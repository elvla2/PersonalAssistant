const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  notify: (title, body) => ipcRenderer.send('notify', { title, body }),
  setBadge: (count) => ipcRenderer.send('badge', count),
  getVersion: () => ipcRenderer.invoke('app-version'),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  getUpdateStatus: () => ipcRenderer.invoke('updater-get-status'),
  saveUpdateConfig: (cfg) => ipcRenderer.invoke('updater-save-config', cfg),
  checkForUpdates: () => ipcRenderer.invoke('updater-check'),
  downloadUpdate: () => ipcRenderer.invoke('updater-download'),
  quitAndInstallUpdate: () => ipcRenderer.invoke('updater-quit-and-install'),
  installLocalUpdateFile: () => ipcRenderer.invoke('updater-install-local-file'),
  onUpdateStatusChange: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('updater-status', handler);
    return () => ipcRenderer.removeListener('updater-status', handler);
  },
});
