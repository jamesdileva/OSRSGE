import { describe, expect, it } from 'vitest';
import { normalizeLatest } from '../../core/market/normalization/normalizer.js';
import {
  LIVE_RANKING_VERSION,
  createLiveHistoryHandler,
  createLiveMarketStore,
  createLiveTop10Handler,
  rankBatchToTop10,
} from '../../electron/services/liveMarket.js';
import { buildRankEntries } from '../../electron/services/rankEntries.js';
import {
  createPipelineRefresh,
  scoreBatchSnapshots,
  wrapRepositoryWithCapture,
} from '../../electron/services/refreshPipeline.js';
import type { HistoryRepository } from '../../core/history/HistoryRepository.js';
import type { LatestSnapshot } from '../../core/market/providers/MarketDataProvider.js';

const T0 = 1_786_000_000_000;

function batch() {
  return normalizeLatest({
    entries: {
      4151: { high: 1000, highTime: null, low: 900, lowTime: null },
      4152: { high: 60, highTime: null, low: 50, lowTime: null },
    },
    fetchedAt: T0,
    invalidRecords: 0,
  });
}

describe('S20 slice-3 live Top-10/history IPC (offline)', () => {
  it('serves an honest empty live payload before the first refresh (never the stub)', () => {
    const store = createLiveMarketStore();
    const response = createLiveTop10Handler(store, () => T0)();
    expect(response.rankingVersion).toBe(LIVE_RANKING_VERSION);
    expect(response.rankingVersion).not.toContain('stub');
    expect(response.itemsAnalyzed).toBe(0);
    expect(response.opportunities).toEqual([]);
    expect(response.computedAt).toBe(T0);
  });

  it('ranks the stored batch with the live version and the price floor', () => {
    const { snapshots } = batch();
    const response = rankBatchToTop10(snapshots, T0);
    expect(response.rankingVersion).toBe(LIVE_RANKING_VERSION);
    expect(response.computedAt).toBe(T0);
    // Universe observed: both snapshots; 4152 midpoints to ~55 (< 100 GP)
    // so only 4151 ranks — same math as the S20 slice-2 observed counts.
    expect(response.itemsAnalyzed).toBe(2);
    expect(response.opportunities.map((o) => o.item.id)).toEqual([4151]);
    expect(response.opportunities[0]?.item.name).toBe('Item 4151');
  });

  it('applies wire filters before the limit slice (S9 precedent)', () => {
    const { snapshots } = batch();
    const filtered = rankBatchToTop10(snapshots, T0, {
      filters: { minPrice: 5000 },
    });
    expect(filtered.itemsAnalyzed).toBe(2);
    expect(filtered.opportunities).toHaveLength(0);
    const limited = rankBatchToTop10(snapshots, T0, { limit: 0 });
    expect(limited.opportunities).toHaveLength(0);
    expect(limited.itemsAnalyzed).toBe(2);
  });

  it('never mutates frozen inputs', () => {
    const { snapshots } = batch();
    const frozen = Object.freeze(snapshots.map((s) => Object.freeze({ ...s })));
    expect(() => rankBatchToTop10(frozen, T0)).not.toThrow();
  });

  it('maps windows to ranges and forwards stored points oldest-first', async () => {
    const points = [
      { itemId: 4151, timestamp: T0 - 1000, high: 100, low: 90 },
      { itemId: 4151, timestamp: T0, high: 101, low: 91 },
    ];
    let seen: { itemId: number; from: number; to: number } | null = null;
    const repository: Pick<HistoryRepository, 'getItemHistory'> = {
      getItemHistory: async (itemId, from, to) => {
        seen = { itemId, from, to };
        return points;
      },
    };
    const handler = createLiveHistoryHandler(repository, () => T0);
    const day = await handler({ itemId: 4151, window: '24h' });
    expect(day).toEqual({ itemId: 4151, window: '24h', points });
    expect(seen).toMatchObject({ itemId: 4151, to: T0 });
    expect((seen as unknown as { from: number }).from).toBe(T0 - 24 * 60 * 60 * 1000);
    const week = await handler({ itemId: 4151, window: '7d' });
    expect(week.window).toBe('7d');
    expect((seen as unknown as { from: number }).from).toBe(T0 - 7 * 24 * 60 * 60 * 1000);
  });

  it('rejects bad itemId/window fail-closed', async () => {
    const repository: Pick<HistoryRepository, 'getItemHistory'> = {
      getItemHistory: async () => [],
    };
    const handler = createLiveHistoryHandler(repository, () => T0);
    await expect(handler({ itemId: 0, window: '24h' })).rejects.toThrow('Invalid history itemId');
    await expect(
      handler({ itemId: 4151, window: '30d' as unknown as '24h' }),
    ).rejects.toThrow('Invalid history window');
  });

  it('pipeline publishes the persisted batch and keeps last-good on failure', async () => {
    const latest: LatestSnapshot = {
      entries: { 4151: { high: 1000, highTime: null, low: 900, lowTime: null } },
      fetchedAt: T0,
      invalidRecords: 0,
    };
    const repository: HistoryRepository = {
      saveSnapshots: async () => undefined,
      getItemHistory: async () => [],
      getLatestSnapshot: async () => null,
    };
    const store = createLiveMarketStore();
    const top10 = createLiveTop10Handler(store, () => T0);
    expect(top10().opportunities).toHaveLength(0);
    await createPipelineRefresh({
      provider: { getLatest: async () => latest },
      repository,
      logger: null,
      onBatch: (snapshots, timestamp) => store.set({ snapshots: [...snapshots], timestamp }),
    })();
    expect(top10().opportunities.map((o) => o.item.id)).toEqual([4151]);
    await expect(
      createPipelineRefresh({
        provider: {
          getLatest: async () => {
            throw new Error('net down');
          },
        },
        repository,
        logger: null,
        onBatch: (snapshots, timestamp) => store.set({ snapshots: [...snapshots], timestamp }),
      })(),
    ).rejects.toThrow('net down');
    // Failure never publishes: the last good batch still serves.
    expect(top10().opportunities.map((o) => o.item.id)).toEqual([4151]);
  });

  it('a throwing onBatch never turns success into failure', async () => {
    const latest: LatestSnapshot = {
      entries: { 4151: { high: 1000, highTime: null, low: 900, lowTime: null } },
      fetchedAt: T0,
      invalidRecords: 0,
    };
    const repository: HistoryRepository = {
      saveSnapshots: async () => undefined,
      getItemHistory: async () => [],
      getLatestSnapshot: async () => null,
    };
    await expect(
      createPipelineRefresh({
        provider: { getLatest: async () => latest },
        repository,
        logger: null,
        onBatch: () => {
          throw new Error('publish bug');
        },
      })(),
    ).resolves.toBeUndefined();
  });

  it('pipeline delegates to class-prototype repository methods (review #206 nit)', async () => {
    const latest: LatestSnapshot = {
      entries: { 4151: { high: 1000, highTime: null, low: 900, lowTime: null } },
      fetchedAt: T0,
      invalidRecords: 0,
    };
    let historyCalls = 0;
    let latestCalls = 0;
    class ProtoRepository implements HistoryRepository {
      async saveSnapshots(): Promise<void> {
        return undefined;
      }
      async getItemHistory(): Promise<never[]> {
        historyCalls += 1;
        return [];
      }
      async getLatestSnapshot(): Promise<null> {
        latestCalls += 1;
        return null;
      }
    }
    const repository = new ProtoRepository();
    // Prove the capturing wrapper itself forwards (not the original repo):
    // calls through the wrapper must reach the prototype methods.
    const { repository: wrapped, getCaptured } = wrapRepositoryWithCapture(repository);
    await wrapped.getItemHistory(4151, 0, T0);
    await wrapped.getLatestSnapshot(4151);
    expect(historyCalls).toBe(1);
    expect(latestCalls).toBe(1);
    expect(getCaptured()).toBeNull();
    // And the pipeline still persists through the same wrapper shape.
    await createPipelineRefresh({
      provider: { getLatest: async () => latest },
      repository,
      logger: null,
    })();
    await wrapped.getItemHistory(4151, 0, T0);
    expect(historyCalls).toBe(2);
  });

  it('served Top-10 agrees with observed scorer counts over the shared builder (no drift)', () => {
    const { snapshots } = batch();
    const counts = scoreBatchSnapshots(snapshots, T0);
    const served = rankBatchToTop10(snapshots, T0);
    expect(served.itemsAnalyzed).toBe(snapshots.length);
    expect(served.opportunities).toHaveLength(counts.ranked);
    expect(counts.rankingCandidates).toBe(buildRankEntries(snapshots, T0).length);
  });
});
