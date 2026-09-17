import { describe, expect, it } from 'vitest';
import { normalizeLatest } from '../../core/market/normalization/normalizer.js';
import type { MappingSnapshot } from '../../core/market/providers/MarketDataProvider.js';
import { rankBatchToTop10 } from '../../electron/services/liveMarket.js';
import {
  createMappingNameCache,
  createMappingRewarmTracker,
  MAPPING_REWARM_INTERVAL_REFRESHES,
  refreshMappingNameCache,
  shouldRewarmMappingNames,
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

  it('malformed snapshots fail closed keeping previous names (atomic swap)', async () => {
    const cache = createMappingNameCache();
    cache.loadFromMapping(mapping());
    expect(cache.resolveName(4151)).toBe('Abyssal whip');

    // Direct load with a non-array items payload throws without wiping.
    expect(() => cache.loadFromMapping({ items: {} } as never)).toThrow(TypeError);
    expect(cache.resolveName(4151)).toBe('Abyssal whip');
    expect(() => cache.loadFromMapping(null as never)).toThrow(TypeError);
    expect(cache.resolveName(4151)).toBe('Abyssal whip');

    // Refresh path: malformed-but-resolving provider returns false, keeps names.
    const badShapes = [null, { items: {} }, {}];
    for (const shape of badShapes) {
      const ok = await refreshMappingNameCache(cache, {
        getMapping: async () => shape as never,
      });
      expect(ok).toBe(false);
      expect(cache.resolveName(4151)).toBe('Abyssal whip');
      expect(cache.size()).toBe(1);
    }
  });

  it('stores trimmed names', () => {
    const cache = createMappingNameCache();
    cache.loadFromMapping({
      items: [
        {
          id: 4151,
          name: '  Abyssal whip  ',
          examine: '',
          members: true,
          lowAlch: null,
          highAlch: null,
          buyLimit: 70,
          value: null,
          icon: '',
        },
      ],
      fetchedAt: T0,
      invalidRecords: 0,
    });
    expect(cache.resolveName(4151)).toBe('Abyssal whip');
  });

  it('re-warm gate: pure predicate with fail-closed inputs', () => {
    expect(MAPPING_REWARM_INTERVAL_REFRESHES).toBe(288);
    expect(shouldRewarmMappingNames(0)).toBe(false);
    expect(shouldRewarmMappingNames(287)).toBe(false);
    expect(shouldRewarmMappingNames(288)).toBe(true);
    expect(shouldRewarmMappingNames(1000)).toBe(true);
    // Fail-closed: bad counters/intervals never trigger a bulk fetch.
    expect(shouldRewarmMappingNames(-1)).toBe(false);
    expect(shouldRewarmMappingNames(NaN)).toBe(false);
    expect(shouldRewarmMappingNames(1.5)).toBe(false);
    expect(shouldRewarmMappingNames(288, 0)).toBe(false);
    expect(shouldRewarmMappingNames(288, -5)).toBe(false);
    expect(shouldRewarmMappingNames(288, NaN)).toBe(false);
    // Small interval honored (test hook + documents the gate shape).
    expect(shouldRewarmMappingNames(2, 3)).toBe(false);
    expect(shouldRewarmMappingNames(3, 3)).toBe(true);
  });

  it('re-warm tracker: no fetch in the hot path, one fetch per interval', async () => {
    const cache = createMappingNameCache();
    const tracker = createMappingRewarmTracker(3);
    let calls = 0;
    const provider = {
      getMapping: async () => {
        calls += 1;
        return mapping();
      },
    };
    // 7 successful refreshes at interval 3 → fetches on #3 and #6 only.
    const outcomes: string[] = [];
    for (let i = 0; i < 7; i += 1) {
      outcomes.push(await tracker.rewarmIfDue(cache, provider));
    }
    expect(outcomes).toEqual(['skipped', 'skipped', 'ok', 'skipped', 'skipped', 'ok', 'skipped']);
    expect(calls).toBe(2);
    expect(cache.resolveName(4151)).toBe('Abyssal whip');
    expect(tracker.successesSinceWarm).toBe(1);
  });

  it('re-warm tracker: failed re-warm keeps previous names and resets the gate', async () => {
    const cache = createMappingNameCache();
    cache.loadFromMapping(mapping());
    const tracker = createMappingRewarmTracker(2);
    let calls = 0;
    const failing = {
      getMapping: async () => {
        calls += 1;
        throw new Error('mapping down');
      },
    };
    expect(await tracker.rewarmIfDue(cache, failing)).toBe('skipped');
    // Due on the 2nd success: attempt fails fail-open, names survive.
    expect(await tracker.rewarmIfDue(cache, failing)).toBe('failed');
    expect(cache.resolveName(4151)).toBe('Abyssal whip');
    expect(cache.size()).toBe(1);
    expect(calls).toBe(1);
    // Gate reset on attempt: next success skips (no retry storm).
    expect(await tracker.rewarmIfDue(cache, failing)).toBe('skipped');
    expect(calls).toBe(1);
    expect(tracker.successesSinceWarm).toBe(1);
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
