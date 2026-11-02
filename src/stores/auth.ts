import { create } from 'zustand';
import { api, errorMessage } from '../api';
import type { AuthUser, LoginRequest } from '../../shared/types';
import { useHomeStore } from './home';
import { useTasksStore } from './tasks';

export interface SavedAccount {
  identifier: string;
  did?: string;
  avatar?: string;
  handle?: string;
  displayName?: string;
  pds?: string;
  addedAt?: string;
  lastUsedAt?: string;
  /** Whether the credentials are kept for the next start. */
  saved?: boolean;
}

/** Accounts' avatars are refreshed at most every ten minutes. */
const PROFILE_TTL = 10 * 60 * 1000;
const profileFetchedAt = new Map<string, number>();

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  loginOpen: boolean;
  loginLoading: boolean;
  loginError: string | null;
  accounts: SavedAccount[];
  /** Identifier of the account that logs in automatically on start. */
  activeAccount: string | null;
  accountsOpen: boolean;
  accountsLoading: boolean;
  switchingAccount: string | null;
  bootstrap: () => Promise<void>;
  openLogin: () => void;
  closeLogin: () => void;
  login: (values: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  openAccounts: () => void;
  closeAccounts: () => void;
  refreshAccounts: () => Promise<void>;
  refreshAccountProfiles: () => Promise<void>;
  switchAccount: (identifier: string) => Promise<void>;
  setSavedCredentials: (identifier: string, saved: boolean) => Promise<void>;
  removeAccount: (identifier: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  loading: false,
  loginOpen: false,
  loginLoading: false,
  loginError: null,
  accounts: [],
  activeAccount: null,
  accountsOpen: false,
  accountsLoading: false,
  switchingAccount: null,

  bootstrap: async () => {
    set({ loading: true });
    try {
      const session = await api.session();
      set({
        user: session.user,
        ...(session.autoLoginFailed
          ? {
              loginOpen: true,
              loginError:
                '上次保存的自动登录凭据已失效或网络不可用，请重新登录或检查代理设置。',
            }
          : {}),
      });
    } finally {
      set({ loading: false });
    }
    await get().refreshAccounts();
  },

  openLogin: () => set({ loginOpen: true, loginError: null }),
  closeLogin: () => set({ loginOpen: false, loginLoading: false }),

  login: async (values) => {
    set({ loginLoading: true, loginError: null });
    try {
      const result = await api.login(values);
      set({
        user: result.user,
        loginOpen: false,
        loginLoading: false,
        loginError: null,
      });
      await useTasksStore.getState().refresh(true);
      await get().refreshAccounts();
      await useHomeStore.getState().reloadHistory().catch(() => undefined);
    } catch (error) {
      const message = errorMessage(error);
      set({ loginError: message, loginLoading: false });
      throw error;
    }
  },

  logout: async () => {
    if (get().loading) return;
    set({ loading: true });
    try {
      await api.logout();
    } finally {
      // Signing out forgets this account. When another saved account exists it
      // becomes the current account and is signed in right away.
      let next: SavedCredentials | null = null;
      try {
        const result = await window.bskyDesktop?.signOutAccounts?.();
        next = result?.credentials ?? null;
      } catch {
        // The server session is already gone; ignore storage errors.
      }
      let switchedUser: AuthUser | null = null;
      if (next) {
        try {
          const result = await api.login({
            identifier: next.identifier,
            password: next.password,
            pds: next.pds,
          });
          switchedUser = result.user;
        } catch {
          switchedUser = null;
        }
      }
      set({ user: switchedUser, loading: false, loginOpen: false });
      useHomeStore.getState().reset();
      await useHomeStore.getState().reloadHistory().catch(() => undefined);
      await get().refreshAccounts();
    }
  },

  openAccounts: () => {
    set({ accountsOpen: true });
    void get().refreshAccounts().then(() => get().refreshAccountProfiles());
  },
  closeAccounts: () => set({ accountsOpen: false }),

  refreshAccounts: async () => {
    const desktop = window.bskyDesktop;
    if (!desktop?.listAccounts) {
      set({ accounts: [] });
      return;
    }
    set({ accountsLoading: true });
    try {
      const result = await desktop.listAccounts();
      if (result?.ok) {
        set({
          accounts: result.accounts ?? [],
          activeAccount: result.active ?? null,
        });
      }
    } catch {
      // Account management is optional; the login form still works.
    } finally {
      set({ accountsLoading: false });
    }
  },

  /**
   * Fills in avatars and display names for saved accounts. Only runs while a
   * session exists, because the profile endpoint requires authentication.
   */
  refreshAccountProfiles: async () => {
    const desktop = window.bskyDesktop;
    const { accounts, user } = get();
    if (!desktop?.updateAccountProfile || !user || accounts.length === 0) {
      return;
    }
    for (const account of accounts) {
      const actor = account.handle || account.identifier;
      if (!actor) continue;
      const last = profileFetchedAt.get(account.identifier) ?? 0;
      if (Date.now() - last < PROFILE_TTL) continue;
      profileFetchedAt.set(account.identifier, Date.now());
      try {
        const profile = await api.getProfile(actor);
        if (!profile?.handle) continue;
        set({
          accounts: get().accounts.map((item) =>
            item.identifier === account.identifier
              ? {
                  ...item,
                  did: profile.did,
                  avatar: profile.avatar,
                  handle: profile.handle,
                  displayName: profile.displayName ?? item.displayName,
                }
              : item,
          ),
        });
        await desktop.updateAccountProfile({
          identifier: account.identifier,
          did: profile.did,
          avatar: profile.avatar,
          handle: profile.handle,
          displayName: profile.displayName,
        });
      } catch {
        // Profile lookups are cosmetic; keep the initials fallback.
      }
    }
  },

  switchAccount: async (identifier) => {
    const desktop = window.bskyDesktop;
    if (!desktop?.activateAccount) {
      throw new Error('当前环境不支持多账号切换');
    }
    set({ switchingAccount: identifier, loginError: null });
    try {
      const activated = await desktop.activateAccount({ identifier });
      if (!activated?.ok || !activated.credentials) {
        throw new Error(activated?.error || '切换账号失败');
      }
      const credentials = activated.credentials;
      const result = await api.login({
        identifier: credentials.identifier,
        password: credentials.password,
        pds: credentials.pds,
      });
      set({
        user: result.user,
        accountsOpen: false,
        loginOpen: false,
        loginLoading: false,
        switchingAccount: null,
      });
      useHomeStore.getState().reset();
      await useTasksStore.getState().refresh(true);
      await get().refreshAccounts();
      await useHomeStore.getState().reloadHistory().catch(() => undefined);
    } catch (error) {
      set({ switchingAccount: null });
      throw error;
    }
  },

  setSavedCredentials: async (identifier, saved) => {
    const desktop = window.bskyDesktop;
    if (!desktop?.setAccountSaved) {
      throw new Error('当前环境不支持保存登录凭证');
    }
    const result = await desktop.setAccountSaved({ identifier, saved });
    if (!result?.ok) {
      throw new Error(result?.error || '保存登录凭证设置失败');
    }
    set({
      accounts: result.accounts ?? get().accounts,
      activeAccount: result.active ?? get().activeAccount,
    });
  },

  removeAccount: async (identifier) => {
    const desktop = window.bskyDesktop;
    if (!desktop?.removeAccount) return;
    const result = await desktop.removeAccount({ identifier });
    if (!result?.ok) {
      throw new Error(result?.error || '删除账号失败');
    }
    set({ accounts: result.accounts ?? [] });
  },
}));
