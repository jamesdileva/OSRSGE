import type { AlertRule } from './alertRules.js';

/**
 * Alert rule persistence abstraction (roadmap Sprint 12 slice-2).
 * UI/scheduler depend on this interface — never on JSON files directly,
 * so SQLite (roadmap §17) can replace the implementation without touching
 * callers. Mirrors the S11 WatchlistRepository contract.
 */
export interface AlertRepository {
  /** Load all rules in insertion order; [] when nothing stored. */
  load(): Promise<AlertRule[]>;

  /** Replace the stored rule list (whole-list write). */
  save(rules: readonly AlertRule[]): Promise<void>;
}
