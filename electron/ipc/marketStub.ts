import type { MarketHistoryRequest, MarketHistoryResponse, MarketTop10Request, MarketTop10Response } from '../../shared/ipc.js';
import type { MarketSnapshot } from '../../core/market/normalization/normalizer.js';
import type { Opportunity } from '../../core/market/ranking/types.js';
import { applyFilters, decodeFiltersFromIpc } from '../../core/market/ranking/filters.js';

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
  // Sprint 9 slice-2: optional post-rank view filter over the stub fixture
  // (D#163 — still never touches the live provider/scorer/history/
  // scheduler). Wire `maxPrice: null` decodes to Infinity via the shared
  // codec; filtering runs before the limit slice so `limit` caps filtered
  // rows. `itemsAnalyzed` stays the unfiltered fixture size so the renderer
  // summary can distinguish universe from view.
  const filtered =
    request?.filters !== undefined
      ? applyFilters(all, decodeFiltersFromIpc(request.filters))
      : all;
  const limit = request?.limit ?? filtered.length;
  return {
    rankingVersion: STUB_RANKING_VERSION,
    computedAt: Date.now(),
    itemsAnalyzed: all.length,
    opportunities: filtered.slice(0, Math.max(0, limit)),
  };
}

/**
 * Sprint 8 slice-2 stub history (D#163 scope guardrail): deterministic
 * MarketSnapshot fixture — never touches the live provider/history/
 * scheduler. Points are oldest-first; price trends gently upward so the
 * pure PriceChart has a visible slope in every window.
 */
export function getStubHistoryResponse(request: MarketHistoryRequest): MarketHistoryResponse {
  const count = request.window === '7d' ? 14 : 12;
  const now = Date.now();
  const stepMs = request.window === '7d' ? 12 * 60 * 60 * 1_000 : 2 * 60 * 60 * 1_000;
  const base = 1000 + (request.itemId % 500);
  const points: MarketSnapshot[] = Array.from({ length: count }, (_, i) => {
    const price = base + i * 7 + (request.itemId % 11);
    return {
      itemId: request.itemId,
      timestamp: now - (count - 1 - i) * stepMs,
      high: price + 12,
      low: price - 12,
    };
  });
  return { itemId: request.itemId, window: request.window, points };
}
