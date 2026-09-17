import type { HistoryRepository } from '../../core/history/HistoryRepository.js';
import type { MarketDataProvider } from '../../core/market/providers/MarketDataProvider.js';
import { SnapshotService } from '../../core/history/snapshotService.js';
import type { MarketSnapshot } from '../../core/market/normalization/normalizer.js';
import {
  defaultRankingConfig,
  rankOpportunities,
} from '../../core/market/ranking/scorer.js';
import { buildRankEntries, type ItemNameResolver } from './rankEntries.js';
import type { AppLogger } from './appLogger.js';

/**
 * Sprint 20 slice-2: live refresh pipeline plus observed scorer counts.
 *
 * One refresh = fetch → normalize → persist (the `SnapshotService`
 * orchestration, interfaces untouched) with the main-owned logger as
 * observer, then a bounded in-memory scorer pass over the just-persisted
 * batch. Success logs `info/api-refresh` carrying the real snapshot /
 * excluded counts plus the observed `rankingCandidates` / `ranked`
 * counts; failure (provider, storage, OR scorer) logs `error/api-failure`
 * with the failure message and rethrows so the scheduler's backoff still
 * stamps the streak (the outer `createLoggingRefresh` adds the adjacent
 * `scheduler` event).
 *
 * Scorer scope (review #205 gates):
 * - Past-only by construction: the scored view is the batch just saved,
 *   ranked at its own timestamp (`snapshot.timestamp <= now` holds for
 *   every point — S14 `sliceHistoryAt` precedent, no future leak). Stored
 *   history is never re-read here.
 * - Thin-evidence honesty: a single pull carries no history-depth
 *   evidence, so `historyMinutes` stays undefined (neutral — the S14
 *   "expected counts stay undefined" precedent). `isCandidate` then gates
 *   on price only; risk/confidence degrade gracefully instead of dropping
 *   the whole universe on the depth filter. Full-history depth gating
 *   returns when stored-history windowing arrives.
 * - Observed, never served here: the counts are named `rankingCandidates` /
 *   `ranked` (what the scorer saw), never "served". S20 slice-3 serves the
 *   same batch over Top-10/history IPC (`electron/services/liveMarket.ts`
 *   ranks the published batch with the shared `buildRankEntries` helper —
 *   the S7/S8 stub fixtures are retired, dead-in-prod in
 *   `electron/ipc/marketStub.ts`). Unknown ids fall back to `Item <id>`
 *   (S2/S14 precedent); no metadata fetch in the pipeline.
 * - Perf guard (S17 lesson): single O(N) in-memory pass over the batch,
 *   zero repository reads (no per-item `getItemHistory` scan — the 8 s
 *   full-week cost stays out of the refresh path). Full-universe
 *   (4534-item) scoring is sub-100 ms scale (measured in tests).
 * - Pipeline safety inherited: the batch is captured by wrapping
 *   `saveSnapshots` (no service/repository interface change); logging
 *   never throws into the pipeline; a throwing scorer maps to
 *   `api-failure` + rethrow like any other pipeline failure; lazy logger
 *   supplier preserved.
 */

export type PipelineLoggerSupplier = () => Pick<AppLogger, 'log'> | null | undefined;

export type PipelineLogger = Pick<AppLogger, 'log'> | null | undefined | PipelineLoggerSupplier;

export interface RankingCounts {
  rankingCandidates: number;
  ranked: number;
}

export type RankSnapshotsFn = (
  snapshots: readonly MarketSnapshot[],
  timestamp: number,
) => RankingCounts;

/**
 * Default scorer over the just-saved batch: per-snapshot single-point
 * metrics at the batch timestamp → `rankOpportunities` with the default
 * BALANCED config. Delegates to the shared `buildRankEntries` helper so
 * observed counts can never drift from the served Top-10 (cleanup slice);
 * frozen-input safe (reads only, fresh entry objects). Name resolution is
 * an optional sync lookup (S21 slice-1 seam); default is the `Item <id>`
 * fallback so the pipeline never fetches.
 */
export function scoreBatchSnapshots(
  snapshots: readonly MarketSnapshot[],
  timestamp: number,
  resolveName?: ItemNameResolver,
): RankingCounts {
  const entries = buildRankEntries(snapshots, timestamp, resolveName);
  const ranked = rankOpportunities(entries, defaultRankingConfig()).length;
  return { rankingCandidates: entries.length, ranked };
}

