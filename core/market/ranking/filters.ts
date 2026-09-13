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

/**
 * Sprint 9 slice-2: IPC-safe wire form of `OpportunityFilters` (roadmap §11).
 * `structuredClone`/JSON over IPC turns `Infinity` into `null`, so the wire
 * uses `maxPrice: null` for "no upper bound" and the codec maps it back to
 * `Number.POSITIVE_INFINITY`. All other fields pass through unchanged
 * (defensive copies for `allowedRisks`). `category` stays a no-op on both
 * sides. Pure — no IPC/scheduler/UI/network.
 */
export interface OpportunityFiltersWire {
  membership?: MembershipFilter;
  minPrice?: number;
  /** `null` means unbounded (Infinity); `undefined`/absent means unfiltered. */
  maxPrice?: number | null;
  allowedRisks?: readonly RiskLevel[];
  minLiquidity?: number;
  minScore?: number;
  category?: string;
}

/** Encode domain filters to the IPC wire form (Infinity → null). */
export function encodeFiltersForIpc(filters: OpportunityFilters = {}): OpportunityFiltersWire {
  const wire: OpportunityFiltersWire = {};
  if (filters.membership !== undefined) {
    wire.membership = filters.membership;
  }
  if (filters.minPrice !== undefined) {
    wire.minPrice = filters.minPrice;
  }
  if (filters.maxPrice !== undefined) {
    wire.maxPrice =
      filters.maxPrice === Number.POSITIVE_INFINITY ? null : filters.maxPrice;
  }
  if (filters.allowedRisks !== undefined) {
    wire.allowedRisks = [...filters.allowedRisks];
  }
  if (filters.minLiquidity !== undefined) {
    wire.minLiquidity = filters.minLiquidity;
  }
  if (filters.minScore !== undefined) {
    wire.minScore = filters.minScore;
  }
  if (filters.category !== undefined) {
    wire.category = filters.category;
  }
  return wire;
}

/** Decode wire filters back to the domain form (null → Infinity). */
export function decodeFiltersFromIpc(wire: OpportunityFiltersWire = {}): OpportunityFilters {
  const filters: OpportunityFilters = {};
  if (wire.membership !== undefined) {
    filters.membership = wire.membership;
  }
  if (wire.minPrice !== undefined) {
    filters.minPrice = wire.minPrice;
  }
  if (wire.maxPrice !== undefined) {
    filters.maxPrice =
      wire.maxPrice === null ? Number.POSITIVE_INFINITY : wire.maxPrice;
  }
  if (wire.allowedRisks !== undefined) {
    filters.allowedRisks = [...wire.allowedRisks];
  }
  if (wire.minLiquidity !== undefined) {
    filters.minLiquidity = wire.minLiquidity;
  }
  if (wire.minScore !== undefined) {
    filters.minScore = wire.minScore;
  }
  if (wire.category !== undefined) {
    filters.category = wire.category;
  }
  return filters;
}

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
