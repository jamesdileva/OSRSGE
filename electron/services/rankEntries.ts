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
 *
 * S21 enrichment (#47): sync metadata-injection seam for members/buyLimit.
 * Served payload change (explicit): with `resolveMetadata` present, entries
 * carry the cached members flag + buy limit; on miss/undefined the payload
 * keeps the pre-enrichment neutral defaults (`members: false`,
 * `buyLimit: null`) fail-open so a mapping outage never breaks refresh or
 * ranking. Filter semantics: `membership` becomes meaningful only when
 * metadata is present — with neutral defaults `members` matches nothing
 * and `f2p` matches everything (previous behavior, preserved on miss).
 * Counts are unaffected (`isCandidate` gates on price only in this
 * thin-evidence path). Staleness: metadata shares the ~24 h count-gated
 * re-warm bound of names (see mappingCache) — a stale members flag is
 * filter-input staleness, documented, display-only.
 *
 * Examine/value follow-up: the same cached snapshot also carries `examine`
 * + `value` via `resolveMetadata` — still NO new bulk pull. On
 * miss/undefined the payload keeps the pre-enrichment neutrals
 * (`examine: ''`, `value: null`) fail-open. Display-only: no filter or
 * ranking input reads examine/value; the renderer surfaces them in
 * ItemDetailsPanel (members/buyLimit/examine/value, miss → neutrals).
 * #50a hardening: serve path validates each metadata field (partial
 * shapes degrade per field; examine trimmed) so a non-cache resolver
 * can never smuggle an invalid display value through.
 */
export type ItemNameResolver = (itemId: number) => string | undefined;
/** Cached `/mapping` members/buyLimit/examine/value only — never fetched in this path. */
export interface CachedItemMetadata {
  members: boolean;
  buyLimit: number | null;
  examine: string;
  value: number | null;
}
export type ItemMetadataResolver = (itemId: number) => CachedItemMetadata | undefined;
export function buildRankEntries(
  snapshots: readonly MarketSnapshot[],
  timestamp: number,
  resolveName?: ItemNameResolver,
  resolveMetadata?: ItemMetadataResolver,
): RankEntry[] {
  const entries: RankEntry[] = [];
  for (const snapshot of snapshots) {
    const metrics = computeMetrics(snapshot.itemId, [snapshot], timestamp);
    if (metrics === null) {
      continue;
    }
    const resolved = resolveName?.(snapshot.itemId)?.trim();
    const raw = resolveMetadata?.(snapshot.itemId);
    // #50a strictness: a custom resolver may return a partial shape —
    // validate per field so miss/invalid stays the fail-open neutrals.
    const rawRecord = (typeof raw === 'object' && raw !== null ? raw : undefined) as
      | Partial<CachedItemMetadata>
      | undefined;
    const buyLimit =
      typeof rawRecord?.buyLimit === 'number' &&
      Number.isInteger(rawRecord.buyLimit) &&
      rawRecord.buyLimit > 0
        ? rawRecord.buyLimit
        : null;
    const examine = typeof rawRecord?.examine === 'string' ? rawRecord.examine.trim() : '';
    const value =
      typeof rawRecord?.value === 'number' &&
      Number.isInteger(rawRecord.value) &&
      rawRecord.value >= 0
        ? rawRecord.value
        : null;
    entries.push({
      metrics,
      item: {
        id: snapshot.itemId,
        name: resolved ? resolved : `Item ${snapshot.itemId}`,
        members: rawRecord?.members === true,
        buyLimit,
        examine,
        value,
      },
      observationCount: 1,
      stalenessMinutes: 0,
    });
  }
  return entries;
}
