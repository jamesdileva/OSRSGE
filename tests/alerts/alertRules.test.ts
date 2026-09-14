import { describe, expect, it } from 'vitest';
import type { Opportunity } from '../../core/market/ranking/types.js';
import {
  addAlertRule,
  createAlertRules,
  evaluateAlerts,
  isValidAlertRule,
  removeAlertRule,
  setAlertRuleEnabled,
} from '../../core/alerts/alertRules.js';

const T0 = 1_700_000_000_000;

function makeOpportunity(
  id: number,
  overrides: Partial<Pick<Opportunity, 'finalScore'>> & {
    change24h?: number;
    spreadPct?: number;
  } = {},
): Opportunity {
  return {
    rank: 0,
    item: { id, name: `Item ${id}`, members: true, buyLimit: null, examine: '', value: null },
    currentPrice: 1000 + id,
    changes: {
      oneHour: 1,
      sixHour: 2,
      ...(overrides.change24h === undefined ? { twentyFourHour: 3 } : { twentyFourHour: overrides.change24h }),
    },
    spread: {
      gp: 10,
      ...(overrides.spreadPct === undefined ? { percent: 1 } : { percent: overrides.spreadPct }),
    },
    components: { momentum: 50, liquidity: 50, spread: 50, profitability: 50, consistency: 50, volatility: 50 },
    risk: 'LOW',
    confidence: 0.9,
    baseScore: overrides.finalScore ?? 50,
    finalScore: overrides.finalScore ?? 50,
  };
}

describe('alert rules store (S12 slice-1)', () => {
  it('creates an empty list and copies seeds (no alias)', () => {
    expect(createAlertRules()).toEqual([]);
    const seed = [{ id: 'r1', itemId: null, kind: 'finalScore' as const, threshold: 80, enabled: true, createdAt: T0 }];
    const copy = createAlertRules(seed);
    expect(copy).toEqual(seed);
    copy[0]!.threshold = -1;
    expect(seed[0]!.threshold).toBe(80);
  });

  it('adds a rule stamping createdAt, defaulting enabled to true', () => {
    const next = addAlertRule([], { id: 'whip-score', itemId: 4151, kind: 'finalScore', threshold: 80 }, T0);
    expect(next).toEqual([
      { id: 'whip-score', itemId: 4151, kind: 'finalScore', threshold: 80, enabled: true, createdAt: T0 },
    ]);
  });

  it('throws on duplicate ids', () => {
    const rules = addAlertRule([], { id: 'r1', itemId: null, kind: 'finalScore', threshold: 80 }, T0);
    expect(() => addAlertRule(rules, { id: 'r1', itemId: 2, kind: 'change24h', threshold: 5 }, T0)).toThrow(
      /Duplicate rule id/,
    );
  });

  it('rejects garbage drafts and clocks', () => {
    expect(() => addAlertRule([], { id: '', itemId: null, kind: 'finalScore', threshold: 80 }, T0)).toThrow();
    expect(() => addAlertRule([], { id: 'r', itemId: -1, kind: 'finalScore', threshold: 80 }, T0)).toThrow();
    expect(() => addAlertRule([], { id: 'r', itemId: null, kind: 'nope' as never, threshold: 80 }, T0)).toThrow();
    expect(() => addAlertRule([], { id: 'r', itemId: null, kind: 'finalScore', threshold: Number.NaN }, T0)).toThrow();
    expect(() =>
      addAlertRule([], { id: 'r', itemId: null, kind: 'finalScore', threshold: Number.POSITIVE_INFINITY }, T0),
    ).toThrow();
    expect(() => addAlertRule([], { id: 'r', itemId: null, kind: 'finalScore', threshold: 80 }, Number.NaN)).toThrow();
    expect(isValidAlertRule({ id: 'r', itemId: null, kind: 'finalScore', threshold: 80, enabled: true, createdAt: -1 })).toBe(
      false,
    );
  });

  it('removes by id; unknown ids return an equal fresh array', () => {
    const rules = addAlertRule([], { id: 'r1', itemId: null, kind: 'finalScore', threshold: 80 }, T0);
    expect(removeAlertRule(rules, 'r1')).toEqual([]);
    const same = removeAlertRule(rules, 'missing');
    expect(same).toEqual(rules);
    expect(same).not.toBe(rules);
  });

  it('toggles enabled without touching other rules', () => {
    const rules = createAlertRules([
      { id: 'a', itemId: null, kind: 'finalScore', threshold: 80, enabled: true, createdAt: T0 },
      { id: 'b', itemId: null, kind: 'change24h', threshold: 5, enabled: true, createdAt: T0 },
    ]);
    const next = setAlertRuleEnabled(rules, 'a', false);
    expect(next.find((r) => r.id === 'a')!.enabled).toBe(false);
    expect(next.find((r) => r.id === 'b')!.enabled).toBe(true);
    expect(rules.find((r) => r.id === 'a')!.enabled).toBe(true);
  });

  it('never mutates frozen inputs', () => {
    const rules = Object.freeze([
      Object.freeze({ id: 'r1', itemId: null, kind: 'finalScore', threshold: 80, enabled: true, createdAt: T0 }),
    ]);
    const added = addAlertRule(rules as unknown as Parameters<typeof addAlertRule>[0], {
      id: 'r2',
      itemId: null,
      kind: 'finalScore',
      threshold: 90,
    }, T0);
    expect(added).toHaveLength(2);
    expect(rules).toHaveLength(1);
  });
});

