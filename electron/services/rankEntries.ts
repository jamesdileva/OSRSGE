import { computeMetrics } from '../../core/market/analytics/metrics.js';
import type { MarketSnapshot } from '../../core/market/normalization/normalizer.js';
import type { RankEntry } from '../../core/market/ranking/scorer.js';

/**
 * Sprint 20 cleanup: single shared batch → rank-entry builder.
 *
 * `refreshPipeline.scoreBatchSnapshots` (observed counts) and
 * `liveMarket.rankBatchToTop10` (served Top-10) must run the verbatim
 * S6/S14 math — single-point `computeMetrics` at the batch timestamp +
 * `Item <id>` fallback + `historyMinutes` undefined (thin-evidence
 * honesty: a single pull carries no history-depth evidence).
 * This helper is the one place that math lives so served/observed can
 * never drift apart. Frozen-input safe (reads only, fresh entry
 * objects).
 *
 * S21 slice-1: sync name-injection seam. The default stays the honest
 * `Item <id>` fallback so neither the pipeline nor the serve path ever
 * fetches; callers that hold cached `/mapping` metadata pass a sync
 * `resolveName` lookup (populated async elsewhere) to serve real names.
 * Empty/whitespace resolver results fall back to `Item <id>`.
 */
export type ItemNameResolver = (itemId: number) => string | undefined;
export function buildRankEntries(
  snapshots: readonly MarketSnapshot[],
  timestamp: number,
  resolveName?: ItemNameResolver,
): RankEntry[] {
  const entries: RankEntry[] = [];
  for (const snapshot of snapshots) {
    const metrics = computeMetrics(snapshot.itemId, [snapshot], timestamp);
    if (metrics === null) {
      continue;
    }
    const resolved = resolveName?.(snapshot.itemId)?.trim();
    entries.push({
      metrics,
      item: {
        id: snapshot.itemId,
        name: resolved ? resolved : `Item ${snapshot.itemId}`,
        members: false,
        buyLimit: null,
        examine: '',
        value: null,
      },
      observationCount: 1,
      stalenessMinutes: 0,
    });
  }
  return entries;
}
