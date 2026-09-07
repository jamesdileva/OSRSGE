import type { MarketSnapshot } from '../normalization/normalizer.js';

/**
 * Shared time-series helpers (guide §18–20). Pure functions over
 * `MarketSnapshot[]`; never assume sorted input or exact timestamps.
 */

/**
 * Representative price for one snapshot: midpoint when both sides exist,
 * otherwise the available side. Undefined when neither side is usable.
 */
export function snapshotPrice(snapshot: MarketSnapshot): number | undefined {
  const { high, low } = snapshot;
  if (high !== undefined && low !== undefined) {
    return (high + low) / 2;
  }
  return high ?? low;
}

/**
 * Closest snapshot to `targetMs` within `toleranceMs` (guide §20).
 * Returns null when history is empty or everything is out of tolerance.
 */
export function findClosestSnapshot(
  history: MarketSnapshot[],
  targetMs: number,
  toleranceMs: number,
): MarketSnapshot | null {
  let best: MarketSnapshot | null = null;
  let bestGap = toleranceMs;
  for (const snapshot of history) {
    const gap = Math.abs(snapshot.timestamp - targetMs);
    if (gap <= bestGap) {
      bestGap = gap;
      best = snapshot;
    }
  }
  return best;
}
