import type { HistoryRepository } from '../../core/history/HistoryRepository.js';
import type { MarketDataProvider } from '../../core/market/providers/MarketDataProvider.js';
import { SnapshotService } from '../../core/history/snapshotService.js';
import type { AppLogger } from './appLogger.js';

/**
 * Sprint 20 slice-1: live refresh pipeline behind the retained logger.
 *
 * One refresh = fetch → normalize → persist (the `SnapshotService`
 * orchestration, interfaces untouched) with the main-owned logger as
 * observer. Success logs `info/api-refresh` carrying the real snapshot /
 * excluded counts; failure logs `error/api-failure` with the failure
 * message and rethrows so the scheduler's backoff still stamps the streak
 * (the outer `createLoggingRefresh` adds the adjacent `scheduler` event —
 * together the ring answers "why didn't the rankings update?" with
 * evidence instead of the `(stub, no pipeline)` honesty note).
 *
 * What this module does NOT do (boundary):
 * - No scorer/ranking counts yet: the `snapshots`/`ranking` dedicated
 *   categories arrive with the scorer-over-history slice (this event
 *   carries the snapshot count in message + details meanwhile).
 * - No HistoryRepository/analytics/scorer interface change: the service,
 *   provider, and repository are used verbatim.
 * - Logging never throws into the pipeline: a throwing logger (or supplier)
 *   degrades to memory-pass-through on success and never masks the original
 *   error on failure.
 */

export type PipelineLoggerSupplier = () => Pick<AppLogger, 'log'> | null | undefined;

export type PipelineLogger = Pick<AppLogger, 'log'> | null | undefined | PipelineLoggerSupplier;

export interface PipelineRefreshDeps {
  provider: Pick<MarketDataProvider, 'getLatest'>;
  repository: HistoryRepository;
  logger?: PipelineLogger;
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

export function createPipelineRefresh(deps: PipelineRefreshDeps): () => Promise<void> {
  const service = new SnapshotService(deps.provider, deps.repository);
  return async (): Promise<void> => {
    const resolved = resolvePipelineLogger(deps.logger);
    try {
      const result = await service.refresh();
      try {
        await resolved?.log(
          'info',
          'api-refresh',
          `refresh succeeded: ${result.snapshots} snapshots, ${result.excluded} excluded`,
          {
            snapshots: result.snapshots,
            excluded: result.excluded,
            timestamp: result.timestamp,
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
