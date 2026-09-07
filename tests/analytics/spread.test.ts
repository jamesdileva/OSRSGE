import { describe, expect, it } from 'vitest';
import { calculateSpread } from '../../core/market/analytics/spread.js';

describe('spread', () => {
  it('computes GP spread and percent of midpoint', () => {
    expect(calculateSpread({ itemId: 1, timestamp: 1, high: 110, low: 100 })).toEqual({
      gp: 10,
      percent: (10 / 105) * 100,
    });
  });

  it('returns undefined when either side is missing', () => {
    expect(calculateSpread({ itemId: 1, timestamp: 1, high: 110 })).toBeUndefined();
    expect(calculateSpread({ itemId: 1, timestamp: 1, low: 100 })).toBeUndefined();
  });

  it('returns undefined for non-positive low prices', () => {
    expect(calculateSpread({ itemId: 1, timestamp: 1, high: 110, low: 0 })).toBeUndefined();
  });
});
