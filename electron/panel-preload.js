// 面板窗口 preload
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('panelAPI', {
  getSkins: () => ipcRenderer.invoke('panel-get-skins'),
  getLog: () => ipcRenderer.invoke('panel-get-log'),
  getState: () => ipcRenderer.invoke('panel-get-state'),
  setAppearance: (change) => ipcRenderer.invoke('panel-set-appearance', change),
  setState: (state) => ipcRenderer.invoke('panel-set-state', state),
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (cfg) => ipcRenderer.invoke('save-config', cfg),
  getNurture: () => ipcRenderer.invoke('panel-get-nurture'),
  nurtureAction: (action) => ipcRenderer.invoke('panel-nurture-action', action),
  getUsage: () => ipcRenderer.invoke('panel-get-usage'),
  refreshBalance: () => ipcRenderer.invoke('panel-refresh-balance'),
  chat: (messages) => ipcRenderer.invoke('panel-chat', { messages }),
  getChatHistory: () => ipcRenderer.invoke('panel-chat-history-get'),
  saveChatHistory: (messages) => ipcRenderer.invoke('panel-chat-history-save', messages),
  onLog: (cb) => ipcRenderer.on('panel-log', (event, entry) => cb(entry)),
  onNurture: (cb) => ipcRenderer.on('panel-nurture', (event, snap) => cb(snap)),
  onUsage: (cb) => ipcRenderer.on('panel-usage', (event, snap) => cb(snap))
});
