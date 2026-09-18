import type { HistoryRepository } from '../../core/history/HistoryRepository.js';
import type { MarketSnapshot } from '../../core/market/normalization/normalizer.js';
import {
  defaultRankingConfig,
  rankOpportunities,
} from '../../core/market/ranking/scorer.js';
import { rankingVersionForPreset } from '../../core/market/ranking/weights.js';
import { applyFilters, decodeFiltersFromIpc } from '../../core/market/ranking/filters.js';
import { buildRankEntries, type ItemMetadataResolver, type ItemNameResolver } from './rankEntries.js';
import type {
  MarketHistoryRequest,
  MarketHistoryResponse,
  MarketTop10Request,
  MarketTop10Response,
} from '../../shared/ipc.js';

/**
 * Sprint 20 slice-3: live Top-10/history serving over the S20 pipeline.
 *
 * The refresh path (S20 slices 1–2) persists every pull and logs observed
 * scorer counts; this module serves that same math over IPC:
 * - Top-10: the last successfully persisted batch, held in memory and
 *   ranked with the verbatim S6/S14 scorer (single-point `computeMetrics`
 *   at the batch timestamp + BALANCED `rankOpportunities` + `Item <id>`
 *   fallback + `historyMinutes` undefined). Zero repository reads — the
 *   S17 full-week scan cost stays out of both the refresh and serve paths.
 * - History: thin `getItemHistory` range over the caller's window
 *   (single-item scan through the selected backend — SQLite when
 *   available, JSON fallback).
 *
 * Honesty notes: an empty store (no successful refresh yet) serves an
 * empty live response, never the S7/S8 stub fixture; `computedAt` is the
 * batch timestamp that was actually ranked; `itemsAnalyzed` is the
 * unfiltered universe size so the summary distinguishes universe from
 * view (S9 precedent — `limit` caps the filtered view).
 */

/** Content-aware live tag — distinct from the `0.2-BALANCED-stub` fixture. */
export const LIVE_RANKING_VERSION = rankingVersionForPreset('BALANCED');

export interface LiveBatch {
  snapshots: readonly MarketSnapshot[];
  timestamp: number;
}

export interface LiveMarketStore {
  get(): LiveBatch | null;
  set(batch: LiveBatch): void;
}

export function createLiveMarketStore(): LiveMarketStore {
  let current: LiveBatch | null = null;
  return {
    get: () => current,
    set: (batch) => {
      current = batch;
    },
  };
}

function buildLiveEntries(
  snapshots: readonly MarketSnapshot[],
  timestamp: number,
  resolveName?: ItemNameResolver,
  resolveMetadata?: ItemMetadataResolver,
): ReturnType<typeof buildRankEntries> {
  // Cleanup slice: thin alias over the shared builder so served Top-10
  // can never drift from the pipeline's observed counts.
  // S21 slice-1: forwards the sync name lookup (cached /mapping names);
  // default stays the honest `Item <id>` fallback (no fetch in serve).
  // S21 enrichment (#47): forwards the sync metadata lookup over the same
  // already-cached map (miss → neutral false/null, explicit payload change).
  return buildRankEntries(snapshots, timestamp, resolveName, resolveMetadata);
}

/**
 * Rank one batch to a Top-10 response. Pure over its inputs (reads only,
 * fresh ranked objects via `rankOpportunities`); frozen-input safe.
 */
export function rankBatchToTop10(
  snapshots: readonly MarketSnapshot[],
  timestamp: number,
  request?: MarketTop10Request,
  resolveName?: ItemNameResolver,
  resolveMetadata?: ItemMetadataResolver,
): MarketTop10Response {
  const ranked = rankOpportunities(
    buildLiveEntries(snapshots, timestamp, resolveName, resolveMetadata),
    defaultRankingConfig(),
  );
  const filtered =
    request?.filters !== undefined ? applyFilters(ranked, decodeFiltersFromIpc(request.filters)) : ranked;
  const limit = request?.limit ?? filtered.length;
  return {
    rankingVersion: LIVE_RANKING_VERSION,
    computedAt: timestamp,
    itemsAnalyzed: snapshots.length,
    opportunities: filtered.slice(0, Math.max(0, limit)),
  };
}

/**
 * Live Top-10 handler over the in-memory last batch. Empty store serves an
 * honest empty live payload (never the stub fixture).
 */
export function createLiveTop10Handler(
  store: Pick<LiveMarketStore, 'get'>,
  now: () => number = Date.now,
  resolveName?: ItemNameResolver,
  resolveMetadata?: ItemMetadataResolver,
): (request?: MarketTop10Request) => MarketTop10Response {
  return (request?: MarketTop10Request): MarketTop10Response => {
    const batch = store.get();
    if (batch === null) {
      return {
        rankingVersion: LIVE_RANKING_VERSION,
        computedAt: now(),
        itemsAnalyzed: 0,
        opportunities: [],
      };
    }
    return rankBatchToTop10(batch.snapshots, batch.timestamp, request, resolveName, resolveMetadata);
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

const HISTORY_WINDOW_MS: Record<MarketHistoryRequest['window'], number> = {
  '24h': DAY_MS,
  '7d': 7 * DAY_MS,
};

/**
 * Live history handler: maps the explicit window union to a [from, to]
 * range ending at `nowMs` and delegates to the repository verbatim.
 * Fail-closed on bad itemId/window (throws — the async IPC wrapper
 * rejects, matching the flips/quality precedent).
 */
export function createLiveHistoryHandler(
  repository: Pick<HistoryRepository, 'getItemHistory'>,
  now: () => number = Date.now,
): (request: MarketHistoryRequest) => Promise<MarketHistoryResponse> {
  return async (request: MarketHistoryRequest): Promise<MarketHistoryResponse> => {
    const itemId = request?.itemId;
    const window = request?.window;
    if (!Number.isInteger(itemId) || (itemId as number) <= 0) {
      throw new Error(`Invalid history itemId: ${String(itemId)}`);
    }
    const windowMs = (HISTORY_WINDOW_MS as Record<string, number>)[window as string];
    if (windowMs === undefined) {
      throw new Error(`Invalid history window: ${String(window)}`);
    }
    const to = now();
    const points = await repository.getItemHistory(itemId, to - (windowMs as number), to);
    return { itemId, window, points };
  };
}
