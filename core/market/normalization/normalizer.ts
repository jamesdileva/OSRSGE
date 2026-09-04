import type {
  LatestEntry,
  LatestSnapshot,
} from '../providers/MarketDataProvider.js';

/**
 * Normalization (roadmap Sprint 3, guide §14).
 * Transforms provider output into the internal market model. Pure functions:
 * no fetch, no storage, no metadata lookups — snapshots stay ID-keyed and
 * names resolve at view-model time via ItemMetadataStore.
 */

/** Internal market model (architecture §11). */
export interface MarketSnapshot {
  itemId: number;
  /** Observation time (unix ms) of the bulk pull this snapshot came from. */
  timestamp: number;
  high?: number;
  low?: number;
  highTime?: number;
  lowTime?: number;
  /** Trade volume — undefined for /latest (endpoint carries none; Sprint 5). */
  volume?: number;
}

export interface NormalizedBatch {
  snapshots: MarketSnapshot[];
  /** Records with no usable price on either side (counted, never fatal). */
  excluded: number;
}

/** Clock-skew allowance (ms) for accepting highTime/lowTime values. */
const TIME_SKEW_ALLOWANCE_MS = 5 * 60 * 1_000;

function cleanPrice(value: number | null): number | undefined {
  if (value === null || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return value;
}

function cleanTime(value: number | null, nowMs: number): number | undefined {
  if (value === null || !Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  const timeMs = value * 1_000;
  if (timeMs > nowMs + TIME_SKEW_ALLOWANCE_MS) {
    return undefined;
  }
  return value;
}

export function normalizeEntry(
  itemId: number,
  entry: LatestEntry,
  timestamp: number,
): MarketSnapshot | null {
  const high = cleanPrice(entry.high);
  const low = cleanPrice(entry.low);
  if (high === undefined && low === undefined) {
    return null;
  }
  const snapshot: MarketSnapshot = { itemId, timestamp };
  if (high !== undefined) {
    snapshot.high = high;
  }
  if (low !== undefined) {
    snapshot.low = low;
  }
  const highTime = cleanTime(entry.highTime, timestamp);
  if (highTime !== undefined) {
    snapshot.highTime = highTime;
  }
  const lowTime = cleanTime(entry.lowTime, timestamp);
  if (lowTime !== undefined) {
    snapshot.lowTime = lowTime;
  }
  return snapshot;
}

/** Normalize a whole bulk pull; unknown item IDs pass through untouched. */
export function normalizeLatest(latest: LatestSnapshot): NormalizedBatch {
  const snapshots: MarketSnapshot[] = [];
  let excluded = latest.invalidRecords;
  for (const [key, entry] of Object.entries(latest.entries)) {
    if (entry === null || typeof entry !== 'object') {
      excluded += 1;
      continue;
    }
    const snapshot = normalizeEntry(Number(key), entry, latest.fetchedAt);
    if (snapshot === null) {
      excluded += 1;
      continue;
    }
    snapshots.push(snapshot);
  }
  return { snapshots, excluded };
}
