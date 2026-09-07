import type { MarketSnapshot } from '../normalization/normalizer.js';

/**
 * Spread estimation (guide §21, architecture §14).
 * Wiki semantics (verified): `high` = last instant-buy price (ask side),
 * `low` = last instant-sell price (bid side). The spread is the cost of
 * immediacy — an observed gap, never a guaranteed fill price.
 */

export interface Spread {
  gp: number;
  percent: number;
}

/** Spread in GP and as % of midpoint; undefined when either side is missing. */
export function calculateSpread(snapshot: MarketSnapshot): Spread | undefined {
  const { high, low } = snapshot;
  if (high === undefined || low === undefined || low <= 0) {
    return undefined;
  }
  const gp = high - low;
  const midpoint = (high + low) / 2;
  if (!(midpoint > 0) || !Number.isFinite(gp)) {
    return undefined;
  }
  return { gp, percent: (gp / midpoint) * 100 };
}
