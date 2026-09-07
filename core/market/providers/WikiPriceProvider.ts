import { WIKI_API_BASE_URL } from '../../../shared/constants.js';
import type { FetchFn } from './httpClient.js';
import { requestJson } from './httpClient.js';
import type {
  AveragesEntry,
  AveragesSnapshot,
  LatestEntry,
  LatestSnapshot,
  MappingItem,
  MappingSnapshot,
  MarketDataProvider,
} from './MarketDataProvider.js';
import { AveragesEntrySchema, AveragesEnvelopeSchema, LatestEntrySchema, LatestEnvelopeSchema, MappingEntrySchema, MappingEnvelopeSchema } from './schemas.js';

const NUMERIC_KEY = /^\d+$/;

/**
 * OSRS Wiki Prices API v2 provider (guide §10).
 * Answers only "what did the API tell us?" — no scoring, no ranking.
 * Invalid records are skipped and counted (guide §12).
 */
export class WikiPriceProvider implements MarketDataProvider {
  private readonly fetchFn: FetchFn;
  private readonly baseUrl: string;

  constructor(fetchFn: FetchFn = fetch, baseUrl: string = WIKI_API_BASE_URL) {
    this.fetchFn = fetchFn;
    this.baseUrl = baseUrl;
  }

  async getLatest(): Promise<LatestSnapshot> {
    const envelope = LatestEnvelopeSchema.parse(
      await requestJson(`${this.baseUrl}/latest`, this.fetchFn),
    );
    const entries: Record<number, LatestEntry> = {};
    let invalidRecords = 0;
    for (const [key, value] of Object.entries(envelope.data)) {
      const parsed = NUMERIC_KEY.test(key) ? LatestEntrySchema.safeParse(value) : null;
      if (parsed === null || !parsed.success) {
        invalidRecords += 1;
        continue;
      }
      entries[Number(key)] = {
        high: parsed.data.high,
        highTime: parsed.data.highTime,
        low: parsed.data.low,
        lowTime: parsed.data.lowTime,
      };
    }
    return { entries, fetchedAt: Date.now(), invalidRecords };
  }

  async getMapping(): Promise<MappingSnapshot> {
    const envelope = MappingEnvelopeSchema.parse(
      await requestJson(`${this.baseUrl}/mapping`, this.fetchFn),
    );
    const items: MappingItem[] = [];
    let invalidRecords = 0;
    for (const value of envelope) {
      const parsed = MappingEntrySchema.safeParse(value);
      if (!parsed.success) {
        invalidRecords += 1;
        continue;
      }
      const entry = parsed.data;
      items.push({
        id: entry.id,
        name: entry.name,
        examine: entry.examine,
        members: entry.members,
        lowAlch: entry.lowalch ?? null,
        highAlch: entry.highalch ?? null,
        buyLimit: entry.limit ?? null,
        value: entry.value ?? null,
        icon: entry.icon,
      });
    }
    return { items, fetchedAt: Date.now(), invalidRecords };
  }

  async getFiveMinute(timestamp?: number): Promise<AveragesSnapshot> {
    return this.getAverages('5m', timestamp);
  }

  async getHourly(timestamp?: number): Promise<AveragesSnapshot> {
    return this.getAverages('1h', timestamp);
  }

  private async getAverages(
    endpoint: '5m' | '1h',
    timestamp?: number,
  ): Promise<AveragesSnapshot> {
    const url =
      timestamp === undefined
        ? `${this.baseUrl}/${endpoint}`
        : `${this.baseUrl}/${endpoint}?timestamp=${timestamp}`;
    const envelope = AveragesEnvelopeSchema.parse(await requestJson(url, this.fetchFn));
    const entries: Record<number, AveragesEntry> = {};
    let invalidRecords = 0;
    for (const [key, value] of Object.entries(envelope.data)) {
      const parsed = NUMERIC_KEY.test(key) ? AveragesEntrySchema.safeParse(value) : null;
      if (parsed === null || !parsed.success) {
        invalidRecords += 1;
        continue;
      }
      entries[Number(key)] = {
        avgHigh: parsed.data.avgHighPrice,
        avgLow: parsed.data.avgLowPrice,
        highVolume: parsed.data.highPriceVolume ?? 0,
        lowVolume: parsed.data.lowPriceVolume ?? 0,
      };
    }
    return {
      entries,
      bucketTimestamp: envelope.timestamp,
      fetchedAt: Date.now(),
      invalidRecords,
    };
  }
}
