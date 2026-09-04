import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import type {
  LatestEntry,
  LatestSnapshot,
} from '../../core/market/providers/MarketDataProvider.js';
import {
  normalizeEntry,
  normalizeLatest,
} from '../../core/market/normalization/normalizer.js';
import type { FetchFn } from '../../core/market/providers/httpClient.js';
import { WikiPriceProvider } from '../../core/market/providers/WikiPriceProvider.js';

const FETCHED_AT = 1_788_483_735_882;

function snapshotWith(entries: Record<number, LatestEntry>): LatestSnapshot {
  return { entries, fetchedAt: FETCHED_AT, invalidRecords: 0 };
}

const FULL: LatestEntry = {
  high: 811362,
  highTime: 1788483777,
  low: 790000,
  lowTime: 1788483014,
};

describe('normalizer', () => {
  it('normalizes a valid record with epoch timestamps intact', () => {
    expect(normalizeEntry(4151, FULL, FETCHED_AT)).toEqual({
      itemId: 4151,
      timestamp: FETCHED_AT,
      high: 811362,
      highTime: 1788483777,
      low: 790000,
      lowTime: 1788483014,
    });
  });

  it('keeps a high-only record without a low side', () => {
    expect(
      normalizeEntry(2, { high: 500, highTime: 1788483777, low: null, lowTime: null }, FETCHED_AT),
    ).toEqual({ itemId: 2, timestamp: FETCHED_AT, high: 500, highTime: 1788483777 });
  });

  it('keeps a low-only record without a high side', () => {
    expect(
      normalizeEntry(3, { high: null, highTime: null, low: 100, lowTime: 1788483014 }, FETCHED_AT),
    ).toEqual({ itemId: 3, timestamp: FETCHED_AT, low: 100, lowTime: 1788483014 });
  });

  it('maps zero and negative prices to undefined sides', () => {
    expect(
      normalizeEntry(4, { high: 0, highTime: 1788483777, low: 250, lowTime: 1788483014 }, FETCHED_AT),
    ).toEqual({ itemId: 4, timestamp: FETCHED_AT, highTime: 1788483777, low: 250, lowTime: 1788483014 });
    expect(
      normalizeEntry(5, { high: -10, highTime: 1, low: 250, lowTime: 1788483014 }, FETCHED_AT),
    ).toEqual({ itemId: 5, timestamp: FETCHED_AT, highTime: 1, low: 250, lowTime: 1788483014 });
  });

  it('excludes records with no usable price on either side', () => {
    const batch = normalizeLatest(
      snapshotWith({
        6: { high: 0, highTime: 1, low: null, lowTime: null },
        7: { high: null, highTime: null, low: -5, lowTime: 1 },
        4151: FULL,
      }),
    );

    expect(batch.snapshots.map((s) => s.itemId)).toEqual([4151]);
    expect(batch.excluded).toBe(2);
  });

  it('drops invalid highTime/lowTime values but keeps the price', () => {
    expect(
      normalizeEntry(
        8,
        { high: 900, highTime: 0, low: 800, lowTime: -50 },
        FETCHED_AT,
      ),
    ).toEqual({ itemId: 8, timestamp: FETCHED_AT, high: 900, low: 800 });
    expect(
      normalizeEntry(
        9,
        { high: 900, highTime: 9_999_999_999, low: 800, lowTime: 1788483014 },
        FETCHED_AT,
      ),
    ).toEqual({ itemId: 9, timestamp: FETCHED_AT, high: 900, low: 800, lowTime: 1788483014 });
  });

  it('passes unknown item IDs through without metadata lookups', () => {
    const batch = normalizeLatest(snapshotWith({ 123456789: FULL }));

    expect(batch.snapshots).toHaveLength(1);
    expect(batch.snapshots[0]?.itemId).toBe(123456789);
    expect(batch.excluded).toBe(0);
  });

  it('carries provider invalidRecords into the excluded count', () => {
    const batch = normalizeLatest({ entries: { 4151: FULL }, fetchedAt: FETCHED_AT, invalidRecords: 3 });

    expect(batch.snapshots).toHaveLength(1);
    expect(batch.excluded).toBe(3);
  });

  it('rejects a malformed API envelope at the provider boundary', async () => {
    const fetchFn: FetchFn = () =>
      Promise.resolve({ ok: true, status: 200, json: async () => ({ nope: [] }) } as Response);
    const provider = new WikiPriceProvider(fetchFn, 'https://prices.test/api/v2/osrs');

    await expect(provider.getLatest()).rejects.toBeInstanceOf(ZodError);
  });
});
