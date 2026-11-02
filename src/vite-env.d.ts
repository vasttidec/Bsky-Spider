declare const __APP_VERSION__: string;
declare const __APP_NAME__: string;

interface SavedCredentials {
  identifier: string;
  password: string;
  pds?: string;
}

interface SavedAccount {
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

interface AccountStoreResult {
  ok: boolean;
  accounts?: SavedAccount[];
  active?: string | null;
  /** Set by sign-out when another saved account takes over. */
  credentials?: SavedCredentials;
  error?: string;
}

interface BskyDesktopApi {
  isDesktop: boolean;
  loadCredentials: () => Promise<{
    ok: boolean;
    credentials?: SavedCredentials;
    error?: string;
  }>;
  saveCredentials: (payload: {
    identifier: string;
    password: string;
    pds?: string;
    did?: string;
    avatar?: string;
    handle?: string;
    displayName?: string;
  }) => Promise<{ ok: boolean; error?: string }>;
  clearCredentials: () => Promise<{ ok: boolean; error?: string }>;
  signOutAccounts: () => Promise<AccountStoreResult>;
  listAccounts: () => Promise<AccountStoreResult>;
  removeAccount: (payload: { identifier: string }) => Promise<AccountStoreResult>;
  activateAccount: (payload: { identifier: string }) => Promise<{
    ok: boolean;
    credentials?: SavedCredentials;
    error?: string;
  }>;
  setAccountSaved: (payload: {
    identifier: string;
    saved: boolean;
  }) => Promise<AccountStoreResult>;
  updateAccountProfile: (payload: {
    identifier: string;
    did?: string;
    avatar?: string;
    handle?: string;
    displayName?: string;
  }) => Promise<AccountStoreResult>;
}

interface Window {
  bskyDesktop?: BskyDesktopApi;
}