export interface PipelineRefreshDeps {
  provider: Pick<MarketDataProvider, 'getLatest'>;
  repository: HistoryRepository;
  logger?: PipelineLogger;
  /** Injectable scorer for tests; defaults to `scoreBatchSnapshots`. */
  rankSnapshots?: RankSnapshotsFn;
  /**
   * Sprint 20 slice-3: optional publish of the just-persisted batch so the
   * live Top-10 IPC can serve it from memory with zero repository reads.
   * Invoked after persist + scorer success; a throwing callback is
   * swallowed (publishing must not turn success into failure). Failure
   * paths never publish — the store keeps the last good batch.
   * Cleanup note: callers should copy the array (`[...snapshots]`) — the
   * copy is array-only, snapshot objects stay aliased. Safe while the
   * pipeline owns the batch (it never mutates after persist); main's
   * `liveStore.set` follows this pattern.
   */
  onBatch?: (snapshots: readonly MarketSnapshot[], timestamp: number) => void;
}

function resolvePipelineLogger(logger: PipelineLogger): Pick<AppLogger, 'log'> | null {
  if (typeof logger === 'function') {
    try {
      return (logger as PipelineLoggerSupplier)() ?? null;
    } catch {
      return null;
    }
  }
  return logger ?? null;
}

/**
 * Cleanup slice: capturing wrapper extracted so tests can prove the
 * wrapper itself forwards `getItemHistory`/`getLatestSnapshot` with the
 * prototype intact (review #216 nit — the old test called the original
 * repo directly, which could not disconfirm a broken wrapper).
 * Behavior identical to the inline version it replaces.
 */
export function wrapRepositoryWithCapture(original: HistoryRepository): {
  repository: HistoryRepository;
  getCaptured: () => MarketSnapshot[] | null;
} {
  let captured: MarketSnapshot[] | null = null;
  const repository: HistoryRepository = {
    saveSnapshots: async (snapshots) => {
      captured = snapshots;
      return original.saveSnapshots(snapshots);
    },
    getItemHistory: (...args) => original.getItemHistory(...args),
    getLatestSnapshot: (...args) => original.getLatestSnapshot(...args),
  };
  return { repository, getCaptured: () => captured };
}

export function createPipelineRefresh(deps: PipelineRefreshDeps): () => Promise<void> {
  // Capture the normalized batch without touching the service/repository
  // interfaces: the wrapper observes the `saveSnapshots` argument the
  // pipeline already persists, so scoring needs zero extra repository
  // reads (S17 perf guard) and zero extra provider pulls.
  // Review #206 nit: explicit delegation (not `{...deps.repository}`)
  // so class-prototype methods survive the wrap. Extracted as
  // `wrapRepositoryWithCapture` (cleanup slice) so tests can prove the
  // wrapper forwards through the capturing layer, not around it.
  const { repository: capturingRepository, getCaptured } = wrapRepositoryWithCapture(
    deps.repository,
  );
  const service = new SnapshotService(deps.provider, capturingRepository);
  const rankSnapshots = deps.rankSnapshots ?? scoreBatchSnapshots;
  return async (): Promise<void> => {
    const resolved = resolvePipelineLogger(deps.logger);
    try {
      const result = await service.refresh();
      const captured = getCaptured();
      // A throwing scorer is a pipeline failure like any other: it maps
      // to `api-failure` + rethrow below (backoff preserved).
      const counts = rankSnapshots(captured ?? [], result.timestamp);
      try {
        deps.onBatch?.(captured ?? [], result.timestamp);
      } catch {
        // Publishing must not turn a successful refresh into a failure.
      }
      try {
        await resolved?.log(
          'info',
          'api-refresh',
          `refresh succeeded: ${result.snapshots} snapshots, ${result.excluded} excluded, ` +
            `${counts.rankingCandidates} ranking candidates, ${counts.ranked} ranked (observed)`,
          {
            snapshots: result.snapshots,
            excluded: result.excluded,
            timestamp: result.timestamp,
            rankingCandidates: counts.rankingCandidates,
            ranked: counts.ranked,
          },
        );
      } catch {
        // Logging must not turn a successful refresh into a failure.
      }
    } catch (error) {
      try {
        await resolved?.log(
          'error',
          'api-failure',
          `refresh failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      } catch {
        // Logging must not mask the refresh failure it observes.
      }
      throw error;
    }
  };
}
