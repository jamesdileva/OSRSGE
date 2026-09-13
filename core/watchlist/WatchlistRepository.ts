import type { WatchlistEntry } from './watchlist.js';

/**
 * Watchlist persistence abstraction (roadmap Sprint 11, architecture §20).
 * Analytics/UI depend on this interface — never on JSON files directly,
 * so SQLite (roadmap §17, `watchlist` table) can replace the
 * implementation without touching callers.
 */
export interface WatchlistRepository {
  /** Load all watched entries in insertion order; [] when nothing stored. */
  load(): Promise<WatchlistEntry[]>;

  /** Replace the stored watchlist (whole-list write). */
  save(entries: readonly WatchlistEntry[]): Promise<void>;
}
