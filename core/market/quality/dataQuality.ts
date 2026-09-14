import type { MarketSnapshot } from '../normalization/normalizer.js';

/**
 * Sprint 16 slice-1: pure data-quality core (roadmap §18).
 * Pure — no fetch, no fs, no IPC, no scheduler, no UI, no network, no Date.now.
 * Callers pass `nowMs` explicitly; inputs are only read; outputs are fresh.
 *
 * No-duplication boundary (review #155 gate 1 — what this module does NOT do):
 * - Normalizer (`normalizeEntry`/`normalizeLatest`) owns raw-shape cleaning:
 *   null → undefined, non-positive/non-finite price sides → undefined, both
 *   sides missing → excluded + counted. Quality never re-cleans raw feeds;
 *   it operates on normalized snapshots (positive finite prices) plus
 *   explicit timestamps/counts. Where the normalizer strips ≤0/NaN silently,
 *   quality strict-throws on such inputs (programming error, fail-closed) —
 *   see `assertSnapshotShape`.
 * - `JsonHistoryRepository.saveSnapshots` owns timestamp-dedupe persistence
 *   (same batch file exists → skip write). Quality owns the pure predicate
 *   (`isDuplicateBatch`/`hasDuplicateTimestamp`): timestamp-exists, NOT
 *   content-equal — matching history semantics. A re-pull with identical
 *   prices but a NEW timestamp is not a duplicate here (it is a frozen-feed
 *   anomaly via `isFrozenFeed`).
 * - `confidence.freshnessFactor` (<2h → 1, decay to 0 at 48h) weights ranking
 *   evidence. Quality `freshnessScore` measures pull recency for trust
 *   display (fresh → 1, decay to 0 at STALE_AFTER_MS). Different consumers,
 *   different clocks — the single-truth rule inside THIS module is:
 *   `freshnessScore` is primary, `isStaleData` derives from it
 *   (stale ⇔ score ≤ 0). Never compare the two modules' scores directly.
 *
 * Impossible vs suspicious vs invalid (gate 2):
 * - INVALID input (non-finite/NaN timestamps, non-positive/non-finite prices
 *   handed to quality directly): strict-throw, fail-closed. These shapes can
 *   never emerge from the normalizer, so they signal a caller bug.
 * - IMPOSSIBLE market value (positive finite but absurd): `isImpossibleSnapshot`
 *   returns true. Callers skip-count (exclude record, continue processing —
 *   guide §45 data-quality), never throw. Thresholds: any side
 *   > MAX_GE_PRICE_GP (2^31−1, engine cash limit), or both sides present with
 *   high < low (crossed market: ask below bid contradicts Wiki semantics).
 * - SUSPICIOUS (plausible but alarming): `isPriceSpike` / `isFrozenFeed`
 *   return true. Flag for review, keep the record — a 100% jump under the
 *   cap is suspicious, not impossible.
 *
 * Provider health (gate 4) is a pure function of explicit counts
 * (`totalRecords`, `invalidRecords`, `excluded`, `stalenessMs`,
 * optional `missingCount`) — no fetch, no repository import.
 * Slice-2 (IPC/panel) is explicitly out.
 */

export const MAX_GE_PRICE_GP = 2_147_483_647;
/** Pull recency budget: 3× the 5-min scheduler interval. */
export const STALE_AFTER_MS = 15 * 60 * 1_000;
/** Deep-stale floor for provider DOWN (4× the stale budget, 60 min). */
export const VERY_STALE_AFTER_MS = 4 * STALE_AFTER_MS;
/** Single-pull jump flag threshold (percent). Suspicious, not impossible. */
export const SPIKE_THRESHOLD_PCT = 50;
/** Error-rate bands for provider health. */
export const DEGRADED_ERROR_RATE = 0.1;
export const DOWN_ERROR_RATE = 0.5;

export type ProviderStatus = 'HEALTHY' | 'DEGRADED' | 'DOWN';

export interface ProviderHealthInput {
  totalRecords: number;
  invalidRecords: number;
  excluded: number;
  stalenessMs: number;
  missingCount?: number;
}

export interface ProviderHealth {
  status: ProviderStatus;
  errorRate: number;
  stale: boolean;
  reason: string;
}

export interface MissingSides {
  total: number;
  missingHigh: number;
  missingLow: number;
}

