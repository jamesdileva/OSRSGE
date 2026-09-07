import type { PriceChanges } from './priceChanges.js';

/**
 * Trend consistency (guide §24, architecture §14): prefer aligned
 * 1h/6h/24h moves over a lone 24h spike that is already reversing.
 * v0: sign agreement with the longest available window, weighted
 * 1h:1 / 6h:2 / 24h:3, scaled to 0–100. Needs ≥2 windows, else undefined.
 */

const WINDOW_WEIGHTS = { oneHour: 1, sixHour: 2, twentyFourHour: 3 } as const;
type WindowKey = keyof typeof WINDOW_WEIGHTS;
const WINDOW_ORDER: WindowKey[] = ['twentyFourHour', 'sixHour', 'oneHour'];
const NEUTRAL_PCT = 0.05;

function directionOf(change: number): number {
  if (Math.abs(change) < NEUTRAL_PCT) {
    return 0;
  }
  return change > 0 ? 1 : -1;
}

export function trendConsistency(changes: PriceChanges): number | undefined {
  const available = WINDOW_ORDER.filter((key) => changes[key] !== undefined);
  if (available.length < 2) {
    return undefined;
  }
  const referenceKey = available[0] as WindowKey;
  const reference = directionOf(changes[referenceKey] as number);
  let agreeWeight = 0;
  let totalWeight = 0;
  for (const key of available) {
    const weight = WINDOW_WEIGHTS[key];
    totalWeight += weight;
    if (directionOf(changes[key] as number) === reference) {
      agreeWeight += weight;
    }
  }
  return (agreeWeight / totalWeight) * 100;
}
