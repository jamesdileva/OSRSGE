import type { ItemMetadata } from '../../items/itemMetadata.js';
import type { RankingConfig, RankingWeights } from '../ranking/types.js';
import { isValidWeights, RANKING_FORMULA_VERSION } from '../ranking/weights.js';
import {
  runRankedBacktest,
  type BacktestSummary,
} from './backtester.js';
import {
  createScorerRankAt,
  snapshotsToPriceSeries,
  type SnapshotHistoryByItem,
} from './scorerBacktest.js';

/**
 * Sprint 15 slice-1: pure weight-variant comparison over the S14 harness
 * (roadmap §17 — "Use backtesting to tune the deterministic model").
 * Pure — no fs, no IPC, no scheduler, no UI, no network, no Date.now.
 *
 * One call runs every weight variant through the same stored histories over
 * the same historical periods and reports per-period summaries plus a
 * cross-period aggregate, so weight sets compete on identical evidence.
 *
 * Comparability gates (strict-throw, fail-closed):
 * - Weights-only delta: every variant config must share `preset`,
 *   `minPrice`, `minVolume`, and `minHistoryMinutes` — only the six weight
 *   shares may differ. A variant that also moves a filter would measure the
 *   filter, not the weights.
 * - Every weight set must satisfy `isValidWeights` (finite shares in
 *   [0, 1] totalling 1.0).
 * - Every variant gets a content-aware version tag derived from its actual
 *   shares (mirroring the `rankingVersionForPreset` scheme); duplicate tags
 *   (identical weight sets under different labels) throw — re-running the
 *   same weights twice would masquerade as a comparison.
 * - At least two variants and at least `MIN_COMPARISON_PERIODS` periods
 *   (roadmap: "Do not optimize against a single day. Use multiple
 *   historical periods.").
 *
 * No-future-leak is inherited, not re-proven: ranking goes through S14
 * `createScorerRankAt` (past-only slice per T) and settlement through S14
 * slice-1 (reads only T + horizon points). Passing full stored histories is
 * safe for the same reason it is safe in slice-2.
 *
 * Aggregation notes:
 * - `meanAvgReturn` / `meanWinRate` are unweighted means of the per-period
 *   summary values (each period is one historical regime, one vote).
 * - `totalTrades` / `totalUnsettled` are sums across periods. Periods that
 *   overlap share evaluation points, so overlapping periods double-count
 *   trades in the totals — keep periods disjoint when totals must read as
 *   distinct trades.
 * - `rankedLabels` orders variants by `meanAvgReturn` desc (ties broken by
 *   label ascending, deterministic). Ranking by mean return is the slice-1
 *   default ordering, not a claim that return beats win rate or drawdown —
 *   the full per-period summaries ship alongside so callers can re-rank.
 *
 * Frozen-input safe: histories, configs, and period descriptors are only
 * read; every output object is fresh. Later slices own IPC/persistence/UI
 * and any automated weight search; slice-1 compares caller-supplied sets.
 */

/** Roadmap §17 floor: never tune against fewer than three periods. */
export const MIN_COMPARISON_PERIODS = 3;

/** One contender: a label plus a full ranking config (weights may differ). */
export interface WeightVariant {
  label: string;
  config: RankingConfig;
}

/** One historical regime: a named set of evaluation times plus settlement. */
export interface ComparisonPeriod {
  name: string;
  evaluationTimes: readonly number[];
  horizonMs: number;
  toleranceMs?: number;
}

export interface VariantPeriodOutcome {
  periodName: string;
  summary: BacktestSummary;
  unsettled: number;
}

export interface VariantAggregate {
  meanAvgReturn: number;
  meanWinRate: number;
  totalTrades: number;
  totalUnsettled: number;
}

export interface VariantComparison {
  label: string;
  /** Content-aware tag from the variant's actual shares (see below). */
  version: string;
  periods: VariantPeriodOutcome[];
  aggregate: VariantAggregate;
}

export interface CompareWeightVariantsResult {
  variants: VariantComparison[];
  /** Variant labels ordered by aggregate meanAvgReturn desc (label asc on ties). */
  rankedLabels: string[];
}

export interface CompareWeightVariantsDeps {
  /** Full stored histories (past + future); the S14 harness slices per T. */
  historiesByItem: SnapshotHistoryByItem;
  metadataByItem?: ReadonlyMap<number, ItemMetadata>;
  variants: readonly WeightVariant[];
  periods: readonly ComparisonPeriod[];
  /** Top-N opportunities entered per evaluation time; must be >= 1. */
  topN: number;
}

/**
 * Content-aware version tag from a variant's actual shares, mirroring the
 * `rankingVersionForPreset` scheme (`0.2-<preset>-m..l..s..p..c..v..`) with
 * a `custom` slot: preset tags hash their frozen preset shares, but variant
 * weights are caller-supplied deltas, so the tag hashes what actually ran.
 * Any share rebalance changes the tag (manual-bump rule from review #27
 * still applies to scorer formula edits — shares alone cannot see those).
 */
