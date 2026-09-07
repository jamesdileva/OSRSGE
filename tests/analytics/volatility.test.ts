import { describe, expect, it } from 'vitest';
import type { MarketSnapshot } from '../../core/market/normalization/normalizer.js';
import { calculateVolatility } from '../../core/market/analytics/volatility.js';

const HOUR = 60 * 60 * 1_000;
const NOW = 1_788_484_800_000;

function series(prices: number[]): MarketSnapshot[] {
  return prices.map((p, i) => ({ itemId: 1, timestamp: NOW - (prices.length - 1 - i) * HOUR, high: p, low: p }));
}

describe('volatility', () => {
  it('is zero for a perfectly flat series', () => {
    expect(calculateVolatility(series([100, 100, 100, 100, 100]), NOW)).toBe(0);
  });

  it('rises when the series gets choppier', () => {
    const calm = calculateVolatility(series([100, 101, 100, 101, 100]), NOW) as number;
    const wild = calculateVolatility(series([100, 120, 80, 120, 80]), NOW) as number;
    expect(wild).toBeGreaterThan(calm);
    expect(calm).toBeGreaterThan(0);
  });

  it('returns undefined with fewer than 4 usable points', () => {
    expect(calculateVolatility(series([100, 101, 102]), NOW)).toBeUndefined();
    expect(calculateVolatility([], NOW)).toBeUndefined();
  });

  it('skips snapshots without a usable price', () => {
    const history: MarketSnapshot[] = [
      ...series([100, 100, 100, 100]),
      { itemId: 1, timestamp: NOW - 30 * 60 * 1_000 },
    ];
    expect(calculateVolatility(history, NOW)).toBe(0);
  });
});
