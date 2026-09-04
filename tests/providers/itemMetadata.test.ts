import { describe, expect, it, vi } from 'vitest';
import type { MarketDataProvider } from '../../core/market/providers/MarketDataProvider.js';
import { ItemMetadataStore } from '../../core/items/itemMetadata.js';

type MappingStub = Pick<MarketDataProvider, 'getMapping'>;

const MAPPING = {
  items: [
    {
      id: 4151,
      name: 'Abyssal whip',
      examine: 'A powerful whip.',
      members: true,
      lowAlch: 72000,
      highAlch: 108000,
      buyLimit: 70,
      value: 120000,
      icon: 'Abyssal whip.png',
    },
  ],
  fetchedAt: 1,
  invalidRecords: 0,
};

function stubProvider(): MappingStub & { calls: () => number } {
  const getMapping = vi.fn().mockResolvedValue(MAPPING);
  return { getMapping, calls: () => getMapping.mock.calls.length };
}

describe('ItemMetadataStore', () => {
  it('fetches /mapping once and serves every lookup from memory', async () => {
    const provider = stubProvider();
    const store = new ItemMetadataStore(provider);

    await expect(store.getItem(4151)).resolves.toMatchObject({ name: 'Abyssal whip', buyLimit: 70 });
    await expect(store.getItemName(4151)).resolves.toBe('Abyssal whip');
    await expect(store.getAllItems()).resolves.toHaveLength(1);
    expect(store.cacheSize()).toBe(1);
    expect(provider.calls()).toBe(1);
  });

  it('returns null / fallback names for unknown items', async () => {
    const store = new ItemMetadataStore(stubProvider());

    await expect(store.getItem(123456)).resolves.toBeNull();
    await expect(store.getItemName(123456)).resolves.toBe('Item 123456');
  });

  it('refresh() drops the cache so the next lookup refetches', async () => {
    const provider = stubProvider();
    const store = new ItemMetadataStore(provider);

    await store.getAllItems();
    store.refresh();
    expect(store.cacheSize()).toBeNull();
    await store.getAllItems();
    expect(provider.calls()).toBe(2);
  });
});
