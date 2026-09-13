import { MARKET_GET_HISTORY, MARKET_GET_TOP10 } from '../../shared/ipc.js';
import type { MarketHistoryRequest, MarketHistoryResponse, MarketTop10Request, MarketTop10Response } from '../../shared/ipc.js';
import type { IpcMainHandler } from './app.handlers.js';

export interface MarketHandlerDeps {
  getTop10: (request?: MarketTop10Request) => MarketTop10Response | Promise<MarketTop10Response>;
  getHistory?: (request: MarketHistoryRequest) => MarketHistoryResponse | Promise<MarketHistoryResponse>;
}

/** Sprint 7 slice-2 stub-feed channel: main returns a fixture, never a live pipeline (D#163). */
export function registerMarketHandlers(ipcMain: IpcMainHandler, deps: MarketHandlerDeps): void {
  ipcMain.handle(MARKET_GET_TOP10, (_event: unknown, request?: unknown) =>
    deps.getTop10(request as MarketTop10Request | undefined),
  );
  // History surface is optional so Slice-1-era callers keep working; the
  // production main always injects the stub getHistory (Sprint 8 slice-2).
  if (deps.getHistory !== undefined) {
    const getHistory = deps.getHistory;
    ipcMain.handle(MARKET_GET_HISTORY, (_event: unknown, request?: unknown) =>
      getHistory(request as MarketHistoryRequest),
    );
  }
}
