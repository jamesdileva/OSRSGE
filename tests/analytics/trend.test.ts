import { describe, expect, it } from 'vitest';
import { trendConsistency } from '../../core/market/analytics/trend.js';

describe('trend consistency', () => {
  it('scores full agreement at 100', () => {
    expect(trendConsistency({ oneHour: 2, sixHour: 4, twentyFourHour: 8 })).toBe(100);
    expect(trendConsistency({ oneHour: -2, sixHour: -4, twentyFourHour: -8 })).toBe(100);
  });

  it('penalizes a short-term reversal against the daily trend', () => {
    // 24h (+) weight 3 and 6h (+) weight 2 agree; 1h (-) weight 1 disagrees.
    expect(trendConsistency({ oneHour: -3, sixHour: 2, twentyFourHour: 8 })).toBeCloseTo(
      (5 / 6) * 100,
      10,
    );
  });

  it('returns undefined when fewer than two windows are available', () => {
    expect(trendConsistency({ twentyFourHour: 8 })).toBeUndefined();
    expect(trendConsistency({})).toBeUndefined();
  });
});
