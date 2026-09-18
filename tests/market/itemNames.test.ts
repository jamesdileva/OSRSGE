import { describe, expect, it } from 'vitest';
import { normalizeLatest } from '../../core/market/normalization/normalizer.js';
import { buildRankEntries } from '../../electron/services/rankEntries.js';
import {
  createLiveMarketStore,
  createLiveTop10Handler,
  rankBatchToTop10,
} from '../../electron/services/liveMarket.js';
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

describe('S21 slice-1 sync name-injection seam (offline)', () => {
  it('defaults to the honest Item <id> fallback when no resolver is given', () => {
    const { snapshots } = batch();
    expect(buildRankEntries(snapshots, T0).map((e) => e.item.name)).toEqual([
      'Item 4151',
      'Item 4152',
    ]);
    expect(rankBatchToTop10(snapshots, T0).opportunities[0]?.item.name).toBe('Item 4151');
  });

  it('serves cached real names through the resolver on both paths', () => {
    const { snapshots } = batch();
    const names = new Map([
      [4151, 'Abyssal whip'],
      [4152, 'Amulet of glory'],
    ]);
    const resolveName = (id: number): string | undefined => names.get(id);
    expect(buildRankEntries(snapshots, T0, resolveName).map((e) => e.item.name)).toEqual([
      'Abyssal whip',
      'Amulet of glory',
    ]);
    const served = rankBatchToTop10(snapshots, T0, undefined, resolveName);
    expect(served.opportunities[0]?.item.name).toBe('Abyssal whip');
    // Observed counts are name-independent: same ranked count either way.
    expect(scoreBatchSnapshots(snapshots, T0, resolveName)).toEqual(
      scoreBatchSnapshots(snapshots, T0),
    );
  });

  it('falls back per-id on unknown/empty resolver results and stays frozen-safe', () => {
    const { snapshots } = batch();
    const resolveName = (id: number): string | undefined =>
      id === 4151 ? 'Abyssal whip' : id === 4152 ? '   ' : undefined;
    const entries = buildRankEntries(snapshots, T0, resolveName);
    expect(entries.map((e) => e.item.name)).toEqual(['Abyssal whip', 'Item 4152']);
    const frozen = Object.freeze(snapshots.map((s) => Object.freeze({ ...s })));
    expect(() => rankBatchToTop10(frozen, T0, undefined, resolveName)).not.toThrow();
  });

  it('live handler forwards the resolver for the stored batch', () => {
    const { snapshots } = batch();
    const store = createLiveMarketStore();
    store.set({ snapshots: [...snapshots], timestamp: T0 });
    const handler = createLiveTop10Handler(store, () => T0, () => 'Abyssal whip');
    expect(handler().opportunities[0]?.item.name).toBe('Abyssal whip');
    expect(createLiveTop10Handler(store, () => T0)().opportunities[0]?.item.name).toBe(
      'Item 4151',
    );
  });

  it('enrichment #47: handler forwards cached metadata, miss stays neutral', () => {
    const { snapshots } = normalizeLatest({
      entries: {
        4151: { high: 1000, highTime: null, low: 900, lowTime: null },
        4152: { high: 500, highTime: null, low: 480, lowTime: null },
      },
      fetchedAt: T0,
      invalidRecords: 0,
    });
    const store = createLiveMarketStore();
    store.set({ snapshots: [...snapshots], timestamp: T0 });
    const resolveMetadata = (id: number) =>
      id === 4151
        ? { members: true, buyLimit: 70 as number | null, examine: 'A powerful whip.', value: 120000 as number | null }
        : undefined;
    const handler = createLiveTop10Handler(store, () => T0, undefined, resolveMetadata);
    const opps = handler().opportunities;
    expect(opps.find((o) => o.item.id === 4151)?.item.members).toBe(true);
    expect(opps.find((o) => o.item.id === 4151)?.item.buyLimit).toBe(70);
    expect(opps.find((o) => o.item.id === 4151)?.item.examine).toBe('A powerful whip.');
    expect(opps.find((o) => o.item.id === 4151)?.item.value).toBe(120000);
    // Miss → pre-enrichment neutral defaults (no throw, no fetch).
    expect(opps.find((o) => o.item.id === 4152)?.item.members).toBe(false);
    expect(opps.find((o) => o.item.id === 4152)?.item.buyLimit).toBeNull();
    expect(opps.find((o) => o.item.id === 4152)?.item.examine).toBe('');
    expect(opps.find((o) => o.item.id === 4152)?.item.value).toBeNull();
    // No metadata resolver at all → all neutral (unchanged legacy shape).
    const plain = createLiveTop10Handler(store, () => T0)().opportunities;
    for (const o of plain) {
      expect(o.item.members).toBe(false);
      expect(o.item.buyLimit).toBeNull();
    }
  });
});
