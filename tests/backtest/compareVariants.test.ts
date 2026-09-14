import { describe, expect, it } from 'vitest';
import type { MarketSnapshot } from '../../core/market/normalization/normalizer.js';
import type { RankingConfig, RankingWeights } from '../../core/market/ranking/types.js';
import {
  compareWeightVariants,
  weightVariantTag,
  type ComparisonPeriod,
  type WeightVariant,
} from '../../core/market/backtest/compareVariants.js';

const HOUR = 3_600_000;

function flat(itemId: number, timestamp: number, price: number): MarketSnapshot {
  return { itemId, timestamp, high: price, low: price };
}

function wide(itemId: number, timestamp: number, price: number): MarketSnapshot {
  return { itemId, timestamp, high: price * 1.025, low: price * 0.975 };
}

const MOMENTUM: RankingWeights = { momentum: 1, liquidity: 0, spread: 0, profitability: 0, consistency: 0, volatility: 0 };
const SPREAD: RankingWeights = { momentum: 0, liquidity: 0, spread: 1, profitability: 0, consistency: 0, volatility: 0 };

function config(weights: RankingWeights): RankingConfig {
  return { preset: 'BALANCED', weights: { ...weights }, minPrice: 1, minVolume: 0, minHistoryMinutes: 60 };
}

/** Item 1 climbs steadily (zero spread); item 2 sits flat with a 5% spread. */
function histories(): Map<number, MarketSnapshot[]> {
  const climbs = [100, 101, 103, 106, 110, 114, 118, 122, 126];
  return new Map([
    [1, climbs.map((price, i) => flat(1, i * 6 * HOUR, price))],
    [2, climbs.map((_, i) => wide(2, i * 6 * HOUR, 100))],
  ]);
}

function periods(): ComparisonPeriod[] {
  return [
    { name: 'day-1', evaluationTimes: [24 * HOUR], horizonMs: 6 * HOUR },
    { name: 'day-2', evaluationTimes: [30 * HOUR], horizonMs: 6 * HOUR },
    { name: 'day-3', evaluationTimes: [36 * HOUR], horizonMs: 6 * HOUR },
  ];
}

function variants(): WeightVariant[] {
  return [
    { label: 'momentum', config: config(MOMENTUM) },
    { label: 'spread', config: config(SPREAD) },
  ];
}

describe('weightVariantTag', () => {
  it('is content-aware: different shares give different 0.2-custom tags', () => {
    const momentumTag = weightVariantTag(MOMENTUM);
    const spreadTag = weightVariantTag(SPREAD);
    expect(momentumTag).not.toBe(spreadTag);
    expect(momentumTag.startsWith('0.2-custom')).toBe(true);
    expect(spreadTag).toContain('s100');
    expect(weightVariantTag({ ...MOMENTUM })).toBe(momentumTag);
  });
});

describe('compareWeightVariants gates', () => {
  it('throws on fewer than two variants, bad labels, or invalid weights', () => {
    const base = { historiesByItem: histories(), periods: periods(), topN: 1 };
    expect(() => compareWeightVariants({ ...base, variants: [variants()[0] as WeightVariant] })).toThrow(
      'at least two variants',
    );
    expect(() => compareWeightVariants({ ...base, variants: [] })).toThrow('at least two variants');
    expect(() =>
      compareWeightVariants({ ...base, variants: [{ label: '', config: config(MOMENTUM) }, variants()[1] as WeightVariant] }),
    ).toThrow('non-empty strings');
    expect(() =>
      compareWeightVariants({ ...base, variants: [variants()[0] as WeightVariant, variants()[0] as WeightVariant] }),
    ).toThrow('Duplicate weight variant label');
    const bad = config(MOMENTUM);
    bad.weights = { ...MOMENTUM, momentum: 0.5 };
    expect(() =>
      compareWeightVariants({ ...base, variants: [{ label: 'bad', config: bad }, variants()[1] as WeightVariant] }),
    ).toThrow('Invalid ranking weights');
  });

  it('throws when variants differ by more than weights, or duplicate weights', () => {
    const base = { historiesByItem: histories(), periods: periods(), topN: 1 };
    const filtered = config(MOMENTUM);
    filtered.minPrice = 500;
    expect(() =>
      compareWeightVariants({ ...base, variants: [{ label: 'filtered', config: filtered }, variants()[1] as WeightVariant] }),
    ).toThrow('more than weights');
    expect(() =>
      compareWeightVariants({
        ...base,
        variants: [
          { label: 'a', config: config(MOMENTUM) },
          { label: 'b', config: config(MOMENTUM) },
        ],
      }),
    ).toThrow('duplicates another');
  });

  it('throws on fewer than three periods, bad names, empty/NaN times, bad topN', () => {
    const base = { historiesByItem: histories(), variants: variants(), periods: periods(), topN: 1 };
    expect(() => compareWeightVariants({ ...base, periods: periods().slice(0, 2) })).toThrow(
      'at least 3 periods',
    );
    expect(() =>
      compareWeightVariants({
        ...base,
        periods: [{ name: '', evaluationTimes: [24 * HOUR], horizonMs: HOUR }, ...periods().slice(0, 2)],
      }),
    ).toThrow('non-empty strings');
    expect(() =>
      compareWeightVariants({
        ...base,
        periods: [periods()[0] as ComparisonPeriod, periods()[1] as ComparisonPeriod, periods()[0] as ComparisonPeriod],
      }),
    ).toThrow('Duplicate comparison period name');
    expect(() =>
      compareWeightVariants({
        ...base,
        periods: [{ name: 'empty', evaluationTimes: [], horizonMs: HOUR }, ...periods().slice(0, 2)],
      }),
    ).toThrow('at least one evaluation time');
    expect(() =>
      compareWeightVariants({
        ...base,
        periods: [{ name: 'nan', evaluationTimes: [Number.NaN], horizonMs: HOUR }, ...periods().slice(0, 2)],
      }),
    ).toThrow('finite timestamps');
    expect(() => compareWeightVariants({ ...base, topN: 0 })).toThrow('topN');
  });
});

