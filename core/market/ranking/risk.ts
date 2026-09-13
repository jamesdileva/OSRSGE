import type { RiskLevel } from './types.js';

/**
 * Risk model (architecture §16, guide §§28, 30).
 * Independent from opportunity: counts warning signals, then maps to
 * LOW / MEDIUM / HIGH. Multipliers match architecture §18
 * (1.00 / 0.90 / 0.70) — starting values, not proven optima.
 */

export interface RiskInput {
  /** 0–100 percentile; undefined = no activity evidence (suspicious). */
  liquidityScore?: number;
  /** Fraction (not %); >0.05 counts as extreme. */
  volatility?: number;
  /** 0–100 trend agreement; <50 counts as inconsistent. */
  trendConsistency?: number;
  historyMinutes?: number;
  requiredMinutes?: number;
  /** Spread % of midpoint; >10 counts as unusually wide. */
  spreadPct?: number;
  /** Largest |change| % across windows; >15 counts as a sudden spike. */
  maxAbsChangePct?: number;
}

export const RISK_MULTIPLIERS: Record<RiskLevel, number> = {
  LOW: 1.0,
  MEDIUM: 0.9,
  HIGH: 0.7,
};

/** Classify risk. Insufficient history alone forces HIGH (guide §30). */
export function classifyRisk(input: RiskInput): RiskLevel {
  if (
    input.historyMinutes !== undefined &&
    input.requiredMinutes !== undefined &&
    input.historyMinutes < input.requiredMinutes
  ) {
    return 'HIGH';
  }
  let warnings = 0;
  if (input.liquidityScore === undefined || input.liquidityScore < 20) {
    warnings += 1;
  }
  if (input.volatility !== undefined && input.volatility > 0.05) {
    warnings += 1;
  }
  if (input.trendConsistency !== undefined && input.trendConsistency < 50) {
    warnings += 1;
  }
  if (input.spreadPct !== undefined && input.spreadPct > 10) {
    warnings += 1;
  }
  if (input.maxAbsChangePct !== undefined && Math.abs(input.maxAbsChangePct) > 15) {
    warnings += 1;
  }
  if (warnings === 0) {
    return 'LOW';
  }
  if (warnings <= 2) {
    return 'MEDIUM';
  }
  return 'HIGH';
}

/** Multiplier applied to the base score (architecture §18). */
export function riskMultiplier(level: RiskLevel): number {
  const multiplier = RISK_MULTIPLIERS[level];
  if (multiplier === undefined) {
    throw new Error(`Unknown risk level: ${String(level)}`);
  }
  return multiplier;
}
