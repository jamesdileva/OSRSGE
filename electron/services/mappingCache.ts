import type {
  MappingSnapshot,
  MarketDataProvider,
} from '../../core/market/providers/MarketDataProvider.js';
import type { ItemMetadataResolver } from './rankEntries.js';
import type { CachedItemMetadata } from './rankEntries.js';
import type { ItemNameResolver } from './rankEntries.js';
import { normalizeCachedMetadata } from '../../core/market/ranking/metadataStrictness.js';

/**
 * Sprint 21 slice-2: async `/mapping` name cache for the S21 sync seam.
 * Slice-3: atomic temp-map-then-swap store. Re-warm slice: count-gated
 * periodic re-warm policy (see `MAPPING_REWARM_INTERVAL_REFRESHES`).
 *
 * The pipeline/serve path stays sync and fetch-free (`buildRankEntries`
 * takes a sync `ItemNameResolver`); this module owns the only async side:
 * a plain in-memory `Map<itemId, name>` populated from one bulk
 * `/mapping` fetch. Main warms it once at startup (best-effort) and
 * passes the sync `resolveName` closure into both the live Top-10 handler
 * (served) and the pipeline scorer (observed) so they can never drift.
 *
 * Error contract (explicit split — review #244 header nit):
 * - `loadFromMapping` THROWS `TypeError` fail-closed on a malformed
 *   snapshot (non-array/absent `items`) and mutates nothing on that path
 *   (atomic swap: temp map first, `clear` + copy only after a clean
 *   iteration).
 * - `refreshMappingNameCache` NEVER REJECTS: any provider throw or
 *   validation throw maps to `false` with previous names kept (possibly
 *   empty → honest `Item <id>` fallback downstream). Mapping names must
 *   not break refresh.
 * S21 enrichment (#47): the same already-cached bulk snapshot also feeds
 * members/buyLimit via `resolveMetadata` — NO new bulk pull beyond the 288
 * count gate. Fail-open neutral defaults (`members: false`,
 * `buyLimit: null`) on miss/invalid so ranking counts and refresh never
 * break. Served-payload change is explicit (see rankEntries): members flags
 * make the `membership` post-rank view filter meaningful; staleness bound
 * (~24 h healthy, extending under outage by design) now covers metadata
 * too — a stale members flag is filter-input staleness (display-only),
 * never a pipeline failure.
 * Examine/value follow-up: same map additionally stores `examine` + `value`
 * from the already-cached snapshot — still NO new bulk pull. Invalid
 * entries degrade per-entry to neutrals (`''`/`null`) without dropping the
 * name; display-only (no filter/ranking input reads them).
 */

export interface MappingNameCache {
  readonly resolveName: ItemNameResolver;
  /** Sync lookup over the already-cached map only — never fetches. */
  readonly resolveMetadata: ItemMetadataResolver;
  loadFromMapping(snapshot: MappingSnapshot): void;
  size(): number;
}

export function createMappingNameCache(): MappingNameCache {
  const names = new Map<number, string>();
  const metas = new Map<number, CachedItemMetadata>();
  const resolveName: ItemNameResolver = (itemId: number) => names.get(itemId);
  const resolveMetadata: ItemMetadataResolver = (itemId: number) => metas.get(itemId);
  return {
    resolveName,
    resolveMetadata,
    loadFromMapping(snapshot: MappingSnapshot): void {
      // Atomic swap: validate + build temp first, swap only on success so a
      // malformed snapshot never wipes previous good names/metadata.
      if (!snapshot || !Array.isArray(snapshot.items)) {
        throw new TypeError('Invalid mapping snapshot: items must be an array');
      }
      const nextNames = new Map<number, string>();
      const nextMetas = new Map<number, CachedItemMetadata>();
      for (const item of snapshot.items) {
        if (
          typeof item?.id === 'number' &&
          Number.isInteger(item.id) &&
          typeof item?.name === 'string' &&
          item.name.trim() !== ''
        ) {
          nextNames.set(item.id, item.name.trim());
          // Fail-open per entry: invalid members/buyLimit/examine/value
          // degrade to the neutral defaults rather than dropping the name.
          // Single-source strictness shared with the serve + display paths.
          nextMetas.set(item.id, normalizeCachedMetadata(item));
        }
      }
      // #50a: value 0 is a real GE value (kept), null stays the miss
      // neutral — the >= 0 bound above is explicit, not accidental.
      names.clear();
      for (const [id, name] of nextNames) {
        names.set(id, name);
      }
      metas.clear();
      for (const [id, meta] of nextMetas) {
        metas.set(id, meta);
      }
    },
    size: () => names.size,
  };
}

/**
 * One bulk `/mapping` pull into the cache. Returns `true` on success,
 * `false` on any provider/validation failure (previous names/metadata kept —
 * the swap in `loadFromMapping` only runs after validation, so a
 * malformed-but-resolving snapshot can never wipe the cache).
 * Never rejects.
 */
