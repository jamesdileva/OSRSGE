import type { Opportunity } from '../market/ranking/types.js';
import type { WatchlistEntry } from './watchlist.js';

/**
 * Sprint 11 slice-2 (part 1): pure watchlist view (roadmap §13).
 * Pure — no fs, no IPC, no scheduler, no UI, no network.
 *
 * IDs-only store stays in `watchlist.ts`; price/change/spread/risk are
 * DERIVED here at view time from `Opportunity[]` (never persisted).
 * Unknown/stale IDs resolve to `opportunity: null` so the UI renders a
 * graceful placeholder row instead of crashing (D#427 risk 1). Row order
 * always follows the store's insertion order (first-watch-wins, D#427
 * risk 2) regardless of the ranking order of `opportunities`.
 */

export interface WatchlistViewRow {
  itemId: number;
  addedAt: number;
  /** Matching opportunity by `item.id`, or null when unwatched-unknown/stale. */
  opportunity: Opportunity | null;
}

/**
 * Build the watchlist view: one row per entry, in store order, with the
 * matching opportunity attached (or null for unknown/stale ids).
 * Never mutates inputs; returns fresh row/entry objects (frozen-input safe).
 */
export function buildWatchlistView(
  entries: readonly WatchlistEntry[],
  opportunities: readonly Opportunity[],
): WatchlistViewRow[] {
  const byId = new Map<number, Opportunity>();
  for (const opportunity of opportunities) {
    const id = opportunity?.item?.id;
    if (typeof id === 'number' && Number.isInteger(id) && !byId.has(id)) {
      byId.set(id, opportunity);
    }
  }
  return entries.map((entry) => ({
    itemId: entry.itemId,
    addedAt: entry.addedAt,
    opportunity: byId.get(entry.itemId) ?? null,
  }));
}