describe('alert evaluator (S12 slice-1)', () => {
  it('fires the roadmap examples: score>80, 24h>5%, spread>10%', () => {
    const opps = [makeOpportunity(4151, { finalScore: 85, change24h: 6, spreadPct: 12 })];
    const rules = createAlertRules([
      { id: 'score', itemId: 4151, kind: 'finalScore', threshold: 80, enabled: true, createdAt: T0 },
      { id: 'chg', itemId: 4151, kind: 'change24h', threshold: 5, enabled: true, createdAt: T0 },
      { id: 'spr', itemId: 4151, kind: 'spreadPct', threshold: 10, enabled: true, createdAt: T0 },
    ]);
    const events = evaluateAlerts(rules, opps, T0);
    expect(events).toEqual([
      { ruleId: 'score', itemId: 4151, metricValue: 85, threshold: 80, triggeredAt: T0 },
      { ruleId: 'chg', itemId: 4151, metricValue: 6, threshold: 5, triggeredAt: T0 },
      { ruleId: 'spr', itemId: 4151, metricValue: 12, threshold: 10, triggeredAt: T0 },
    ]);
  });

  it('is strict > (equal does not trigger) and fail-closed on missing metrics', () => {
    const opps = [makeOpportunity(1, { finalScore: 80, change24h: 5, spreadPct: 10 })];
    const rules = createAlertRules([
      { id: 's', itemId: 1, kind: 'finalScore', threshold: 80, enabled: true, createdAt: T0 },
      { id: 'c', itemId: 1, kind: 'change24h', threshold: 5, enabled: true, createdAt: T0 },
      { id: 'p', itemId: 1, kind: 'spreadPct', threshold: 10, enabled: true, createdAt: T0 },
    ]);
    expect(evaluateAlerts(rules, opps, T0)).toEqual([]);

    const thin: Opportunity = { ...makeOpportunity(2, { finalScore: 99 }), changes: {}, spread: {} };
    const thinRules = createAlertRules([
      { id: 'c2', itemId: 2, kind: 'change24h', threshold: 0, enabled: true, createdAt: T0 },
      { id: 'p2', itemId: 2, kind: 'spreadPct', threshold: 0, enabled: true, createdAt: T0 },
    ]);
    expect(evaluateAlerts(thinRules, [thin], T0)).toEqual([]);
  });

  it('scopes by item: null watches every item, unknown ids stay silent', () => {
    const opps = [makeOpportunity(1, { finalScore: 90 }), makeOpportunity(2, { finalScore: 10 })];
    const anyRule = createAlertRules([
      { id: 'any', itemId: null, kind: 'finalScore', threshold: 80, enabled: true, createdAt: T0 },
    ]);
    expect(evaluateAlerts(anyRule, opps, T0).map((e) => e.itemId)).toEqual([1]);

    const scoped = createAlertRules([
      { id: 'scoped', itemId: 999_999, kind: 'finalScore', threshold: 0, enabled: true, createdAt: T0 },
    ]);
    expect(evaluateAlerts(scoped, opps, T0)).toEqual([]);
    expect(evaluateAlerts(anyRule, [], T0)).toEqual([]);
  });

  it('skips disabled and invalid stored rules; rejects bad clocks', () => {
    const opps = [makeOpportunity(1, { finalScore: 99 })];
    const rules = createAlertRules([
      { id: 'off', itemId: 1, kind: 'finalScore', threshold: 0, enabled: false, createdAt: T0 },
    ]);
    expect(evaluateAlerts(rules, opps, T0)).toEqual([]);

    const withGarbage = [...rules, { id: '', itemId: null, kind: 'finalScore', threshold: 0, enabled: true, createdAt: T0 }] as unknown as Parameters<
      typeof evaluateAlerts
    >[0];
    expect(evaluateAlerts(withGarbage, opps, T0)).toEqual([]);
    expect(() => evaluateAlerts(rules, opps, Number.NaN)).toThrow();
  });

  it('stamps triggeredAt from nowMs and never mutates frozen inputs', () => {
    const rules = Object.freeze([
      Object.freeze({ id: 'r', itemId: 1, kind: 'finalScore', threshold: 80, enabled: true, createdAt: T0 }),
    ]);
    const opps = Object.freeze([Object.freeze(makeOpportunity(1, { finalScore: 81 }))]);
    const events = evaluateAlerts(
      rules as unknown as Parameters<typeof evaluateAlerts>[0],
      opps as unknown as Parameters<typeof evaluateAlerts>[1],
      T0 + 5,
    );
    expect(events).toHaveLength(1);
    expect(events[0]!.triggeredAt).toBe(T0 + 5);
  });
});
