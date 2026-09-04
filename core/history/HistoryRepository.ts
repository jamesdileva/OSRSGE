import type { MarketSnapshot } from '../market/normalization/normalizer.js';

/**
 * Historical storage abstraction (guide §15, roadmap Sprint 4).
 * Analytics depends on this interface — never on JSON files directly,
 * so SQLite can replace the implementation without touching analytics.
 */
export interface HistoryRepository {
  /** Persist one bulk pull. Skips batches already stored (dedupe). */
  saveSnapshots(snapshots: MarketSnapshot[]): Promise<void>;

  /** Snapshots for one item within [from, to] (unix ms), oldest first. */
  getItemHistory(itemId: number, from: number, to: number): Promise<MarketSnapshot[]>;

  /** Newest stored snapshot for one item, or null when unknown. */
  getLatestSnapshot(itemId: number): Promise<MarketSnapshot | null>;
}
