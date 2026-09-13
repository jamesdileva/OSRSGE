import type { MarketTop10Request, MarketTop10Response } from '../../shared/ipc.js';
import type { Opportunity } from '../../core/market/ranking/types.js';

/**
 * Sprint 7 slice-2 stub feed (D#163 scope guardrail).
 * Returns a fixed fixture — never touches the live provider, scorer,
 * history, or scheduler. The live pipeline arrives in later sprints;
 * this stub exists only to prove the main → preload → renderer round-trip.
 */
const STUB_RANKING_VERSION = '0.2-BALANCED-stub';

function makeOpportunity(
  id: number,
  name: string,
  currentPrice: number,
  finalScore: number,
  risk: Opportunity['risk'],
): Opportunity {
  return {
    rank: 0,
    item: { id, name, members: true, buyLimit: null, examine: '', value: null },
    currentPrice,
    changes: { oneHour: 1, sixHour: 2, twentyFourHour: 3 },
    spread: { gp: 60, percent: 2.5 },
    components: { momentum: 55, liquidity: 65, spread: 45, profitability: 35, consistency: 75, volatility: 25 },
    risk,
    confidence: 0.85,
    baseScore: finalScore,
    finalScore,
  };
}

/** Fixed fixture, deliberately unsorted — the renderer sorts via the shared view-model. */
function stubOpportunities(): Opportunity[] {
  return [
    makeOpportunity(4151, 'Abyssal whip', 806507, 10, 'LOW'),
    makeOpportunity(536, 'Dragon bones', 2450, 90, 'MEDIUM'),
    makeOpportunity(561, 'Nature rune', 210, 50, 'HIGH'),
  ];
}

export function getStubTop10Response(request?: MarketTop10Request): MarketTop10Response {
  const all = stubOpportunities();
  const limit = request?.limit ?? all.length;
  return {
    rankingVersion: STUB_RANKING_VERSION,
    computedAt: Date.now(),
    itemsAnalyzed: all.length,
    opportunities: all.slice(0, Math.max(0, limit)),
  };
}
