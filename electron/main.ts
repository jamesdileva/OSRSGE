import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerAppHandlers } from './ipc/app.handlers.js';
import { getApplicationVersion, initializeApplicationServices } from './services/application.js';
import { startScheduler } from './services/scheduler.js';
import { getWindowOptions } from './window.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173';

let mainWindow: BrowserWindow | null = null;

function createWindow(): BrowserWindow {
  const preloadPath = path.join(currentDir, 'preload.js');
  mainWindow = new BrowserWindow(getWindowOptions(preloadPath));

  if (!app.isPackaged) {
    void mainWindow.loadURL(DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    void mainWindow.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

void app.whenReady().then(() => {
  initializeApplicationServices();
  registerAppHandlers(ipcMain, { getVersion: getApplicationVersion });
  createWindow();
  startScheduler();

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
