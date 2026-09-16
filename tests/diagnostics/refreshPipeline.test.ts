import { describe, expect, it } from 'vitest';
import type { HistoryRepository } from '../../core/history/HistoryRepository.js';
import type {
  LatestSnapshot,
  MarketDataProvider,
} from '../../core/market/providers/MarketDataProvider.js';
import { createAppLogger, type AppLogger } from '../../electron/services/appLogger.js';
import { createPipelineRefresh } from '../../electron/services/refreshPipeline.js';
import { createLoggingRefresh } from '../../electron/services/scheduler.js';

const T0 = 1_786_000_000_000;

function stubNow(start: number = T0): () => number {
  let t = start;
  return () => t++;
}

function makeLatest(entries: LatestSnapshot['entries'], invalidRecords = 0): LatestSnapshot {
  return { entries, fetchedAt: T0, invalidRecords };
}

function stubProvider(latest: LatestSnapshot | Error): Pick<MarketDataProvider, 'getLatest'> {
  return {
    getLatest: async (): Promise<LatestSnapshot> => {
      if (latest instanceof Error) throw latest;
      return latest;
    },
  };
}

function stubRepository(impl?: Partial<HistoryRepository>): {
  repository: HistoryRepository;
  saved: LatestSnapshot['entries'] extends never ? never : Parameters<HistoryRepository['saveSnapshots']>[0][];
} {
  const saved: Parameters<HistoryRepository['saveSnapshots']>[0][] = [];
  const repository: HistoryRepository = {
    saveSnapshots: async (snapshots) => {
      await impl?.saveSnapshots?.(snapshots);
      saved.push(snapshots);
    },
    getItemHistory: async (...args) =>
      (await impl?.getItemHistory?.(...args)) ?? [],
    getLatestSnapshot: async (...args) =>
      (await impl?.getLatestSnapshot?.(...args)) ?? null,
  };
  return { repository, saved };
}

describe('S20 slice-1 live pipeline refresh through the retained logger (offline)', () => {
  it('persists normalized snapshots and logs info/api-refresh with real counts', async () => {
    const logger = createAppLogger({ now: stubNow() });
    const provider = stubProvider(
      makeLatest({
        4151: { high: 100, highTime: null, low: 90, lowTime: null },
        4152: { high: null, highTime: null, low: null, lowTime: null },
      }),
    );
    const { repository, saved } = stubRepository();
    await createPipelineRefresh({ provider, repository, logger })();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toHaveLength(1);
    const recent = logger.getRecent();
    expect(recent).toHaveLength(1);
    expect(recent[0]?.level).toBe('info');
    expect(recent[0]?.category).toBe('api-refresh');
    expect(recent[0]?.message).toBe('refresh succeeded: 1 snapshots, 1 excluded');
    expect(recent[0]?.details).toMatchObject({ snapshots: 1, excluded: 1 });
  });

  it('resolves the lazy supplier per refresh (retained-logger visibility)', async () => {
    const logger = createAppLogger({ now: stubNow() });
    const provider = stubProvider(
      makeLatest({ 4151: { high: 100, highTime: null, low: 90, lowTime: null } }),
    );
    const { repository } = stubRepository();
    let current: AppLogger | null = null;
    const refresh = createPipelineRefresh({
      provider,
      repository,
      logger: () => current,
    });
    await refresh();
    expect(logger.getRecent()).toHaveLength(0);
    current = logger;
    await refresh();
    expect(logger.getRecent().map((e) => e.category)).toEqual(['api-refresh']);
  });

  it('provider failure logs error/api-failure and rethrows (backoff preserved)', async () => {
    const logger = createAppLogger({ now: stubNow() });
    const { repository, saved } = stubRepository();
    const refresh = createPipelineRefresh({
      provider: stubProvider(new Error('net down')),
      repository,
      logger,
    });
    await expect(refresh()).rejects.toThrow('net down');
    expect(saved).toHaveLength(0);
    const recent = logger.getRecent();
    expect(recent).toHaveLength(1);
    expect(recent[0]?.level).toBe('error');
    expect(recent[0]?.category).toBe('api-failure');
    expect(recent[0]?.message).toContain('net down');
  });

  it('storage failure logs error/api-failure and rethrows without persisting', async () => {
    const logger = createAppLogger({ now: stubNow() });
    const provider = stubProvider(
      makeLatest({ 4151: { high: 100, highTime: null, low: 90, lowTime: null } }),
    );
    const { repository } = stubRepository({
      saveSnapshots: async () => {
        throw new Error('disk full');
      },
    });
    await expect(
      createPipelineRefresh({ provider, repository, logger })(),
    ).rejects.toThrow('disk full');
    expect(logger.getRecent()[0]?.category).toBe('api-failure');
    expect(logger.getRecent()[0]?.message).toContain('disk full');
  });

  it('composes with createLoggingRefresh: api-failure + scheduler error events', async () => {
    const logger = createAppLogger({ now: stubNow() });
    const { repository } = stubRepository();
    const pipeline = createPipelineRefresh({
      provider: stubProvider(new Error('net down')),
      repository,
      logger: () => logger,
    });
    await expect(createLoggingRefresh(() => logger, pipeline)()).rejects.toThrow('net down');
    const categories = logger.getRecent().map((e) => e.category);
    expect(categories).toEqual(['api-failure', 'scheduler']);
    expect(logger.getRecent()[1]?.level).toBe('error');
  });

  it('logging never throws into the pipeline', async () => {
    const throwing: Pick<AppLogger, 'log'> = {
      log: async () => {
        throw new Error('logger bug');
      },
    };
    const okProvider = stubProvider(
      makeLatest({ 4151: { high: 100, highTime: null, low: 90, lowTime: null } }),
    );
    const { repository } = stubRepository();
    await expect(
      createPipelineRefresh({ provider: okProvider, repository, logger: throwing })(),
    ).resolves.toBeUndefined();
    await expect(
      createPipelineRefresh({
        provider: stubProvider(new Error('net down')),
        repository,
        logger: throwing,
      })(),
    ).rejects.toThrow('net down');
    const throwingSupplier = (): Pick<AppLogger, 'log'> => {
      throw new Error('supplier bug');
    };
    await expect(
      createPipelineRefresh({ provider: okProvider, repository, logger: throwingSupplier })(),
    ).resolves.toBeUndefined();
  });

  it('is a pass-through with a null logger', async () => {
    const provider = stubProvider(
      makeLatest({ 4151: { high: 100, highTime: null, low: 90, lowTime: null } }),
    );
    const { repository, saved } = stubRepository();
    await createPipelineRefresh({ provider, repository, logger: null })();
    expect(saved).toHaveLength(1);
  });
});
