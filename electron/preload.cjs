const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('bskyDesktop', {
  isDesktop: true,
  loadCredentials: () => ipcRenderer.invoke('bsky:load-credentials'),
  saveCredentials: (payload) =>
    ipcRenderer.invoke('bsky:save-credentials', payload),
  clearCredentials: () => ipcRenderer.invoke('bsky:clear-credentials'),
  signOutAccounts: () => ipcRenderer.invoke('bsky:accounts-signout'),
  listAccounts: () => ipcRenderer.invoke('bsky:accounts-list'),
  removeAccount: (payload) => ipcRenderer.invoke('bsky:accounts-remove', payload),
  activateAccount: (payload) =>
    ipcRenderer.invoke('bsky:accounts-activate', payload),
  setAccountSaved: (payload) =>
    ipcRenderer.invoke('bsky:accounts-set-saved', payload),
  updateAccountProfile: (payload) =>
    ipcRenderer.invoke('bsky:accounts-update-profile', payload),
});
