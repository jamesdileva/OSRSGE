import { describe, expect, it } from 'vitest';
import { assessDataQuality } from '../../core/market/quality/qualityAssessment.js';
import { STALE_AFTER_MS } from '../../core/market/quality/dataQuality.js';
import type { MarketSnapshot } from '../../core/market/normalization/normalizer.js';

const NOW = 1_788_500_000_000;

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

describe('assessDataQuality orchestrator (pure, single truth)', () => {
  it('fresh batch scores 1 and reports no gaps', () => {
    const a = assessDataQuality({ snapshots: [snap(1, NOW, 100, 90)], nowMs: NOW });
    expect(a.freshnessScore).toBe(1);
    expect(a.stale).toBe(false);
    expect(a.missingSides).toEqual({ total: 1, missingHigh: 0, missingLow: 0 });
    expect(a.missingItems).toEqual([]);
    expect(a.impossibleCount).toBe(0);
    expect(a.duplicateBatch).toBeNull();
    expect(a.health).toBeNull();
  });

  it('empty batch is fully stale with zero counts', () => {
    const a = assessDataQuality({ snapshots: [], nowMs: NOW });
    expect(a.stale).toBe(true);
    expect(a.freshnessScore).toBe(0);
    expect(a.missingSides).toEqual({ total: 0, missingHigh: 0, missingLow: 0 });
  });

  it('reports missing items, impossible count, duplicate flag and health together', () => {
    const batch = [snap(1, NOW, 100, 90), snap(2, NOW, 200, undefined)];
    const a = assessDataQuality({
      snapshots: batch,
      nowMs: NOW,
      expectedItemIds: [1, 2, 3],
      existingTimestamps: [NOW - 1000],
      candidateTimestamp: NOW,
      totalRecords: 10,
      invalidRecords: 0,
      excluded: 0,
    });
    expect(a.missingSides).toEqual({ total: 2, missingHigh: 0, missingLow: 1 });
    expect(a.missingItems).toEqual([3]);
    expect(a.impossibleCount).toBe(0);
    expect(a.duplicateBatch).toBe(false);
    expect(a.health?.status).toBe('DEGRADED');
    expect(a.health?.reason).toBe('missing items reported');
  });

  it('flags a stale duplicate DOWN feed with crossed-market impossibles', () => {
    const staleAt = NOW - STALE_AFTER_MS - 60_000;
    const batch = [snap(1, staleAt, 90, 100)];
    const a = assessDataQuality({
      snapshots: batch,
      nowMs: NOW,
      existingTimestamps: [staleAt],
      candidateTimestamp: staleAt,
      totalRecords: 10,
      invalidRecords: 6,
      excluded: 0,
    });
    expect(a.stale).toBe(true);
    expect(a.impossibleCount).toBe(1);
    expect(a.duplicateBatch).toBe(true);
    expect(a.health?.status).toBe('DOWN');
  });

  it('fails closed on partial duplicate/counter context and invalid clocks', () => {
    expect(() => assessDataQuality({ snapshots: [], nowMs: Number.NaN })).toThrow('Invalid nowMs');
    expect(() =>
      assessDataQuality({ snapshots: [snap(1, NOW, 100, 90)], nowMs: NOW, candidateTimestamp: NOW }),
    ).toThrow('duplicate context');
    expect(() =>
      assessDataQuality({ snapshots: [], nowMs: NOW, totalRecords: 10, invalidRecords: 0 }),
    ).toThrow('provider counters');
  });

  it('never aliases inputs (frozen-input safe, fresh outputs)', () => {
    const batch = [snap(1, NOW, 100, 90)];
    const expected = [1, 2];
    const a = assessDataQuality({ snapshots: batch, nowMs: NOW, expectedItemIds: expected });
    expect(a.missingItems).not.toBe(expected);
    expect(a.missingSides).not.toBeUndefined();
    const b = assessDataQuality({ snapshots: batch, nowMs: NOW, expectedItemIds: expected });
    expect(b).toEqual(a);
    expect(b.missingItems).not.toBe(a.missingItems);
  });
});
