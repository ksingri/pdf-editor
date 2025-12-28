const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
  saveFile: (content) => ipcRenderer.invoke('dialog:saveFile', content),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
});

