import type { MarketSnapshot } from '../normalization/normalizer.js';
import {
  assessProviderHealth,
  countImpossible,
  countMissingSides,
  freshnessScore,
  isDuplicateBatch,
  stalenessMs,
  trackMissingItems,
  type MissingSides,
  type ProviderHealth,
} from './dataQuality.js';

/**
 * Sprint 16 slice-2: stateless quality assessment orchestrator (roadmap §18).
 * Pure — no fetch, no fs, no IPC, no scheduler, no UI, no network, no Date.now.
 * Composes the slice-1 pure core into a single trust snapshot so the IPC
 * handler, the renderer fallback, and the panel share one truth instead of
 * re-combining primitives in three places.
 *
 * Stateless by design (S13 flip:calculate precedent): callers pass the
 * observed batch in (snapshots + nowMs + optional universe/store context);
 * nothing persists, nothing is fetched. Invalid inputs throw fail-closed
 * via the slice-1 validators — nothing is saved because there is nothing
 * to save.
 */

export interface QualityAssessmentInput {
  /** Normalized batch under review (positive-finite sides or undefined). */
  snapshots: readonly MarketSnapshot[];
  /** Explicit clock (no Date.now, S10 scheduler convention). */
  nowMs: number;
  /** Optional universe for coverage gaps; absent = coverage unchecked. */
  expectedItemIds?: readonly number[];
  /** Optional stored batch timestamps for duplicate detection. */
  existingTimestamps?: readonly number[];
  /** Candidate batch timestamp to test against the store. */
  candidateTimestamp?: number;
  /** Optional provider counters for the health verdict. */
  totalRecords?: number;
  invalidRecords?: number;
  excluded?: number;
}

export interface QualityAssessment {
  stalenessMs: number;
  freshnessScore: number;
  stale: boolean;
  missingSides: MissingSides;
  /** Fresh sorted gap list; empty when universe unchecked or fully covered. */
  missingItems: number[];
  impossibleCount: number;
  /** Null when no candidate/store context was supplied. */
  duplicateBatch: boolean | null;
  /** Null when provider counters were not supplied. */
  health: ProviderHealth | null;
}

/**
 * Assess one observed batch. Frozen-input safe (inputs only read; arrays
 * copied on output). Latest timestamp = max snapshot timestamp; an empty
 * batch is fully stale at nowMs (no observations = no freshness evidence).
 */
export function assessDataQuality(input: QualityAssessmentInput): QualityAssessment {
  const {
    snapshots,
    nowMs,
    expectedItemIds,
    existingTimestamps,
    candidateTimestamp,
    totalRecords,
    invalidRecords,
    excluded,
  } = (input ?? {}) as QualityAssessmentInput;
  if (!Array.isArray(snapshots)) {
    throw new Error('Invalid snapshots: expected an array');
  }
  if (!Number.isFinite(nowMs)) {
    throw new Error(`Invalid nowMs: ${String(nowMs)}`);
  }
  const missingSides = countMissingSides(snapshots);
  const missingItems =
    expectedItemIds === undefined ? [] : trackMissingItems(expectedItemIds, snapshots);
  const impossibleCount = countImpossible(snapshots);
  let latest = Number.NaN;
  for (const snapshot of snapshots) {
    if (!Number.isFinite(latest) || snapshot.timestamp > latest) {
      latest = snapshot.timestamp;
    }
  }
  const staleness = Number.isFinite(latest) ? stalenessMs(nowMs, latest) : nowMs;
  if (!Number.isFinite(staleness)) {
    throw new Error(`Invalid stalenessMs: ${String(staleness)}`);
  }
  const freshness = freshnessScore(staleness);
  const stale = freshness <= 0;

  let duplicateBatch: boolean | null = null;
  if (candidateTimestamp !== undefined || existingTimestamps !== undefined) {
    if (candidateTimestamp === undefined || existingTimestamps === undefined) {
      throw new Error('Invalid duplicate context: candidateTimestamp and existingTimestamps go together');
    }
    if (!Array.isArray(existingTimestamps)) {
      throw new Error('Invalid existingTimestamps: expected an array');
    }
    duplicateBatch = isDuplicateBatch(existingTimestamps, candidateTimestamp);
  }

  let health: ProviderHealth | null = null;
  if (totalRecords !== undefined || invalidRecords !== undefined || excluded !== undefined) {
    if (totalRecords === undefined || invalidRecords === undefined || excluded === undefined) {
      throw new Error('Invalid provider counters: totalRecords, invalidRecords and excluded go together');
    }
    health = assessProviderHealth({
      totalRecords,
      invalidRecords,
      excluded,
      stalenessMs: staleness,
      missingCount: missingItems.length,
    });
  }

  return {
    stalenessMs: staleness,
    freshnessScore: freshness,
    stale,
    missingSides: { ...missingSides },
    missingItems: [...missingItems],
    impossibleCount,
    duplicateBatch,
    health,
  };
}
