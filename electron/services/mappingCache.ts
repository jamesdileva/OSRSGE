import type {
  MappingSnapshot,
  MarketDataProvider,
} from '../../core/market/providers/MarketDataProvider.js';
import type { ItemNameResolver } from './rankEntries.js';

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
 * Members/buyLimit enrichment stays out (name-only slice; filters keep
 * current semantics).
 */

export interface MappingNameCache {
  readonly resolveName: ItemNameResolver;
  loadFromMapping(snapshot: MappingSnapshot): void;
  size(): number;
}

export function createMappingNameCache(): MappingNameCache {
  const names = new Map<number, string>();
  const resolveName: ItemNameResolver = (itemId: number) => names.get(itemId);
  return {
    resolveName,
    loadFromMapping(snapshot: MappingSnapshot): void {
      // Atomic swap: validate + build temp first, swap only on success so a
      // malformed snapshot never wipes previous good names (S21 slice-3).
      if (!snapshot || !Array.isArray(snapshot.items)) {
        throw new TypeError('Invalid mapping snapshot: items must be an array');
      }
      const next = new Map<number, string>();
      for (const item of snapshot.items) {
        if (
          typeof item?.id === 'number' &&
          Number.isInteger(item.id) &&
          typeof item?.name === 'string' &&
          item.name.trim() !== ''
        ) {
          next.set(item.id, item.name.trim());
        }
      }
      names.clear();
      for (const [id, name] of next) {
        names.set(id, name);
      }
    },
    size: () => names.size,
  };
}

/**
 * One bulk `/mapping` pull into the cache. Returns `true` on success,
 * `false` on any provider/validation failure (previous names kept —
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
): MappingRewarmTracker {
  let successes = 0;
  return {
    get successesSinceWarm(): number {
      return successes;
    },
    async rewarmIfDue(cache, provider): Promise<MappingRewarmOutcome> {
      successes += 1;
      if (!shouldRewarmMappingNames(successes, interval)) {
        return 'skipped';
      }
      // Reset on attempt, not on success — bounds outage fetch cost.
      successes = 0;
      try {
        const ok = await refreshMappingNameCache(cache, provider);
        return ok ? 'ok' : 'failed';
      } catch {
        // Defensive: refreshMappingNameCache never rejects by contract,
        // but the gate must still never break the refresh hot path.
        return 'failed';
      }
    },
  };
}
