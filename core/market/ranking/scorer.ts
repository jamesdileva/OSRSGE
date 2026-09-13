import type { ItemMetadata } from '../../items/itemMetadata.js';
import type { ItemMetrics } from '../analytics/metrics.js';
import { confidenceMultiplier, computeConfidence } from './confidence.js';
import { classifyRisk, riskMultiplier } from './risk.js';
import type {
  ComponentScores,
  Opportunity,
  RankableCandidate,
  RankingConfig,
  RankingPresetName,
  RankingWeights,
  RiskLevel,
} from './types.js';
import { isValidWeights, resolveWeights } from './weights.js';

/**
 * Scorer (architecture §§13–14, 18; guide §§25–28, 32).
 * Pure and deterministic: ItemMetrics → 0–100 components → weighted base
 * → risk × confidence → ranked Opportunity list. No network, no UI.
 *
 * Calibration notes (v0.2: spread/profit orthogonalized per ablation #23/#24):
 * - Momentum: 50 + 5× the 1h:1/6h:2/24h:3 weighted-average change %.
 *   +2% → 60, +5% → 75, +10% → 100, −10% → 0.
 * - Spread: relative margin signal, spreadPct × 20 (2% → 40, 5% → 100).
 * - Profitability: absolute-scale signal, orthogonal to spread pct —
 *   net = spreadGp − 1% of price, then 25×log10(1 + net/100) so cheap
 *   high-pct/low-gp flips and expensive low-pct/high-gp flips diverge
 *   (net ≤ 0 or missing → 0; ~100gp → ~7.5, ~4k → ~40, ~7.5k → ~47).
 * - Volatility opportunity: Gaussian peak at 2% (σ 2%) — dead-flat and
 *   extreme churn both score low; moderate churn scores high.
 * - Liquidity / consistency pass through the Sprint 5 0–100 scores.
 * - Missing inputs score 0 (no evidence = no opportunity); thin coverage
 *   is additionally penalized via confidence and forced HIGH risk.
 */

export const DEFAULT_MIN_PRICE = 100;
export const DEFAULT_MIN_VOLUME = 1;
export const DEFAULT_MIN_HISTORY_MINUTES = 360;
const GE_TAX_PCT = 1;

function clamp100(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(100, Math.max(0, value));
}

/** 50 + 5× weighted-average change %; no windows → 0. */
export function momentumScore(metrics: Pick<ItemMetrics, 'priceChange1h' | 'priceChange6h' | 'priceChange24h'>): number {
  const windows = [
    { value: metrics.priceChange1h, weight: 1 },
    { value: metrics.priceChange6h, weight: 2 },
    { value: metrics.priceChange24h, weight: 3 },
  ].filter((w): w is { value: number; weight: number } => w.value !== undefined);
  if (windows.length === 0) {
    return 0;
  }
  const totalWeight = windows.reduce((sum, w) => sum + w.weight, 0);
  const average = windows.reduce((sum, w) => sum + w.value * w.weight, 0) / totalWeight;
  return clamp100(50 + 5 * average);
}

/** spreadPct × 20; missing → 0. */
export function spreadScore(spreadPct: number | undefined): number {
  if (spreadPct === undefined) {
    return 0;
  }
  return clamp100(spreadPct * 20);
}

/** (net absolute profit after 1% tax) → 25×log10(1+net/100); missing/non-positive → 0. */
export function profitabilityScore(
  spreadGp: number | undefined,
  price: number,
): number {
  if (spreadGp === undefined || !Number.isFinite(spreadGp) || !Number.isFinite(price)) {
    return 0;
  }
  const net = spreadGp - price * (GE_TAX_PCT / 100);
  if (!(net > 0)) {
    return 0;
  }
  return clamp100(25 * Math.log10(1 + net / 100));
}

/** Gaussian peak at 2% vol (σ 2%); missing → 0. */
export function volatilityOpportunityScore(volatility: number | undefined): number {
  if (volatility === undefined) {
    return 0;
  }
  const volPct = volatility * 100;
  return clamp100(100 * Math.exp(-((volPct - 2) ** 2) / 8));
}

/** Per-unit flip estimate: spread minus the assumed 1% tax bite. */
export function estimatedProfitPerUnit(
  metrics: Pick<ItemMetrics, 'price' | 'spreadGp'>,
): number | undefined {
  if (metrics.spreadGp === undefined) {
    return undefined;
  }
  return Math.max(0, metrics.spreadGp - metrics.price * (GE_TAX_PCT / 100));
}

