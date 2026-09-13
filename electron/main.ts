import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MARKET_REFRESH_NOW, MARKET_REFRESH_UPDATED } from '../shared/ipc.js';
import type { MarketRefreshUpdate } from '../shared/ipc.js';
import { registerAppHandlers } from './ipc/app.handlers.js';
import { registerMarketHandlers } from './ipc/market.handlers.js';
import { getStubHistoryResponse, getStubTop10Response } from './ipc/marketStub.js';
import { getApplicationVersion, initializeApplicationServices } from './services/application.js';
import { startScheduler, stopScheduler, toSchedulerUpdate } from './services/scheduler.js';
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
  registerMarketHandlers(ipcMain, { getTop10: (request) => getStubTop10Response(request), getHistory: (request) => getStubHistoryResponse(request) });
  createWindow();
  // Sprint 10 slice-2: timer runtime on stub-only refresh (D#163 — the
  // refresh advances schedule state; no live pipeline yet). Notify pushes
  // the fresh schedule snapshot to the renderer; the manual trigger runs
  // one refresh now (single-flight shared with timer ticks).
  const scheduler = startScheduler(undefined, {
    notify: (update: MarketRefreshUpdate) => {
      mainWindow?.webContents.send(MARKET_REFRESH_UPDATED, update);
    },
  });
  ipcMain.handle(MARKET_REFRESH_NOW, async (): Promise<MarketRefreshUpdate> => {
    await scheduler.refreshNow();
    // Review #96 finding 2: reuse the scheduler's snapshot helper so the
    // push and invoke payloads can never drift apart.
    return toSchedulerUpdate(scheduler.getState());
  });

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

// Review #96 nit 3: stop the scheduler timer explicitly on quit — harmless
// today (process exit kills the handle) but cheaper than debugging a
// lingering handle in tests/packaged runs.
app.on('before-quit', () => {
  stopScheduler();
});
