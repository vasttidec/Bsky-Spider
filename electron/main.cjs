const {
  app,
  BrowserWindow,
  Menu,
  dialog,
  ipcMain,
  safeStorage,
  shell,
  session,
  utilityProcess,
} = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');

const APP_NAME = 'Bsky-Spider';
const DEV = !app.isPackaged;
const SERVER_ENTRY = path.join(__dirname, '..', 'dist', 'server', 'index.cjs');
const WEB_DIR = path.join(__dirname, '..', 'dist', 'web');
const SPLASH = path.join(__dirname, 'splash.html');
const PRELOAD = path.join(__dirname, 'preload.cjs');

let mainWindow = null;
let splashWindow = null;
let serverProcess = null;
let serverPort = null;
let appUrl = null;
let quitting = false;

app.setName(APP_NAME);
app.setAppUserModelId('app.bskyspider');

function singleInstance() {
  const lock = app.requestSingleInstanceLock();
  if (!lock) {
    app.quit();
    return false;
  }
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
  return true;
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function waitForServer(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = async () => {
      if (Date.now() > deadline) {
        reject(new Error('本地服务启动超时'));
        return;
      }
      try {
        const response = await fetch(`http://127.0.0.1:${port}/api/health`);
        if (response.ok) {
          resolve();
          return;
        }
      } catch {
        // Server is still booting.
      }
      setTimeout(attempt, 250);
    };
    void attempt();
  });
}

const DATA_DIR_NAME = 'data';
const ACCOUNTS_FILE = 'accounts.enc';
const LEGACY_CREDENTIALS_FILE = 'login.enc';
const LEGACY_DATA_FILES = ['settings.json', 'tasks.json', 'history.json'];
const STARTUP_LOG_FILE = 'startup.log';

/**
 * The data folder lives next to Bsky-Spider.exe (the portable launcher exposes
 * its original location through PORTABLE_EXECUTABLE_DIR).
 *
 * An existing `data` folder next to the executable is always honoured, even
 * when the per-user application data folder still holds data from an older
 * version: reading the folder that ships with the app must never depend on
 * write probes or on leftover legacy data. Only when that folder is missing
 * and cannot be created do we fall back to %APPDATA%.
 */
function resolveDataDir() {
  const portableDir = (process.env.PORTABLE_EXECUTABLE_DIR || '').trim();
  const exeDir = portableDir || path.dirname(app.getPath('exe'));
  const candidate = path.join(exeDir, DATA_DIR_NAME);

  if (fs.existsSync(candidate)) {
    try {
      if (fs.statSync(candidate).isDirectory()) return candidate;
    } catch {
      // Fall through and try to create a usable folder.
    }
  }

  try {
    fs.mkdirSync(candidate, { recursive: true });
    // A real write probe is more reliable than an ACL check on Windows.
    const probe = path.join(candidate, `.bsky-spider-write-test-${process.pid}`);
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    return candidate;
  } catch {
    const fallback = path.join(app.getPath('userData'), DATA_DIR_NAME);
    fs.mkdirSync(fallback, { recursive: true });
    return fallback;
  }
}

let cachedDataDir = null;
let cachedDataDirSource = null;

function dataDir() {
  if (!cachedDataDir) {
    const portableDir = (process.env.PORTABLE_EXECUTABLE_DIR || '').trim();
    const exeDir = portableDir || path.dirname(app.getPath('exe'));
    cachedDataDir = resolveDataDir();
    cachedDataDirSource =
      path.resolve(cachedDataDir) ===
      path.resolve(path.join(exeDir, DATA_DIR_NAME))
        ? 'exe'
        : 'user';
  }
  return cachedDataDir;
}

/** Where the data folder was found: next to the exe, or the %APPDATA% fallback. */
function dataDirSource() {
  dataDir();
  return cachedDataDirSource;
}

/**
 * Keeps a small diagnostic trail in %APPDATA% so the chosen data folder is
 * traceable even when it lives somewhere else (or is not writable).
 */
