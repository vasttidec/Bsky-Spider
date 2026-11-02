import { HISTORY_FILE } from './config';
import { ensureDataDir, readJsonFile, writeJsonFile } from './storage';

const MAX_HISTORY = 12;

interface HistoryStore {
  version: 2;
  /** Whether the pre-1.1.1 list has been handed to the first account seen. */
  migrated: boolean;
  /** Search history per account, keyed by the account DID. */
  byAccount: Record<string, string[]>;
  /** History from older versions that did not separate accounts. */
  legacy: string[];
}

let store: HistoryStore = {
  version: 2,
  migrated: false,
  byAccount: {},
  legacy: [],
};
let initialized = false;

function normalizeHandle(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .trim()
    .replace(/^@/, '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .slice(0, 100)
    .trim();
}

function normalizeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const entry of value) {
    const handle = normalizeHandle(entry);
    if (!handle || seen.has(handle)) continue;
    seen.add(handle);
    result.push(handle);
    if (result.length >= MAX_HISTORY) break;
  }
  return result;
}

function normalizeMap(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object') return {};
  const result: Record<string, string[]> = {};
  for (const [key, list] of Object.entries(value as Record<string, unknown>)) {
    if (!key) continue;
    const entries = normalizeList(list);
    if (entries.length > 0) result[key] = entries;
  }
  return result;
}

function accountKey(did?: string | null): string {
  const value = (did || '').trim();
  return value.startsWith('did:') ? value : '';
}

async function save(): Promise<void> {
  await writeJsonFile(HISTORY_FILE, store);
}

export async function initHistory(): Promise<void> {
  if (initialized) return;
  await ensureDataDir();
  const saved = await readJsonFile<unknown>(HISTORY_FILE, null);
  if (Array.isArray(saved)) {
    // Version 1 stored a single shared list.
    store = {
      version: 2,
      migrated: false,
      byAccount: {},
      legacy: normalizeList(saved),
    };
  } else if (saved && typeof saved === 'object') {
    const raw = saved as Partial<HistoryStore>;
    store = {
      version: 2,
      migrated: Boolean(raw.migrated),
      byAccount: normalizeMap(raw.byAccount),
      legacy: normalizeList(raw.legacy),
    };
  }
  initialized = true;
}

/**
 * Returns the search history of one account. History is never shared between
 * accounts: without a session (or with an unknown DID) the list is empty.
 */
export async function getSearchHistory(
  accountDid?: string | null,
): Promise<string[]> {
  if (!initialized) await initHistory();
  const key = accountKey(accountDid);
  if (!key) return [];
  if (!store.migrated) {
    // Hand the old shared list to the first account that asks for it.
    if (!store.byAccount[key] || store.byAccount[key].length === 0) {
      store.byAccount[key] = [...store.legacy];
    }
    store.legacy = [];
    store.migrated = true;
    await save();
  }
  return [...(store.byAccount[key] ?? [])];
}

export async function addSearchHistory(
  accountDid: string | null | undefined,
  handle: unknown,
): Promise<string[]> {
  if (!initialized) await initHistory();
  const key = accountKey(accountDid);
  if (!key) return [];
  const clean = normalizeHandle(handle);
  if (clean) {
    const current = store.byAccount[key] ?? [];
    store.byAccount[key] = [
      clean,
      ...current.filter((entry) => entry !== clean),
    ].slice(0, MAX_HISTORY);
    await save();
  }
  return getSearchHistory(key);
}

export async function clearSearchHistory(
  accountDid?: string | null,
): Promise<string[]> {
  if (!initialized) await initHistory();
  const key = accountKey(accountDid);
  if (!key) return [];
  if (store.byAccount[key]) {
    delete store.byAccount[key];
    await save();
  }
  return [];
}
