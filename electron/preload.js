const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('petAPI', {
  onStateChanged: (callback) => ipcRenderer.on('state-changed', (event, state) => callback(state)),
  onCycleToggled: (callback) => ipcRenderer.on('cycle-toggled', () => callback()),
  onDshState: (callback) => ipcRenderer.on('dsh-state', (event, state) => callback(state)),
  onDshStatus: (callback) => ipcRenderer.on('dsh-status', (event, connected) => callback(connected)),
  onDshThought: (callback) => ipcRenderer.on('dsh-thought', (event, text) => callback(text)),
  onDshApproval: (callback) => ipcRenderer.on('dsh-approval', (event, info) => callback(info)),
  onDshQuestion: (callback) => ipcRenderer.on('dsh-question', (event, info) => callback(info)),
  onDshUsageReport: (callback) => ipcRenderer.on('dsh-usage-report', (event, snap) => callback(snap)),
  onAppearance: (callback) => ipcRenderer.on('pet-appearance', (event, app) => callback(app)),
  getAppearance: () => ipcRenderer.invoke('pet-get-appearance'),
  nurtureAction: (action) => ipcRenderer.send('nurture-action', action),
  onNurture: (callback) => ipcRenderer.on('nurture-state', (event, state) => callback(state)),
  dragStart: (x, y) => ipcRenderer.send('drag-start', { x, y }),
  dragMove: (x, y) => ipcRenderer.send('drag-move', { x, y }),
  dragEnd: () => ipcRenderer.send('drag-end'),
  hidePet: () => ipcRenderer.send('hide-pet'),
  quit: () => ipcRenderer.send('quit')
});
