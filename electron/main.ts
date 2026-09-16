import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MARKET_REFRESH_NOW, MARKET_REFRESH_UPDATED } from '../shared/ipc.js';
import type { MarketRefreshUpdate } from '../shared/ipc.js';
import { registerAppHandlers } from './ipc/app.handlers.js';
import { registerAlertsHandlers } from './ipc/alerts.handlers.js';
import { registerFlipsHandlers } from './ipc/flips.handlers.js';
import { registerMarketHandlers } from './ipc/market.handlers.js';
import { registerQualityHandlers } from './ipc/quality.handlers.js';
import { registerWatchlistHandlers } from './ipc/watchlist.handlers.js';
import { getStubHistoryResponse, getStubTop10Response } from './ipc/marketStub.js';
import { getApplicationVersion, initializeApplicationServices } from './services/application.js';
import { createAppLogger } from './services/appLogger.js';
import { startScheduler, stopScheduler, toSchedulerUpdate } from './services/scheduler.js';
import { getWindowOptions } from './window.js';
import { JsonWatchlistRepository } from '../storage/json/JsonWatchlistRepository.js';
import { JsonAlertRepository } from '../storage/json/JsonAlertRepository.js';

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
  // Sprint 19 slice-2: main-owned app logger (file sink under userData,
  // guide §44; no history-backend touch). Startup is the first category.
  const appLogger = createAppLogger({ baseDir: app.getPath('userData') });
  void appLogger.log('info', 'startup', `app started v${getApplicationVersion()}`);
  registerAppHandlers(ipcMain, { getVersion: getApplicationVersion });
  registerMarketHandlers(ipcMain, { getTop10: (request) => getStubTop10Response(request), getHistory: (request) => getStubHistoryResponse(request) });
  // Sprint 11 slice-2: watchlist persistence owned by main (ID-only store,
  // JSON backend from slice-1; SQLite can replace it untouched per §17).
  const watchlistRepo = new JsonWatchlistRepository(app.getPath('userData'));
  registerWatchlistHandlers(ipcMain, {
    load: () => watchlistRepo.load(),
    save: (entries) => watchlistRepo.save(entries),
  });
  // Sprint 12 slice-2 part 2: alert-rule persistence owned by main
  // (rule store only; evaluation stays renderer-side, in-app only).
  const alertsRepo = new JsonAlertRepository(app.getPath('userData'));
  registerAlertsHandlers(ipcMain, {
    load: () => alertsRepo.load(),
    save: (rules) => alertsRepo.save(rules),
  });
  // Sprint 13 slice-2: stateless flip calculation (pure calcFlip default;
  // no repository — nothing persists, callers pass observed prices in).
  registerFlipsHandlers(ipcMain);
  // Sprint 16 slice-2: stateless quality assessment (pure assessDataQuality
  // default; no repository — nothing persists, callers pass the batch in).
  registerQualityHandlers(ipcMain);
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
