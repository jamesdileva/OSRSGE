import { contextBridge, ipcRenderer } from 'electron';
import {
  APP_GET_VERSION,
  MARKET_GET_HISTORY,
  MARKET_GET_TOP10,
  MARKET_REFRESH_NOW,
  MARKET_REFRESH_UPDATED,
} from '../shared/ipc.js';
import type {
  MarketHistoryRequest,
  MarketHistoryResponse,
  MarketRefreshUpdate,
  MarketTop10Request,
  MarketTop10Response,
  OsrsApi,
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
};

contextBridge.exposeInMainWorld('osrsApi', api);
