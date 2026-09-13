import { describe, expect, it, vi } from 'vitest';
import {
  MARKET_REFRESH_NOW,
  MARKET_REFRESH_UPDATED,
} from '../../shared/ipc.ts';
import {
  createSchedulerState,
  isRefreshDue,
  markRefreshFailure,
  markRefreshSuccess,
  msUntilNextRun,
  startScheduler,
  stopScheduler,
} from '../../electron/services/scheduler.ts';

/**
 * Sprint 10 slice-2: timers + single-flight + manual refresh + notify.
 * Zero real timers, zero network — the clock and setTimeout/clearTimeout
 * are injected fakes so every tick is deterministic.
 */

function makeTimerFakes() {
  const scheduled: Array<{ callback: () => void; ms: number }> = [];
  const cancelled: unknown[] = [];
  const schedule = vi.fn((callback: () => void, ms: number) => {
    const id = scheduled.length;
    scheduled.push({ callback, ms });
    return id;
  });
  const cancel = vi.fn((timer: unknown) => {
    cancelled.push(timer);
  });
  return { scheduled, cancelled, schedule, cancel };
}

describe('S10 slice-2 scheduler nits (offline, zero timers)', () => {
  it('rejects non-finite nowMs in every pure helper', () => {
    const state = createSchedulerState(0, { intervalMs: 300_000 });
    expect(() => isRefreshDue(Number.NaN, state)).toThrow();
    expect(() => msUntilNextRun(Number.NaN, state)).toThrow();
    expect(() => markRefreshSuccess(Number.NaN, state)).toThrow();
    // Disconfirming case from the slice-2 brief: NaN failure time throws
    // instead of silently stamping nextRunAt = NaN.
    expect(() => markRefreshFailure(Number.NaN, state)).toThrow();
    expect(() => markRefreshFailure(Number.POSITIVE_INFINITY, state)).toThrow();
  });

  it('lifts the backoff ceiling to the interval when the interval exceeds 1h', () => {
    const twoHours = 2 * 60 * 60 * 1_000;
    const state = createSchedulerState(0, { intervalMs: twoHours });
    // Documented ceiling policy: the cap never sleeps less than one
    // normal interval, so the 1h default lifts to the 2h interval.
    expect(state.maxBackoffMs).toBe(twoHours);
    // An explicit maxBackoff below the interval clamps UP to the interval.
    const clamped = createSchedulerState(0, { intervalMs: 300_000, maxBackoffMs: 1_000 });
    expect(clamped.maxBackoffMs).toBe(300_000);
  });
});

