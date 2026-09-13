import { MARKET_GET_TOP10 } from '../../shared/ipc.js';
import type { MarketTop10Request, MarketTop10Response } from '../../shared/ipc.js';
import type { IpcMainHandler } from './app.handlers.js';

export interface MarketHandlerDeps {
  getTop10: (request?: MarketTop10Request) => MarketTop10Response | Promise<MarketTop10Response>;
}

/** Sprint 7 slice-2 stub-feed channel: main returns a fixture, never a live pipeline (D#163). */
export function registerMarketHandlers(ipcMain: IpcMainHandler, deps: MarketHandlerDeps): void {
  ipcMain.handle(MARKET_GET_TOP10, (_event: unknown, request?: unknown) =>
    deps.getTop10(request as MarketTop10Request | undefined),
  );
}
