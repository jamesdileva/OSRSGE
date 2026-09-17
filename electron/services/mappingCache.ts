import type {
  MappingSnapshot,
  MarketDataProvider,
} from '../../core/market/providers/MarketDataProvider.js';
import type { ItemNameResolver } from './rankEntries.js';

/**
 * Sprint 21 slice-2: async `/mapping` name cache for the S21 sync seam.
 *
 * The pipeline/serve path stays sync and fetch-free (`buildRankEntries`
 * takes a sync `ItemNameResolver`); this module owns the only async side:
 * a plain in-memory `Map<itemId, name>` populated from one bulk
 * `/mapping` fetch. Main warms it once at startup (best-effort) and
 * passes the sync `resolveName` closure into both the live Top-10 handler
 * (served) and the pipeline scorer (observed) so they can never drift.
 *
 * Fail-open by design: a failed `/mapping` fetch returns `false` and keeps
 * the previous names (possibly empty → honest `Item <id>` fallback
 * downstream). Never throws — mapping names must not break refresh.
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
