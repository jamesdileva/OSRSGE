/**
 * Provider abstraction (architecture §3.3, guide §9).
 * The ranking system depends on this interface — never on Wiki response shapes.
 * Sprint 2 covers bulk `latest` + `mapping`; 5m/1h/timeseries extend this
 * interface when analytics needs them (Sprint 5).
 */

export interface LatestEntry {
  high: number | null;
  highTime: number | null;
  low: number | null;
  lowTime: number | null;
}

export interface LatestSnapshot {
  entries: Record<number, LatestEntry>;
  fetchedAt: number;
  /** Records rejected during validation (counted, never fatal). */
  invalidRecords: number;
}

export interface MappingSnapshot {
  items: MappingItem[];
  fetchedAt: number;
  invalidRecords: number;
}

export interface MappingItem {
  id: number;
  name: string;
  examine: string;
  members: boolean;
  lowAlch: number | null;
  highAlch: number | null;
  buyLimit: number | null;
  value: number | null;
  icon: string;
}

export interface MarketDataProvider {
  /** Bulk latest high/low prices for all traded items. Exactly one request. */
  getLatest(): Promise<LatestSnapshot>;
  /** Full item metadata catalogue (names, members, buy limits). */
  getMapping(): Promise<MappingSnapshot>;
}
