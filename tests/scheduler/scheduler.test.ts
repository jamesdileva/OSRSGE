import { describe, expect, it } from 'vitest';
import {
  DEFAULT_MAX_BACKOFF_MS,
  DEFAULT_REFRESH_INTERVAL_MS,
  MIN_REFRESH_INTERVAL_MS,
  createSchedulerState,
  isRefreshDue,
  markRefreshFailure,
  markRefreshSuccess,
  msUntilNextRun,
} from '../../electron/services/scheduler.ts';

describe('Sprint 10 slice-1 pure scheduler core (offline, zero timers)', () => {
  it('schedules the first run one interval after creation', () => {
    const state = createSchedulerState(1_000, { intervalMs: DEFAULT_REFRESH_INTERVAL_MS });
    expect(state.nextRunAt).toBe(1_000 + DEFAULT_REFRESH_INTERVAL_MS);
    expect(state.consecutiveFailures).toBe(0);
  });

  it('clamps sub-minute intervals to the rate-safety floor', () => {
    const state = createSchedulerState(0, { intervalMs: 5_000 });
    expect(state.intervalMs).toBe(MIN_REFRESH_INTERVAL_MS);
    expect(state.nextRunAt).toBe(MIN_REFRESH_INTERVAL_MS);
  });

  it('rejects non-finite, zero, and negative intervals', () => {
    for (const intervalMs of [0, -1_000, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => createSchedulerState(0, { intervalMs })).toThrow();
    }
    expect(() => createSchedulerState(Number.NaN, { intervalMs: 60_000 })).toThrow();
  });

  it('is due exactly at nextRunAt and not a millisecond before', () => {
    const state = createSchedulerState(1_000, { intervalMs: 300_000 });
    expect(isRefreshDue(state.nextRunAt - 1, state)).toBe(false);
    expect(isRefreshDue(state.nextRunAt, state)).toBe(true);
    expect(msUntilNextRun(state.nextRunAt - 500, state)).toBe(500);
    expect(msUntilNextRun(state.nextRunAt + 1, state)).toBe(0);
  });

  it('success clears the failure streak and schedules one interval out', () => {
    const failed = markRefreshFailure(
      2_000,
      markRefreshFailure(1_000, createSchedulerState(0, { intervalMs: 300_000 })),
    );
    expect(failed.consecutiveFailures).toBe(2);
    const ok = markRefreshSuccess(3_000, failed);
    expect(ok.consecutiveFailures).toBe(0);
    expect(ok.nextRunAt).toBe(3_000 + 300_000);
    expect(ok.lastSuccessAt).toBe(3_000);
    expect(isRefreshDue(3_000, ok)).toBe(false);
  });

  it('backs off exponentially: 1x, 2x, 4x the interval', () => {
    const interval = 300_000;
    let state = createSchedulerState(0, { intervalMs: interval });
    state = markRefreshFailure(0, state);
    expect(state.nextRunAt).toBe(1 * interval);
    state = markRefreshFailure(state.nextRunAt, state);
    expect(state.nextRunAt).toBe(1 * interval + 2 * interval);
    state = markRefreshFailure(state.nextRunAt, state);
    expect(state.nextRunAt).toBe(1 * interval + 2 * interval + 4 * interval);
    expect(state.consecutiveFailures).toBe(3);
  });

  it('caps backoff at maxBackoffMs', () => {
    let state = createSchedulerState(0, { intervalMs: 300_000, maxBackoffMs: 500_000 });
    for (let i = 0; i < 10; i += 1) {
      const before = state.nextRunAt;
      state = markRefreshFailure(before, state);
      expect(state.nextRunAt - before).toBeLessThanOrEqual(500_000);
    }
    expect(state.nextRunAt - 0).toBeLessThanOrEqual(300_000 + 500_000 * 10);
    // Default ceiling is at least the documented constant.
    expect(createSchedulerState(0, { intervalMs: 60_000 }).maxBackoffMs).toBe(DEFAULT_MAX_BACKOFF_MS);
  });

  it('never mutates its input state (frozen inputs work)', () => {
    const state = Object.freeze(createSchedulerState(0, { intervalMs: 300_000 }));
    expect(() => markRefreshSuccess(1_000, state)).not.toThrow();
    expect(() => markRefreshFailure(1_000, state)).not.toThrow();
    expect(state.consecutiveFailures).toBe(0);
  });
});
