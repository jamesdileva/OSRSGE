import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  WATCHLIST_ADD,
  WATCHLIST_GET,
  WATCHLIST_REMOVE,
} from '../../shared/ipc.ts';
import type { WatchlistEntry } from '../../core/watchlist/watchlist.js';
import { registerWatchlistHandlers } from '../../electron/ipc/watchlist.handlers.ts';
import { addWatchedItem, fetchWatchlist, removeWatchedItem } from '../../src/services/electronApi.ts';

const T0 = 1_700_000_000_000;

function mockIpc(): {
  handlers: Map<string, (event: unknown, ...args: unknown[]) => unknown>;
  ipcMain: { handle: (channel: string, listener: (event: unknown, ...args: unknown[]) => unknown) => void };
} {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
  return {
    handlers,
    ipcMain: {
      handle: (channel, listener) => {
        handlers.set(channel, listener);
      },
    },
  };
}

afterEach(() => {
  window.osrsApi = undefined;
  vi.restoreAllMocks();
});

describe('Sprint 11 slice-2 watchlist IPC (main half + bridge guards, offline-pure)', () => {
  it('exposes stable watchlist channels', () => {
    expect(WATCHLIST_GET).toBe('watchlist:get');
    expect(WATCHLIST_ADD).toBe('watchlist:add');
    expect(WATCHLIST_REMOVE).toBe('watchlist:remove');
  });

  it('get returns the loaded entries', async () => {
    const { handlers, ipcMain } = mockIpc();
    const stored: WatchlistEntry[] = [{ itemId: 4151, addedAt: T0 }];
    registerWatchlistHandlers(ipcMain, {
      load: () => stored,
      save: () => undefined,
    });
    const listener = handlers.get(WATCHLIST_GET);
    expect(listener).toBeTypeOf('function');
    await expect(listener?.(undefined)).resolves.toEqual({ entries: stored });
  });

  it('add appends with the injected clock and persists (first-watch-wins on re-add)', async () => {
    const { handlers, ipcMain } = mockIpc();
    let stored: WatchlistEntry[] = [{ itemId: 4151, addedAt: T0 }];
    const saved: WatchlistEntry[][] = [];
    registerWatchlistHandlers(ipcMain, {
      load: () => stored,
      save: (entries) => {
        saved.push([...entries]);
        stored = [...entries];
      },
      now: () => T0 + 100,
    });
    const add = handlers.get(WATCHLIST_ADD);
    const first = (await add?.(undefined, { itemId: 561 })) as { entries: WatchlistEntry[] };
    expect(first.entries).toEqual([
      { itemId: 4151, addedAt: T0 },
      { itemId: 561, addedAt: T0 + 100 },
    ]);
    expect(saved).toHaveLength(1);

    // Re-add preserves the original addedAt + position.
    const second = (await add?.(undefined, { itemId: 561 })) as { entries: WatchlistEntry[] };
    expect(second.entries).toEqual(first.entries);
    expect(saved).toHaveLength(2);
  });

  it('remove drops the id and persists (unknown id is a fresh-array no-op)', async () => {
    const { handlers, ipcMain } = mockIpc();
    let stored: WatchlistEntry[] = [
      { itemId: 4151, addedAt: T0 },
      { itemId: 561, addedAt: T0 + 1 },
    ];
    registerWatchlistHandlers(ipcMain, {
      load: () => stored,
      save: (entries) => {
        stored = [...entries];
      },
    });
    const remove = handlers.get(WATCHLIST_REMOVE);
    const after = (await remove?.(undefined, { itemId: 4151 })) as { entries: WatchlistEntry[] };
    expect(after.entries).toEqual([{ itemId: 561, addedAt: T0 + 1 }]);
    const noop = (await remove?.(undefined, { itemId: 999_999 })) as { entries: WatchlistEntry[] };
    expect(noop.entries).toEqual([{ itemId: 561, addedAt: T0 + 1 }]);
  });

  it('add rejects garbage ids fail-closed (no save)', async () => {
    const { handlers, ipcMain } = mockIpc();
    const save = vi.fn();
    registerWatchlistHandlers(ipcMain, {
      load: () => [],
      save,
      now: () => T0,
    });
    const add = handlers.get(WATCHLIST_ADD);
    await expect(add?.(undefined, { itemId: 0 })).rejects.toThrow();
    await expect(add?.(undefined, { itemId: -5 })).rejects.toThrow();
    await expect(add?.(undefined, {})).rejects.toThrow();
    expect(save).not.toHaveBeenCalled();
  });

  it('renderer bridge helpers throw when the bridge is absent or stale', async () => {
    window.osrsApi = undefined;
    await expect(fetchWatchlist()).rejects.toThrow('Desktop bridge unavailable');
    await expect(addWatchedItem({ itemId: 4151 })).rejects.toThrow('Desktop bridge unavailable');
    await expect(removeWatchedItem({ itemId: 4151 })).rejects.toThrow('Desktop bridge unavailable');

    // Stale preload without the watchlist surface (S7/S10 precedent).
    window.osrsApi = {
      app: { getVersion: vi.fn() },
      market: { fetchTop10: vi.fn(), fetchHistory: vi.fn() },
    };
    await expect(fetchWatchlist()).rejects.toThrow('Desktop bridge unavailable');
    await expect(addWatchedItem({ itemId: 4151 })).rejects.toThrow('Desktop bridge unavailable');
    await expect(removeWatchedItem({ itemId: 4151 })).rejects.toThrow('Desktop bridge unavailable');
  });

  it('renderer bridge helpers delegate to the preload surface', async () => {
    const getWatchlist = vi.fn().mockResolvedValue({ entries: [{ itemId: 4151, addedAt: T0 }] });
    const addToWatchlist = vi
      .fn()
      .mockResolvedValue({ entries: [{ itemId: 4151, addedAt: T0 }, { itemId: 561, addedAt: T0 + 1 }] });
    const removeFromWatchlist = vi.fn().mockResolvedValue({ entries: [] });
    window.osrsApi = {
      app: { getVersion: vi.fn() },
      market: { fetchTop10: vi.fn(), fetchHistory: vi.fn() },
      watchlist: { getWatchlist, addToWatchlist, removeFromWatchlist },
    };
    await expect(fetchWatchlist()).resolves.toEqual({ entries: [{ itemId: 4151, addedAt: T0 }] });
    const added = await addWatchedItem({ itemId: 561 });
    expect(added.entries).toEqual([
      { itemId: 4151, addedAt: T0 },
      { itemId: 561, addedAt: T0 + 1 },
    ]);
    expect(addToWatchlist).toHaveBeenCalledWith({ itemId: 561 });
    await removeWatchedItem({ itemId: 4151 });
    expect(removeFromWatchlist).toHaveBeenCalledWith({ itemId: 4151 });
  });
});
