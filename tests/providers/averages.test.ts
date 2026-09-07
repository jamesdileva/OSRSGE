import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';
import type { FetchFn } from '../../core/market/providers/httpClient.js';
import { WikiPriceProvider } from '../../core/market/providers/WikiPriceProvider.js';
import { normalizeAverages } from '../../core/market/normalization/normalizer.js';

const BASE = 'https://prices.test/api/v2/osrs';

function stubFetch(routes: Record<string, unknown>): { fetchFn: FetchFn; seen: string[] } {
  const seen: string[] = [];
  const fetchFn: FetchFn = (input) => {
    const url = String(input);
    seen.push(url);
    const body = routes[url];
    if (body === undefined) {
      return Promise.resolve({ ok: false, status: 404, json: async () => 'nope' } as Response);
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
  };
  return { fetchFn, seen };
}

const HOURLY_FIXTURE = {
  data: {
    4151: { avgHighPrice: 843550.5, highPriceVolume: 5, avgLowPrice: 826536, lowPriceVolume: 1 },
    2: { avgHighPrice: null, highPriceVolume: 0, avgLowPrice: 237, lowPriceVolume: 10 },
    3: { avgHighPrice: 'lots', highPriceVolume: 1, avgLowPrice: 2, lowPriceVolume: 3 },
  },
  timestamp: 1788480000,
};

describe('hourly/five-minute averages', () => {
  it('parses buckets, sums volumes, and counts invalid records', async () => {
    const { fetchFn } = stubFetch({ [`${BASE}/1h`]: HOURLY_FIXTURE });
    const provider = new WikiPriceProvider(fetchFn, BASE);

    const snapshot = await provider.getHourly();

    expect(snapshot.bucketTimestamp).toBe(1788480000);
    expect(snapshot.entries[4151]).toEqual({ avgHigh: 843550.5, avgLow: 826536, highVolume: 5, lowVolume: 1 });
    expect(snapshot.entries[2]).toEqual({ avgHigh: null, avgLow: 237, highVolume: 0, lowVolume: 10 });
    expect(snapshot.invalidRecords).toBe(1);
  });

  it('passes the requested bucket timestamp to the API', async () => {
    const { fetchFn, seen } = stubFetch({ [`${BASE}/1h?timestamp=1788480000`]: HOURLY_FIXTURE });
    const provider = new WikiPriceProvider(fetchFn, BASE);

    await provider.getHourly(1788480000);

    expect(seen).toEqual([`${BASE}/1h?timestamp=1788480000`]);
  });

  it('normalizes a bucket to snapshots stamped at the bucket start', async () => {
    const { fetchFn } = stubFetch({ [`${BASE}/5m`]: HOURLY_FIXTURE });
    const provider = new WikiPriceProvider(fetchFn, BASE);

    const batch = normalizeAverages(await provider.getFiveMinute());

    expect(batch.excluded).toBe(1);
    expect(batch.snapshots).toHaveLength(2);
    expect(batch.snapshots[0]).toMatchObject({
      itemId: 2,
      timestamp: 1788480000 * 1000,
      low: 237,
      volume: 10,
    });
    expect(batch.snapshots.find((s) => s.itemId === 4151)).toMatchObject({ volume: 6 });
  });

  it('rejects a malformed averages envelope', async () => {
    const { fetchFn } = stubFetch({ [`${BASE}/1h`]: { data: {} } });
    const provider = new WikiPriceProvider(fetchFn, BASE);

    await expect(provider.getHourly()).rejects.toBeInstanceOf(ZodError);
  });
});
