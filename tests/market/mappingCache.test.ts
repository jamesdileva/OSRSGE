import { describe, expect, it } from 'vitest';
import { normalizeLatest } from '../../core/market/normalization/normalizer.js';
import type { MappingSnapshot } from '../../core/market/providers/MarketDataProvider.js';
import { applyFilters } from '../../core/market/ranking/filters.js';
import { buildRankEntries } from '../../electron/services/rankEntries.js';
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

describe('S21 enrichment #47: cached members/buyLimit (offline)', () => {
  it('loads members/buyLimit from the same already-cached snapshot (no new pull)', () => {
    const cache = createMappingNameCache();
    cache.loadFromMapping(mapping());
    expect(cache.resolveMetadata(4151)).toEqual({ members: true, buyLimit: 70, examine: '', value: null });
    // Blank-name entries are skipped entirely → no metadata either.
    expect(cache.resolveMetadata(4152)).toBeUndefined();
  });

  it('fail-open neutral defaults on miss keep the pre-enrichment payload shape', () => {
    const cache = createMappingNameCache();
    const { snapshots } = batch();
    // Empty cache: miss → neutral defaults (old behavior preserved).
    const entries = buildRankEntries(snapshots, T0, cache.resolveName, cache.resolveMetadata);
    for (const e of entries) {
      expect(e.item.members).toBe(false);
      expect(e.item.buyLimit).toBeNull();
    }
    expect(cache.resolveMetadata(999999)).toBeUndefined();
  });

  it('invalid members/buyLimit degrade per-entry to neutral without dropping the name', () => {
    const cache = createMappingNameCache();
    cache.loadFromMapping({
      items: [
        {
          id: 4151,
          name: 'Abyssal whip',
          examine: '',
          members: 'yes' as never,
          lowAlch: null,
          highAlch: null,
          buyLimit: -5,
          value: null,
          icon: '',
        },
      ],
      fetchedAt: T0,
      invalidRecords: 0,
    });
    expect(cache.resolveName(4151)).toBe('Abyssal whip');
    expect(cache.resolveMetadata(4151)).toEqual({ members: false, buyLimit: null, examine: '', value: null });
  });

  it('served payload carries enriched members/buyLimit explicitly; counts unchanged', () => {
    const cache = createMappingNameCache();
    cache.loadFromMapping(mapping());
    const { snapshots } = batch();
    const enriched = rankBatchToTop10(
      snapshots,
      T0,
      undefined,
      cache.resolveName,
      cache.resolveMetadata,
    );
    const plain = rankBatchToTop10(snapshots, T0);
    expect(enriched.opportunities[0]?.item.members).toBe(true);
    expect(enriched.opportunities[0]?.item.buyLimit).toBe(70);
    // Explicit payload change vs the pre-enrichment neutral defaults.
    expect(plain.opportunities[0]?.item.members).toBe(false);
    expect(plain.opportunities[0]?.item.buyLimit).toBeNull();
    // Counts are name/metadata-independent (price-only candidacy here).
    expect(scoreBatchSnapshots(snapshots, T0, cache.resolveName, cache.resolveMetadata)).toEqual(
      scoreBatchSnapshots(snapshots, T0),
    );
  });

  it('membership filter becomes meaningful only with metadata (explicit, no silent shift)', () => {
    const cache = createMappingNameCache();
    cache.loadFromMapping(mapping());
    const { snapshots } = batch();
    const enriched = rankBatchToTop10(
      snapshots,
      T0,
      undefined,
      cache.resolveName,
      cache.resolveMetadata,
    );
    // 4151 members=true survives `members`, 4152 fallback neutral is f2p.
    expect(
      applyFilters(enriched.opportunities, { membership: 'members' }).map((o) => o.item.id),
    ).toContain(4151);
    expect(
      applyFilters(enriched.opportunities, { membership: 'f2p' }).map((o) => o.item.id),
    ).not.toContain(4151);
    // Without metadata every entry is neutral f2p (previous behavior).
    const plain = rankBatchToTop10(snapshots, T0);
    expect(applyFilters(plain.opportunities, { membership: 'members' })).toHaveLength(0);
    expect(applyFilters(plain.opportunities, { membership: 'f2p' })).toHaveLength(
      plain.opportunities.length,
    );
  });
});

