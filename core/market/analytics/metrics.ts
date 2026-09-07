import type { MarketSnapshot } from '../normalization/normalizer.js';
import { liquidityScore, recentVolume } from './liquidity.js';
import { priceChanges } from './priceChanges.js';
import { calculateSpread } from './spread.js';
import { snapshotPrice } from './timeseries.js';
import { trendConsistency } from './trend.js';
import { calculateVolatility } from './volatility.js';

/**
 * Metrics orchestrator (architecture §11, roadmap Sprint 5).
 * Raw descriptive metrics only — percentile normalization and weighted
 * scoring arrive with the ranking engine (Sprint 6).
 */

export interface ItemMetrics {
  itemId: number;
  timestamp: number;
  price: number;
  priceChange1h?: number;
  priceChange6h?: number;
  priceChange24h?: number;
  spreadGp?: number;
  spreadPct?: number;
  volatility?: number;
  liquidityScore?: number;
  trendConsistency?: number;
}

export interface MetricsUniverse {
  /** Trailing-24h volume sums for every candidate, for percentile ranking. */
  volumes: number[];
}

/**
 * Compute every Sprint 5 metric for one item. Returns null when history
 * is empty. `universe` is optional — without it, liquidity is skipped.
 */
export function computeMetrics(
  itemId: number,
  history: MarketSnapshot[],
  nowMs: number,
  universe?: MetricsUniverse,
): ItemMetrics | null {
  if (history.length === 0) {
    return null;
  }
  const latest = latestOf(history);
  const price = snapshotPrice(latest);
  if (price === undefined) {
    return null;
  }
  const metrics: ItemMetrics = { itemId, timestamp: latest.timestamp, price };

  const changes = priceChanges(history, nowMs);
  if (changes.oneHour !== undefined) {
    metrics.priceChange1h = changes.oneHour;
  }
  if (changes.sixHour !== undefined) {
    metrics.priceChange6h = changes.sixHour;
  }
  if (changes.twentyFourHour !== undefined) {
    metrics.priceChange24h = changes.twentyFourHour;
  }

  const spread = calculateSpread(latest);
  if (spread !== undefined) {
    metrics.spreadGp = spread.gp;
    metrics.spreadPct = spread.percent;
  }

  const volatility = calculateVolatility(history, nowMs);
  if (volatility !== undefined) {
    metrics.volatility = volatility;
  }

  if (universe !== undefined) {
    const score = liquidityScore(recentVolume(history, nowMs), universe.volumes);
    if (score !== undefined) {
      metrics.liquidityScore = score;
    }
  }

  const consistency = trendConsistency(changes);
  if (consistency !== undefined) {
    metrics.trendConsistency = consistency;
  }

  return metrics;
}

function latestOf(history: MarketSnapshot[]): MarketSnapshot {
  let latest = history[0] as MarketSnapshot;
  for (const snapshot of history) {
    if (snapshot.timestamp > latest.timestamp) {
      latest = snapshot;
    }
  }
  return latest;
}
