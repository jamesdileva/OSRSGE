import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Opportunity } from '../../core/market/ranking/types.js';
import { isValidWatchlistEntry } from '../../core/watchlist/watchlist.js';
import { buildWatchlistView } from '../../core/watchlist/watchlistView.js';
import { JsonWatchlistRepository } from '../../storage/json/JsonWatchlistRepository.js';

const T0 = 1_700_000_000_000;

function makeOpportunity(id: number, name: string, finalScore: number): Opportunity {
  return {
    rank: 0,
    item: { id, name, members: true, buyLimit: null, examine: '', value: null },
    currentPrice: 1000 + id,
    changes: { oneHour: 1, sixHour: 2, twentyFourHour: 3 },
    spread: { gp: 10, percent: 1 },
    components: { momentum: 50, liquidity: 50, spread: 50, profitability: 50, consistency: 50, volatility: 50 },
    risk: 'LOW',
    confidence: 0.9,
    baseScore: finalScore,
    finalScore,
  };
}

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe('watchlist view (slice-2 part 1)', () => {
  it('returns [] for an empty watchlist', () => {
    expect(buildWatchlistView([], [makeOpportunity(4151, 'Whip', 90)])).toEqual([]);
  });

  it('resolves known ids and preserves first-watch-wins order (not ranking order)', () => {
    const entries = [
      { itemId: 561, addedAt: T0 + 2 },
      { itemId: 4151, addedAt: T0 },
    ];
    // Opportunities ranked opposite to watch order.
    const opportunities = [makeOpportunity(4151, 'Abyssal whip', 90), makeOpportunity(561, 'Nature rune', 10)];
    const view = buildWatchlistView(entries, opportunities);
    expect(view.map((row) => row.itemId)).toEqual([561, 4151]);
    expect(view[0]!.addedAt).toBe(T0 + 2);
    expect(view[0]!.opportunity?.item.name).toBe('Nature rune');
    expect(view[1]!.opportunity?.item.name).toBe('Abyssal whip');
  });

  it('renders unknown/stale ids gracefully as null (no throw)', () => {
    const view = buildWatchlistView([{ itemId: 999_999, addedAt: T0 }], []);
    expect(view).toHaveLength(1);
    expect(view[0]).toEqual({ itemId: 999_999, addedAt: T0, opportunity: null });
    // Mixed known + unknown.
    const mixed = buildWatchlistView(
      [
        { itemId: 4151, addedAt: T0 },
        { itemId: 999_999, addedAt: T0 + 1 },
      ],
      [makeOpportunity(4151, 'Abyssal whip', 90)],
    );
    expect(mixed[0]!.opportunity?.item.name).toBe('Abyssal whip');
    expect(mixed[1]!.opportunity).toBeNull();
  });

  it('never mutates inputs (frozen-input safe) and returns fresh rows', () => {
    const entries = Object.freeze([
      Object.freeze({ itemId: 4151, addedAt: T0 }),
      Object.freeze({ itemId: 561, addedAt: T0 + 1 }),
    ]);
    const opportunities = Object.freeze([Object.freeze(makeOpportunity(4151, 'Whip', 90))]);
    const view = buildWatchlistView(entries, opportunities as unknown as Opportunity[]);
    expect(view.map((row) => row.itemId)).toEqual([4151, 561]);
    expect(view[1]!.opportunity).toBeNull();
    // Mutating the view must not alias the store input.
    view[0]!.addedAt = -1;
    expect(entries[0]!.addedAt).toBe(T0);
  });

  it('rejects negative addedAt once user-visible (store guard)', () => {
    expect(isValidWatchlistEntry({ itemId: 4151, addedAt: -1 })).toBe(false);
    expect(isValidWatchlistEntry({ itemId: 4151, addedAt: 0 })).toBe(true);
  });

  it('repo load normalizes to {itemId,addedAt}, dedupes first-wins, skips negatives', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'osrs-watchlist-view-'));
    dirs.push(dir);
    const repo = new JsonWatchlistRepository(dir);
    await writeFile(
      path.join(dir, 'watchlist.json'),
      JSON.stringify([
        { itemId: 4151, addedAt: T0, extra: 'strip-me', spread: 99 },
        { itemId: 4151, addedAt: T0 + 999 },
        { itemId: 561, addedAt: -5 },
        { itemId: 561, addedAt: T0 + 1 },
      ]),
      'utf8',
    );
    await expect(repo.load()).resolves.toEqual([
      { itemId: 4151, addedAt: T0 },
      { itemId: 561, addedAt: T0 + 1 },
    ]);
  });
});
