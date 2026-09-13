import { contextBridge, ipcRenderer } from 'electron';
import { APP_GET_VERSION, MARKET_GET_TOP10 } from '../shared/ipc.js';
import type { MarketTop10Request, MarketTop10Response, OsrsApi } from '../shared/ipc.js';

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
  },
};

contextBridge.exposeInMainWorld('osrsApi', api);
