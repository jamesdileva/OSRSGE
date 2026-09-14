import { describe, expect, it } from 'vitest';
import type { LatestEntry } from '../../core/market/providers/MarketDataProvider.js';
import {
  normalizeEntry,
  type MarketSnapshot,
} from '../../core/market/normalization/normalizer.js';
import { freshnessFactor, computeConfidence } from '../../core/market/ranking/confidence.js';
import {
  assessProviderHealth,
  countImpossible,
  countMissingSides,
  freshnessScore,
  hasDuplicateTimestamp,
  isDuplicateBatch,
  isFrozenFeed,
  isImpossibleSnapshot,
  isPriceSpike,
  isStaleData,
  MAX_GE_PRICE_GP,
  STALE_AFTER_MS,
  stalenessMs,
  trackMissingItems,
} from '../../core/market/quality/dataQuality.js';

const NOW = 1_788_500_000_000;
const FETCHED_AT = NOW;

function snap(itemId: number, timestamp: number, high?: number, low?: number): MarketSnapshot {
  const s: MarketSnapshot = { itemId, timestamp };
  if (high !== undefined) {
    s.high = high;
  }
  if (low !== undefined) {
    s.low = low;
  }
  return s;
}

describe('freshness single truth', () => {
  it('fresh pull scores 1 and is not stale; stale boundary derives from the score', () => {
    expect(freshnessScore(stalenessMs(NOW, NOW))).toBe(1);
    expect(isStaleData(NOW, NOW)).toBe(false);
    expect(freshnessScore(STALE_AFTER_MS)).toBe(0);
    expect(isStaleData(NOW, NOW - STALE_AFTER_MS)).toBe(true);
    // Interior point: score and gate always agree.
    const half = STALE_AFTER_MS / 2;
    expect(freshnessScore(half)).toBeCloseTo(0.5, 12);
    expect(isStaleData(NOW, NOW - half)).toBe(false);
    // Future pull clamps to fresh, never stale.
    expect(freshnessScore(-60_000)).toBe(1);
    expect(isStaleData(NOW, NOW + 60_000)).toBe(false);
  });

  it('strict-throws on non-finite time inputs', () => {
    expect(() => stalenessMs(Number.NaN, NOW)).toThrow('Invalid nowMs');
    expect(() => stalenessMs(NOW, Number.POSITIVE_INFINITY)).toThrow('Invalid latestTimestampMs');
    expect(() => freshnessScore(Number.NaN)).toThrow('Invalid stalenessMs');
  });
});

describe('missing-data tracking where the normalizer stays silent', () => {
  it('counts one-sided partials the normalizer keeps', () => {
    const highOnly = normalizeEntry(
      2,
      { high: 500, highTime: 1788483777, low: null, lowTime: null } as LatestEntry,
      FETCHED_AT,
    );
    const lowOnly = normalizeEntry(
      3,
      { high: null, highTime: null, low: 100, lowTime: 1788483014 } as LatestEntry,
      FETCHED_AT,
    );
    // Normalizer keeps both partials (non-null) — quality must see the gaps.
    expect(highOnly).not.toBeNull();
    expect(lowOnly).not.toBeNull();
    const census = countMissingSides([highOnly as MarketSnapshot, lowOnly as MarketSnapshot]);
    expect(census).toEqual({ total: 2, missingHigh: 1, missingLow: 1 });
  });

  it('tracks universe coverage gaps as a fresh sorted id list', () => {
    const batch = [snap(1, NOW, 100, 90), snap(3, NOW, 50, 45)];
    expect(trackMissingItems([1, 2, 3], batch)).toEqual([2]);
    expect(trackMissingItems([3, 1], batch)).toEqual([]);
  });
});

describe('duplicate batches match history timestamp-exists semantics', () => {
  it('flags repeated timestamps, never content-equal feeds', () => {
    expect(hasDuplicateTimestamp([1000, 2000, 1000])).toBe(true);
    expect(hasDuplicateTimestamp([1000, 2000, 3000])).toBe(false);
    expect(isDuplicateBatch([1000, 2000], 2000)).toBe(true);
    expect(isDuplicateBatch([1000, 2000], 3000)).toBe(false);
    // Same prices, new timestamp: not a duplicate batch (frozen-feed territory).
    expect(isDuplicateBatch([1000], 2000)).toBe(false);
    expect(isFrozenFeed([500, 500, 500])).toBe(true);
    expect(isFrozenFeed([500, 500])).toBe(false);
  });

  it('strict-throws on non-finite timestamps', () => {
    expect(() => hasDuplicateTimestamp([1000, Number.NaN])).toThrow('Invalid batch timestamp');
    expect(() => isDuplicateBatch([1000], Number.POSITIVE_INFINITY)).toThrow(
      'Invalid candidateTimestamp',
    );
  });
});

describe('impossible vs suspicious vs invalid', () => {
  it('flags over-cap and crossed-market snapshots as impossible (skip-count, not throw)', () => {
    expect(isImpossibleSnapshot(snap(1, NOW, MAX_GE_PRICE_GP + 1, 100))).toBe(true);
    expect(isImpossibleSnapshot(snap(1, NOW, 90, 100))).toBe(true);
    expect(isImpossibleSnapshot(snap(1, NOW, 100, 90))).toBe(false);
    expect(countImpossible([snap(1, NOW, 100, 90), snap(2, NOW, 90, 100)])).toBe(1);
  });

  it('fail-closed throws on shapes the normalizer could never emit', () => {
    // Non-positive / non-finite sides are the normalizer's exclusion zone.
    expect(() => isImpossibleSnapshot(snap(1, NOW, 0, 100))).toThrow('Invalid snapshot price side');
    expect(() => isImpossibleSnapshot(snap(1, NOW, Number.NaN, 100))).toThrow(
      'Invalid snapshot price side',
    );
    expect(() => countMissingSides([snap(1, Number.NaN, 100, 90)])).toThrow(
      'Invalid snapshot.timestamp',
    );
  });

  it('spike is suspicious, not impossible, under the cap with a sane spread', () => {
    expect(isPriceSpike(100, 250)).toBe(true);
    expect(isPriceSpike(100, 110)).toBe(false);
    // The spiked snapshot itself is still possible: under cap, ask above bid.
    expect(isImpossibleSnapshot(snap(1, NOW, 260, 240))).toBe(false);
    expect(() => isPriceSpike(0, 100)).toThrow('positive prices');
    expect(() => isPriceSpike(Number.NaN, 100)).toThrow('Invalid prevMid');
  });
});

