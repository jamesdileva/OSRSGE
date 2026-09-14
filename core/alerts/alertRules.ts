import type { Opportunity } from '../market/ranking/types.js';

/**
 * Sprint 12 slice-1: pure alert rules + evaluator (roadmap §14).
 * Pure — no fs, no IPC, no scheduler, no UI, no network, no OS notification.
 *
 * Slice-1 covers the roadmap examples only:
 * - Score > 80        (finalScore, absolute 0–100 scale)
 * - 24h change > 5%   (changes.twentyFourHour, percent points)
 * - Spread > 10%      (spread.percent, percent points)
 *
 * Scope contract (slice-1):
 * - Rule store only + pure evaluator over `Opportunity[]`. Persistence
 *   (JSON repository), IPC channels, scheduler hooks, and UI all stay in
 *   later slices — slice-2 stays in-app only (no OS notification).
 * - Strict `>` comparison: a metric exactly equal to the threshold does
 *   NOT trigger. Missing/non-finite metrics fail closed (no trigger, never
 *   a crash) so thin-history items with absent windows stay silent.
 * - Explicit `nowMs` (no Date.now): `triggeredAt` is deterministic and
 *   testable, matching the S10 scheduler / S11 watchlist convention.
 * - Strict on write, tolerant on read: `addAlertRule` throws on invalid
 *   drafts and duplicate ids; `evaluateAlerts` skips invalid stored rules
 *   gracefully (a stale persisted doc can never crash evaluation).
 * - All helpers never mutate inputs (frozen-input safe): every mutating
 *   operation returns a fresh array of fresh objects.
 */

/** Metric a rule watches. Slice-1 covers the three roadmap examples. */
export type AlertMetricKind = 'finalScore' | 'change24h' | 'spreadPct';

/** One alert rule. `itemId: null` watches every item; otherwise one item. */
export interface AlertRule {
  id: string;
  /** Null = any item; otherwise a positive integer item id. */
  itemId: number | null;
  kind: AlertMetricKind;
  /** Strict `>` threshold; must be finite. */
  threshold: number;
  enabled: boolean;
  /** Unix ms when the rule was added (explicit clock, no Date.now). */
  createdAt: number;
}

/** Draft for `addAlertRule` — `createdAt` is stamped from `nowMs`. */
export interface AlertRuleDraft {
  id: string;
  itemId: number | null;
  kind: AlertMetricKind;
  threshold: number;
  /** Defaults to true when omitted. */
  enabled?: boolean;
}

/** One fired alert: which rule, which item, what value, when. */
export interface AlertEvent {
  ruleId: string;
  itemId: number;
  metricValue: number;
  threshold: number;
  triggeredAt: number;
}

const VALID_KINDS: readonly AlertMetricKind[] = ['finalScore', 'change24h', 'spreadPct'];

function isValidId(id: unknown): id is string {
  return typeof id === 'string' && id.trim().length > 0;
}

function isValidItemScope(itemId: unknown): itemId is number | null {
  return itemId === null || (typeof itemId === 'number' && Number.isInteger(itemId) && itemId > 0);
}

function assertNowMs(nowMs: number): void {
  if (!Number.isFinite(nowMs) || nowMs < 0) {
    throw new Error(`Invalid nowMs: ${String(nowMs)} (expected finite timestamp >= 0)`);
  }
}

function copyRule(rule: AlertRule): AlertRule {
  return { ...rule };
}

export function isValidAlertRule(value: unknown): value is AlertRule {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    isValidId(record.id) &&
    isValidItemScope(record.itemId) &&
    typeof record.kind === 'string' &&
    (VALID_KINDS as readonly string[]).includes(record.kind) &&
    typeof record.threshold === 'number' &&
    Number.isFinite(record.threshold) &&
    typeof record.enabled === 'boolean' &&
    typeof record.createdAt === 'number' &&
    Number.isFinite(record.createdAt) &&
    (record.createdAt as number) >= 0
  );
}

