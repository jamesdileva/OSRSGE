import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MARKET_REFRESH_NOW, MARKET_REFRESH_UPDATED } from '../shared/ipc.js';
import type { MarketRefreshUpdate } from '../shared/ipc.js';
import { registerAppHandlers } from './ipc/app.handlers.js';
import { registerAlertsHandlers } from './ipc/alerts.handlers.js';
import { registerFlipsHandlers } from './ipc/flips.handlers.js';
import { registerLogsHandlers } from './ipc/logs.handlers.js';
import { registerMarketHandlers } from './ipc/market.handlers.js';
import { registerQualityHandlers } from './ipc/quality.handlers.js';
import { registerWatchlistHandlers } from './ipc/watchlist.handlers.js';
import { createLiveHistoryHandler, createLiveMarketStore, createLiveTop10Handler } from './services/liveMarket.js';
import {
  createMappingNameCache,
  createMappingRewarmTracker,
  refreshMappingNameCache,
} from './services/mappingCache.js';
import { getApplicationVersion, initializeApplicationServices } from './services/application.js';
import { getAppLogger, initAppLogger } from './services/appLogger.js';
import { createPipelineRefresh, scoreBatchSnapshots } from './services/refreshPipeline.js';
import { createLoggingRefresh, startScheduler, stopScheduler, toSchedulerUpdate } from './services/scheduler.js';
import { getWindowOptions } from './window.js';
import { JsonWatchlistRepository } from '../storage/json/JsonWatchlistRepository.js';
import { JsonAlertRepository } from '../storage/json/JsonAlertRepository.js';
import { WikiPriceProvider } from '../core/market/providers/WikiPriceProvider.js';
import { closeHistoryRepository, createHistoryRepository } from '../storage/historyBackend.js';
import type { HistoryRepository } from '../core/history/HistoryRepository.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL ?? 'http://localhost:5173';

let mainWindow: BrowserWindow | null = null;
// S20 slice-1: module-level history handle so before-quit can release the
// backend (no-op for JSON, closes SQLite). Assigned once at launch.
let historyRepository: HistoryRepository | null = null;

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

