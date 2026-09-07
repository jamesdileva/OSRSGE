import { describe, expect, it } from 'vitest';
import type { MarketSnapshot } from '../../core/market/normalization/normalizer.js';
import { liquidityScore, recentVolume } from '../../core/market/analytics/liquidity.js';

const HOUR = 60 * 60 * 1_000;
const NOW = 1_788_484_800_000;

describe('liquidity', () => {
  it('ranks volume as a percentile of the universe', () => {
    expect(liquidityScore(30, [10, 20, 30, 40])).toBe(50);
    expect(liquidityScore(40, [10, 20, 30, 40])).toBe(75);
    expect(liquidityScore(5, [10, 20, 30, 40])).toBe(0);
  });

  it('returns undefined without volume data or a universe', () => {
    expect(liquidityScore(undefined, [10, 20])).toBeUndefined();
    expect(liquidityScore(30, [])).toBeUndefined();
  });

  it('sums trailing-24h volumes and reports undefined when absent', () => {
    const history: MarketSnapshot[] = [
      { itemId: 1, timestamp: NOW - 2 * HOUR, high: 100, low: 90, volume: 10 },
      { itemId: 1, timestamp: NOW - HOUR, high: 100, low: 90, volume: 20 },
      { itemId: 1, timestamp: NOW - 30 * HOUR, high: 100, low: 90, volume: 999 },
    ];
    expect(recentVolume(history, NOW)).toBe(30);

    const noVolume: MarketSnapshot[] = [{ itemId: 1, timestamp: NOW, high: 100, low: 90 }];
    expect(recentVolume(noVolume, NOW)).toBeUndefined();
  });
});
