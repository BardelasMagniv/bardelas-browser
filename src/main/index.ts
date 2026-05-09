import path from 'path';
import { app, BrowserWindow, ipcMain } from 'electron';
import { registerProfileHandlers } from './ipc/profileHandlers';
import { registerBrowserHandlers } from './ipc/browserHandlers';
import { registerMirrorHandlers } from './ipc/mirrorHandlers';
import { registerSettingsHandlers } from './ipc/settingsHandlers';
import { registerAiHandlers } from './ipc/aiHandlers';

const isDev = process.env.NODE_ENV !== 'production';

function createMainWindow() {
  const iconPath = path.join(__dirname, '..', '..', 'bardelasbrowser.ico');
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const loadRendererFile = () => win.loadFile(path.join(__dirname, '../renderer/index.html'));

  if (isDev) {
    const devUrl = 'http://localhost:4173';
    win.loadURL(devUrl).catch(() => {
      loadRendererFile();
    });

    win.webContents.on('did-fail-load', () => {
      loadRendererFile();
    });

    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    loadRendererFile();
  }
}

app.whenReady().then(() => {
  createMainWindow();
  registerProfileHandlers(ipcMain);
  registerBrowserHandlers(ipcMain);
  registerMirrorHandlers(ipcMain);
  registerSettingsHandlers(ipcMain);
  registerAiHandlers(ipcMain);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
