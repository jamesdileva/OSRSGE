/**
 * Live analytics demo for Sprint 5 (roadmap §7).
 * Run with `npm run check:analytics`. Backfills the last 24 hourly buckets
 * (bulk requests only — never per-item loops), then prints real metrics for
 * one item plus its liquidity percentile against the backfilled universe.
 * Manual verification tool, NOT a test (tests must stay offline, guide §46).
 */
import { computeMetrics } from '../core/market/analytics/metrics.ts';
import { recentVolume } from '../core/market/analytics/liquidity.ts';
import type { MarketSnapshot } from '../core/market/normalization/normalizer.ts';
import { normalizeAverages } from '../core/market/normalization/normalizer.ts';
import { WikiPriceProvider } from '../core/market/providers/WikiPriceProvider.ts';

const ITEM_ID = 4151; // Abyssal whip
const HOURS = 24;
const HOUR_S = 3_600;

const provider = new WikiPriceProvider();
const nowMs = Date.now();
const hourStart = Math.floor(nowMs / 1_000 / HOUR_S) * HOUR_S;

const byItem = new Map<number, MarketSnapshot[]>();
let buckets = 0;
let skipped = 0;
for (let h = HOURS; h >= 1; h -= 1) {
  const bucket = hourStart - h * HOUR_S;
  try {
    const batch = normalizeAverages(await provider.getHourly(bucket));
    if (batch.snapshots.length === 0) {
      skipped += 1;
      continue;
    }
    buckets += 1;
    for (const snapshot of batch.snapshots) {
      const list = byItem.get(snapshot.itemId) ?? [];
      list.push(snapshot);
      byItem.set(snapshot.itemId, list);
    }
  } catch {
    skipped += 1;
  }
}

const history = (byItem.get(ITEM_ID) ?? []).sort((a, b) => a.timestamp - b.timestamp);
const universeVolumes: number[] = [];
for (const list of byItem.values()) {
  const total = recentVolume(list, nowMs);
  if (total !== undefined) {
    universeVolumes.push(total);
  }
}

console.log(`Buckets backfilled: ${buckets} (skipped: ${skipped}), universe: ${byItem.size} items`);
console.log(`History points for #${ITEM_ID}: ${history.length}`);

const metrics = computeMetrics(ITEM_ID, history, nowMs, { volumes: universeVolumes });
if (metrics === null) {
  throw new Error(`No usable history for #${ITEM_ID}`);
}
const fmt = (value: number | undefined, digits = 2): string =>
  value === undefined ? 'n/a' : value.toFixed(digits);
console.log(`Price: ${metrics.price}`);
console.log(
  `Changes: 1h=${fmt(metrics.priceChange1h)}% 6h=${fmt(metrics.priceChange6h)}% 24h=${fmt(metrics.priceChange24h)}%`,
);
console.log(`Spread: ${fmt(metrics.spreadGp, 0)} gp (${fmt(metrics.spreadPct)}%)`);
console.log(`Volatility: ${fmt(metrics.volatility, 4)}`);
console.log(`Liquidity: ${fmt(metrics.liquidityScore, 1)} / 100`);
console.log(`Trend consistency: ${fmt(metrics.trendConsistency, 1)} / 100`);
