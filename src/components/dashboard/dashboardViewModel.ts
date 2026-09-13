import type { Opportunity } from '../../../core/market/ranking/types.js';

/**
 * Sprint 7 slice-1: pure dashboard view-model (guide §§35–38).
 * Zero network, zero IPC, zero scheduler — sorts a snapshot of
 * Opportunities into a Top-10 + summary the Dashboard renders.
 * Out of scope: filters/presets (S9), IPC/scheduler (S10),
 * charts/details (S8), backtest profit-weight watch (S14).
 */
export interface DashboardSummary {
  itemsAnalyzed: number;
  opportunitiesFound: number;
  lastUpdated?: number;
}

export interface DashboardViewModel {
  summary: DashboardSummary;
  top10: Opportunity[];
}

export function buildDashboardViewModel(input: {
  opportunities: Opportunity[];
  itemsAnalyzed: number;
  lastUpdated?: number;
}): DashboardViewModel {
  const sorted = [...input.opportunities].sort((a, b) => b.finalScore - a.finalScore);
  // Copy-on-rank: never mutate caller objects (review #37 — shallow
  // [...]/slice copies still share refs, so forEach rank assignment
  // leaked into props). Fresh objects keep the builder pure.
  const top10 = sorted.slice(0, 10).map((opportunity, index) => ({ ...opportunity, rank: index + 1 }));
  return {
    summary: {
      itemsAnalyzed: input.itemsAnalyzed,
      opportunitiesFound: input.opportunities.length,
      lastUpdated: input.lastUpdated,
    },
    top10,
  };
}
