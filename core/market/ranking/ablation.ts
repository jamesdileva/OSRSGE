import type { Opportunity, RankingWeights } from './types.js';

/**
 * Ablation helpers for the spread/profitability double-count check
 * (review risk 2: spreadScore pct*20 and profitabilityScore (pct-1% tax)*25
 * share the same spread-pct input).
 *
 * Pure and offline: zero a weight + renormalize, compare Top-N sets,
 * Spearman rank correlation over the shared candidate universe.
 */

/** Zero one share and renormalize the rest to sum 1.0. Throws if nothing remains. */
export function zeroWeightAndRenorm(
  weights: Readonly<RankingWeights>,
  key: keyof RankingWeights,
): RankingWeights {
  const zeroed: RankingWeights = { ...weights, [key]: 0 };
  const total = (
    Object.keys(zeroed) as (keyof RankingWeights)[]
  ).reduce((sum, k) => sum + zeroed[k], 0);
  if (!(total > 0)) {
    throw new Error(`Cannot renormalize weights: all shares are zero after removing ${key}`);
  }
  const renormed = {} as RankingWeights;
  for (const k of Object.keys(zeroed) as (keyof RankingWeights)[]) {
    renormed[k] = zeroed[k] / total;
  }
  return renormed;
}

/** Item ids of the first N opportunities in rank order. */
export function topNIds(ranked: Opportunity[], n: number): number[] {
  return ranked.slice(0, n).map((o) => o.item.id);
}

/** Size of the intersection of two id sets. */
export function overlapCount(a: number[], b: number[]): number {
  const inB = new Set(b);
  return a.filter((id) => inB.has(id)).length;
}

/**
 * Spearman rho over the shared candidate universe, using rank position
 * (1-based) in each list. Both lists must contain the same ids; extra ids
 * present in only one list are ignored. Returns NaN when fewer than 2
 * shared ids.
 */
export function spearmanRankCorrelation(baseline: Opportunity[], variant: Opportunity[]): number {
  const rankOf = (list: Opportunity[]): Map<number, number> => {
    const map = new Map<number, number>();
    list.forEach((o, index) => {
      if (!map.has(o.item.id)) {
        map.set(o.item.id, index + 1);
      }
    });
    return map;
  };
  const baseRanks = rankOf(baseline);
  const variantRanks = rankOf(variant);
  const shared: number[] = [];
  for (const id of baseRanks.keys()) {
    if (variantRanks.has(id)) {
      shared.push(id);
    }
  }
  const n = shared.length;
  if (n < 2) {
    return NaN;
  }
  let sumDSquared = 0;
  for (const id of shared) {
    const d = (baseRanks.get(id) as number) - (variantRanks.get(id) as number);
    sumDSquared += d * d;
  }
  return 1 - (6 * sumDSquared) / (n * (n * n - 1));
}
