import { recentVolume } from '../analytics/liquidity.js';
import { computeMetrics } from '../analytics/metrics.js';
import { snapshotPrice } from '../analytics/timeseries.js';
import type { MarketSnapshot } from '../normalization/normalizer.js';
import type { ItemMetadata } from '../../items/itemMetadata.js';
import { rankOpportunities, type RankEntry } from '../ranking/scorer.js';
import type { RankingConfig } from '../ranking/types.js';
import type { BacktestPick, BacktestPricePoint } from './backtester.js';

/**
 * Sprint 14 slice-2: scorer-over-snapshots backtest harness
 * (roadmap §16, guide §50). Pure — no fs, no IPC, no scheduler, no UI,
 * no network, no Date.now.
 *
 * Slice-1 proved the settle + summarize core with ranking injected as a
 * `rankAt(timeMs)` callback. This slice supplies the real ranking: at each
 * evaluation time T the harness builds a past-only snapshot view
 * (`timestamp <= T`), runs `computeMetrics → rankOpportunities` over it,
 * and enters the top-N opportunities at verbatim T.
 *
 * No-future-leak by construction: `createScorerRankAt` only ever reads
 * snapshots with `timestamp <= T` for ranking, and settlement (slice-1)
 * only reads series points at/after T + horizon. Building the past-only
 * view is no longer the caller's job — passing the full stored history is
 * safe because the harness slices per T internally. Appending future
 * snapshots must never change `rankAt(T)` (disconfirmed by test).
 *
 * Entry prices are the scorer's own `currentPrice` (the midpoint at the
 * latest past-only snapshot), so settlement measures the ranked price —
 * never a caller-invented fill.
 *
 * S15 weight comparison stays out: the harness takes one caller-supplied
 * `RankingConfig`, so weight variants run as separate passes later.
 */

const MS_PER_MINUTE = 60_000;

/** Caller-owned stored history per item (may include points after T). */
export type SnapshotHistoryByItem = ReadonlyMap<number, readonly MarketSnapshot[]>;

/** Past-only view of one item's history at T (fresh array, same refs). */
export function sliceHistoryAt(
  history: readonly MarketSnapshot[],
  timeMs: number,
): MarketSnapshot[] {
  if (!Number.isFinite(timeMs)) {
    throw new Error('Backtest slice timeMs must be a finite timestamp');
  }
  return history.filter((snapshot) => snapshot.timestamp <= timeMs);
}

/** Past-only view of every item's history at T (fresh map + arrays). */
export function sliceHistoriesAt(
  historiesByItem: SnapshotHistoryByItem,
  timeMs: number,
): Map<number, MarketSnapshot[]> {
  if (!Number.isFinite(timeMs)) {
    throw new Error('Backtest slice timeMs must be a finite timestamp');
  }
  const sliced = new Map<number, MarketSnapshot[]>();
  for (const [itemId, history] of historiesByItem) {
    sliced.set(itemId, sliceHistoryAt(history, timeMs));
  }
  return sliced;
}

/**
 * Midpoint price series per item for settlement. Snapshots without a
 * usable price are skipped (no evidence = no point); the slice-1 settler
 * still validates and throws on garbage that survives this projection.
 */
export function snapshotsToPriceSeries(
  historiesByItem: SnapshotHistoryByItem,
): Map<number, BacktestPricePoint[]> {
  const series = new Map<number, BacktestPricePoint[]>();
  for (const [itemId, history] of historiesByItem) {
    const points: BacktestPricePoint[] = [];
    for (const snapshot of history) {
      const price = snapshotPrice(snapshot);
      if (price === undefined) {
        continue;
      }
      points.push({ timestamp: snapshot.timestamp, price });
    }
    points.sort((a, b) => a.timestamp - b.timestamp);
    series.set(itemId, points);
  }
  return series;
}

export interface ScorerRankAtDeps {
  /** Full stored history (past + future); the harness slices per T. */
  historiesByItem: SnapshotHistoryByItem;
  /** Display metadata; unknown ids fall back to `Item <id>` (S2 precedent). */
  metadataByItem?: ReadonlyMap<number, ItemMetadata>;
  /** Single ranking config for this pass (S15 runs variants separately). */
  config: RankingConfig;
  /** Top-N opportunities entered per evaluation time; must be >= 1. */
  topN: number;
}

function fallbackItem(itemId: number): ItemMetadata {
  return { id: itemId, name: `Item ${itemId}`, members: false, buyLimit: null, examine: '', value: null };
}

function assertTopN(topN: number): void {
  if (!Number.isInteger(topN) || !(topN >= 1)) {
    throw new Error('Backtest topN must be a positive integer');
  }
}

/**
 * Build the guide §50 `rankAt` callback over the real scorer. At each T:
 * past-only slice → per-item `computeMetrics` (liquidity universe from the
 * same past-only view) → `rankOpportunities` → top-N picks entered at
 * verbatim T with the scorer's currentPrice. Frozen-input safe: stored
 * history is only read, picks are fresh objects.
 */
export function createScorerRankAt(deps: ScorerRankAtDeps): (timeMs: number) => BacktestPick[] {
  assertTopN(deps.topN);
  const { historiesByItem, metadataByItem, config, topN } = deps;
  return (timeMs: number): BacktestPick[] => {
    if (!Number.isFinite(timeMs)) {
      throw new Error('Backtest evaluationTimes must be finite timestamps');
    }
    const pastByItem = sliceHistoriesAt(historiesByItem, timeMs);
    const volumes: number[] = [];
    for (const past of pastByItem.values()) {
      const volume = recentVolume(past, timeMs);
      if (volume !== undefined) {
        volumes.push(volume);
      }
    }
    const universe = { volumes };
    const entries: RankEntry[] = [];
    for (const [itemId, past] of pastByItem) {
      if (past.length === 0) {
        continue;
      }
      const metrics = computeMetrics(itemId, past, timeMs, universe);
      if (metrics === null) {
        continue;
      }
      let earliest = past[0] as MarketSnapshot;
      let latest = past[0] as MarketSnapshot;
      for (const snapshot of past) {
        if (snapshot.timestamp < earliest.timestamp) {
          earliest = snapshot;
        }
        if (snapshot.timestamp > latest.timestamp) {
          latest = snapshot;
        }
      }
      const volume = recentVolume(past, timeMs);
      const entry: RankEntry = {
        metrics,
        item: metadataByItem?.get(itemId) ?? fallbackItem(itemId),
        observationCount: past.length,
        historyMinutes: (timeMs - earliest.timestamp) / MS_PER_MINUTE,
        stalenessMinutes: (timeMs - latest.timestamp) / MS_PER_MINUTE,
      };
      if (volume !== undefined) {
        entry.volume = volume;
      }
      entries.push(entry);
    }
    return rankOpportunities(entries, config)
      .slice(0, topN)
      .map((opportunity) => ({
        itemId: opportunity.item.id,
        entryTime: timeMs,
        entryPrice: opportunity.currentPrice,
      }));
  };
}
