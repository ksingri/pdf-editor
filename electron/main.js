const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs/promises');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const startUrl = process.env.ELECTRON_START_URL || `file://${path.join(__dirname, '../dist/index.html')}`;
  
  // In dev, wait for vite to be ready, but for now we'll just load localhost:3000 if env var is set
  if (process.env.ELECTRON_START_URL) {
    mainWindow.loadURL(process.env.ELECTRON_START_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL(startUrl);
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers
ipcMain.handle('dialog:openFile', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'PDFs', extensions: ['pdf'] }],
  });
  if (canceled) {
    return null;
  } else {
    // Read the file immediately to send content back? 
    // Or just send path. Let's send path and content to be safe/easy.
    const filePath = filePaths[0];
    const content = await fs.readFile(filePath);
    return { filePath, content: content.buffer }; // Send as ArrayBuffer
  }
});

ipcMain.handle('dialog:saveFile', async (event, content) => {
  // content should be ArrayBuffer or Uint8Array
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    filters: [{ name: 'PDFs', extensions: ['pdf'] }],
  });
  
  if (canceled || !filePath) {
    return false;
  }

  await fs.writeFile(filePath, Buffer.from(content));
  return true;
});