/** Convert raw Sprint 5 metrics into six comparable 0–100 components. */
export function scoreComponents(metrics: ItemMetrics): ComponentScores {
  return {
    momentum: momentumScore(metrics),
    liquidity: metrics.liquidityScore ?? 0,
    spread: spreadScore(metrics.spreadPct),
    profitability: profitabilityScore(metrics.spreadGp, metrics.price),
    consistency: metrics.trendConsistency ?? 0,
    volatility: volatilityOpportunityScore(metrics.volatility),
  };
}

/** Weighted sum of components (0–100). Throws on invalid weights. */
export function computeBaseScore(
  components: ComponentScores,
  weights: Readonly<RankingWeights>,
): number {
  if (!isValidWeights(weights)) {
    throw new Error('Invalid ranking weights: shares must be finite, within [0, 1], and total 1.0');
  }
  return (
    components.momentum * weights.momentum +
    components.liquidity * weights.liquidity +
    components.spread * weights.spread +
    components.profitability * weights.profitability +
    components.consistency * weights.consistency +
    components.volatility * weights.volatility
  );
}

function maxAbsChange(metrics: ItemMetrics): number | undefined {
  const changes = [metrics.priceChange1h, metrics.priceChange6h, metrics.priceChange24h].filter(
    (c): c is number => c !== undefined,
  );
  if (changes.length === 0) {
    return undefined;
  }
  return Math.max(...changes.map((c) => Math.abs(c)));
}

/** Default config: 100 GP floor, any activity, 6h history. */
export function defaultRankingConfig(preset: RankingPresetName = 'BALANCED'): RankingConfig {
  return {
    preset,
    weights: resolveWeights(preset),
    minPrice: DEFAULT_MIN_PRICE,
    minVolume: DEFAULT_MIN_VOLUME,
    minHistoryMinutes: DEFAULT_MIN_HISTORY_MINUTES,
  };
}

/** Cheapness is a filter (guide §54): below minPrice is never rankable. */
export function isCandidate(
  candidate: Pick<RankableCandidate, 'volume' | 'historyMinutes'> & { price: number },
  config: RankingConfig,
): boolean {
  if (!(candidate.price >= config.minPrice)) {
    return false;
  }
  if (candidate.volume !== undefined && !(candidate.volume >= config.minVolume)) {
    return false;
  }
  if (candidate.historyMinutes !== undefined && !(candidate.historyMinutes >= config.minHistoryMinutes)) {
    return false;
  }
  return true;
}

export interface RankEntry {
  metrics: ItemMetrics;
  item: ItemMetadata;
  volume?: number;
  historyMinutes?: number;
  observationCount?: number;
  expectedObservations?: number;
  stalenessMinutes?: number;
}

/** Score, adjust, sort desc, assign ranks. Filtered-out candidates are dropped. */
export function rankOpportunities(entries: RankEntry[], config: RankingConfig): Opportunity[] {
  const scored = entries
    .filter((entry) =>
      isCandidate(
        { price: entry.metrics.price, volume: entry.volume, historyMinutes: entry.historyMinutes },
        config,
      ),
    )
    .map((entry) => {
      const components = scoreComponents(entry.metrics);
      const baseScore = computeBaseScore(components, config.weights);
      const risk: RiskLevel = classifyRisk({
        liquidityScore: entry.metrics.liquidityScore,
        volatility: entry.metrics.volatility,
        trendConsistency: entry.metrics.trendConsistency,
        historyMinutes: entry.historyMinutes,
        requiredMinutes: config.minHistoryMinutes,
        spreadPct: entry.metrics.spreadPct,
        maxAbsChangePct: maxAbsChange(entry.metrics),
      });
      const confidence = computeConfidence({
        historyMinutes: entry.historyMinutes,
        requiredMinutes: config.minHistoryMinutes,
        observationCount: entry.observationCount,
        expectedObservations: entry.expectedObservations,
        trendConsistency: entry.metrics.trendConsistency,
        stalenessMinutes: entry.stalenessMinutes,
      });
      const finalScore = baseScore * riskMultiplier(risk) * confidenceMultiplier(confidence);
      const opportunity: Opportunity = {
        rank: 0,
        item: entry.item,
        currentPrice: entry.metrics.price,
        changes: {
          oneHour: entry.metrics.priceChange1h,
          sixHour: entry.metrics.priceChange6h,
          twentyFourHour: entry.metrics.priceChange24h,
        },
        spread: { gp: entry.metrics.spreadGp, percent: entry.metrics.spreadPct },
        components,
        risk,
        confidence,
        baseScore,
        finalScore,
      };
      const profit = estimatedProfitPerUnit(entry.metrics);
      if (profit !== undefined) {
        opportunity.estimatedProfit = profit;
      }
      return opportunity;
    })
    .sort((a, b) => b.finalScore - a.finalScore);
  scored.forEach((opportunity, index) => {
    opportunity.rank = index + 1;
  });
  return scored;
}
