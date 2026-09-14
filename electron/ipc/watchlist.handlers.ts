import { WATCHLIST_ADD, WATCHLIST_GET, WATCHLIST_REMOVE } from '../../shared/ipc.js';
import type {
  WatchlistAddRequest,
  WatchlistGetResponse,
  WatchlistRemoveRequest,
} from '../../shared/ipc.js';
import type { WatchlistEntry } from '../../core/watchlist/watchlist.js';
import { addToWatchlist, removeFromWatchlist } from '../../core/watchlist/watchlist.js';
import type { IpcMainHandler } from './app.handlers.js';

export interface WatchlistHandlerDeps {
  load: () => Promise<WatchlistEntry[]> | WatchlistEntry[];
  save: (entries: readonly WatchlistEntry[]) => Promise<void> | void;
  /** Clock override for tests (defaults to Date.now). */
  now?: () => number;
}

/**
 * Sprint 11 slice-2 watchlist IPC (roadmap §13, part 2a).
 * Main owns persistence: handlers load the ID-only store, apply the pure
 * add/remove helpers (first-watch-wins, strict validation), save the
 * whole list, and return the fresh entry list. Price/change/spread/risk
 * never ride this channel — the renderer derives them via
 * buildWatchlistView. Zero scheduler/UI/network.
 */
export function registerWatchlistHandlers(ipcMain: IpcMainHandler, deps: WatchlistHandlerDeps): void {
  const nowMs = (): number => (deps.now !== undefined ? deps.now() : Date.now());

  ipcMain.handle(WATCHLIST_GET, async (): Promise<WatchlistGetResponse> => {
    const entries = await deps.load();
    // Copy for symmetry with add/remove: safe across real IPC (structured
    // clone) and avoids aliasing for in-process callers.
    return { entries: entries.map((entry) => ({ ...entry })) };
  });

  ipcMain.handle(WATCHLIST_ADD, async (_event: unknown, request?: unknown): Promise<WatchlistGetResponse> => {
    const itemId = (request as WatchlistAddRequest | undefined)?.itemId;
    const current = await deps.load();
    // Pure helper throws on garbage ids/timestamps (fail-closed).
    const updated = addToWatchlist(current, itemId as number, nowMs());
    await deps.save(updated);
    return { entries: updated };
  });

  ipcMain.handle(WATCHLIST_REMOVE, async (_event: unknown, request?: unknown): Promise<WatchlistGetResponse> => {
    const itemId = (request as WatchlistRemoveRequest | undefined)?.itemId;
    const current = await deps.load();
    const updated = removeFromWatchlist(current, itemId as number);
    await deps.save(updated);
    return { entries: updated };
  });
}