export async function refreshMappingNameCache(
  cache: MappingNameCache,
  provider: Pick<MarketDataProvider, 'getMapping'>,
): Promise<boolean> {
  try {
    const snapshot = await provider.getMapping();
    cache.loadFromMapping(snapshot);
    return true;
  } catch {
    return false;
  }
}

/**
 * Re-warm slice: staleness bound for cached `/mapping` names.
 *
 * Decision (review #244): refresh-count gate, NOT a scheduler time hook.
 * The 5-minute refresh path must never pay a bulk `/mapping` pull, so
 * re-warm fires at most once per this many *successful* pipeline
 * refreshes (observed via the pipeline's `onBatch`, which only runs
 * after persist + scorer success). 288 successes ≈ 24 h at the default
 * 5-minute interval — names are display-only, so a ~24 h bound is ample
 * (new-item renames just wait for the next gate).
 *
 * Why the scheduler hook was rejected: a time-based hook drifts under
 * backoff/sleep (timers delay while successes still accumulate) and
 * needs clock injection + scheduler coupling for zero benefit. The
 * count gate's own drift runs the other way — under idle (no successful
 * refreshes) no re-warm fires — but that drift is benign: with no fresh
 * price data the served view is equally stale, so name staleness can
 * never observably exceed data staleness.
 */
export const MAPPING_REWARM_INTERVAL_REFRESHES = 288;

/**
 * #50b fast-retry: when the cache is empty (startup warm failed and no
 * good snapshot yet) or the last re-warm attempt failed, the next attempt
 * is due after this many successful refreshes instead of the full 288.
 * 12 successes ≈ 1 h at the default 5-minute interval — fast enough to
 * recover from a startup outage the same morning, slow enough that a
 * sustained mapping outage costs at most ~1 bulk fetch/hour (not 1 per
 * refresh: the counter still resets on *attempt*, so no retry storm).
 */
export const MAPPING_REWARM_RETRY_REFRESHES = 12;

/**
 * Pure gate predicate: re-warm is due once `successesSinceWarm` reaches
 * `interval`. Fail-closed `false` on any non-integer/non-positive input
 * (a bad counter must never trigger a bulk fetch).
 */
export function shouldRewarmMappingNames(
  successesSinceWarm: number,
  interval: number = MAPPING_REWARM_INTERVAL_REFRESHES,
): boolean {
  if (!Number.isInteger(successesSinceWarm) || successesSinceWarm < 0) {
    return false;
  }
  if (!Number.isInteger(interval) || interval <= 0) {
    return false;
  }
  return successesSinceWarm >= interval;
}

export type MappingRewarmOutcome = 'skipped' | 'ok' | 'failed';

export interface MappingRewarmTracker {
  readonly successesSinceWarm: number;
  /**
   * Call once per successful pipeline refresh. Skips (no fetch) until
   * the gate is due; when due, performs one best-effort
   * `refreshMappingNameCache` and resets the counter on the *attempt*
   * (success or failure) so a sustained mapping outage costs at most
   * one bulk fetch per interval instead of one per refresh. Failure
   * keeps previous names via the atomic swap (fail-open). Never rejects.
   */
  rewarmIfDue(
    cache: MappingNameCache,
    provider: Pick<MarketDataProvider, 'getMapping'>,
  ): Promise<MappingRewarmOutcome>;
}

export function createMappingRewarmTracker(
  interval: number = MAPPING_REWARM_INTERVAL_REFRESHES,
  retryInterval: number = MAPPING_REWARM_RETRY_REFRESHES,
): MappingRewarmTracker {
  let successes = 0;
  let lastFailed = false;
  // Fail-closed: bad retry intervals fall back to the main interval so a
  // bad arg can never trigger a per-refresh fetch storm.
  const retryEvery =
    Number.isInteger(retryInterval) && retryInterval > 0 ? retryInterval : interval;
  return {
    get successesSinceWarm(): number {
      return successes;
    },
    async rewarmIfDue(cache, provider): Promise<MappingRewarmOutcome> {
      successes += 1;
      // #50b: empty cache (startup warm never succeeded) or a failed last
      // attempt retries on the short gate; healthy warm uses the full gate.
      // Capped at the main interval so a retry can never be slower than
      // healthy, and never below 1 so every refresh cannot fetch.
      const fastPath = lastFailed || cache.size() === 0;
      const effective = fastPath ? Math.min(retryEvery, interval) : interval;
      if (!shouldRewarmMappingNames(successes, effective)) {
        return 'skipped';
      }
      // Reset on attempt, not on success — bounds outage fetch cost.
      successes = 0;
      try {
        const ok = await refreshMappingNameCache(cache, provider);
        lastFailed = !ok;
        return ok ? 'ok' : 'failed';
      } catch {
        // Defensive: refreshMappingNameCache never rejects by contract,
        // but the gate must still never break the refresh hot path.
        lastFailed = true;
        return 'failed';
      }
    },
  };
}