describe('compareWeightVariants end-to-end (divergence disconfirm)', () => {
  it('momentum-heavy beats spread-heavy on a steady climber vs a flat wide spread', () => {
    const result = compareWeightVariants({ historiesByItem: histories(), variants: variants(), periods: periods(), topN: 1 });
    expect(result.rankedLabels).toEqual(['momentum', 'spread']);
    const momentum = result.variants.find((v) => v.label === 'momentum')!;
    const spread = result.variants.find((v) => v.label === 'spread')!;
    expect(momentum.version).not.toBe(spread.version);
    // Momentum rides item 1 up three periods: every trade wins.
    expect(momentum.aggregate.totalTrades).toBe(3);
    expect(momentum.aggregate.totalUnsettled).toBe(0);
    expect(momentum.aggregate.meanWinRate).toBe(1);
    expect(momentum.aggregate.meanAvgReturn).toBeGreaterThan(3);
    expect(momentum.aggregate.meanAvgReturn).toBeCloseTo(
      momentum.periods.reduce((sum, p) => sum + p.summary.avgReturn, 0) / 3,
      12,
    );
    // Spread sits in flat item 2: ties count as losses, zero average.
    expect(spread.aggregate.totalTrades).toBe(3);
    expect(spread.aggregate.meanWinRate).toBe(0);
    expect(spread.aggregate.meanAvgReturn).toBe(0);
    expect(spread.periods.map((p) => p.periodName)).toEqual(['day-1', 'day-2', 'day-3']);
  });

  it('never mutates frozen inputs and returns fresh result objects', () => {
    const stored = histories();
    const contenderVariants = variants();
    const contenderPeriods = periods();
    for (const history of stored.values()) {
      for (const snapshot of history) {
        Object.freeze(snapshot);
      }
      Object.freeze(history);
    }
    for (const variant of contenderVariants) {
      Object.freeze(variant.config.weights);
      Object.freeze(variant.config);
      Object.freeze(variant);
    }
    Object.freeze(contenderVariants);
    Object.freeze(contenderPeriods);
    const before = JSON.stringify({
      histories: [...stored.entries()],
      weights: contenderVariants.map((v) => v.config.weights),
    });
    const first = compareWeightVariants({
      historiesByItem: stored,
      variants: contenderVariants,
      periods: contenderPeriods,
      topN: 1,
    });
    const second = compareWeightVariants({
      historiesByItem: stored,
      variants: contenderVariants,
      periods: contenderPeriods,
      topN: 1,
    });
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.variants).not.toBe(second.variants);
    first.variants[0]!.label = 'mutated';
    first.variants[0]!.periods[0]!.summary.avgReturn = 999;
    expect(second.variants[0]!.label).toBe('momentum');
    expect(
      compareWeightVariants({
        historiesByItem: stored,
        variants: contenderVariants,
        periods: contenderPeriods,
        topN: 1,
      }).variants[0]!.periods[0]!.summary.avgReturn,
    ).not.toBe(999);
    expect(
      JSON.stringify({
        histories: [...stored.entries()],
        weights: contenderVariants.map((v) => v.config.weights),
      }),
    ).toBe(before);
  });
});