describe('examine/value follow-up: cached examine/value (offline)', () => {
  function richMapping(): MappingSnapshot {
    return {
      items: [
        {
          id: 4151,
          name: 'Abyssal whip',
          examine: 'A powerful whip.',
          members: true,
          lowAlch: null,
          highAlch: null,
          buyLimit: 70,
          value: 120000,
          icon: '',
        },
        {
          id: 4152,
          name: '   ',
          examine: 'Blank-name skip.',
          members: false,
          lowAlch: null,
          highAlch: null,
          buyLimit: null,
          value: 1,
          icon: '',
        },
      ],
      fetchedAt: T0,
      invalidRecords: 0,
    };
  }

  it('loads examine/value from the same already-cached snapshot (no new pull)', () => {
    const cache = createMappingNameCache();
    cache.loadFromMapping(richMapping());
    expect(cache.size()).toBe(1);
    expect(cache.resolveMetadata(4151)).toEqual({
      members: true,
      buyLimit: 70,
      examine: 'A powerful whip.',
      value: 120000,
    });
    // Blank-name entries are skipped entirely → no metadata either.
    expect(cache.resolveMetadata(4152)).toBeUndefined();
  });

  it('fail-open neutral defaults on miss keep the pre-enrichment payload shape', () => {
    const cache = createMappingNameCache();
    const { snapshots } = batch();
    // Empty cache: miss → neutral defaults (old behavior preserved).
    const entries = buildRankEntries(snapshots, T0, cache.resolveName, cache.resolveMetadata);
    for (const e of entries) {
      expect(e.item.examine).toBe('');
      expect(e.item.value).toBeNull();
    }
  });

  it('invalid examine/value degrade per-entry to neutral without dropping the name', () => {
    const cache = createMappingNameCache();
    cache.loadFromMapping({
      items: [
        {
          id: 4151,
          name: 'Abyssal whip',
          examine: 42 as never,
          members: true,
          lowAlch: null,
          highAlch: null,
          buyLimit: 70,
          value: -5,
          icon: '',
        },
        {
          id: 4153,
          name: 'Odd value',
          examine: '',
          members: false,
          lowAlch: null,
          highAlch: null,
          buyLimit: null,
          value: 1.5,
          icon: '',
        },
      ],
      fetchedAt: T0,
      invalidRecords: 0,
    });
    expect(cache.resolveName(4151)).toBe('Abyssal whip');
    expect(cache.resolveMetadata(4151)).toEqual({
      members: true,
      buyLimit: 70,
      examine: '',
      value: null,
    });
    // Non-integer value is not a real GE value → null.
    expect(cache.resolveMetadata(4153)).toEqual({
      members: false,
      buyLimit: null,
      examine: '',
      value: null,
    });
  });

  it('served payload carries enriched examine/value explicitly; counts unchanged', () => {
    const cache = createMappingNameCache();
    cache.loadFromMapping(richMapping());
    const { snapshots } = batch();
    const enriched = rankBatchToTop10(
      snapshots,
      T0,
      undefined,
      cache.resolveName,
      cache.resolveMetadata,
    );
    const plain = rankBatchToTop10(snapshots, T0);
    expect(enriched.opportunities[0]?.item.examine).toBe('A powerful whip.');
    expect(enriched.opportunities[0]?.item.value).toBe(120000);
    // Explicit payload change vs the pre-enrichment neutral defaults.
    expect(plain.opportunities[0]?.item.examine).toBe('');
    expect(plain.opportunities[0]?.item.value).toBeNull();
    // Counts are name/metadata-independent (price-only candidacy here).
    expect(scoreBatchSnapshots(snapshots, T0, cache.resolveName, cache.resolveMetadata)).toEqual(
      scoreBatchSnapshots(snapshots, T0),
    );
  });

  it('#50a: examine trims on store (padded kept trimmed, whitespace-only degrades to neutral)', () => {
    const cache = createMappingNameCache();
    cache.loadFromMapping({
      items: [
        {
          id: 4151,
          name: 'Abyssal whip',
          examine: '  A powerful whip.  ',
          members: true,
          lowAlch: null,
          highAlch: null,
          buyLimit: 70,
          value: 120000,
          icon: '',
        },
        {
          id: 4153,
          name: 'Padded blank',
          examine: '   ',
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
    });
    expect(cache.resolveMetadata(4151)?.examine).toBe('A powerful whip.');
    // Whitespace-only is stored as the neutral so the panel renders a dash, never blank.
    expect(cache.resolveMetadata(4153)?.examine).toBe('');
  });

  it('#50a: value 0 is a real value (kept), distinct from the null miss neutral', () => {
    const cache = createMappingNameCache();
    cache.loadFromMapping({
      items: [
        {
          id: 4151,
          name: 'Zero value',
          examine: '',
          members: false,
          lowAlch: null,
          highAlch: null,
          buyLimit: null,
          value: 0,
          icon: '',
        },
      ],
      fetchedAt: T0,
      invalidRecords: 0,
    });
    expect(cache.resolveMetadata(4151)?.value).toBe(0);
    const { snapshots } = batch();
    const entries = buildRankEntries(snapshots, T0, cache.resolveName, cache.resolveMetadata);
    expect(entries.find((e) => e.item.id === 4151)?.item.value).toBe(0);
    // Empty cache still serves the null neutral for the same id.
    const empty = createMappingNameCache();
    const miss = buildRankEntries(snapshots, T0, empty.resolveName, empty.resolveMetadata);
    expect(miss.find((e) => e.item.id === 4151)?.item.value).toBeNull();
  });

  it('#50a: partial metadata shapes degrade per field (strict serve, no throw)', () => {
    const { snapshots } = batch();
    const partial = () =>
      ({ members: undefined, buyLimit: '70', examine: '   ', value: 1.5 }) as never;
    const entries = buildRankEntries(snapshots, T0, undefined, partial);
    for (const e of entries) {
      expect(e.item.members).toBe(false);
      expect(e.item.buyLimit).toBeNull();
      expect(e.item.examine).toBe('');
      expect(e.item.value).toBeNull();
    }
  });
});
