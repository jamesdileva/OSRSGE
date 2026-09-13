/**
 * Confidence model (architecture §17, guide §29).
 * Answers "how much evidence is behind this ranking?" as a 0–1 product of
 * coverage × observations × agreement × freshness. Unknown factors default
 * to neutral (1, except agreement 0.5) — missing data already scores 0 in
 * its opportunity component, so confidence only penalizes known weakness.
 * Multiplier: 0.70 + confidence × 0.30 (guide §29).
 */

export interface ConfidenceInput {
  historyMinutes?: number;
  requiredMinutes?: number;
  observationCount?: number;
  expectedObservations?: number;
  /** 0–100 trend agreement; unknown is neutral. */
  trendConsistency?: number;
  /** Minutes since the latest observation; unknown assumes fresh. */
  stalenessMinutes?: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.min(1, Math.max(0, value));
}

/** Fresh (<2h) → 1, then linear decay to 0 at 48h. */
export function freshnessFactor(stalenessMinutes: number | undefined): number {
  if (stalenessMinutes === undefined) {
    return 1;
  }
  if (stalenessMinutes <= 120) {
    return 1;
  }
  return clamp01(1 - (stalenessMinutes - 120) / (48 * 60 - 120));
}

/** 0–1 confidence product. */
export function computeConfidence(input: ConfidenceInput): number {
  const coverage =
    input.historyMinutes !== undefined && input.requiredMinutes !== undefined
      ? clamp01(input.historyMinutes / input.requiredMinutes)
      : 1;
  const observations =
    input.observationCount !== undefined && input.expectedObservations !== undefined
      ? clamp01(input.observationCount / input.expectedObservations)
      : 1;
  const agreement =
    input.trendConsistency !== undefined ? clamp01(input.trendConsistency / 100) : 0.5;
  return clamp01(coverage * observations * agreement * freshnessFactor(input.stalenessMinutes));
}

/** 0.70 + confidence × 0.30 — never destroys the signal, always penalizes doubt. */
export function confidenceMultiplier(confidence: number): number {
  if (!Number.isFinite(confidence)) {
    throw new Error(`Invalid confidence: ${String(confidence)}`);
  }
  return 0.7 + clamp01(confidence) * 0.3;
}
