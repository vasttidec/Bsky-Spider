import type { UpdateCheckResult } from '../shared/types';
import { APP_VERSION, GITHUB_RELEASES_URL, GITHUB_REPO } from './config';
import { ApiError, fetchJson } from './http';

/** `1.2.0` / `v1.2.0` → [1, 2, 0] (non numeric prefixes are ignored). */
function parseVersion(value: string): number[] {
  const match = value.trim().match(/(\d+(?:\.\d+)*)/);
  if (!match) return [0];
  return match[1].split('.').map((part) => Number.parseInt(part, 10) || 0);
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const next = parseVersion(candidate);
  const now = parseVersion(current);
  const length = Math.max(next.length, now.length);
  for (let index = 0; index < length; index += 1) {
    const a = next[index] ?? 0;
    const b = now[index] ?? 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return false;
}

interface GithubRelease {
  tag_name?: string;
  name?: string;
  html_url?: string;
  body?: string;
  published_at?: string;
  draft?: boolean;
  prerelease?: boolean;
}

/**
 * Compares the local version with the newest GitHub release. A repository
 * without releases yet is treated as "already up to date".
 */
export async function checkForUpdates(): Promise<UpdateCheckResult> {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;
  let release: GithubRelease;
  try {
    release = await fetchJson<GithubRelease>(
      url,
      {
        headers: {
          accept: 'application/vnd.github+json',
          'user-agent': 'Bsky-Spider-Update-Check',
        },
      },
      15_000,
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return {
        current: APP_VERSION,
        latest: null,
        updateAvailable: false,
        url: GITHUB_RELEASES_URL,
        repository: GITHUB_REPO,
      };
    }
    if (error instanceof ApiError) {
      throw new ApiError(
        error.message,
        error.status,
        error.code,
        error.details,
      );
    }
    throw error;
  }

  const latest = (release.tag_name || release.name || '').replace(/^v/i, '');
  return {
    current: APP_VERSION,
    latest: latest || null,
    updateAvailable: Boolean(latest) && isNewerVersion(latest, APP_VERSION),
    url: release.html_url || GITHUB_RELEASES_URL,
    publishedAt: release.published_at,
    notes: (release.body || '').slice(0, 4000),
    repository: GITHUB_REPO,
  };
}
