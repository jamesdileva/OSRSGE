import { describe, expect, it } from 'vitest';
import type { MarketSnapshot } from '../../core/market/normalization/normalizer.js';
import { computeMetrics } from '../../core/market/analytics/metrics.js';

const HOUR = 60 * 60 * 1_000;
const NOW = 1_788_484_800_000;

/** 25 hourly points, steadily rising, with volumes. */
function risingHistory(): MarketSnapshot[] {
  const out: MarketSnapshot[] = [];
  for (let i = 24; i >= 0; i -= 1) {
    const price = 1000 + (24 - i) * 10;
    out.push({
      itemId: 4151,
      timestamp: NOW - i * HOUR,
      high: price + 5,
      low: price - 5,
      volume: 100,
    });
  }
  return out;
}

describe('computeMetrics', () => {
  it('computes the full Sprint 5 metric set for a healthy history', () => {
    const metrics = computeMetrics(4151, risingHistory(), NOW, {
      volumes: [100, 500, 2500, 5000],
    });

    expect(metrics).not.toBeNull();
    expect(metrics?.itemId).toBe(4151);
    expect(metrics?.price).toBe(1240);
    expect(metrics?.priceChange24h).toBeCloseTo(24, 8);
    expect(metrics?.priceChange6h).toBeCloseTo((1240 - 1180) / 1180 * 100, 8);
    expect(metrics?.priceChange1h).toBeCloseTo((1240 - 1230) / 1230 * 100, 8);
    expect(metrics?.spreadGp).toBe(10);
    expect(metrics?.spreadPct).toBeCloseTo((10 / 1240) * 100, 8);
    expect(metrics?.volatility).toBeGreaterThanOrEqual(0);
    // Item 24h volume = 2500; universe [100, 500, 2500, 5000] → 2 of 4 below.
    expect(metrics?.liquidityScore).toBe(50);
    expect(metrics?.trendConsistency).toBe(100);
  });

  it('skips liquidity without a universe and returns null when empty', () => {
    const metrics = computeMetrics(4151, risingHistory(), NOW);

    expect(metrics?.liquidityScore).toBeUndefined();
    expect(metrics?.priceChange24h).toBeDefined();
    expect(computeMetrics(4151, [], NOW)).toBeNull();
  });
});
