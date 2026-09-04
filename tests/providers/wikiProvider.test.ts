import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import type { FetchFn } from '../../core/market/providers/httpClient.js';
import { WikiPriceProvider } from '../../core/market/providers/WikiPriceProvider.js';

function stubFetch(routes: Record<string, unknown>): FetchFn {
  return (input) => {
    const url = String(input);
    const body = routes[url];
    if (body === undefined) {
      return Promise.resolve({ ok: false, status: 404, json: async () => 'nope' } as Response);
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
  };
}

const BASE = 'https://prices.test/api/v2/osrs';

const LATEST_FIXTURE = {
  data: {
    // Fully observed item.
    4151: { high: 811362, highTime: 1788483777, low: 790000, lowTime: 1788483014 },
    // Never instant-bought: nullable side stays null.
    2: { high: null, highTime: null, low: 100, lowTime: 1788483014 },
    // Zero price is well-formed (normalization decides what it means).
    3: { high: 0, highTime: 1788483014, low: 0, lowTime: 1788483014 },
    // Wrong value type → rejected + counted.
    4: { high: 'expensive', highTime: 1, low: 2, lowTime: 3 },
    // Negative price → rejected + counted.
    5: { high: -10, highTime: 1, low: 2, lowTime: 3 },
    // Non-numeric key → rejected + counted.
    bogus: { high: 1, highTime: 1, low: 1, lowTime: 1 },
  },
};

const MAPPING_FIXTURE = [
  {
    examine: 'A powerful whip.',
    id: 4151,
    members: true,
    lowalch: 72000,
    limit: 70,
    value: 120000,
    highalch: 108000,
    icon: 'Abyssal whip.png',
    name: 'Abyssal whip',
  },
  // Missing optional numeric metadata → nulls, still valid.
  { examine: 'Coins.', id: 995, members: false, icon: 'Coins.png', name: 'Coins' },
  // Missing name → rejected + counted.
  { examine: 'Nameless.', id: 999999, members: false, icon: 'X.png' },
];

describe('WikiPriceProvider', () => {
  it('parses /latest, keeps nulls and zeroes, counts invalid records', async () => {
    const provider = new WikiPriceProvider(
      stubFetch({ [`${BASE}/latest`]: LATEST_FIXTURE }),
      BASE,
    );

    const snapshot = await provider.getLatest();

    expect(snapshot.entries[4151]).toEqual({
      high: 811362,
      highTime: 1788483777,
      low: 790000,
      lowTime: 1788483014,
    });
    expect(snapshot.entries[2]).toEqual({ high: null, highTime: null, low: 100, lowTime: 1788483014 });
    expect(snapshot.entries[3]).toEqual({ high: 0, highTime: 1788483014, low: 0, lowTime: 1788483014 });
    expect(snapshot.entries[4]).toBeUndefined();
    expect(snapshot.invalidRecords).toBe(3);
  });

  it('parses /mapping with buy limits and tolerates missing numerics', async () => {
    const provider = new WikiPriceProvider(
      stubFetch({ [`${BASE}/mapping`]: MAPPING_FIXTURE }),
      BASE,
    );

    const snapshot = await provider.getMapping();

    expect(snapshot.items).toHaveLength(2);
    expect(snapshot.items[0]).toMatchObject({ id: 4151, name: 'Abyssal whip', buyLimit: 70 });
    expect(snapshot.items[1]).toMatchObject({ id: 995, name: 'Coins', buyLimit: null });
    expect(snapshot.invalidRecords).toBe(1);
  });

  it('rejects a malformed /latest envelope instead of returning garbage', async () => {
    const provider = new WikiPriceProvider(
      stubFetch({ [`${BASE}/latest`]: { nope: [] } }),
      BASE,
    );

    await expect(provider.getLatest()).rejects.toBeInstanceOf(ZodError);
  });
});
