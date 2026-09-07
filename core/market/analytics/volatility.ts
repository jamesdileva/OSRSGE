import type { MarketSnapshot } from '../normalization/normalizer.js';
import { snapshotPrice } from './timeseries.js';

/**
 * Rolling volatility (guide §23): population stddev of simple returns
 * `r_t = (P_t - P_{t-1}) / P_{t-1}` over the trailing 24h of observations.
 * Unitless (fraction, not %). Drives both opportunity AND risk downstream —
 * never a buy signal on its own.
 */

const VOLATILITY_WINDOW_MS = 24 * 60 * 60 * 1_000;
const MIN_POINTS = 4;

export function calculateVolatility(
  history: MarketSnapshot[],
  nowMs: number,
): number | undefined {
  const prices = history
    .filter((s) => s.timestamp <= nowMs && s.timestamp >= nowMs - VOLATILITY_WINDOW_MS)
    .sort((a, b) => a.timestamp - b.timestamp)
    .map(snapshotPrice)
    .filter((p): p is number => p !== undefined && p > 0);
  if (prices.length < MIN_POINTS) {
    return undefined;
  }
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i += 1) {
    const prev = prices[i - 1] as number;
    const curr = prices[i] as number;
    returns.push((curr - prev) / prev);
  }
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance =
    returns.reduce((a, r) => a + (r - mean) * (r - mean), 0) / returns.length;
  return Math.sqrt(variance);
}
