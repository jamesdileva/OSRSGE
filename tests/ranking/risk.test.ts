import { describe, expect, it } from 'vitest';
import { classifyRisk, riskMultiplier } from '../../core/market/ranking/risk.js';

describe('risk model', () => {
  it('rates a healthy item LOW', () => {
    expect(
      classifyRisk({
        liquidityScore: 70,
        volatility: 0.01,
        trendConsistency: 100,
        historyMinutes: 1440,
        requiredMinutes: 360,
        spreadPct: 1.5,
        maxAbsChangePct: 2,
      }),
    ).toBe('LOW');
  });

  it('rates one or two warnings MEDIUM', () => {
    expect(
      classifyRisk({
        liquidityScore: 10,
        volatility: 0.01,
        trendConsistency: 100,
        spreadPct: 1,
        maxAbsChangePct: 2,
      }),
    ).toBe('MEDIUM');
  });

  it('rates a spike with no activity and extreme volatility HIGH', () => {
    expect(
      classifyRisk({
        liquidityScore: 2,
        volatility: 0.12,
        trendConsistency: 20,
        spreadPct: 12,
        maxAbsChangePct: 40,
      }),
    ).toBe('HIGH');
  });

  it('forces HIGH on insufficient history alone', () => {
    expect(
      classifyRisk({
        liquidityScore: 90,
        volatility: 0.005,
        trendConsistency: 100,
        historyMinutes: 60,
        requiredMinutes: 360,
      }),
    ).toBe('HIGH');
  });

  it('uses the architecture §18 multipliers and rejects unknowns', () => {
    expect(riskMultiplier('LOW')).toBe(1.0);
    expect(riskMultiplier('MEDIUM')).toBe(0.9);
    expect(riskMultiplier('HIGH')).toBe(0.7);
    expect(() => riskMultiplier('BOGUS' as never)).toThrow('Unknown risk level');
  });
});
