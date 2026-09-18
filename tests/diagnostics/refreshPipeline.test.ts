import { describe, expect, it } from 'vitest';
import type { HistoryRepository } from '../../core/history/HistoryRepository.js';
import type {
  LatestSnapshot,
  MarketDataProvider,
} from '../../core/market/providers/MarketDataProvider.js';
import { createAppLogger, type AppLogger } from '../../electron/services/appLogger.js';
import {
  createPipelineRefresh,
  scoreBatchSnapshots,
} from '../../electron/services/refreshPipeline.js';
import { createLoggingRefresh } from '../../electron/services/scheduler.js';
import { getStubTop10Response } from '../../electron/ipc/marketStub.js';

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

describe('S20 slice-2 observed scorer counts in the pipeline refresh (offline)', () => {
  it('persists normalized snapshots and logs info/api-refresh with observed ranking counts', async () => {
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
    // 4151 midpoints to 95 (< 100 GP floor): observed as a candidate,
    // filtered before ranking — honest thin-evidence counts, not served.
    expect(recent[0]?.message).toBe(
      'refresh succeeded: 1 snapshots, 1 excluded, 1 ranking candidates, 0 ranked (observed)',
    );
    expect(recent[0]?.details).toMatchObject({
      snapshots: 1,
      excluded: 1,
      rankingCandidates: 1,
      ranked: 0,
    });
  });

  it('carries a non-zero ranked count when the batch clears the price floor', async () => {
    const logger = createAppLogger({ now: stubNow() });
    const provider = stubProvider(
      makeLatest({
        4151: { high: 1000, highTime: null, low: 900, lowTime: null },
      }),
    );
    const { repository } = stubRepository();
    await createPipelineRefresh({ provider, repository, logger })();
    const recent = logger.getRecent();
    expect(recent).toHaveLength(1);
    expect(recent[0]?.message).toBe(
      'refresh succeeded: 1 snapshots, 0 excluded, 1 ranking candidates, 1 ranked (observed)',
    );
    expect(recent[0]?.details).toMatchObject({ rankingCandidates: 1, ranked: 1 });
  });

  it('logs the zero-candidate path when every record is excluded', async () => {
    const logger = createAppLogger({ now: stubNow() });
    const provider = stubProvider(
      makeLatest({
        4152: { high: null, highTime: null, low: null, lowTime: null },
      }),
    );
    const { repository, saved } = stubRepository();
    await createPipelineRefresh({ provider, repository, logger })();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toHaveLength(0);
    const recent = logger.getRecent();
    expect(recent).toHaveLength(1);
    expect(recent[0]?.message).toBe(
      'refresh succeeded: 0 snapshots, 1 excluded, 0 ranking candidates, 0 ranked (observed)',
    );
    expect(recent[0]?.details).toMatchObject({ rankingCandidates: 0, ranked: 0 });
  });

  it('a throwing scorer maps to error/api-failure and rethrows (backoff preserved)', async () => {
    const logger = createAppLogger({ now: stubNow() });
    const provider = stubProvider(
      makeLatest({ 4151: { high: 1000, highTime: null, low: 900, lowTime: null } }),
    );
    const { repository, saved } = stubRepository();
    const refresh = createPipelineRefresh({
      provider,
      repository,
      logger,
      rankSnapshots: () => {
        throw new Error('scorer bug');
      },
    });
    await expect(refresh()).rejects.toThrow('scorer bug');
    // Scoring runs after persist: the batch is kept, the failure is still
    // surfaced so the scheduler stamps its backoff streak.
    expect(saved).toHaveLength(1);
    const recent = logger.getRecent();
    expect(recent).toHaveLength(1);
    expect(recent[0]?.level).toBe('error');
    expect(recent[0]?.category).toBe('api-failure');
    expect(recent[0]?.message).toContain('scorer bug');
  });

  it('leaves the Top-10 IPC stub fixture untouched (counts are observed, never served)', async () => {
    const response = getStubTop10Response();
    expect(response.rankingVersion).toBe('0.2-BALANCED-stub');
    expect(response.itemsAnalyzed).toBe(3);
    expect(response.opportunities).toHaveLength(3);
  });

  it('scores a full-universe batch in a single bounded pass with zero repository reads (deterministic S17 perf guard)', async () => {
    const { normalizeLatest } = await import(
      '../../core/market/normalization/normalizer.js'
    );
    const entries: Record<string, { high: number; highTime: null; low: number; lowTime: null }> = {};
    for (let id = 1; id <= 4534; id += 1) {
      const price = 200 + ((id * 37) % 5000);
      entries[String(id)] = { high: price + 10, highTime: null, low: price - 10, lowTime: null };
    }
    const batch = normalizeLatest({ entries, fetchedAt: T0, invalidRecords: 0 });
    expect(batch.snapshots.length).toBe(4534);
    // Direct correctness at full-universe scale (no timing: wall-clock
    // `Date.now` bounds flake on shared CI hardware — determinism first).
    const counts = scoreBatchSnapshots(batch.snapshots, T0);
    expect(counts.rankingCandidates).toBe(4534);
    expect(counts.ranked).toBeGreaterThan(0);
    // Structural perf proof through the real pipeline: exactly one scorer
    // pass over the persisted batch plus zero repository history reads —
    // the 8 s full-week `getItemHistory` scan stays out of the refresh
    // path by construction, not by stopwatch.
    let rankCalls = 0;
    let rankedArgLength = 0;
    let historyReads = 0;
    let latestReads = 0;
    const provider = stubProvider(makeLatest(entries));
    const { repository } = stubRepository({
      getItemHistory: async () => {
        historyReads += 1;
        return [];
      },
      getLatestSnapshot: async () => {
        latestReads += 1;
        return null;
      },
    });
    const refresh = createPipelineRefresh({
      provider,
      repository,
      logger: null,
      rankSnapshots: (snapshots, timestamp) => {
        rankCalls += 1;
        rankedArgLength = snapshots.length;
        return scoreBatchSnapshots(snapshots, timestamp);
      },
    });
    await refresh();
    expect(rankCalls).toBe(1);
    expect(rankedArgLength).toBe(4534);
    expect(historyReads).toBe(0);
    expect(latestReads).toBe(0);
  });

  it('never mutates frozen scorer inputs', async () => {
    const { normalizeLatest } = await import(
      '../../core/market/normalization/normalizer.js'
    );
    const batch = normalizeLatest({
      entries: { 4151: { high: 1000, highTime: null, low: 900, lowTime: null } },
      fetchedAt: T0,
      invalidRecords: 0,
    });
    const frozen = Object.freeze(batch.snapshots.map((s) => Object.freeze({ ...s })));
    expect(() => scoreBatchSnapshots(frozen, T0)).not.toThrow();
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
