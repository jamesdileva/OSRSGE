import { describe, expect, it } from 'vitest';
import type { ItemMetadata } from '../../core/items/itemMetadata.js';
import type { ItemMetrics } from '../../core/market/analytics/metrics.js';
import {
  computeBaseScore,
  defaultRankingConfig,
  isCandidate,
  momentumScore,
  profitabilityScore,
  rankOpportunities,
  scoreComponents,
  spreadScore,
  volatilityOpportunityScore,
  type RankEntry,
} from '../../core/market/ranking/scorer.js';
import { resolveWeights } from '../../core/market/ranking/weights.js';

function item(id: number, name: string): ItemMetadata {
  return { id, name, members: false, buyLimit: null, examine: name, value: null };
}

function metrics(overrides: Partial<ItemMetrics> & { price: number }): ItemMetrics {
  return { itemId: 1, timestamp: 1_788_484_800_000, ...overrides };
}

/** Scenario A: high volume + moderate momentum. */
function scenarioA(): RankEntry {
  return {
    metrics: metrics({
      itemId: 4151,
      price: 800_000,
      priceChange1h: 0.8,
      priceChange6h: 1.5,
      priceChange24h: 2.5,
      spreadGp: 12_000,
      spreadPct: 1.5,
      volatility: 0.008,
      liquidityScore: 85,
      trendConsistency: 100,
    }),
    item: item(4151, 'Abyssal whip'),
    volume: 5000,
    historyMinutes: 1440,
    observationCount: 24,
    expectedObservations: 24,
    stalenessMinutes: 5,
  };
}

/** Scenario B: huge spike + almost no activity. */
function scenarioB(): RankEntry {
  return {
    metrics: metrics({
      itemId: 999,
      price: 50_000,
      priceChange1h: 25,
      priceChange6h: 40,
      priceChange24h: 60,
      spreadGp: 8000,
      spreadPct: 16,
      volatility: 0.15,
      liquidityScore: 3,
      trendConsistency: 33,
    }),
    item: item(999, 'Spike junk'),
    volume: 12,
    historyMinutes: 1440,
    observationCount: 3,
    expectedObservations: 24,
    stalenessMinutes: 30,
  };
}

/** Scenario C: stable positive trend + healthy liquidity. */
function scenarioC(): RankEntry {
  return {
    metrics: metrics({
      itemId: 560,
      price: 5000,
      priceChange1h: 0.3,
      priceChange6h: 1.0,
      priceChange24h: 3.0,
      spreadGp: 150,
      spreadPct: 3,
      volatility: 0.015,
      liquidityScore: 65,
      trendConsistency: 100,
    }),
    item: item(560, 'Death rune'),
    volume: 3000,
    historyMinutes: 1440,
    observationCount: 24,
    expectedObservations: 24,
    stalenessMinutes: 5,
  };
}

describe('scorer components', () => {
  it('maps moderate momentum to ~60 and huge spikes to the cap', () => {
    expect(momentumScore({ priceChange24h: 2 })).toBeCloseTo(60, 6);
    expect(momentumScore({ priceChange1h: 25, priceChange6h: 40, priceChange24h: 60 })).toBe(100);
    expect(momentumScore({})).toBe(0);
  });

  it('scales spread linearly and nets profitability on absolute scale, orthogonal to pct', () => {
    expect(spreadScore(2)).toBeCloseTo(40, 9);
    expect(spreadScore(undefined)).toBe(0);
    // net = 12_000 − 1%×800_000 = 4_000 → 25×log10(41) ≈ 40.3
    expect(profitabilityScore(12_000, 800_000)).toBeCloseTo(40.3, 1);
    expect(profitabilityScore(undefined, 800_000)).toBe(0);
    expect(profitabilityScore(10, 5000)).toBe(0);
  });

  it('diverges spread pct from absolute profit: same pct, different stakes', () => {
    // Same 10% relative margin, ×100 stakes → different profitability.
    const cheap = profitabilityScore(10, 100);
    const pricey = profitabilityScore(1000, 10_000);
    const cheapPct = 10;
    const priceyPct = 10;
    expect(spreadScore(cheapPct)).toBe(spreadScore(priceyPct));
    expect(spreadScore(cheapPct)).toBe(100);
    expect(pricey).toBeGreaterThan(cheap);
    // Same absolute net (900gp), different pct → different spread, same profit.
    expect(spreadScore(1)).toBeLessThan(spreadScore(10));
    expect(profitabilityScore(1000, 10_000)).toBeCloseTo(
      profitabilityScore(910, 1000),
      6,
    );
  });

  it('rewards moderate volatility over flat or extreme churn', () => {
    const moderate = volatilityOpportunityScore(0.02);
    expect(moderate).toBeCloseTo(100, 6);
    expect(volatilityOpportunityScore(0)).toBeLessThan(moderate);
    expect(volatilityOpportunityScore(0.15)).toBeLessThan(5);
    expect(volatilityOpportunityScore(undefined)).toBe(0);
  });

  it('rejects invalid weights instead of scoring silently', () => {
    const components = scoreComponents(scenarioA().metrics);
    expect(() =>
      computeBaseScore(components, { ...resolveWeights('BALANCED'), momentum: 0.9 }),
    ).toThrow('Invalid ranking weights');
  });
});

describe('roadmap Sprint 6 scenarios', () => {
  it('A scores high with low/medium risk; C scores strong with low risk', () => {
    const config = defaultRankingConfig('BALANCED');
    const [a] = rankOpportunities([scenarioA()], config);
    const [c] = rankOpportunities([scenarioC()], config);
    expect(a!.baseScore).toBeGreaterThan(50);
    expect(['LOW', 'MEDIUM']).toContain(a!.risk);
    expect(c!.baseScore).toBeGreaterThan(50);
    expect(c!.risk).toBe('LOW');
  });

  it('B ends HIGH risk with its final score well below base despite huge momentum', () => {
    const config = defaultRankingConfig('BALANCED');
    const [b] = rankOpportunities([scenarioB()], config);
    // Five warning signals (dead liquidity, extreme vol, weak trend,
    // wide spread, sudden spike) force HIGH even with full history depth.
    expect(b!.risk).toBe('HIGH');
    expect(b!.finalScore).toBeLessThan(b!.baseScore * 0.6);
  });

  it('A outranks B head-to-head under the balanced configuration', () => {
    const config = defaultRankingConfig('BALANCED');
    const ranked = rankOpportunities([scenarioB(), scenarioA(), scenarioC()], config);
    expect(ranked).toHaveLength(3);
    const top = ranked[0]!;
    expect(['Abyssal whip', 'Death rune']).toContain(top.item.name);
    expect(ranked[ranked.length - 1]!.item.name).toBe('Spike junk');
    expect(ranked[0]!.rank).toBe(1);
    expect(ranked[2]!.rank).toBe(3);
  });

  it('CHEAP_FLIPS never surfaces sub-100GP junk: cheapness is a filter, not a weight', () => {
    const config = defaultRankingConfig('CHEAP_FLIPS');
    const junk: RankEntry = {
      ...scenarioA(),
      metrics: metrics({ itemId: 2, price: 50, priceChange24h: 30, spreadPct: 20, spreadGp: 10 }),
      item: item(2, 'Junk'),
    };
    expect(isCandidate({ price: 50, volume: 9999, historyMinutes: 1440 }, config)).toBe(false);
    const ranked = rankOpportunities([junk, scenarioC()], config);
    expect(ranked.some((o) => o.item.name === 'Junk')).toBe(false);
    expect(ranked[0]!.item.name).toBe('Death rune');
  });
});
