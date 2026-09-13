import { describe, expect, it } from 'vitest';
import {
  computeConfidence,
  confidenceMultiplier,
  freshnessFactor,
} from '../../core/market/ranking/confidence.js';

describe('confidence model', () => {
  it('rewards full coverage, full observations, agreement, and freshness', () => {
    const confidence = computeConfidence({
      historyMinutes: 1440,
      requiredMinutes: 360,
      observationCount: 24,
      expectedObservations: 24,
      trendConsistency: 100,
      stalenessMinutes: 10,
    });
    expect(confidence).toBeCloseTo(1, 9);
  });

  it('penalizes thin history and disagreement', () => {
    const thin = computeConfidence({
      historyMinutes: 60,
      requiredMinutes: 1440,
      observationCount: 2,
      expectedObservations: 24,
      trendConsistency: 20,
      stalenessMinutes: 10,
    });
    expect(thin).toBeLessThan(0.05);
  });

  it('decays freshness only after 2h, reaching 0 at 48h', () => {
    expect(freshnessFactor(undefined)).toBe(1);
    expect(freshnessFactor(120)).toBe(1);
    expect(freshnessFactor(48 * 60)).toBe(0);
    const mid = freshnessFactor(24 * 60);
    expect(mid).toBeGreaterThan(0.4);
    expect(mid).toBeLessThan(0.6);
  });

  it('maps confidence through 0.70 + confidence × 0.30', () => {
    expect(confidenceMultiplier(1)).toBeCloseTo(1, 9);
    expect(confidenceMultiplier(0)).toBeCloseTo(0.7, 9);
    expect(confidenceMultiplier(0.5)).toBeCloseTo(0.85, 9);
    expect(() => confidenceMultiplier(Number.NaN)).toThrow('Invalid confidence');
  });
});
