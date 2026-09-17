import { describe, expect, it } from 'vitest';
import { normalizeLatest } from '../../core/market/normalization/normalizer.js';
import type { MappingSnapshot } from '../../core/market/providers/MarketDataProvider.js';
import { rankBatchToTop10 } from '../../electron/services/liveMarket.js';
import {
  createMappingNameCache,
  refreshMappingNameCache,
} from '../../electron/services/mappingCache.js';
import { scoreBatchSnapshots } from '../../electron/services/refreshPipeline.js';

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

function mapping(): MappingSnapshot {
  return {
    items: [
      {
        id: 4151,
        name: 'Abyssal whip',
        examine: '',
        members: true,
        lowAlch: null,
        highAlch: null,
        buyLimit: 70,
        value: null,
        icon: '',
      },
      {
        id: 4152,
        name: '   ',
        examine: '',
        members: false,
        lowAlch: null,
        highAlch: null,
        buyLimit: null,
        value: null,
        icon: '',
      },
    ],
    fetchedAt: T0,
    invalidRecords: 0,
  };
}

describe('S21 slice-2 mapping name cache (offline)', () => {
  it('starts empty so the resolver yields the honest fallback', () => {
    const cache = createMappingNameCache();
    expect(cache.size()).toBe(0);
    expect(cache.resolveName(4151)).toBeUndefined();
    const { snapshots } = batch();
    expect(rankBatchToTop10(snapshots, T0, undefined, cache.resolveName).opportunities[0]?.item.name).toBe(
      'Item 4151',
    );
  });

  it('loads real names, skipping blank entries', () => {
    const cache = createMappingNameCache();
    cache.loadFromMapping(mapping());
    expect(cache.size()).toBe(1);
    expect(cache.resolveName(4151)).toBe('Abyssal whip');
    expect(cache.resolveName(4152)).toBeUndefined();
  });

  it('refresh populates from the provider and fails open without losing names', async () => {
    const cache = createMappingNameCache();
    const ok = await refreshMappingNameCache(cache, {
      getMapping: async () => mapping(),
    });
    expect(ok).toBe(true);
    expect(cache.resolveName(4151)).toBe('Abyssal whip');

    const failed = await refreshMappingNameCache(cache, {
      getMapping: async () => {
        throw new Error('network down');
      },
    });
    expect(failed).toBe(false);
    // Previous good names survive the failed refresh.
    expect(cache.resolveName(4151)).toBe('Abyssal whip');
  });

  it('main wiring pattern: served Top-10 and observed counts share the cache resolver', async () => {
    const cache = createMappingNameCache();
    await refreshMappingNameCache(cache, { getMapping: async () => mapping() });
    const { snapshots } = batch();
    // Same shape main passes: rankSnapshots closure over the live resolver.
    const rankSnapshots = (snaps: typeof snapshots, ts: number) =>
      scoreBatchSnapshots(snaps, ts, cache.resolveName);
    const counts = rankSnapshots(snapshots, T0);
    const served = rankBatchToTop10(snapshots, T0, undefined, cache.resolveName);
    expect(served.opportunities[0]?.item.name).toBe('Abyssal whip');
    expect(counts).toEqual(scoreBatchSnapshots(snapshots, T0));
  });
});
