import { MARKET_GET_HISTORY, MARKET_GET_TOP10 } from '../../shared/ipc.js';
import type { MarketHistoryRequest, MarketHistoryResponse, MarketTop10Request, MarketTop10Response } from '../../shared/ipc.js';
import type { IpcMainHandler } from './app.handlers.js';

export interface MarketHandlerDeps {
  getTop10: (request?: MarketTop10Request) => MarketTop10Response | Promise<MarketTop10Response>;
  getHistory?: (request: MarketHistoryRequest) => MarketHistoryResponse | Promise<MarketHistoryResponse>;
}

/** Sprint 20 slice-3 live market channels: main serves the last persisted batch + stored history (no stub). */
export function registerMarketHandlers(ipcMain: IpcMainHandler, deps: MarketHandlerDeps): void {
  ipcMain.handle(MARKET_GET_TOP10, (_event: unknown, request?: unknown) =>
    deps.getTop10(request as MarketTop10Request | undefined),
  );
  // History surface is optional so pre-S8 callers keep working; the
  // production main always injects the live history handler over the
  // selected backend (Sprint 20 slice-3).
  if (deps.getHistory !== undefined) {
    const getHistory = deps.getHistory;
    ipcMain.handle(MARKET_GET_HISTORY, (_event: unknown, request?: unknown) =>
      getHistory(request as MarketHistoryRequest),
    );
  }
}