function assertFiniteMs(value: number, name: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid ${name}: ${String(value)}`);
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** ms since the latest observation. Negative (future pull) means not stale. */
export function stalenessMs(nowMs: number, latestTimestampMs: number): number {
  assertFiniteMs(nowMs, 'nowMs');
  assertFiniteMs(latestTimestampMs, 'latestTimestampMs');
  return nowMs - latestTimestampMs;
}

/**
 * Primary freshness truth: 1 when fresh, linear decay to 0 at STALE_AFTER_MS.
 * Future timestamps (negative staleness) clamp to 1.
 */
export function freshnessScore(staleness: number): number {
  assertFiniteMs(staleness, 'stalenessMs');
  return clamp01(1 - staleness / STALE_AFTER_MS);
}

/**
 * Derived boolean gate: stale ⇔ freshnessScore ≤ 0. Always derive via the
 * score so the two can never disagree (gate 2 single-truth rule).
 */
export function isStaleData(nowMs: number, latestTimestampMs: number): boolean {
  return freshnessScore(stalenessMs(nowMs, latestTimestampMs)) <= 0;
}

function assertSnapshotShape(snapshot: MarketSnapshot): void {
  assertFiniteMs(snapshot.timestamp, 'snapshot.timestamp');
  if (!Number.isInteger(snapshot.itemId)) {
    throw new Error(`Invalid snapshot itemId: ${String(snapshot.itemId)}`);
  }
  for (const side of [snapshot.high, snapshot.low] as const) {
    if (side !== undefined && (!Number.isFinite(side) || side <= 0)) {
      throw new Error(`Invalid snapshot price side: ${String(side)}`);
    }
  }
}

/**
 * Partial-side census over normalized snapshots the normalizer KEEPS
 * (high-only / low-only pass normalization with the absent side undefined).
 * This fires exactly where the normalizer stays silent: the normalizer
 * counts only both-sides-missing as excluded.
 */
export function countMissingSides(snapshots: readonly MarketSnapshot[]): MissingSides {
  let missingHigh = 0;
  let missingLow = 0;
  for (const snapshot of snapshots) {
    assertSnapshotShape(snapshot);
    if (snapshot.high === undefined) {
      missingHigh += 1;
    }
    if (snapshot.low === undefined) {
      missingLow += 1;
    }
  }
  return { total: snapshots.length, missingHigh, missingLow };
}

/**
 * Item-coverage gap: expected universe ids with no snapshot in the batch.
 * Returns a fresh array of missing ids (ascending, deduped).
 */
export function trackMissingItems(
  expectedItemIds: readonly number[],
  snapshots: readonly MarketSnapshot[],
): number[] {
  const seen = new Set<number>();
  for (const snapshot of snapshots) {
    assertSnapshotShape(snapshot);
    seen.add(snapshot.itemId);
  }
  const missing = new Set<number>();
  for (const id of expectedItemIds) {
    if (!Number.isInteger(id)) {
      throw new Error(`Invalid expected itemId: ${String(id)}`);
    }
    if (!seen.has(id)) {
      missing.add(id);
    }
  }
  return [...missing].sort((a, b) => a - b);
}

/** True when any batch timestamp repeats (history timestamp-exists semantics). */
export function hasDuplicateTimestamp(timestamps: readonly number[]): boolean {
  const seen = new Set<number>();
  for (const timestamp of timestamps) {
    assertFiniteMs(timestamp, 'batch timestamp');
    if (seen.has(timestamp)) {
      return true;
    }
    seen.add(timestamp);
  }
  return false;
}

/** True when the candidate batch timestamp is already stored. */
export function isDuplicateBatch(
  existingTimestamps: readonly number[],
  candidateTimestamp: number,
): boolean {
  assertFiniteMs(candidateTimestamp, 'candidateTimestamp');
  const seen = new Set<number>();
  for (const timestamp of existingTimestamps) {
    assertFiniteMs(timestamp, 'existing batch timestamp');
    seen.add(timestamp);
  }
  return seen.has(candidateTimestamp);
}

/**
 * Impossible market value (positive finite but absurd → skip-count, not throw):
 * any side above the engine cash limit, or both sides present with high < low
 * (crossed market contradicts Wiki high=ask / low=bid semantics).
 * Non-positive/non-finite sides throw (normalizer output never looks like
 * that — direct callers passing it have a bug, fail-closed).
 */
export function isImpossibleSnapshot(snapshot: MarketSnapshot): boolean {
  assertSnapshotShape(snapshot);
  if (
    (snapshot.high !== undefined && snapshot.high > MAX_GE_PRICE_GP) ||
    (snapshot.low !== undefined && snapshot.low > MAX_GE_PRICE_GP)
  ) {
    return true;
  }
  if (snapshot.high !== undefined && snapshot.low !== undefined && snapshot.high < snapshot.low) {
    return true;
  }
  return false;
}

/** Count impossible snapshots (fresh count, inputs only read). */
export function countImpossible(snapshots: readonly MarketSnapshot[]): number {
  let count = 0;
  for (const snapshot of snapshots) {
    if (isImpossibleSnapshot(snapshot)) {
      count += 1;
    }
  }
  return count;
}

/**
 * Suspicious single-pull jump: |curr − prev| / prev × 100 > threshold.
 * Suspicious, not impossible — flag for review, keep the record.
 * Throws on non-finite/non-positive prices (invalid input, fail-closed).
 */
export function isPriceSpike(
  prevMid: number,
  currMid: number,
  thresholdPct: number = SPIKE_THRESHOLD_PCT,
): boolean {
  for (const [value, name] of [
    [prevMid, 'prevMid'],
    [currMid, 'currMid'],
    [thresholdPct, 'thresholdPct'],
  ] as const) {
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid ${name}: ${String(value)}`);
    }
  }
  if (prevMid <= 0 || currMid <= 0 || thresholdPct < 0) {
    throw new Error('isPriceSpike needs positive prices and a non-negative threshold');
  }
  return (Math.abs(currMid - prevMid) / prevMid) * 100 > thresholdPct;
}

