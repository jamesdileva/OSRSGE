import type { Opportunity, RiskLevel } from './types.js';

/**
 * Sprint 9 slice-1: pure post-rank opportunity filters (roadmap §11).
 * Pure — no IPC, no scheduler, no UI, no network.
 *
 * Scope contract (S9 slice-1 APPROVED conditions):
 * - `liquidity` means the 0–100 `components.liquidity` score (Sprint 5
 *   percentile passthrough), NOT raw trade volume.
 * - `score` means `finalScore` (post risk×confidence), NOT `baseScore`.
 * - `category` is a documented no-op: neither `MappingEntrySchema`
 *   (core/market/providers/schemas.ts) nor `ItemMetadata` carries a
 *   category field (verified by grep — no `category` match), so the field
 *   is accepted for roadmap API compat but never excludes anything.
 * - Pre-gate vs post-rank split: `isCandidate` (scorer.ts) remains the
 *   pre-rank gate that drops junk before scoring; `applyFilters` is the
 *   post-rank view filter over already-ranked `Opportunity[]` and keeps
 *   original `rank` numbers (gaps preserved, never renumbered).
 */

/** Membership dimension: 'all' (default) keeps everything. */
export type MembershipFilter = 'all' | 'f2p' | 'members';

export interface OpportunityFilters {
  membership?: MembershipFilter;
  minPrice?: number;
  maxPrice?: number;
  allowedRisks?: readonly RiskLevel[];
  /** 0–100 threshold against `components.liquidity`. */
  minLiquidity?: number;
  /** Threshold against `finalScore`. */
  minScore?: number;
  /**
   * Documented no-op (see module doc): no category data exists on
   * `ItemMetadata`, so any value — including undefined — matches all.
   */
  category?: string;
}

export const DEFAULT_FILTERS: Required<
  Pick<
    OpportunityFilters,
    'membership' | 'minPrice' | 'maxPrice' | 'allowedRisks' | 'minLiquidity' | 'minScore'
  >
> = {
  membership: 'all',
  minPrice: 0,
  maxPrice: Number.POSITIVE_INFINITY,
  allowedRisks: ['LOW', 'MEDIUM', 'HIGH'],
  minLiquidity: 0,
  minScore: 0,
};

/** Pure predicate: true when the opportunity survives every active filter. */
export function matchesFilters(
  opportunity: Opportunity,
  filters: OpportunityFilters = {},
): boolean {
  const membership = filters.membership ?? 'all';
  if (membership === 'f2p' && opportunity.item.members) {
    return false;
  }
  if (membership === 'members' && !opportunity.item.members) {
    return false;
  }
  if (filters.minPrice !== undefined && !(opportunity.currentPrice >= filters.minPrice)) {
    return false;
  }
  if (filters.maxPrice !== undefined && !(opportunity.currentPrice <= filters.maxPrice)) {
    return false;
  }
  if (
    filters.allowedRisks !== undefined &&
    filters.allowedRisks.length > 0 &&
    !filters.allowedRisks.includes(opportunity.risk)
  ) {
    return false;
  }
  if (
    filters.minLiquidity !== undefined &&
    !(opportunity.components.liquidity >= filters.minLiquidity)
  ) {
    return false;
  }
  if (filters.minScore !== undefined && !(opportunity.finalScore >= filters.minScore)) {
    return false;
  }
  // filters.category intentionally ignored: no category data exists.
  return true;
}

/**
 * Post-rank view filter over already-ranked opportunities.
 * Returns a fresh array (same object refs) with original `rank` numbers
 * preserved — removed rows leave gaps, never a renumber. Never mutates input.
 */
export function applyFilters(
  opportunities: readonly Opportunity[],
  filters: OpportunityFilters = {},
): Opportunity[] {
  return opportunities.filter((o) => matchesFilters(o, filters));
}