void app.whenReady().then(async () => {
  initializeApplicationServices();
  // Sprint 19 slice-2: main-owned app logger (file sink under userData,
  // guide §44; no history-backend touch). Startup is the first category.
  // Slice-3a: retained module-level (review #193 nit) so scheduler/pipeline
  // callers log into the same ring past launch.
  initAppLogger({ baseDir: app.getPath('userData') });
  // Slice-3b: attach .catch so a logging bug can never surface as an
  // unhandled rejection from the startup path (review #195 nit 3).
  void getAppLogger()?.log('info', 'startup', `app started v${getApplicationVersion()}`)?.catch(() => undefined);
  registerAppHandlers(ipcMain, { getVersion: getApplicationVersion });
  // Sprint 20 slice-3: live Top-10/history over the S20 pipeline (no stub).
  // Top-10 serves the last successfully persisted batch from memory (zero
  // repository reads); history is a thin getItemHistory window range.
  // Empty before the first successful refresh — honestly empty, never a
  // fixture. The store is module-scoped here and published by the
  // pipeline's onBatch below.
  const liveStore = createLiveMarketStore();
  // S21 slice-2: async /mapping name cache over the slice-1 sync seam.
  // Sync read path stays fetch-free; this map is warmed once below
  // (best-effort) and read synchronously by both served + observed paths.
  const mappingNames = createMappingNameCache();
  // Re-warm slice: refresh-count gate (NOT a scheduler time hook — see
  // `MAPPING_REWARM_INTERVAL_REFRESHES`). `onBatch` fires only after a
  // successful persist + scorer pass, so counting there bounds the bulk
  // `/mapping` cost to one fetch per 288 healthy refreshes (~24 h).
  const mappingRewarm = createMappingRewarmTracker();
  const liveTop10 = createLiveTop10Handler(
    liveStore,
    Date.now,
    mappingNames.resolveName,
    mappingNames.resolveMetadata,
  );
  registerMarketHandlers(ipcMain, {
    getTop10: (request) => liveTop10(request),
    // History backend resolves lazily per request: registration runs
    // before createHistoryRepository assigns the module handle, so a
    // stale capture would stay null forever (S19 lazy-supplier precedent).
    getHistory: (request) => {
      if (historyRepository === null) {
        throw new Error('History backend not ready');
      }
      return createLiveHistoryHandler(historyRepository)(request);
    },
  });
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
  // Sprint 19 slice-3b: read-only log exposure (memory ring + summary;
  // lazy supplier so a swapped instance never leaves a stale capture).
  registerLogsHandlers(ipcMain, { getLogger: () => getAppLogger() });
  createWindow();
  // Sprint 10 slice-2: timer runtime (D#163) — S20 slice-1 plugs the real
  // provider → normalize → history pipeline in as the `refresh` dep
  // (SnapshotService verbatim, history selector verbatim, no interface
  // change). Notify pushes the fresh schedule snapshot to the renderer;
  // the manual trigger runs one refresh now (single-flight shared with
  // timer ticks).
  // S19 slice-3a: the refresh runs through the retained app logger so
  // every scheduler success/failure lands in the memory ring + app.log
  // (guide §44 `scheduler`). S20 slice-1: the inner pipeline logs
  // `api-refresh`/`api-failure` with real snapshot/excluded counts, so the
  // ring answers "why didn't the rankings update?" with evidence — the
  // `(stub, no pipeline)` honesty note is retired for the scheduler path.
  // S20 slice-3: the stub Top-10/history fixtures are retired too — the
  // pipeline publishes each persisted batch into liveStore (zero extra
  // reads) and the handlers above serve it; history reads the backend.
  // Slice-3b: lazy supplier (review #195 nit 2) so a swapped instance never
  // leaves a stale capture.
  const { repository, backend: historyBackend } =
    await createHistoryRepository(app.getPath('userData'));
  historyRepository = repository;
  void getAppLogger()
    ?.log('info', 'startup', `history backend: ${historyBackend}`)
    ?.catch(() => undefined);
  // S21 slice-2 warm: one bulk /mapping pull (best-effort, never blocks
  // startup or refresh — failure keeps the honest `Item <id>` fallback).
  const priceProvider = new WikiPriceProvider();
  // Both-down (b): single shared re-warm tick so onBatch + onFailure can
  // never drift (one background fetch shape, never throws into refresh).
  const tickMappingRewarm = (): Promise<void> =>
    mappingRewarm.rewarmIfDue(mappingNames, priceProvider).then((outcome) => {
      if (outcome === 'skipped') {
        return;
      }
      void getAppLogger()?.log(
        outcome === 'ok' ? 'info' : 'warn',
        'api-refresh',
        outcome === 'ok'
          ? `mapping names re-warmed: ${mappingNames.size()} cached`
          : 'mapping re-warm failed, keeping previous names',
      )?.catch(() => undefined);
    });
  void refreshMappingNameCache(mappingNames, priceProvider).then((ok) => {
    void getAppLogger()
      ?.log(
        'info',
        'startup',
        ok
          ? `mapping names: ${mappingNames.size()} cached`
          : 'mapping names: unavailable, using Item <id> fallback',
      )
      ?.catch(() => undefined);
  });
  const scheduler = startScheduler(undefined, {
    refresh: createLoggingRefresh(
      () => getAppLogger(),
      createPipelineRefresh({
        provider: priceProvider,
        repository: historyRepository,
        logger: () => getAppLogger(),
        // Observed counts run through the same sync resolvers as the
        // served Top-10 above so served==observed on names+metadata.
        // Enrichment (#47): metadata comes from the same already-cached
        // map — no extra bulk pull; miss degrades to neutral false/null.
        rankSnapshots: (snapshots, timestamp) =>
          scoreBatchSnapshots(
            snapshots,
            timestamp,
            mappingNames.resolveName,
            mappingNames.resolveMetadata,
          ),
        onBatch: (snapshots, timestamp) => {
          liveStore.set({ snapshots: [...snapshots], timestamp });
          // Count-gated re-warm: skipped (no fetch) until due; when due,
          // one best-effort background pull that never throws into the
          // refresh. Fail-open keeps previous names on failure.
          // Both-down (b): the same tick runs on onFailure below so an
          // empty cache recovers while price refreshes keep failing.
          void tickMappingRewarm();
        },
        onFailure: () => {
          void tickMappingRewarm();
        },
      }),
    ),
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
// lingering handle in tests/packaged runs. S20 slice-1: also release the
// history backend handle (no-op for JSON, closes SQLite).
app.on('before-quit', () => {
  stopScheduler();
  if (historyRepository !== null) {
    try {
      closeHistoryRepository(historyRepository);
    } catch {
      // Backend release must not block shutdown; the failure is already
      // visible via the refresh log if it matters.
    }
    historyRepository = null;
  }
});
