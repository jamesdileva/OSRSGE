import { describe, expect, it } from 'vitest';
import {
  overlapCount,
  spearmanRankCorrelation,
  topNIds,
  zeroWeightAndRenorm,
} from '../../core/market/ranking/ablation.js';
import type { Opportunity } from '../../core/market/ranking/types.js';
import { DEFAULT_WEIGHTS } from '../../core/market/ranking/weights.js';

function fakeOpportunity(id: number): Opportunity {
  return {
    rank: 0,
    item: { id, name: `Item ${id}`, members: false, buyLimit: null, examine: '', value: null },
    currentPrice: 1000,
    changes: {},
    spread: {},
    components: { momentum: 50, liquidity: 50, spread: 50, profitability: 50, consistency: 50, volatility: 50 },
    risk: 'LOW',
    confidence: 1,
    baseScore: 50,
    finalScore: 50,
  };
}

function ordered(ids: number[]): Opportunity[] {
  return ids.map((id, index) => ({ ...fakeOpportunity(id), rank: index + 1 }));
}

describe('ablation helpers (offline)', () => {
  it('zeroes spread and renormalizes to 1.0', () => {
    const renormed = zeroWeightAndRenorm(DEFAULT_WEIGHTS, 'spread');
    expect(renormed.spread).toBe(0);
    const total = Object.values(renormed).reduce((s, v) => s + v, 0);
    expect(total).toBeCloseTo(1, 9);
    // BALANCED spread 0.2 removed: momentum 0.3/0.8 = 0.375
    expect(renormed.momentum).toBeCloseTo(0.375, 9);
  });

  it('zeroes profitability and renormalizes to 1.0', () => {
    const renormed = zeroWeightAndRenorm(DEFAULT_WEIGHTS, 'profitability');
    expect(renormed.profitability).toBe(0);
    const total = Object.values(renormed).reduce((s, v) => s + v, 0);
    expect(total).toBeCloseTo(1, 9);
  });

  it('identical orders correlate at rho=1 with full overlap', () => {
    const a = ordered([1, 2, 3, 4, 5]);
    const b = ordered([1, 2, 3, 4, 5]);
    expect(overlapCount(topNIds(a, 3), topNIds(b, 3))).toBe(3);
    expect(spearmanRankCorrelation(a, b)).toBeCloseTo(1, 9);
  });

  it('reversed orders correlate at rho=-1', () => {
    const a = ordered([1, 2, 3, 4, 5]);
    const b = ordered([5, 4, 3, 2, 1]);
    expect(spearmanRankCorrelation(a, b)).toBeCloseTo(-1, 9);
  });

  it('single swap lowers but does not destroy correlation', () => {
    const a = ordered([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const b = ordered([2, 1, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(overlapCount(topNIds(a, 10), topNIds(b, 10))).toBe(10);
    expect(spearmanRankCorrelation(a, b)).toBeGreaterThan(0.95);
  });
});
