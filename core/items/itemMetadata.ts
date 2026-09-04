import type { MarketDataProvider } from '../market/providers/MarketDataProvider.js';

/**
 * Item metadata catalogue (guide §13, architecture §10).
 * Backed by GET /mapping, cached in memory after the first load —
 * ranking must never trigger one network request per item.
 * Persistent caching arrives with Sprint 4 storage.
 */

export interface ItemMetadata {
  id: number;
  name: string;
  members: boolean;
  buyLimit: number | null;
  examine: string;
  value: number | null;
}

export class ItemMetadataStore {
  private readonly provider: Pick<MarketDataProvider, 'getMapping'>;
  private cache: Map<number, ItemMetadata> | null = null;
  private loadPromise: Promise<Map<number, ItemMetadata>> | null = null;

  constructor(provider: Pick<MarketDataProvider, 'getMapping'>) {
    this.provider = provider;
  }

  /** Number of cached items, or null when nothing has been loaded yet. */
  cacheSize(): number | null {
    return this.cache?.size ?? null;
  }

  /** Drop the cache; the next lookup refetches /mapping. */
  refresh(): void {
    this.cache = null;
    this.loadPromise = null;
  }

  async getAllItems(): Promise<ItemMetadata[]> {
    return [...(await this.ensureLoaded()).values()];
  }

  async getItem(id: number): Promise<ItemMetadata | null> {
    return (await this.ensureLoaded()).get(id) ?? null;
  }

  /** Display name with a stable fallback for unknown ids. */
  async getItemName(id: number): Promise<string> {
    return (await this.getItem(id))?.name ?? `Item ${id}`;
  }

  private ensureLoaded(): Promise<Map<number, ItemMetadata>> {
    if (this.cache !== null) {
      return Promise.resolve(this.cache);
    }
    if (this.loadPromise === null) {
      this.loadPromise = this.provider.getMapping().then((snapshot) => {
        const next = new Map<number, ItemMetadata>();
        for (const item of snapshot.items) {
          next.set(item.id, {
            id: item.id,
            name: item.name,
            members: item.members,
            buyLimit: item.buyLimit,
            examine: item.examine,
            value: item.value,
          });
        }
        this.cache = next;
        return next;
      });
    }
    return this.loadPromise;
  }
}
