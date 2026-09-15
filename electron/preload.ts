import { contextBridge, ipcRenderer } from 'electron';
import {
  ALERTS_ADD,
  ALERTS_GET,
  ALERTS_REMOVE,
  ALERTS_SET_ENABLED,
  APP_GET_VERSION,
  FLIP_CALCULATE,
  QUALITY_ASSESS,
  MARKET_GET_HISTORY,
  MARKET_GET_TOP10,
  MARKET_REFRESH_NOW,
  MARKET_REFRESH_UPDATED,
  WATCHLIST_ADD,
  WATCHLIST_GET,
  WATCHLIST_REMOVE,
} from '../shared/ipc.js';
import type {
  AlertsAddRequest,
  AlertsGetResponse,
  AlertsRemoveRequest,
  AlertsSetEnabledRequest,
  FlipCalculateRequest,
  FlipCalculateResponse,
  MarketHistoryRequest,
  MarketHistoryResponse,
  MarketRefreshUpdate,
  QualityAssessRequest,
  QualityAssessResponse,
  MarketTop10Request,
  MarketTop10Response,
  OsrsApi,
  WatchlistAddRequest,
  WatchlistGetResponse,
  WatchlistRemoveRequest,
} from '../shared/ipc.js';

/**
 * Deliberately small preload bridge (architecture §6, guide §7).
 * React gets exactly this API — raw ipcRenderer is never exposed.
 */
const api: OsrsApi = {
  app: {
    getVersion: () => ipcRenderer.invoke(APP_GET_VERSION) as Promise<string>,
  },
  market: {
    fetchTop10: (request?: MarketTop10Request) =>
      ipcRenderer.invoke(MARKET_GET_TOP10, request) as Promise<MarketTop10Response>,
    fetchHistory: (request: MarketHistoryRequest) =>
      ipcRenderer.invoke(MARKET_GET_HISTORY, request) as Promise<MarketHistoryResponse>,
    triggerRefreshNow: () => ipcRenderer.invoke(MARKET_REFRESH_NOW) as Promise<MarketRefreshUpdate>,
    onRefreshUpdated: (listener: (update: MarketRefreshUpdate) => void) => {
      const wrapped = (_event: unknown, update: MarketRefreshUpdate): void => {
        listener(update);
      };
      ipcRenderer.on(MARKET_REFRESH_UPDATED, wrapped);
      return () => {
        ipcRenderer.removeListener(MARKET_REFRESH_UPDATED, wrapped);
      };
    },
  },
  // Sprint 11 slice-2: watchlist persistence (ID-only entries; view-time
  // derivation stays renderer-side via buildWatchlistView).
  watchlist: {
    getWatchlist: () => ipcRenderer.invoke(WATCHLIST_GET) as Promise<WatchlistGetResponse>,
    addToWatchlist: (request: WatchlistAddRequest) =>
      ipcRenderer.invoke(WATCHLIST_ADD, request) as Promise<WatchlistGetResponse>,
    removeFromWatchlist: (request: WatchlistRemoveRequest) =>
      ipcRenderer.invoke(WATCHLIST_REMOVE, request) as Promise<WatchlistGetResponse>,
  },
  // Sprint 12 slice-2 part 2: alert-rule persistence (rule store only;
  // evaluation stays renderer-side via evaluateAlerts, in-app only).
  alerts: {
    getAlerts: () => ipcRenderer.invoke(ALERTS_GET) as Promise<AlertsGetResponse>,
    addAlertRule: (request: AlertsAddRequest) =>
      ipcRenderer.invoke(ALERTS_ADD, request) as Promise<AlertsGetResponse>,
    removeAlertRule: (request: AlertsRemoveRequest) =>
      ipcRenderer.invoke(ALERTS_REMOVE, request) as Promise<AlertsGetResponse>,
    setAlertRuleEnabled: (request: AlertsSetEnabledRequest) =>
      ipcRenderer.invoke(ALERTS_SET_ENABLED, request) as Promise<AlertsGetResponse>,
  },
  // Sprint 13 slice-2: stateless flip calculation (pure calcFlip main-side;
  // callers pass observed prices in, calculated values come back out).
  flips: {
    calculateFlip: (request: FlipCalculateRequest) =>
      ipcRenderer.invoke(FLIP_CALCULATE, request) as Promise<FlipCalculateResponse>,
  },
  // Sprint 16 slice-2: stateless quality assessment (pure assessDataQuality
  // main-side; callers pass the observed batch in, trust verdict comes out).
  quality: {
    assessQuality: (request: QualityAssessRequest) =>
      ipcRenderer.invoke(QUALITY_ASSESS, request) as Promise<QualityAssessResponse>,
  },
};

contextBridge.exposeInMainWorld('osrsApi', api);
