import { describe, expect, it } from 'vitest';
import {
  LOG_CATEGORIES,
  MAX_DETAILS_CHARS,
  MAX_MESSAGE_CHARS,
  appendLogEvent,
  createLogEvent,
  formatLogEvent,
  summarizeLog,
} from '../../core/diagnostics/appLog.js';

const T0 = 1_786_000_000_000;

describe('appLog (Sprint 19 slice-1, pure)', () => {
  it('creates a frozen valid event', () => {
    const event = createLogEvent(T0, 'info', 'startup', 'app started', { version: '0.1.0' });
    expect(event.timestampMs).toBe(T0);
    expect(event.level).toBe('info');
    expect(event.message).toBe('app started');
    expect(Object.isFrozen(event)).toBe(true);
    expect(Object.isFrozen(event.details)).toBe(true);
  });

  it('covers every guide §44 category', () => {
    expect([...LOG_CATEGORIES].sort()).toEqual(
      ['api-failure', 'api-refresh', 'ranking', 'scheduler', 'snapshots', 'startup', 'storage'].sort(),
    );
    for (const category of LOG_CATEGORIES) {
      expect(() => createLogEvent(T0, 'info', category, 'ok')).not.toThrow();
    }
  });

  it('rejects invalid inputs fail-closed', () => {
    expect(() => createLogEvent(Number.NaN, 'info', 'startup', 'x')).toThrow('timestampMs');
    expect(() => createLogEvent(0, 'info', 'startup', 'x')).toThrow('timestampMs');
    expect(() => createLogEvent(T0, 'debug' as never, 'startup', 'x')).toThrow('level');
    expect(() => createLogEvent(T0, 'info', 'nope' as never, 'x')).toThrow('category');
    expect(() => createLogEvent(T0, 'info', 'startup', '   ')).toThrow('message');
    expect(() => createLogEvent(T0, 'info', 'startup', 'x', ['array'] as never)).toThrow('details');
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => createLogEvent(T0, 'info', 'startup', 'x', circular)).toThrow('JSON-serializable');
    expect(() => appendLogEvent([], createLogEvent(T0, 'info', 'startup', 'x'), 0)).toThrow('maxEntries');
    expect(() => summarizeLog('nope' as never)).toThrow('must be an array');
  });

  it('appends without mutating and drops oldest beyond the cap', () => {
    const first = createLogEvent(T0, 'info', 'startup', 'first');
    const base = Object.freeze([first]);
    const second = createLogEvent(T0 + 1, 'warn', 'scheduler', 'second');
    const next = appendLogEvent(base, second, 2);
    expect(base).toHaveLength(1);
    expect(next).toHaveLength(2);
    expect(next[0]).toBe(first);
    const third = createLogEvent(T0 + 2, 'error', 'storage', 'third');
    const capped = appendLogEvent(next, third, 2);
    expect(capped).toHaveLength(2);
    expect(capped.map((e) => e.message)).toEqual(['second', 'third']);
  });

  it('freezes stored copies so caller mutation cannot rewrite history', () => {
    const details = { count: 1 };
    const event = createLogEvent(T0, 'info', 'snapshots', 'saved', details);
    details.count = 999;
    expect(event.details?.['count']).toBe(1);
    const stored = appendLogEvent([], event);
    expect(stored[0]).not.toBe(event);
    expect(stored[0].details?.['count']).toBe(1);
  });

  it('truncates over-long messages and details instead of throwing', () => {
    const longMessage = 'm'.repeat(MAX_MESSAGE_CHARS + 100);
    const event = createLogEvent(T0, 'warn', 'ranking', longMessage);
    expect(event.message.length).toBeLessThanOrEqual(MAX_MESSAGE_CHARS);
    const bigDetails = { blob: 'x'.repeat(MAX_DETAILS_CHARS + 500) };
    const line = formatLogEvent(createLogEvent(T0, 'info', 'snapshots', 'saved', bigDetails));
    expect(line.length).toBeLessThanOrEqual(
      `[${new Date(T0).toISOString()}] INFO snapshots: saved `.length + MAX_DETAILS_CHARS + 1,
    );
  });

  it('formats the single-line file shape with ISO timestamp', () => {
    const line = formatLogEvent(createLogEvent(T0, 'error', 'api-failure', 'timeout', { tries: 2 }));
    expect(line).toBe(`[${new Date(T0).toISOString()}] ERROR api-failure: timeout {"tries":2}`);
    const bare = formatLogEvent(createLogEvent(T0, 'info', 'startup', 'ready'));
    expect(bare).toBe(`[${new Date(T0).toISOString()}] INFO startup: ready`);
  });

  it('summarizes counts and surfaces the newest error first', () => {
    const events = [
      createLogEvent(T0, 'info', 'startup', 'boot'),
      createLogEvent(T0 + 1, 'error', 'api-failure', 'first failure'),
      createLogEvent(T0 + 2, 'info', 'api-refresh', 'recovered'),
      createLogEvent(T0 + 3, 'error', 'storage', 'disk full'),
    ];
    const summary = summarizeLog(events);
    expect(summary.total).toBe(4);
    expect(summary.byLevel).toEqual({ info: 2, warn: 0, error: 2 });
    expect(summary.byCategory['startup']).toBe(1);
    expect(summary.byCategory['storage']).toBe(1);
    expect(summary.lastError?.message).toBe('disk full');
    expect(summary.lastEventMs).toBe(T0 + 3);
  });

  it('summarizes an empty buffer to zeros and nulls', () => {
    const summary = summarizeLog([]);
    expect(summary.total).toBe(0);
    expect(summary.lastError).toBeNull();
    expect(summary.lastEventMs).toBeNull();
  });

  it('stays pure over frozen inputs and repeated runs', () => {
    const events = Object.freeze([
      Object.freeze({
        timestampMs: T0,
        level: 'warn' as const,
        category: 'scheduler' as const,
        message: 'backoff',
      }),
    ]);
    const first = summarizeLog(events);
    const second = summarizeLog(events);
    expect(second).toEqual(first);
    expect(events).toHaveLength(1);
  });
});
