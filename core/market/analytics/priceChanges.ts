import type { MarketSnapshot } from '../normalization/normalizer.js';
import { findClosestSnapshot, snapshotPrice } from './timeseries.js';

/**
 * Multi-window price changes (guide §19, roadmap Sprint 5).
 * `changePct = ((current - past) / past) * 100`, else undefined —
 * never Infinity or NaN.
 */

export interface ChangeWindow {
  key: 'oneHour' | 'sixHour' | 'twentyFourHour';
  lookbackMs: number;
  toleranceMs: number;
}

const HOUR_MS = 60 * 60 * 1_000;

export const CHANGE_WINDOWS: ChangeWindow[] = [
  { key: 'oneHour', lookbackMs: HOUR_MS, toleranceMs: 15 * 60 * 1_000 },
  { key: 'sixHour', lookbackMs: 6 * HOUR_MS, toleranceMs: HOUR_MS },
  { key: 'twentyFourHour', lookbackMs: 24 * HOUR_MS, toleranceMs: 3 * HOUR_MS },
];

export function changePct(current: number, past: number): number | undefined {
  if (!Number.isFinite(current) || !Number.isFinite(past) || past <= 0) {
    return undefined;
  }
  return ((current - past) / past) * 100;
}

/** Change of the representative price vs the closest past observation. */
export function priceChange(
  history: MarketSnapshot[],
  nowMs: number,
  lookbackMs: number,
  toleranceMs: number,
): number | undefined {
  const current = history.length === 0 ? undefined : snapshotPrice(latestOf(history));
  if (current === undefined) {
    return undefined;
  }
  const pastSnapshot = findClosestSnapshot(history, nowMs - lookbackMs, toleranceMs);
  if (pastSnapshot === null) {
    return undefined;
  }
  const past = snapshotPrice(pastSnapshot);
  if (past === undefined) {
    return undefined;
  }
  return changePct(current, past);
}

export interface PriceChanges {
  oneHour?: number;
  sixHour?: number;
  twentyFourHour?: number;
}

/** All three roadmap windows at once. */
export function priceChanges(history: MarketSnapshot[], nowMs: number): PriceChanges {
  const changes: PriceChanges = {};
  for (const window of CHANGE_WINDOWS) {
    const value = priceChange(history, nowMs, window.lookbackMs, window.toleranceMs);
    if (value !== undefined) {
      changes[window.key] = value;
    }
  }
  return changes;
}

function latestOf(history: MarketSnapshot[]): MarketSnapshot {
  let latest = history[0] as MarketSnapshot;
  for (const snapshot of history) {
    if (snapshot.timestamp > latest.timestamp) {
      latest = snapshot;
    }
  }
  return latest;
}
