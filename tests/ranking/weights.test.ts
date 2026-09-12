import { describe, expect, it } from 'vitest';
import type { RankingPresetName } from '../../core/market/ranking/types.js';
import {
  DEFAULT_WEIGHTS,
  RANKING_PRESETS,
  isValidWeights,
  rankingVersionForPreset,
  resolveWeights,
} from '../../core/market/ranking/weights.js';

const PRESETS: RankingPresetName[] = [
  'BALANCED',
  'CONSERVATIVE',
  'AGGRESSIVE',
  'CHEAP_FLIPS',
  'HIGH_PROFIT',
];

function total(weights: typeof DEFAULT_WEIGHTS): number {
  return (
    weights.momentum +
    weights.liquidity +
    weights.spread +
    weights.profitability +
    weights.consistency +
    weights.volatility
  );
}

describe('ranking weights', () => {
  it('defaults to the architecture §18 baseline totaling 1.0', () => {
    expect(DEFAULT_WEIGHTS).toEqual({
      momentum: 0.3,
      liquidity: 0.2,
      spread: 0.2,
      profitability: 0.15,
      consistency: 0.1,
      volatility: 0.05,
    });
    expect(total(DEFAULT_WEIGHTS)).toBeCloseTo(1, 9);
    expect(isValidWeights(DEFAULT_WEIGHTS)).toBe(true);
  });

  it('keeps every preset valid and totaling 1.0', () => {
    for (const preset of PRESETS) {
      expect(isValidWeights(RANKING_PRESETS[preset])).toBe(true);
      expect(total(RANKING_PRESETS[preset])).toBeCloseTo(1, 9);
    }
  });

  it('returns a copy so callers cannot mutate the preset', () => {
    const weights = resolveWeights('BALANCED');
    expect(weights).toEqual(DEFAULT_WEIGHTS);
    expect(weights).not.toBe(RANKING_PRESETS.BALANCED);
    weights.momentum = 0;
    expect(RANKING_PRESETS.BALANCED.momentum).toBe(0.3);
  });

  it('rejects shares that are negative, >1, non-finite, or off-sum', () => {
    expect(isValidWeights({ ...DEFAULT_WEIGHTS, momentum: -0.1 })).toBe(false);
    expect(isValidWeights({ ...DEFAULT_WEIGHTS, momentum: 1.1 })).toBe(false);
    expect(isValidWeights({ ...DEFAULT_WEIGHTS, momentum: Number.NaN })).toBe(false);
    expect(isValidWeights({ ...DEFAULT_WEIGHTS, momentum: 0.4 })).toBe(false);
  });

  it('throws on unknown presets and versions each preset', () => {
    expect(() =>
      resolveWeights('BOGUS' as unknown as RankingPresetName),
    ).toThrow('Unknown ranking preset');
    expect(rankingVersionForPreset('BALANCED')).toBe('0.1-balanced');
  });
});