export function weightVariantTag(weights: Readonly<RankingWeights>): string {
  const pct = (share: number): number => Math.round(share * 100);
  return (
    `${RANKING_FORMULA_VERSION}-custom` +
    `-m${pct(weights.momentum)}l${pct(weights.liquidity)}s${pct(weights.spread)}` +
    `p${pct(weights.profitability)}c${pct(weights.consistency)}v${pct(weights.volatility)}`
  );
}

function assertVariants(variants: readonly WeightVariant[]): void {
  if (variants.length < 2) {
    throw new Error('Weight comparison needs at least two variants');
  }
  const labels = new Set<string>();
  for (const variant of variants) {
    if (typeof variant.label !== 'string' || variant.label.length === 0) {
      throw new Error('Weight variant labels must be non-empty strings');
    }
    if (labels.has(variant.label)) {
      throw new Error(`Duplicate weight variant label: ${variant.label}`);
    }
    labels.add(variant.label);
    if (!isValidWeights(variant.config.weights)) {
      throw new Error(`Invalid ranking weights for variant ${variant.label}`);
    }
  }
  const first = variants[0] as WeightVariant;
  for (const variant of variants.slice(1)) {
    if (
      variant.config.preset !== first.config.preset ||
      variant.config.minPrice !== first.config.minPrice ||
      variant.config.minVolume !== first.config.minVolume ||
      variant.config.minHistoryMinutes !== first.config.minHistoryMinutes
    ) {
      throw new Error(
        `Weight variant ${variant.label} changes more than weights: ` +
          'preset/minPrice/minVolume/minHistoryMinutes must match across variants',
      );
    }
  }
  const versions = new Set<string>();
  for (const variant of variants) {
    const version = weightVariantTag(variant.config.weights);
    if (versions.has(version)) {
      throw new Error(
        `Weight variant ${variant.label} duplicates another variant's weights (${version})`,
      );
    }
    versions.add(version);
  }
}

function assertPeriods(periods: readonly ComparisonPeriod[]): void {
  if (periods.length < MIN_COMPARISON_PERIODS) {
    throw new Error(
      `Weight comparison needs at least ${MIN_COMPARISON_PERIODS} periods (single-day tuning is out of scope)`,
    );
  }
  const names = new Set<string>();
  for (const period of periods) {
    if (typeof period.name !== 'string' || period.name.length === 0) {
      throw new Error('Comparison period names must be non-empty strings');
    }
    if (names.has(period.name)) {
      throw new Error(`Duplicate comparison period name: ${period.name}`);
    }
    names.add(period.name);
    if (period.evaluationTimes.length === 0) {
      throw new Error(`Comparison period ${period.name} needs at least one evaluation time`);
    }
    for (const timeMs of period.evaluationTimes) {
      if (!Number.isFinite(timeMs)) {
        throw new Error(`Comparison period ${period.name} evaluationTimes must be finite timestamps`);
      }
    }
  }
}

/**
 * Run every variant over every period through the S14 scorer harness and
 * summarize. Inputs are only read; outputs are fresh objects.
 */
export function compareWeightVariants(deps: CompareWeightVariantsDeps): CompareWeightVariantsResult {
  assertVariants(deps.variants);
  assertPeriods(deps.periods);
  const pricesByItem = snapshotsToPriceSeries(deps.historiesByItem);
  const variants: VariantComparison[] = deps.variants.map((variant) => {
    const rankAt = createScorerRankAt({
      historiesByItem: deps.historiesByItem,
      metadataByItem: deps.metadataByItem,
      config: {
        preset: variant.config.preset,
        weights: { ...variant.config.weights },
        minPrice: variant.config.minPrice,
        minVolume: variant.config.minVolume,
        minHistoryMinutes: variant.config.minHistoryMinutes,
      },
      topN: deps.topN,
    });
    const periods: VariantPeriodOutcome[] = deps.periods.map((period) => {
      const result = runRankedBacktest({
        evaluationTimes: [...period.evaluationTimes],
        horizonMs: period.horizonMs,
        toleranceMs: period.toleranceMs,
        rankAt,
        pricesByItem,
      });
      return { periodName: period.name, summary: { ...result.summary }, unsettled: result.unsettled };
    });
    const totalTrades = periods.reduce((sum, outcome) => sum + outcome.summary.tradeCount, 0);
    return {
      label: variant.label,
      version: weightVariantTag(variant.config.weights),
      periods,
      aggregate: {
        meanAvgReturn: periods.reduce((sum, outcome) => sum + outcome.summary.avgReturn, 0) / periods.length,
        meanWinRate: periods.reduce((sum, outcome) => sum + outcome.summary.winRate, 0) / periods.length,
        totalTrades,
        totalUnsettled: periods.reduce((sum, outcome) => sum + outcome.unsettled, 0),
      },
    };
  });
  const rankedLabels = variants
    .slice()
    .sort((a, b) => b.aggregate.meanAvgReturn - a.aggregate.meanAvgReturn || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0))
    .map((variant) => variant.label);
  return { variants, rankedLabels };
}
