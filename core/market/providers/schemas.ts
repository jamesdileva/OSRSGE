import { z } from 'zod';

/**
 * Zod schemas for the OSRS Wiki Prices API v2 (implementation guide §12).
 * External data enters as `unknown` and is only trusted after `safeParse`.
 * Unknown extra fields are stripped; invalid records are rejected by the
 * provider and counted, never allowed to crash a refresh.
 */

const nullableIntPrice = z.number().int().nonnegative().nullable();
const nullableIntTime = z.number().int().nonnegative().nullable();

/** One entry of GET /latest — all fields nullable when never observed. */
export const LatestEntrySchema = z.object({
  high: nullableIntPrice,
  highTime: nullableIntTime,
  low: nullableIntPrice,
  lowTime: nullableIntTime,
});

/**
 * Loose envelope: entry values stay `unknown` so the provider can
 * validate them one by one and count rejections (guide §12).
 */
export const LatestEnvelopeSchema = z.object({
  data: z.record(z.string(), z.unknown()),
});

export type RawLatestEntry = z.infer<typeof LatestEntrySchema>;

/** One entry of GET /mapping. Numeric metadata may be absent on some items. */
export const MappingEntrySchema = z.object({
  id: z.number().int().nonnegative(),
  name: z.string().min(1),
  examine: z.string(),
  members: z.boolean(),
  lowalch: z.number().int().nonnegative().nullable().optional(),
  highalch: z.number().int().nonnegative().nullable().optional(),
  limit: z.number().int().nonnegative().nullable().optional(),
  value: z.number().int().nonnegative().nullable().optional(),
  icon: z.string(),
});

export const MappingEnvelopeSchema = z.array(z.unknown());

export type RawMappingEntry = z.infer<typeof MappingEntrySchema>;

/**
 * One entry of GET /5m and GET /1h (verified live 2026-09-04):
 * `{ avgHighPrice, highPriceVolume, avgLowPrice, lowPriceVolume }`
 * under `{ data: { "<id>": ... }, timestamp }`. Prices may be null on
 * zero-volume buckets (same convention as /timeseries).
 */
export const AveragesEntrySchema = z.object({
  avgHighPrice: z.number().nonnegative().nullable(),
  highPriceVolume: z.number().int().nonnegative().nullable().optional(),
  avgLowPrice: z.number().nonnegative().nullable(),
  lowPriceVolume: z.number().int().nonnegative().nullable().optional(),
});

export const AveragesEnvelopeSchema = z.object({
  data: z.record(z.string(), z.unknown()),
  timestamp: z.number().int().nonnegative(),
});

export type RawAveragesEntry = z.infer<typeof AveragesEntrySchema>;