describe('provider health is a pure function of explicit counts', () => {
  it('grades HEALTHY / DEGRADED / DOWN on documented bands', () => {
    expect(
      assessProviderHealth({ totalRecords: 100, invalidRecords: 2, excluded: 3, stalenessMs: 0 }),
    ).toMatchObject({ status: 'HEALTHY', stale: false });
    expect(
      assessProviderHealth({ totalRecords: 100, invalidRecords: 8, excluded: 5, stalenessMs: 0 }),
    ).toMatchObject({ status: 'DEGRADED' });
    expect(
      assessProviderHealth({ totalRecords: 100, invalidRecords: 2, excluded: 3, stalenessMs: STALE_AFTER_MS + 1 }),
    ).toMatchObject({ status: 'DEGRADED', stale: true });
    expect(
      assessProviderHealth({ totalRecords: 100, invalidRecords: 40, excluded: 20, stalenessMs: 0 }),
    ).toMatchObject({ status: 'DOWN' });
    expect(
      assessProviderHealth({ totalRecords: 100, invalidRecords: 0, excluded: 0, stalenessMs: 61 * 60 * 1000 }),
    ).toMatchObject({ status: 'DOWN' });
  });

  it('missing items cap a fresh feed at DEGRADED; bad counts throw', () => {
    expect(
      assessProviderHealth({
        totalRecords: 100,
        invalidRecords: 0,
        excluded: 0,
        stalenessMs: 0,
        missingCount: 2,
      }).status,
    ).toBe('DEGRADED');
    expect(() =>
      assessProviderHealth({ totalRecords: -1, invalidRecords: 0, excluded: 0, stalenessMs: 0 }),
    ).toThrow('non-negative');
    expect(() =>
      assessProviderHealth({ totalRecords: 10, invalidRecords: 11, excluded: 0, stalenessMs: 0 }),
    ).toThrow('cannot exceed total');
  });
});

describe('non-overlap disconfirm both directions (review #155 cheapest check)', () => {
  it('normalizer keeps what quality flags: stale pull, duplicate batch, absurd spike', () => {
    const kept = normalizeEntry(
      4151,
      { high: 810000, highTime: 1788483777, low: 790000, lowTime: 1788483014 } as LatestEntry,
      FETCHED_AT,
    );
    expect(kept).not.toBeNull();
    // Stale: a 60-minute-old pull is far past the 15-minute quality budget.
    expect(isStaleData(NOW, FETCHED_AT - 60 * 60 * 1000)).toBe(true);
    // Duplicate: the same batch timestamp reappears.
    expect(isDuplicateBatch([FETCHED_AT], FETCHED_AT)).toBe(true);
    // Absurd: crossed market + over-cap both impossible, spike suspicious.
    expect(isImpossibleSnapshot(snap(4151, FETCHED_AT, 90, 100))).toBe(true);
    expect(isImpossibleSnapshot(snap(4151, FETCHED_AT, MAX_GE_PRICE_GP + 5, MAX_GE_PRICE_GP))).toBe(true);
    expect(isPriceSpike(100, 300)).toBe(true);
  });

  it('quality passes what the normalizer excludes and confidence penalizes', () => {
    // Both-sides-zero: normalizer excludes (null) — quality over the kept set sees nothing.
    const junk = normalizeEntry(
      99,
      { high: 0, highTime: 1788483777, low: 0, lowTime: 1788483014 } as LatestEntry,
      FETCHED_AT,
    );
    expect(junk).toBeNull();
    const kept = [snap(4151, NOW, 810000, 790000)];
    expect(countImpossible(kept)).toBe(0);
    expect(freshnessScore(stalenessMs(NOW, NOW))).toBe(1);
    expect(isStaleData(NOW, NOW)).toBe(false);
    // Same fresh evidence, thin history: confidence penalizes what quality passes.
    expect(freshnessFactor(30)).toBe(1);
    // Coverage 10/1440 drags confidence near zero while the pull itself is fresh.
    const thin = computeConfidence({ historyMinutes: 10, requiredMinutes: 1440 });
    expect(thin).toBeLessThan(0.01);
  });
});

describe('frozen-input purity and fresh outputs', () => {
  it('never mutates frozen inputs and returns fresh objects per call', () => {
    const batch = Object.freeze([Object.freeze(snap(1, NOW, 100, 90))]) as readonly MarketSnapshot[];
    const before = JSON.stringify(batch);
    const first = countMissingSides(batch);
    const second = countMissingSides(batch);
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(trackMissingItems([1, 2], batch)).toEqual([2]);
    expect(JSON.stringify(batch)).toBe(before);
    const healthy = assessProviderHealth({
      totalRecords: 10,
      invalidRecords: 0,
      excluded: 0,
      stalenessMs: 0,
    });
    expect(healthy.status).toBe('HEALTHY');
  });
});