describe('S10 slice-2 scheduler runtime (fake timers, zero network)', () => {
  it('fires the timer tick when due and reschedules after success', async () => {
    const fakes = makeTimerFakes();
    let nowMs = 0;
    const refresh = vi.fn(async () => undefined);
    const notify = vi.fn();
    const handle = startScheduler({ intervalMs: 300_000 }, {
      refresh,
      notify,
      now: () => nowMs,
      schedule: fakes.schedule,
      cancel: fakes.cancel,
    });
    try {
      // First schedule waits one full interval.
      expect(fakes.scheduled).toHaveLength(1);
      expect(fakes.scheduled[0]?.ms).toBe(300_000);

      // Early tick is quiet: no refresh, just reschedules.
      nowMs = 100_000;
      fakes.scheduled[0]?.callback();
      expect(refresh).not.toHaveBeenCalled();

      // Due tick runs exactly one refresh and notifies.
      nowMs = 300_000;
      fakes.scheduled[fakes.scheduled.length - 1]?.callback();
      await Promise.resolve();
      await Promise.resolve();
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(notify).toHaveBeenCalledTimes(1);
      expect(notify.mock.calls[0]?.[0]).toMatchObject({ consecutiveFailures: 0 });
      expect(handle.getState().nextRunAt).toBe(300_000 + 300_000);
    } finally {
      handle.stop();
      stopScheduler();
    }
  });

  it('backs off and notifies with the failure streak when refresh throws', async () => {
    const fakes = makeTimerFakes();
    let nowMs = 0;
    const refresh = vi.fn(async () => {
      throw new Error('stub-refresh-down');
    });
    const notify = vi.fn();
    const handle = startScheduler({ intervalMs: 300_000 }, {
      refresh,
      notify,
      now: () => nowMs,
      schedule: fakes.schedule,
      cancel: fakes.cancel,
    });
    try {
      nowMs = 300_000;
      fakes.scheduled[0]?.callback();
      await Promise.resolve();
      await Promise.resolve();
      expect(notify).toHaveBeenCalledTimes(1);
      expect(notify.mock.calls[0]?.[0]).toMatchObject({ consecutiveFailures: 1 });
      // Second failure doubles the delay (1x then 2x the interval).
      expect(handle.getState().nextRunAt).toBe(300_000 + 300_000);
      nowMs = handle.getState().nextRunAt;
      fakes.scheduled[fakes.scheduled.length - 1]?.callback();
      await Promise.resolve();
      await Promise.resolve();
      expect(handle.getState().consecutiveFailures).toBe(2);
      expect(handle.getState().nextRunAt).toBe(600_000 + 600_000);
    } finally {
      handle.stop();
      stopScheduler();
    }
  });

  it('shares one in-flight refresh across concurrent manual triggers (single-flight)', async () => {
    const fakes = makeTimerFakes();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const refresh = vi.fn(() => gate.then(() => undefined));
    const notify = vi.fn();
    const handle = startScheduler({ intervalMs: 300_000 }, {
      refresh,
      notify,
      now: () => 0,
      schedule: fakes.schedule,
      cancel: fakes.cancel,
    });
    try {
      const first = handle.refreshNow();
      const second = handle.refreshNow();
      release();
      await first;
      await second;
      // S4 SnapshotService pattern: two callers, one underlying refresh.
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(notify).toHaveBeenCalledTimes(1);
    } finally {
      handle.stop();
      stopScheduler();
    }
  });

  it('manual refresh bypasses the due check and stop cancels the timer', async () => {
    const fakes = makeTimerFakes();
    const refresh = vi.fn(async () => undefined);
    const handle = startScheduler({ intervalMs: 300_000 }, {
      refresh,
      now: () => 0,
      schedule: fakes.schedule,
      cancel: fakes.cancel,
    });
    try {
      // Timer scheduled but not yet due — manual trigger still refreshes.
      await handle.refreshNow();
      expect(refresh).toHaveBeenCalledTimes(1);
      handle.stop();
      expect(fakes.cancel).toHaveBeenCalled();
    } finally {
      stopScheduler();
    }
  });

  it('a throwing notify never rejects the refresh and the loop reschedules (review #96)', async () => {
    const fakes = makeTimerFakes();
    const refresh = vi.fn(async () => undefined);
    const notify = vi.fn(() => {
      throw new Error('webContents destroyed');
    });
    const handle = startScheduler({ intervalMs: 300_000 }, {
      refresh,
      notify,
      now: () => 0,
      schedule: fakes.schedule,
      cancel: fakes.cancel,
    });
    try {
      const scheduledBefore = fakes.schedule.mock.calls.length;
      // Manual trigger succeeds despite the notify throw.
      await expect(handle.refreshNow()).resolves.toBeUndefined();
      expect(refresh).toHaveBeenCalledTimes(1);
      expect(handle.getState().consecutiveFailures).toBe(0);
      // Timer loop survives: a fresh tick was scheduled after the refresh.
      expect(fakes.schedule.mock.calls.length).toBeGreaterThan(scheduledBefore);
    } finally {
      handle.stop();
      stopScheduler();
    }
  });
});

describe('S10 slice-2 refresh IPC contract (offline-pure)', () => {
  it('exposes stable manual-refresh and update channel names', () => {
    expect(MARKET_REFRESH_NOW).toBe('market:refreshNow');
    expect(MARKET_REFRESH_UPDATED).toBe('market:refreshUpdated');
  });
});

describe('S10 slice-2 renderer refresh helpers (zero network)', () => {
  it('throws bridge-absent and stale-preload errors, delegates on a full bridge', async () => {
    const { triggerManualRefresh, subscribeToRefreshUpdates } = await import(
      '../../src/services/electronApi.ts'
    );
    const update = { nextRunAt: 123, consecutiveFailures: 0 };

    (window as unknown as { osrsApi?: unknown }).osrsApi = undefined;
    await expect(triggerManualRefresh()).rejects.toThrow('Desktop bridge unavailable');
    expect(() => subscribeToRefreshUpdates(() => undefined)).toThrow('Desktop bridge unavailable');

    // Stale preload with only the S7/S8 surface: new methods absent.
    (window as unknown as { osrsApi?: unknown }).osrsApi = {
      app: { getVersion: vi.fn() },
      market: { fetchTop10: vi.fn(), fetchHistory: vi.fn() },
    };
    await expect(triggerManualRefresh()).rejects.toThrow('Desktop bridge unavailable');
    expect(() => subscribeToRefreshUpdates(() => undefined)).toThrow('Desktop bridge unavailable');

    // Full slice-2 bridge: trigger delegates, subscribe returns cleanup.
    const trigger = vi.fn(async () => update);
    const unsubscribe = vi.fn();
    const onRefreshUpdated = vi.fn(() => unsubscribe);
    (window as unknown as { osrsApi?: unknown }).osrsApi = {
      app: { getVersion: vi.fn() },
      market: { fetchTop10: vi.fn(), fetchHistory: vi.fn(), triggerRefreshNow: trigger, onRefreshUpdated },
    };
    await expect(triggerManualRefresh()).resolves.toEqual(update);
    const seen: unknown[] = [];
    const cleanup = subscribeToRefreshUpdates((u) => seen.push(u));
    expect(onRefreshUpdated).toHaveBeenCalledTimes(1);
    expect(cleanup).toBe(unsubscribe);

    (window as unknown as { osrsApi?: unknown }).osrsApi = undefined;
  });
});
