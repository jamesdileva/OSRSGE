/**
 * Live BALANCED Top-10 ablation for the spread double-count check (risk 2).
 * Run with `npm run check:ablation`. Reuses the check:analytics backfill
 * (24 bulk /1h pulls, never per-item loops), scores all candidates 3 ways
 * with BALANCED (baseline, spread=0 renorm, profitability=0 renorm), then
 * reports Top-10 overlap + Spearman rho for baseline-vs-each-ablation.
 * Manual verification tool, NOT a test (tests stay offline, guide §46).
 */
import { computeMetrics } from '../core/market/analytics/metrics.ts';
import { recentVolume } from '../core/market/analytics/liquidity.ts';
import type { MarketSnapshot } from '../core/market/normalization/normalizer.ts';
import { normalizeAverages } from '../core/market/normalization/normalizer.ts';
import { WikiPriceProvider } from '../core/market/providers/WikiPriceProvider.ts';
import { ItemMetadataStore } from '../core/items/itemMetadata.ts';
import type { ItemMetadata } from '../core/items/itemMetadata.ts';
import {
  overlapCount,
  spearmanRankCorrelation,
  topNIds,
  zeroWeightAndRenorm,
} from '../core/market/ranking/ablation.ts';
import { defaultRankingConfig, rankOpportunities } from '../core/market/ranking/scorer.ts';
import type { RankEntry } from '../core/market/ranking/scorer.ts';

const HOURS = 24;
const HOUR_S = 3_600;
const TOP_N = 10;

const provider = new WikiPriceProvider();
const metadata = new ItemMetadataStore(provider);
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

const universeVolumes: number[] = [];
for (const list of byItem.values()) {
  const total = recentVolume(list, nowMs);
  if (total !== undefined) {
    universeVolumes.push(total);
  }
}

const catalog = new Map<number, ItemMetadata>();
try {
  for (const item of await metadata.getAllItems()) {
    catalog.set(item.id, item);
  }
} catch {
  // Name fallback below covers mapping failures.
}

const fallback = (id: number): ItemMetadata => ({
  id,
  name: `Item ${id}`,
  members: false,
  buyLimit: null,
  examine: '',
  value: null,
});

const entries: RankEntry[] = [];
for (const [itemId, list] of byItem) {
  const sorted = [...list].sort((a, b) => a.timestamp - b.timestamp);
  const metrics = computeMetrics(itemId, sorted, nowMs, { volumes: universeVolumes });
  if (metrics === null) {
    continue;
  }
  const latest = sorted[sorted.length - 1] as MarketSnapshot;
  const earliest = sorted[0] as MarketSnapshot;
  entries.push({
    metrics,
    item: catalog.get(itemId) ?? fallback(itemId),
    volume: recentVolume(sorted, nowMs),
    historyMinutes: (latest.timestamp - earliest.timestamp) / 60_000,
    observationCount: sorted.length,
    expectedObservations: HOURS,
    stalenessMinutes: (nowMs - latest.timestamp) / 60_000,
  });
}

const baseline = defaultRankingConfig('BALANCED');
const noSpread = { ...baseline, weights: zeroWeightAndRenorm(baseline.weights, 'spread') };
const noProfit = { ...baseline, weights: zeroWeightAndRenorm(baseline.weights, 'profitability') };

const baseRanked = rankOpportunities(entries, baseline);
const spreadRanked = rankOpportunities(entries, noSpread);
const profitRanked = rankOpportunities(entries, noProfit);

const baseTop = topNIds(baseRanked, TOP_N);
const spreadTop = topNIds(spreadRanked, TOP_N);
const profitTop = topNIds(profitRanked, TOP_N);
const overlapSpread = overlapCount(baseTop, spreadTop);
const overlapProfit = overlapCount(baseTop, profitTop);
const rhoSpread = spearmanRankCorrelation(baseRanked, spreadRanked);
const rhoProfit = spearmanRankCorrelation(baseRanked, profitRanked);
const nameOf = (id: number): string => catalog.get(id)?.name ?? `Item ${id}`;
const fmtTop = (ids: number[]): string => ids.map((id) => `${id} (${nameOf(id)})`).join(', ');

console.log(`Buckets backfilled: ${buckets} (skipped: ${skipped}), universe: ${byItem.size} items, candidates: ${baseRanked.length}`);
console.log(`Baseline Top-${TOP_N}: ${fmtTop(baseTop)}`);
console.log(`No-spread Top-${TOP_N}: ${fmtTop(spreadTop)}`);
console.log(`No-profit Top-${TOP_N}: ${fmtTop(profitTop)}`);
console.log(`Overlap baseline-vs-no-spread: ${overlapSpread}/${TOP_N}, rho=${rhoSpread.toFixed(4)}`);
console.log(`Overlap baseline-vs-no-profit: ${overlapProfit}/${TOP_N}, rho=${rhoProfit.toFixed(4)}`);
const doubleCount =
  (overlapSpread >= 9 && rhoSpread > 0.95) || (overlapProfit >= 9 && rhoProfit > 0.95);
console.log(
  doubleCount
    ? 'Verdict: DOUBLE-COUNT CONFIRMED (overlap>=9/10 AND rho>0.95 on either ablation) -> merge/orthogonalize before Sprint 7.'
    : 'Verdict: INDEPENDENT SIGNAL (no ablation hits both thresholds) -> keep weights.',
);
