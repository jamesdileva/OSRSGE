import type { MarketSnapshot } from '../market/normalization/normalizer.js';

/**
 * S17 measurement-only bench helpers (roadmap §19, review #178).
 * Pure functions only: deterministic synthetic snapshots, latency
 * summaries, and the migrate/skip verdict. No I/O, no network, no timers,
 * no schema/migration/dependency/interface change — the I/O bench lives in
 * `scripts/check-storage-bench.ts` (manual tool, not a test).
 */

/** Items per synthetic pull — live /latest universe size (~4534). */
export const BENCH_ITEMS_PER_PULL = 4534;
/** Pulls in a full 7-day week at a 5-minute cadence (7 × 288). */
export const BENCH_PULLS_PER_WEEK = 2016;
/** Synthetic pull cadence (ms). */
export const BENCH_PULL_INTERVAL_MS = 5 * 60 * 1_000;

/** Migrate gates: 7-day total, history p95, latest p95. */
export const BENCH_MAX_WEEK_BYTES = 1_073_741_824; // 1 GiB
export const BENCH_MAX_HISTORY_P95_MS = 1_000;
export const BENCH_MAX_LATEST_P95_MS = 500;

export interface LatencySummary {
  count: number;
  mean: number;
  p95: number;
  min: number;
  max: number;
}

export interface StorageVerdict {
  migrate: boolean;
  reasons: string[];
}

/**
 * One deterministic full-shape normalized snapshot (high/low/highTime/
 * lowTime/volume/timestamp — the shape `normalizeLatest` emits for /latest
 * plus the Sprint 5 `volume` bucket field, so bytes/pull never
 * underestimates vs minimal fixtures). Item ids are 1-based; prices stay
 * positive-finite so the batch is normalizer-plausible.
 */
export function makeBenchSnapshot(itemId: number, timestamp: number, pullIndex: number): MarketSnapshot {
  const high = 100 + ((itemId * 37 + pullIndex * 11) % 9_000);
  const low = high - (1 + ((itemId + pullIndex) % 50));
  const tradeTimeSec = Math.floor(timestamp / 1_000) - 60;
  return {
    itemId,
    timestamp,
    high,
    low,
    highTime: tradeTimeSec,
    lowTime: tradeTimeSec,
    volume: (itemId * 13 + pullIndex * 7) % 5_000,
  };
}

/** Nearest-rank summary over >=1 samples (fail-closed on empty/NaN). */
export function summarizeLatencies(samplesMs: number[]): LatencySummary {
  if (samplesMs.length === 0) {
    throw new Error('summarizeLatencies needs at least one sample');
  }
  if (samplesMs.some((s) => !Number.isFinite(s) || s < 0)) {
    throw new Error('summarizeLatencies samples must be finite and >= 0');
  }
  const sorted = [...samplesMs].sort((a, b) => a - b);
  const total = sorted.reduce((acc, s) => acc + s, 0);
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil(0.95 * sorted.length)));
  return {
    count: sorted.length,
    mean: total / sorted.length,
    p95: sorted[rank - 1] as number,
    min: sorted[0] as number,
    max: sorted[sorted.length - 1] as number,
  };
}

/**
 * Threshold verdict (review #178 gate 4): SKIP unless the 7-day total tops
 * 1 GiB OR history p95 tops 1000 ms OR latest p95 tops 500 ms.
 */
export function evaluateStorageVerdict(
  weekBytes: number,
  historyP95Ms: number,
  latestP95Ms: number,
): StorageVerdict {
  const reasons: string[] = [];
  if (weekBytes > BENCH_MAX_WEEK_BYTES) {
    reasons.push(`7-day total ${weekBytes} bytes > ${BENCH_MAX_WEEK_BYTES}`);
  }
  if (historyP95Ms > BENCH_MAX_HISTORY_P95_MS) {
    reasons.push(`history p95 ${historyP95Ms}ms > ${BENCH_MAX_HISTORY_P95_MS}ms`);
  }
  if (latestP95Ms > BENCH_MAX_LATEST_P95_MS) {
    reasons.push(`latest p95 ${latestP95Ms}ms > ${BENCH_MAX_LATEST_P95_MS}ms`);
  }
  return { migrate: reasons.length > 0, reasons };
}
