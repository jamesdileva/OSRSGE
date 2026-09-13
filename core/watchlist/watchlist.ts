/**
 * Sprint 11 slice-1: pure watchlist store (roadmap §13).
 * Pure — no fs, no IPC, no scheduler, no UI, no network.
 *
 * The store is an insertion-ordered list of watched item IDs with the
 * timestamp each was added. All helpers take inputs explicitly (no
 * Date.now) and never mutate their inputs (frozen-input safe): every
 * mutating operation returns a fresh array.
 *
 * Scope contract (slice-1):
 * - ID set only: price/change/spread/risk are DERIVED at view time from
 *   `Opportunity[]`/snapshots by the caller (slice-2), never stored here.
 * - No cap: the roadmap sets no size limit, so none is invented.
 * - Strict on write, tolerant on read: invalid entries throw here; the
 *   JSON repository skips invalid records when loading (same split as
 *   the provider/normalizer boundary in Sprint 2/3).
 */

/** One watched item: its ID plus when it was first added (unix ms). */
export interface WatchlistEntry {
  itemId: number;
  addedAt: number;
}

function assertItemId(itemId: number): void {
  if (!Number.isInteger(itemId) || itemId <= 0) {
    throw new Error(`Invalid itemId: ${String(itemId)} (expected positive integer)`);
  }
}

function assertNowMs(nowMs: number): void {
  if (!Number.isFinite(nowMs) || nowMs < 0) {
    throw new Error(`Invalid nowMs: ${String(nowMs)} (expected finite timestamp >= 0)`);
  }
}

export function isValidWatchlistEntry(value: unknown): value is WatchlistEntry {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.itemId === 'number' &&
    Number.isInteger(record.itemId) &&
    (record.itemId as number) > 0 &&
    typeof record.addedAt === 'number' &&
    Number.isFinite(record.addedAt as number) &&
    (record.addedAt as number) >= 0
  );
}

/** Fresh empty watchlist (defensive copy when seeded). */
export function createWatchlist(initial: readonly WatchlistEntry[] = []): WatchlistEntry[] {
  return initial.map((entry) => {
    if (!isValidWatchlistEntry(entry)) {
      throw new Error(`Invalid watchlist entry: ${JSON.stringify(entry)}`);
    }
    return { itemId: entry.itemId, addedAt: entry.addedAt };
  });
}

/**
 * Add an item. Re-adding a watched id is a no-op that preserves the
 * original `addedAt` and position (first-watch wins).
 */
export function addToWatchlist(
  entries: readonly WatchlistEntry[],
  itemId: number,
  nowMs: number,
): WatchlistEntry[] {
  assertItemId(itemId);
  assertNowMs(nowMs);
  if (entries.some((entry) => entry.itemId === itemId)) {
    return entries.map((entry) => ({ itemId: entry.itemId, addedAt: entry.addedAt }));
  }
  return [...entries.map((entry) => ({ ...entry })), { itemId, addedAt: nowMs }];
}

/** Remove an item. Removing an unwatched id returns an equal fresh array. */
export function removeFromWatchlist(
  entries: readonly WatchlistEntry[],
  itemId: number,
): WatchlistEntry[] {
  assertItemId(itemId);
  return entries
    .filter((entry) => entry.itemId !== itemId)
    .map((entry) => ({ itemId: entry.itemId, addedAt: entry.addedAt }));
}

export function isWatched(entries: readonly WatchlistEntry[], itemId: number): boolean {
  assertItemId(itemId);
  return entries.some((entry) => entry.itemId === itemId);
}

/** Watched IDs in insertion order. */
export function watchlistIds(entries: readonly WatchlistEntry[]): number[] {
  return entries.map((entry) => entry.itemId);
}
