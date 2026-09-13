import { describe, expect, it } from 'vitest';
import type { ItemMetadata } from '../../core/items/itemMetadata.js';
import type { ComponentScores, Opportunity, RiskLevel } from '../../core/market/ranking/types.js';
import { applyFilters, DEFAULT_FILTERS, matchesFilters } from '../../core/market/ranking/filters.js';

function item(id: number, name: string, members: boolean): ItemMetadata {
  return { id, name, members, buyLimit: null, examine: name, value: null };
}

function components(overrides: Partial<ComponentScores> = {}): ComponentScores {
  return { momentum: 50, liquidity: 50, spread: 50, profitability: 50, consistency: 50, volatility: 50, ...overrides };
}

function opp(
  rank: number,
  name: string,
  overrides: {
    members?: boolean;
    price?: number;
    risk?: RiskLevel;
    liquidity?: number;
    finalScore?: number;
    baseScore?: number;
  } = {},
): Opportunity {
  return {
    rank,
    item: item(rank, name, overrides.members ?? false),
    currentPrice: overrides.price ?? 1000,
    changes: {},
    spread: {},
    components: components({ liquidity: overrides.liquidity ?? 50 }),
    risk: overrides.risk ?? 'LOW',
    confidence: 1,
    baseScore: overrides.baseScore ?? (overrides.finalScore ?? 60),
    finalScore: overrides.finalScore ?? 60,
  };
}

describe('opportunity filters (Sprint 9 slice-1)', () => {
  it('empty filters keep everything and never mutate the input', () => {
    const list = [opp(1, 'A'), opp(2, 'B')];
    const out = applyFilters(list, {});
    expect(out).toHaveLength(2);
    expect(list).toHaveLength(2);
    expect(out.map((o) => o.rank)).toEqual([1, 2]);
  });

  it('membership splits f2p vs members', () => {
    const list = [opp(1, 'Free', { members: false }), opp(2, 'Paid', { members: true })];
    expect(applyFilters(list, { membership: 'f2p' }).map((o) => o.item.name)).toEqual(['Free']);
    expect(applyFilters(list, { membership: 'members' }).map((o) => o.item.name)).toEqual(['Paid']);
    expect(applyFilters(list, { membership: 'all' })).toHaveLength(2);
  });

  it('price range is inclusive on currentPrice', () => {
    const list = [opp(1, 'Cheap', { price: 100 }), opp(2, 'Mid', { price: 500 }), opp(3, 'Pricy', { price: 1000 })];
    const out = applyFilters(list, { minPrice: 100, maxPrice: 500 });
    expect(out.map((o) => o.item.name)).toEqual(['Cheap', 'Mid']);
  });

  it('risk allowlist filters on risk level', () => {
    const list = [opp(1, 'Safe', { risk: 'LOW' }), opp(2, 'Mid', { risk: 'MEDIUM' }), opp(3, 'Wild', { risk: 'HIGH' })];
    expect(applyFilters(list, { allowedRisks: ['LOW'] }).map((o) => o.item.name)).toEqual(['Safe']);
    expect(applyFilters(list, { allowedRisks: [] })).toHaveLength(3);
  });

  it('minLiquidity reads components.liquidity, not volume', () => {
    const list = [opp(1, 'Thin', { liquidity: 10 }), opp(2, 'Deep', { liquidity: 90 })];
    const out = applyFilters(list, { minLiquidity: 50 });
    expect(out.map((o) => o.item.name)).toEqual(['Deep']);
    // Same threshold must not consult any volume field (Opportunity has none).
    expect(matchesFilters(opp(1, 'Thin', { liquidity: 90 }), { minLiquidity: 90 })).toBe(true);
  });

  it('minScore reads finalScore, not baseScore', () => {
    const inflated = opp(1, 'Inflated', { finalScore: 40, baseScore: 95 });
    expect(matchesFilters(inflated, { minScore: 50 })).toBe(false);
    expect(matchesFilters(inflated, { minScore: 40 })).toBe(true);
  });

  it('category is a documented no-op', () => {
    const list = [opp(1, 'A'), opp(2, 'B')];
    expect(applyFilters(list, { category: 'weapon' })).toHaveLength(2);
    expect(applyFilters(list, { category: 'anything-at-all' })).toHaveLength(2);
  });

  it('keeps original ranks with gaps (never renumbers)', () => {
    const list = [opp(1, 'A', { risk: 'LOW' }), opp(2, 'B', { risk: 'HIGH' }), opp(3, 'C', { risk: 'LOW' })];
    const out = applyFilters(list, { allowedRisks: ['LOW'] });
    expect(out.map((o) => o.rank)).toEqual([1, 3]);
  });

  it('DEFAULT_FILTERS is the pass-everything baseline', () => {
    const list = [opp(1, 'A', { members: false, price: 100, risk: 'HIGH', liquidity: 0, finalScore: 0 })];
    expect(applyFilters(list, { ...DEFAULT_FILTERS })).toHaveLength(1);
  });
});