function appendStartupLog(message) {
  try {
    console.log(message);
  } catch {
    // Ignore console failures.
  }
  try {
    const file = path.join(app.getPath('userData'), STARTUP_LOG_FILE);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${new Date().toISOString()} ${message}\n`);
  } catch {
    // Diagnostics must never prevent startup.
  }
}

/** Copies the files of the old %APPDATA% data folder into the active one. */
function migrateLegacyData(target) {
  const legacy = path.join(app.getPath('userData'), DATA_DIR_NAME);
  if (path.resolve(legacy) === path.resolve(target)) return;
  try {
    if (!fs.existsSync(legacy)) return;
    let copied = 0;
    for (const name of LEGACY_DATA_FILES) {
      const source = path.join(legacy, name);
      const destination = path.join(target, name);
      if (fs.existsSync(source) && !fs.existsSync(destination)) {
        fs.copyFileSync(source, destination);
        copied += 1;
      }
    }
    if (copied > 0) {
      appendStartupLog(
        `[data] migrated ${copied} file(s) from ${legacy} to ${target}`,
      );
    }
  } catch (error) {
    appendStartupLog(`[data] legacy migration skipped: ${error.message}`);
  }
}

function appendServerLog(chunk) {
  try {
    const logFile = path.join(dataDir(), 'server.log');
    fs.appendFileSync(logFile, chunk);
  } catch {
    // Logging diagnostics must never prevent startup.
  }
}

function startServer(port, credentials) {
  if (!fs.existsSync(SERVER_ENTRY)) {
    throw new Error(`找不到本地服务文件：${SERVER_ENTRY}`);
  }
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    BSKY_SPIDER_PORT: String(port),
    BSKY_SPIDER_HOST: '127.0.0.1',
    BSKY_SPIDER_DATA_DIR: dataDir(),
    BSKY_SPIDER_DATA_DIR_SOURCE: dataDirSource(),
    BSKY_SPIDER_DOWNLOADS_DIR: app.getPath('downloads'),
    BSKY_SPIDER_WEB_DIR: WEB_DIR,
    BSKY_SPIDER_OPEN: '0',
  };
  if (credentials) {
    env.BSKY_SPIDER_AUTO_LOGIN = JSON.stringify(credentials);
  }

  // utilityProcess is Electron's supported way to run a Node-only child. It
  // avoids relying on the RunAsNode fuse, which security-hardened builds may
  // disable.
  serverProcess = utilityProcess.fork(SERVER_ENTRY, [], {
    env,
    stdio: 'pipe',
    serviceName: 'Bsky-Spider API',
  });
  serverProcess.stdout?.on('data', (chunk) => appendServerLog(String(chunk)));
  serverProcess.stderr?.on('data', (chunk) => appendServerLog(String(chunk)));
  serverProcess.once('exit', (code) => {
    if (!quitting && code !== 0) {
      appendServerLog(`\n[server exited with code ${code}]\n`);
    }
  });
}

function stopServer() {
  if (!serverProcess) return;
  try {
    serverProcess.kill();
  } catch {
    // Ignore shutdown races.
  }
  serverProcess = null;
}

function createMainWindow() {
  const window = new BrowserWindow({
    width: 1320,
    height: 900,
    minWidth: 1020,
    minHeight: 700,
    show: false,
    backgroundColor: '#f4f9ff',
    title: APP_NAME,
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      devTools: true,
    },
  });

  if (DEV) {
    window.webContents.openDevTools({ mode: 'detach' });
  }

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    if (appUrl && url.startsWith(appUrl)) return;
    event.preventDefault();
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
  });

  window.webContents.on('will-attach-webview', (event) => event.preventDefault());

  window.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      window.webContents.toggleDevTools();
      event.preventDefault();
    }
    if (
      input.type === 'keyDown' &&
      (input.control || input.meta) &&
      input.shift &&
      input.key.toLowerCase() === 'i'
    ) {
      window.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  window.once('ready-to-show', () => {
    window.show();
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.destroy();
    splashWindow = null;
  });

  window.on('closed', () => {
    mainWindow = null;
  });

  return window;
}

function showSplash() {
  splashWindow = new BrowserWindow({
    width: 460,
    height: 310,
    frame: false,
    resizable: false,
    movable: true,
    center: true,
    show: false,
    backgroundColor: '#f4f9ff',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  splashWindow.loadFile(SPLASH).catch(() => undefined);
  splashWindow.once('ready-to-show', () => splashWindow.show());
}

function accountsPath() {
  return path.join(dataDir(), ACCOUNTS_FILE);
}

function legacyCredentialsPath() {
  return path.join(app.getPath('userData'), LEGACY_CREDENTIALS_FILE);
}

function sanitizeIdentifier(value) {
  return typeof value === 'string' ? value.trim().slice(0, 512) : '';
}

function sanitizePds(value) {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, 512)
    : undefined;
}

function accountKey(identifier) {
  return identifier.trim().toLowerCase();
}

function readLegacyCredentials() {
  const file = legacyCredentialsPath();
  if (!fs.existsSync(file)) return null;
  try {
    if (!safeStorage.isEncryptionAvailable()) return null;
    const parsed = JSON.parse(safeStorage.decryptString(fs.readFileSync(file)));
    const identifier = sanitizeIdentifier(parsed?.identifier);
    const password = typeof parsed?.password === 'string' ? parsed.password : '';
    if (!identifier || !password) return null;
    return { identifier, password, pds: sanitizePds(parsed?.pds) };
  } catch (error) {
    appendServerLog(
      `\n[accounts] failed to read legacy credentials: ${error.message}\n`,
    );
    return null;
  }
}

function normalizeAccount(raw) {
  const identifier = sanitizeIdentifier(raw?.identifier);
  const password = typeof raw?.password === 'string' ? raw.password : '';
  if (!identifier || !password) return null;
  return {
    identifier,
    password,
    pds: sanitizePds(raw?.pds),
    did: sanitizeIdentifier(raw?.did) || undefined,
    avatar:
      typeof raw?.avatar === 'string' && raw.avatar.trim()
        ? raw.avatar.trim().slice(0, 1024)
        : undefined,
    handle:
      typeof raw?.handle === 'string' ? raw.handle.slice(0, 512) : undefined,
    displayName:
      typeof raw?.displayName === 'string'
        ? raw.displayName.slice(0, 512)
        : undefined,
    addedAt: typeof raw?.addedAt === 'string' ? raw.addedAt : undefined,
    lastUsedAt:
      typeof raw?.lastUsedAt === 'string' ? raw.lastUsedAt : undefined,
    // Whether the credentials of this account are kept for the next start.
    saved: raw?.saved !== false,
  };
}

function readAccountStore() {
  const file = accountsPath();
  if (fs.existsSync(file)) {
    try {
      if (!safeStorage.isEncryptionAvailable()) {
        return { version: 2, active: null, accounts: [] };
      }
      const parsed = JSON.parse(
        safeStorage.decryptString(fs.readFileSync(file)),
      );
      const accounts = (Array.isArray(parsed?.accounts) ? parsed.accounts : [])
        .map(normalizeAccount)
        .filter(Boolean);
      // An explicit `active: null` means the user signed out: keep it so the
      // next start does not log in automatically. Only files written by older
      // versions (without the field) fall back to the first account.
      const hasActiveField =
        parsed != null && Object.prototype.hasOwnProperty.call(parsed, 'active');
      const active = hasActiveField
        ? accounts.find((account) => account.identifier === parsed.active)
            ?.identifier || null
        : accounts[0]?.identifier || null;
      return { version: 2, active, accounts };
    } catch (error) {
      appendServerLog(
        `\n[accounts] failed to read account store: ${error.message}\n`,
      );
    }
  }

  // Upgrade from the single-account file used by older versions.
  const legacy = readLegacyCredentials();
  if (legacy) {
    const now = new Date().toISOString();
    const store = {
      version: 2,
      active: legacy.identifier,
      accounts: [{ ...legacy, addedAt: now, lastUsedAt: now }],
    };
    try {
      writeAccountStore(store);
      fs.rmSync(legacyCredentialsPath(), { force: true });
    } catch (error) {
      appendServerLog(
        `\n[accounts] legacy migration failed: ${error.message}\n`,
      );
    }
    return store;
  }

  // Also pick up a multi-account store left in the old %APPDATA% data folder
  // (for example after the app itself was moved to another directory).
  const legacyStorePath = path.join(
    app.getPath('userData'),
    DATA_DIR_NAME,
    ACCOUNTS_FILE,
  );
  if (fs.existsSync(legacyStorePath)) {
    try {
      if (safeStorage.isEncryptionAvailable()) {
        const parsed = JSON.parse(
          safeStorage.decryptString(fs.readFileSync(legacyStorePath)),
        );
        const accounts = (Array.isArray(parsed?.accounts) ? parsed.accounts : [])
          .map(normalizeAccount)
          .filter(Boolean);
        if (accounts.length > 0) {
          const store = {
            version: 2,
            active:
              accounts.find(
                (account) => account.identifier === parsed?.active,
              )?.identifier || accounts[0].identifier,
            accounts,
          };
          writeAccountStore(store);
          return store;
        }
      }
    } catch (error) {
      appendServerLog(
        `\n[accounts] could not import ${legacyStorePath}: ${error.message}\n`,
      );
    }
  }

  return { version: 2, active: null, accounts: [] };
}

function writeAccountStore(store) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('系统加密服务不可用，无法保存自动登录凭据');
  }
  const payload = JSON.stringify({
    version: 2,
    active: store.active || null,
    accounts: store.accounts,
  });
  const encrypted = safeStorage.encryptString(payload);
  fs.mkdirSync(path.dirname(accountsPath()), { recursive: true });
  fs.writeFileSync(accountsPath(), encrypted, { mode: 0o600 });
}

function publicAccount(account) {
  return {
    identifier: account.identifier,
    did: account.did,
    avatar: account.avatar,
    handle: account.handle,
    displayName: account.displayName,
    pds: account.pds,
    addedAt: account.addedAt,
    lastUsedAt: account.lastUsedAt,
    saved: account.saved !== false,
  };
}

function publicStore(store, active) {
  return {
    ok: true,
    accounts: store.accounts.map(publicAccount),
    active: active ?? store.active,
  };
}

function credentialsOf(account) {
  return {
    identifier: account.identifier,
    password: account.password,
    pds: account.pds,
  };
}

/** Drops accounts that opted out of keeping credentials ("保留登录凭证"). */
function pruneUnsavedAccounts(store) {
  const kept = store.accounts.filter((entry) => entry.saved !== false);
  if (kept.length === store.accounts.length) return store;
  const removed = store.accounts.length - kept.length;
  store.accounts = kept;
  if (store.active && !kept.some((entry) => entry.identifier === store.active)) {
    store.active = kept[0] ? kept[0].identifier : null;
  }
  try {
    writeAccountStore(store);
    appendServerLog(`\n[accounts] removed ${removed} account(s) without saved credentials\n`);
  } catch (error) {
    appendServerLog(
      `\n[accounts] failed to prune unsaved accounts: ${error.message}\n`,
    );
  }
  return store;
}

function loadSavedCredentials() {
  const store = pruneUnsavedAccounts(readAccountStore());
  if (!store.active) return null;
  const active = store.accounts.find(
    (entry) => entry.identifier === store.active,
  );
  // The current account kept its credentials: log in with it as before.
  if (active && active.saved !== false) return credentialsOf(active);

  // The current account opted out of keeping credentials. Use the first
  // account in list order that still has them, and make it the current one.
  const fallback = store.accounts.find((entry) => entry.saved !== false);
  if (!fallback) return null;
  if (store.active !== fallback.identifier) {
    fallback.lastUsedAt = new Date().toISOString();
    store.active = fallback.identifier;
    try {
      writeAccountStore(store);
    } catch (error) {
      appendServerLog(
        `\n[accounts] failed to switch account at startup: ${error.message}\n`,
      );
    }
  }
  return credentialsOf(fallback);
}

/** Most recently used account, used to pre-fill the login form after signing out. */
function mostRecentAccount(store) {
  const sorted = [...store.accounts].sort((a, b) =>
    String(b.lastUsedAt || '').localeCompare(String(a.lastUsedAt || '')),
  );
  return sorted[0];
}

let credentialIpcRegistered = false;

function registerCredentialIpc() {
  if (credentialIpcRegistered) return;
  credentialIpcRegistered = true;

  const saveAccount = (payload) => {
    if (!safeStorage.isEncryptionAvailable()) {
      return { ok: false, error: '系统加密服务不可用，无法保存自动登录凭据' };
    }
    const account = normalizeAccount(payload);
    if (!account) return { ok: false, error: '登录凭据不完整' };
    const store = readAccountStore();
    const now = new Date().toISOString();
    const existing = store.accounts.find(
      (entry) =>
        accountKey(entry.identifier) === accountKey(account.identifier),
    );
    if (existing) {
      existing.identifier = account.identifier;
      existing.password = account.password;
      existing.pds = account.pds;
      existing.did = account.did || existing.did;
      existing.avatar = account.avatar || existing.avatar;
      existing.handle = account.handle || existing.handle;
      existing.displayName = account.displayName || existing.displayName;
      existing.addedAt = existing.addedAt || now;
      existing.lastUsedAt = now;
    } else {
      store.accounts.push({
        ...account,
        addedAt: account.addedAt || now,
        lastUsedAt: now,
      });
    }
    store.active = existing ? existing.identifier : account.identifier;
    writeAccountStore(store);
    return publicStore(store);
  };

  ipcMain.handle('bsky:save-credentials', (_event, payload) => {
    try {
      return saveAccount(payload);
    } catch (error) {
      return { ok: false, error: error.message || '保存自动登录凭据失败' };
    }
  });

  ipcMain.handle('bsky:load-credentials', () => {
    try {
      const store = readAccountStore();
      // Pre-fill with the account that was used last, even after signing out.
      const account =
        store.accounts.find((entry) => entry.identifier === store.active) ||
        mostRecentAccount(store);
      if (!account) {
        return { ok: false, error: '没有可用的自动登录凭据' };
      }
      return {
        ok: true,
        credentials: {
          identifier: account.identifier,
          password: account.password,
          pds: account.pds,
        },
      };
    } catch (error) {
      return { ok: false, error: error.message || '读取自动登录凭据失败' };
    }
  });

  // Signing out forgets the current account; when other saved accounts remain,
  // the first one becomes the current account and is returned so the renderer
  // can switch to it right away.
  ipcMain.handle('bsky:accounts-signout', () => {
    try {
      const store = readAccountStore();
      const current = store.accounts.find(
        (entry) => accountKey(entry.identifier) === accountKey(store.active),
      );
      if (current) {
        store.accounts = store.accounts.filter(
          (entry) =>
            accountKey(entry.identifier) !== accountKey(current.identifier),
        );
      }
      const next = store.accounts[0] || null;
      store.active = next ? next.identifier : null;
      if (next) next.lastUsedAt = new Date().toISOString();
      writeAccountStore(store);
      return {
        ...publicStore(store),
        credentials: next
          ? {
              identifier: next.identifier,
              password: next.password,
              pds: next.pds,
            }
          : undefined,
      };
    } catch (error) {
      return { ok: false, error: error.message || '退出登录失败' };
    }
  });

  ipcMain.handle('bsky:clear-credentials', () => {
    try {
      fs.rmSync(accountsPath(), { force: true });
      fs.rmSync(legacyCredentialsPath(), { force: true });
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message || '清除自动登录凭据失败' };
    }
  });

  ipcMain.handle('bsky:accounts-list', () => {
    try {
      return publicStore(readAccountStore());
    } catch (error) {
      return { ok: false, error: error.message || '读取账号列表失败' };
    }
  });

  ipcMain.handle('bsky:accounts-remove', (_event, payload) => {
    try {
      const identifier = sanitizeIdentifier(payload?.identifier);
      if (!identifier) return { ok: false, error: '账号标识不能为空' };
      const store = readAccountStore();
      const remaining = store.accounts.filter(
        (entry) =>
          accountKey(entry.identifier) !== accountKey(identifier),
      );
      if (remaining.length === store.accounts.length) {
        return { ok: false, error: '没有找到该账号' };
      }
      store.accounts = remaining;
      if (!store.active || accountKey(store.active) === accountKey(identifier)) {
        store.active = remaining[0]?.identifier || null;
      }
      writeAccountStore(store);
      return publicStore(store);
    } catch (error) {
      return { ok: false, error: error.message || '删除账号失败' };
    }
  });

  ipcMain.handle('bsky:accounts-update-profile', (_event, payload) => {
    try {
      const identifier = sanitizeIdentifier(payload?.identifier);
      if (!identifier) return { ok: false, error: '账号标识不能为空' };
      const store = readAccountStore();
      const account = store.accounts.find(
        (entry) => accountKey(entry.identifier) === accountKey(identifier),
      );
      if (!account) return { ok: false, error: '没有找到该账号' };
      const did = sanitizeIdentifier(payload?.did);
      if (did) account.did = did;
      if (typeof payload?.avatar === 'string' && payload.avatar.trim()) {
        account.avatar = payload.avatar.trim().slice(0, 1024);
      }
      if (typeof payload?.handle === 'string' && payload.handle.trim()) {
        account.handle = payload.handle.trim().slice(0, 512);
      }
      if (
        typeof payload?.displayName === 'string' &&
        payload.displayName.trim()
      ) {
        account.displayName = payload.displayName.trim().slice(0, 512);
      }
      writeAccountStore(store);
      return publicStore(store);
    } catch (error) {
      return { ok: false, error: error.message || '更新账号信息失败' };
    }
  });

  ipcMain.handle('bsky:accounts-set-saved', (_event, payload) => {
    try {
      const identifier = sanitizeIdentifier(payload?.identifier);
      const saved = Boolean(payload?.saved);
      const store = readAccountStore();
      const account = store.accounts.find(
        (entry) => accountKey(entry.identifier) === accountKey(identifier),
      );
      if (!account) return { ok: false, error: '没有找到该账号' };
      account.saved = saved;
      writeAccountStore(store);
      return publicStore(store);
    } catch (error) {
      return { ok: false, error: error.message || '保存登录凭证设置失败' };
    }
  });

  ipcMain.handle('bsky:accounts-activate', (_event, payload) => {
    try {
      const identifier = sanitizeIdentifier(payload?.identifier);
      const store = readAccountStore();
      const account = store.accounts.find(
        (entry) => accountKey(entry.identifier) === accountKey(identifier),
      );
      if (!account) return { ok: false, error: '没有找到该账号' };
      account.lastUsedAt = new Date().toISOString();
      store.active = account.identifier;
      writeAccountStore(store);
      return {
        ok: true,
        credentials: {
          identifier: account.identifier,
          password: account.password,
          pds: account.pds,
        },
      };
    } catch (error) {
      return { ok: false, error: error.message || '切换账号失败' };
    }
  });
}

async function boot() {
  showSplash();
  try {
    const activeDataDir = dataDir();
    appendStartupLog(
      `[data] using ${activeDataDir} (source=${dataDirSource()})`,
    );
    migrateLegacyData(activeDataDir);
    registerCredentialIpc();
    const savedCredentials = loadSavedCredentials();
    serverPort = await getFreePort();
    startServer(serverPort, savedCredentials);
    await waitForServer(serverPort);
    appUrl = `http://127.0.0.1:${serverPort}`;
    mainWindow = createMainWindow();
    await mainWindow.loadURL(appUrl);
  } catch (error) {
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.destroy();
    dialog.showErrorBox(
      `${APP_NAME} 启动失败`,
      `${error.message || error}\n\n诊断日志：${path.join(
        dataDir(),
        'server.log',
      )}\n启动日志：${path.join(
        app.getPath('userData'),
        STARTUP_LOG_FILE,
      )}`,
    );
    app.quit();
  }
}

if (singleInstance()) {
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    session.defaultSession.setPermissionRequestHandler(
      (_webContents, permission, callback) => {
        // The app uses an in-window toast for download completion and does not
        // request Windows/browser system notifications.
        callback(permission === 'clipboard-sanitized-write');
      },
    );
    void boot();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void boot();
  });

  app.on('window-all-closed', () => {
    app.quit();
  });

  app.on('before-quit', () => {
    quitting = true;
    stopServer();
  });
}