/**
 * Frozen-feed anomaly: ≥3 consecutive identical mids suggest a stuck provider.
 * Content-equal with ADVANCING timestamps is explicitly NOT a duplicate batch
 * (see above) — it is this anomaly instead. Throws on non-finite prices.
 */
export function isFrozenFeed(mids: readonly number[]): boolean {
  if (mids.length < 3) {
    return false;
  }
  for (const mid of mids) {
    if (!Number.isFinite(mid) || mid <= 0) {
      throw new Error(`Invalid frozen-feed price: ${String(mid)}`);
    }
  }
  const first = mids[0] as number;
  return mids.every((mid) => mid === first);
}

/**
 * Pure provider-health verdict from explicit counts (gate 4 — no fetch,
 * no repository import). Error rate = (invalid + excluded) / max(1, total).
 * DOWN when the feed is mostly garbage (errorRate > 0.5) or deeply stale
 * (> VERY_STALE_AFTER_MS); DEGRADED when stale, error-prone (> 0.1), or
 * reporting missing items; otherwise HEALTHY.
 */
export function assessProviderHealth(input: ProviderHealthInput): ProviderHealth {
  const { totalRecords, invalidRecords, excluded, stalenessMs: staleness, missingCount = 0 } = input;
  for (const [value, name] of [
    [totalRecords, 'totalRecords'],
    [invalidRecords, 'invalidRecords'],
    [excluded, 'excluded'],
    [staleness, 'stalenessMs'],
    [missingCount, 'missingCount'],
  ] as const) {
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid provider-health ${name}: ${String(value)}`);
    }
  }
  if (
    !Number.isInteger(totalRecords) ||
    !Number.isInteger(invalidRecords) ||
    !Number.isInteger(excluded) ||
    !Number.isInteger(missingCount) ||
    totalRecords < 0 ||
    invalidRecords < 0 ||
    excluded < 0 ||
    missingCount < 0
  ) {
    throw new Error('Invalid provider-health counts: counts must be non-negative integers');
  }
  if (invalidRecords > totalRecords || excluded > totalRecords) {
    throw new Error('Invalid provider-health counts: invalid/excluded cannot exceed total');
  }
  const errorRate = (invalidRecords + excluded) / Math.max(1, totalRecords);
  const stale = freshnessScore(staleness) <= 0;
  const veryStale = staleness > VERY_STALE_AFTER_MS;
  if (errorRate > DOWN_ERROR_RATE || veryStale) {
    return {
      status: 'DOWN',
      errorRate,
      stale,
      reason: veryStale && errorRate > DOWN_ERROR_RATE
        ? 'error rate above 50% and feed deeply stale'
        : veryStale
          ? 'feed deeply stale (>60m)'
          : 'error rate above 50%',
    };
  }
  if (stale || errorRate > DEGRADED_ERROR_RATE || missingCount > 0) {
    return {
      status: 'DEGRADED',
      errorRate,
      stale,
      reason: stale
        ? 'feed stale (>15m)'
        : errorRate > DEGRADED_ERROR_RATE
          ? 'error rate above 10%'
          : 'missing items reported',
    };
  }
  return { status: 'HEALTHY', errorRate, stale, reason: 'feed fresh with low errors' };
}
