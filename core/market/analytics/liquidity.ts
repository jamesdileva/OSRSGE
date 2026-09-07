import type { MarketSnapshot } from '../normalization/normalizer.js';

/**
 * Liquidity (guide §22): percentile rank of an item's trailing-24h traded
 * volume against the candidate universe — never a raw volume number.
 * Top-volume item → 100, median → ~50, least-traded → 0.
 */

const LIQUIDITY_WINDOW_MS = 24 * 60 * 60 * 1_000;

export function recentVolume(history: MarketSnapshot[], nowMs: number): number | undefined {
  let total = 0;
  let observed = false;
  for (const snapshot of history) {
    if (snapshot.timestamp > nowMs || snapshot.timestamp < nowMs - LIQUIDITY_WINDOW_MS) {
      continue;
    }
    if (snapshot.volume !== undefined) {
      observed = true;
      total += snapshot.volume;
    }
  }
  return observed ? total : undefined;
}

/** Percentile (0–100) of `itemVolume` within `universeVolumes`. */
export function liquidityScore(
  itemVolume: number | undefined,
  universeVolumes: number[],
): number | undefined {
  if (itemVolume === undefined || universeVolumes.length === 0) {
    return undefined;
  }
  const below = universeVolumes.filter((v) => v < itemVolume).length;
  return (below / universeVolumes.length) * 100;
}
