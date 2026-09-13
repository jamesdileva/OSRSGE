import type { RankingPresetName, RankingWeights } from './types.js';

/**
 * Ranking weights (architecture §18, guide §§27, 59).
 * Baseline: Momentum 30 / Liquidity 20 / Spread 20 / Profitability 15 /
 * Consistency 10 / Volatility 5. Presets only rebalance these six shares —
 * cheapness stays a filter/secondary feature (guide §54), not a weight,
 * so CHEAP_FLIPS leans into spread + profitability instead.
 */

/**
 * Version tag stamped on ranking output for future comparison (guide §51).
 * Content-aware: derived from the preset's actual shares, so any rebalance
 * changes the version (e.g. `0.2-balanced-m30l20s20p15c10v5`).
 * Prefix 0.2 = spread/profit orthogonalization (slice-3, ablation #23/#24):
 * spread scores relative margin (spreadPct), profitability scores absolute
 * net (log-scale over spreadGp minus 1% tax). Shares unchanged — the total
 * margin weight is the same, now split across independent signals.
 *
 * Manual-bump rule (review #27): RANKING_FORMULA_VERSION must be bumped on
 * any change to scorer.ts component formulas — the version hashes shares
 * only, so formula edits would otherwise keep the same tag silently.
 */
export const RANKING_FORMULA_VERSION = '0.2';

export function rankingVersionForPreset(preset: RankingPresetName): string {
  const weights = RANKING_PRESETS[preset];
  if (weights === undefined) {
    throw new Error(`Unknown ranking preset: ${String(preset)}`);
  }
  const pct = (share: number): number => Math.round(share * 100);
  return (
    `${RANKING_FORMULA_VERSION}-${preset.toLowerCase()}` +
    `-m${pct(weights.momentum)}l${pct(weights.liquidity)}s${pct(weights.spread)}` +
    `p${pct(weights.profitability)}c${pct(weights.consistency)}v${pct(weights.volatility)}`
  );
}

function freezeWeights(weights: RankingWeights): Readonly<RankingWeights> {
  return Object.freeze({ ...weights });
}

export const DEFAULT_WEIGHTS: Readonly<RankingWeights> = freezeWeights({
  momentum: 0.3,
  liquidity: 0.2,
  spread: 0.2,
  profitability: 0.15,
  consistency: 0.1,
  volatility: 0.05,
});

export const RANKING_PRESETS: Record<RankingPresetName, Readonly<RankingWeights>> =
  Object.freeze({
    BALANCED: freezeWeights({ ...DEFAULT_WEIGHTS }),
    CONSERVATIVE: freezeWeights({
      momentum: 0.25,
      liquidity: 0.3,
      spread: 0.15,
      profitability: 0.1,
      consistency: 0.15,
      volatility: 0.05,
    }),
    AGGRESSIVE: freezeWeights({
      momentum: 0.4,
      liquidity: 0.1,
      spread: 0.2,
      profitability: 0.15,
      consistency: 0.05,
      volatility: 0.1,
    }),
    CHEAP_FLIPS: freezeWeights({
      momentum: 0.2,
      liquidity: 0.15,
      spread: 0.3,
      profitability: 0.2,
      consistency: 0.1,
      volatility: 0.05,
    }),
    HIGH_PROFIT: freezeWeights({
      momentum: 0.15,
      liquidity: 0.15,
      spread: 0.25,
      profitability: 0.3,
      consistency: 0.1,
      volatility: 0.05,
    }),
  });

const WEIGHT_SUM_TOLERANCE = 1e-6;

/** True when every share is finite, within [0, 1], and the shares total 1.0. */
export function isValidWeights(weights: Readonly<RankingWeights>): boolean {
  const shares = [
    weights.momentum,
    weights.liquidity,
    weights.spread,
    weights.profitability,
    weights.consistency,
    weights.volatility,
  ];
  if (!shares.every((share) => Number.isFinite(share) && share >= 0 && share <= 1)) {
    return false;
  }
  const total = shares.reduce((sum, share) => sum + share, 0);
  return Math.abs(total - 1) <= WEIGHT_SUM_TOLERANCE;
}

/** Fresh copy of a preset's weights — callers can never mutate the preset. */
export function resolveWeights(preset: RankingPresetName): RankingWeights {
  const weights = RANKING_PRESETS[preset];
  if (weights === undefined) {
    throw new Error(`Unknown ranking preset: ${String(preset)}`);
  }
  return { ...weights };
}
