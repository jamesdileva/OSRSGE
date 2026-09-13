import { describe, expect, it } from 'vitest';
import {
  addToWatchlist,
  createWatchlist,
  isWatched,
  removeFromWatchlist,
  watchlistIds,
  type WatchlistEntry,
} from '../../core/watchlist/watchlist.js';

const T0 = 1_700_000_000_000;

function seed(): WatchlistEntry[] {
  return [
    { itemId: 4151, addedAt: T0 },
    { itemId: 560, addedAt: T0 + 1 },
  ];
}

describe('watchlist store', () => {
  it('creates an empty watchlist by default and copies seeds', () => {
    expect(createWatchlist()).toEqual([]);
    const initial = seed();
    const list = createWatchlist(initial);
    expect(list).toEqual(initial);
    expect(list).not.toBe(initial);
  });

  it('appends new ids with the given timestamp', () => {
    const list = addToWatchlist(createWatchlist(), 4151, T0);
    expect(list).toEqual([{ itemId: 4151, addedAt: T0 }]);
    expect(watchlistIds(addToWatchlist(list, 560, T0 + 5))).toEqual([4151, 560]);
  });

  it('re-adding a watched id preserves the original addedAt and position', () => {
    const list = addToWatchlist(seed(), 4151, T0 + 999);
    expect(watchlistIds(list)).toEqual([4151, 560]);
    expect(list[0]).toEqual({ itemId: 4151, addedAt: T0 });
  });

  it('removes ids and returns an equal fresh array for unknown ids', () => {
    expect(watchlistIds(removeFromWatchlist(seed(), 4151))).toEqual([560]);
    const list = removeFromWatchlist(seed(), 9999);
    expect(watchlistIds(list)).toEqual([4151, 560]);
  });

  it('answers membership', () => {
    expect(isWatched(seed(), 560)).toBe(true);
    expect(isWatched(seed(), 9999)).toBe(false);
  });

  it('rejects invalid ids and timestamps', () => {
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      expect(() => addToWatchlist([], bad, T0)).toThrow();
      expect(() => removeFromWatchlist([], bad)).toThrow();
      expect(() => isWatched([], bad)).toThrow();
    }
    expect(() => addToWatchlist([], 4151, Number.NaN)).toThrow();
    expect(() => addToWatchlist([], 4151, Number.POSITIVE_INFINITY)).toThrow();
    expect(() => createWatchlist([{ itemId: -2, addedAt: T0 }])).toThrow();
  });

  it('never mutates inputs (frozen-input safe)', () => {
    const frozen = Object.freeze(seed().map((e) => Object.freeze({ ...e })));
    const added = addToWatchlist(frozen, 1234, T0);
    const removed = removeFromWatchlist(frozen, 4151);
    expect(watchlistIds(frozen)).toEqual([4151, 560]);
    expect(watchlistIds(added)).toEqual([4151, 560, 1234]);
    expect(watchlistIds(removed)).toEqual([560]);
  });

  it('returns copies so callers cannot alias stored entries', () => {
    const list = seed();
    const added = addToWatchlist(list, 1234, T0);
    added[0]!.addedAt = -1;
    expect(list[0]).toEqual({ itemId: 4151, addedAt: T0 });
  });
});