function assertDraft(draft: AlertRuleDraft): void {
  if (!isValidId(draft.id)) {
    throw new Error(`Invalid rule id: ${String(draft?.id)} (expected non-empty string)`);
  }
  if (!isValidItemScope(draft.itemId)) {
    throw new Error(`Invalid itemId: ${String(draft.itemId)} (expected null or positive integer)`);
  }
  if (!VALID_KINDS.includes(draft.kind)) {
    throw new Error(`Invalid kind: ${String(draft.kind)} (expected finalScore|change24h|spreadPct)`);
  }
  if (typeof draft.threshold !== 'number' || !Number.isFinite(draft.threshold)) {
    throw new Error(`Invalid threshold: ${String(draft.threshold)} (expected finite number)`);
  }
  if (draft.enabled !== undefined && typeof draft.enabled !== 'boolean') {
    throw new Error(`Invalid enabled: ${String(draft.enabled)} (expected boolean)`);
  }
}

/** Fresh empty rule list (defensive copy when seeded). */
export function createAlertRules(initial: readonly AlertRule[] = []): AlertRule[] {
  return initial.map((rule) => {
    if (!isValidAlertRule(rule)) {
      throw new Error(`Invalid alert rule: ${JSON.stringify(rule)}`);
    }
    return copyRule(rule);
  });
}

/**
 * Add a rule. Duplicate ids throw (rules are keyed by id, unlike the
 * watchlist's first-wins id set). `createdAt` is stamped from `nowMs`.
 */
export function addAlertRule(
  rules: readonly AlertRule[],
  draft: AlertRuleDraft,
  nowMs: number,
): AlertRule[] {
  assertNowMs(nowMs);
  assertDraft(draft);
  if (rules.some((rule) => rule.id === draft.id)) {
    throw new Error(`Duplicate rule id: ${draft.id}`);
  }
  return [
    ...rules.map(copyRule),
    {
      id: draft.id,
      itemId: draft.itemId,
      kind: draft.kind,
      threshold: draft.threshold,
      enabled: draft.enabled ?? true,
      createdAt: nowMs,
    },
  ];
}

/** Remove a rule. Unknown ids return an equal fresh array. */
export function removeAlertRule(rules: readonly AlertRule[], id: string): AlertRule[] {
  if (!isValidId(id)) {
    throw new Error(`Invalid rule id: ${String(id)} (expected non-empty string)`);
  }
  return rules.filter((rule) => rule.id !== id).map(copyRule);
}

/** Enable/disable a rule. Unknown ids return an equal fresh array. */
export function setAlertRuleEnabled(
  rules: readonly AlertRule[],
  id: string,
  enabled: boolean,
): AlertRule[] {
  if (!isValidId(id)) {
    throw new Error(`Invalid rule id: ${String(id)} (expected non-empty string)`);
  }
  if (typeof enabled !== 'boolean') {
    throw new Error(`Invalid enabled: ${String(enabled)} (expected boolean)`);
  }
  return rules.map((rule) => (rule.id === id ? { ...rule, enabled } : copyRule(rule)));
}

function metricValueFor(kind: AlertMetricKind, opportunity: Opportunity): number | undefined {
  switch (kind) {
    case 'finalScore':
      return opportunity.finalScore;
    case 'change24h':
      return opportunity.changes?.twentyFourHour;
    case 'spreadPct':
      return opportunity.spread?.percent;
  }
}

/**
 * Evaluate enabled rules against opportunities. Returns one event per
 * (rule × matching item) where the metric is finite and strictly greater
 * than the threshold. Invalid stored rules are skipped; unknown item ids
 * simply match nothing; missing metrics fail closed. Never mutates inputs.
 */
export function evaluateAlerts(
  rules: readonly AlertRule[],
  opportunities: readonly Opportunity[],
  nowMs: number,
): AlertEvent[] {
  assertNowMs(nowMs);
  const byId = new Map<number, Opportunity>();
  for (const opportunity of opportunities) {
    const id = opportunity?.item?.id;
    if (typeof id === 'number' && Number.isInteger(id) && id > 0 && !byId.has(id)) {
      byId.set(id, opportunity);
    }
  }
  const events: AlertEvent[] = [];
  for (const rule of rules) {
    if (!isValidAlertRule(rule) || rule.enabled !== true) {
      continue;
    }
    const targets: Opportunity[] =
      rule.itemId === null
        ? [...byId.values()]
        : (() => {
            const match = byId.get(rule.itemId);
            return match === undefined ? [] : [match];
          })();
    for (const target of targets) {
      const value = metricValueFor(rule.kind, target);
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        continue;
      }
      if (value > rule.threshold) {
        events.push({
          ruleId: rule.id,
          itemId: target.item.id,
          metricValue: value,
          threshold: rule.threshold,
          triggeredAt: nowMs,
        });
      }
    }
  }
  return events;
}
