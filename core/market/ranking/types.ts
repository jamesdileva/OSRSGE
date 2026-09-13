import type { ItemMetadata } from '../../items/itemMetadata.js';

/**
 * Ranking contracts (architecture §§12–19, guide §§27–32).
 * Pure types only — math arrives in scorer.ts / risk.ts / confidence.ts.
 */

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type RankingPresetName =
  | 'BALANCED'
  | 'CONSERVATIVE'
  | 'AGGRESSIVE'
  | 'CHEAP_FLIPS'
  | 'HIGH_PROFIT';

/** Weighted-score inputs. Weights must total 1.0 (see weights.ts). */
export interface RankingWeights {
  momentum: number;
  liquidity: number;
  spread: number;
  profitability: number;
  consistency: number;
  volatility: number;
}

export interface RankingConfig {
  preset: RankingPresetName;
  weights: RankingWeights;
  /** MVP default per architecture §13: ignore junk below 100 GP. */
  minPrice: number;
  /** Minimum trailing-24h traded volume to be rankable. */
  minVolume: number;
  /** Minimum history depth (minutes) needed for a 24h comparison. */
  minHistoryMinutes: number;
}

/** Filter inputs for candidacy (guide §25, architecture §13). */
export interface RankableCandidate {
  price: number;
  volume?: number;
  historyMinutes?: number;
}

/** Per-component scores, each normalized to 0–100 (guide §26). */
export interface ComponentScores {
  momentum: number;
  liquidity: number;
  spread: number;
  profitability: number;
  consistency: number;
  volatility: number;
}

/**
 * Ranked opportunity — the primary UI contract (guide §31).
 * Deviation from the guide: the guide's sketch omits spread from `metrics`
 * but includes it in the §32 breakdown, so components carry all six scores
 * and `spread` keeps the raw observed values beside them.
 */
export interface Opportunity {
  rank: number;
  item: ItemMetadata;
  currentPrice: number;
  changes: {
    oneHour?: number;
    sixHour?: number;
    twentyFourHour?: number;
  };
  spread: {
    gp?: number;
    percent?: number;
  };
  components: ComponentScores;
  /** Estimate only — never an observed market fact (guide §56). */
  estimatedProfit?: number;
  risk: RiskLevel;
  /** Normalized to 0–1 (guide §29). */
  confidence: number;
  baseScore: number;
  finalScore: number;
}
