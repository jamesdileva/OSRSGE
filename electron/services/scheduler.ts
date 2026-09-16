/**
 * Scheduler timing core + runtime (roadmap Sprint 10, guide §§41–43).
 *
 * Slice-1 delivered the pure core: schedule state, due checks, and
 * exponential backoff with zero timers/IPC/UI. Slice-2 adds the timer
 * runtime, single-flight refresh, manual-refresh trigger, and a notify
 * callback the main process forwards to the renderer — still stub-only
 * data (no live provider/scorer/history pipeline; D#163).
 *
 * Purity rule: the helpers below take `nowMs` explicitly and never call
 * Date.now. Only the runtime calls the clock once per tick/trigger and
 * passes the reading down, so timing stays deterministic under test.
 *
 * Jitter decision: NO jitter. This is a single desktop client polling on
 * its own cadence — there is no fleet to thundering-herd against. Jitter
 * would only blur the backoff math (1x/2x/4x) every dashboard test asserts
 * and harm determinism for zero availability gain. Revisit only if a
 * multi-client or server-driven schedule ever appears.
 *
 * All helpers never mutate their inputs (frozen-input safe).
 */

import type { AppLogger } from './appLogger.js';

/** Roadmap §12 UI example default: refresh every 5 minutes. */
export const DEFAULT_REFRESH_INTERVAL_MS = 5 * 60 * 1_000;

/**
 * Rate-safety floor (guide §43 — never hammer the API). Sub-minute
 * intervals are clamped, not rejected: a misconfigured setting should
 * degrade to the floor, never to a hot loop.
 */
export const MIN_REFRESH_INTERVAL_MS = 60 * 1_000;

/** Backoff ceiling: a failing refresh never sleeps longer than this. */
export const DEFAULT_MAX_BACKOFF_MS = 60 * 60 * 1_000;

export interface SchedulerConfig {
  intervalMs: number;
  maxBackoffMs?: number;
}

export interface SchedulerState {
  intervalMs: number;
  maxBackoffMs: number;
  nextRunAt: number;
  consecutiveFailures: number;
  lastRunAt?: number;
  lastSuccessAt?: number;
}

function resolveInterval(intervalMs: number): number {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    throw new Error(`Invalid refresh interval: ${String(intervalMs)}`);
  }
  return Math.max(MIN_REFRESH_INTERVAL_MS, intervalMs);
}

function resolveMaxBackoff(maxBackoffMs: number | undefined, intervalMs: number): number {
  // Ceiling policy: the cap never sleeps less than one normal interval,
  // so an explicit maxBackoff below the interval clamps UP to the
  // interval, and when the interval itself exceeds the 1h default (e.g. a
  // 2h polling config) the default lifts to the interval — a "ceiling"
  // below one interval would otherwise retry faster than the schedule.
  if (maxBackoffMs === undefined) {
    return Math.max(DEFAULT_MAX_BACKOFF_MS, intervalMs);
  }
  if (!Number.isFinite(maxBackoffMs) || maxBackoffMs <= 0) {
    throw new Error(`Invalid max backoff: ${String(maxBackoffMs)}`);
  }
  return Math.max(intervalMs, maxBackoffMs);
}

/** Fresh schedule: first run one interval after `nowMs`. */
export function createSchedulerState(nowMs: number, config: SchedulerConfig): SchedulerState {
  assertNowMs(nowMs, 'createSchedulerState');
  const intervalMs = resolveInterval(config.intervalMs);
  return {
    intervalMs,
    maxBackoffMs: resolveMaxBackoff(config.maxBackoffMs, intervalMs),
    nextRunAt: nowMs + intervalMs,
    consecutiveFailures: 0,
  };
}

function assertNowMs(nowMs: number, caller: string): void {
  if (!Number.isFinite(nowMs)) {
    throw new Error(`Invalid timestamp in ${caller}: ${String(nowMs)}`);
  }
}

/** True once the clock has reached the scheduled run (inclusive). */
export function isRefreshDue(nowMs: number, state: SchedulerState): boolean {
  assertNowMs(nowMs, 'isRefreshDue');
  return nowMs >= state.nextRunAt;
}

/** Milliseconds until the next run (0 when already due). */
export function msUntilNextRun(nowMs: number, state: SchedulerState): number {
  assertNowMs(nowMs, 'msUntilNextRun');
  return Math.max(0, state.nextRunAt - nowMs);
}

/** Success clears the failure streak; the next run is one interval out. */
export function markRefreshSuccess(nowMs: number, state: SchedulerState): SchedulerState {
  assertNowMs(nowMs, 'markRefreshSuccess');
  return {
    ...state,
    nextRunAt: nowMs + state.intervalMs,
    consecutiveFailures: 0,
    lastRunAt: nowMs,
    lastSuccessAt: nowMs,
  };
}

/**
 * Failure schedules the next attempt with exponential backoff:
 * interval × 2^(failures−1), capped at maxBackoffMs. The first failure
 * retries after one normal interval; the streak doubles from there.
 */
export function markRefreshFailure(nowMs: number, state: SchedulerState): SchedulerState {
  assertNowMs(nowMs, 'markRefreshFailure');
  const consecutiveFailures = state.consecutiveFailures + 1;
  const delay = Math.min(
    state.intervalMs * 2 ** (consecutiveFailures - 1),
    state.maxBackoffMs,
  );
  return {
    ...state,
    nextRunAt: nowMs + delay,
    consecutiveFailures,
    lastRunAt: nowMs,
  };
}

/**
 * Slice-2 runtime. The refresh handler is stub-only data by design
 * (D#163): the default is a no-op that simply advances the schedule so a
 * status line can bind — the live provider/scorer/history pipeline
 * arrives in later sprints and plugs in as the `refresh` dep.
 */
export type SchedulerRefreshHandler = () => Promise<void> | void;

/** Schedule snapshot pushed to the renderer after every refresh. */
export interface SchedulerUpdate {
  nextRunAt: number;
  consecutiveFailures: number;
  lastRunAt?: number;
  lastSuccessAt?: number;
}

export interface SchedulerRuntimeDeps {  /** Stub-only refresh work (default: no-op success). */
  refresh?: SchedulerRefreshHandler;
  /** Called after every completed refresh (success or failure). */
  notify?: (update: SchedulerUpdate) => void;
  /** Clock override for tests (default: Date.now). */
  now?: () => number;
  /** Timer overrides for tests (default: setTimeout/clearTimeout). */
  schedule?: (callback: () => void, ms: number) => unknown;
  cancel?: (timer: unknown) => void;
}

export interface SchedulerHandle {
  getState(): SchedulerState;
  /** Manual-refresh trigger: runs a refresh now, bypassing the due check. */
  refreshNow(): Promise<void>;
  stop(): void;
}

/** Singleton owned by start/stopScheduler so main.ts stays a thin owner. */
let activeHandle: SchedulerHandle | null = null;

/**
 * Schedule snapshot for the renderer (review #96: exported so main.ts
 * reuses it instead of rebuilding the payload inline — one shape, no
 * drift). Structurally identical to shared `MarketRefreshUpdate`.
 */
export function toSchedulerUpdate(state: SchedulerState): SchedulerUpdate {
  return {
    nextRunAt: state.nextRunAt,
    consecutiveFailures: state.consecutiveFailures,
    ...(state.lastRunAt !== undefined ? { lastRunAt: state.lastRunAt } : {}),
    ...(state.lastSuccessAt !== undefined ? { lastSuccessAt: state.lastSuccessAt } : {}),
  };
}

export function startScheduler(config?: SchedulerConfig, deps?: SchedulerRuntimeDeps): SchedulerHandle {
  const now = deps?.now ?? Date.now;
  // Wrapped (not `?? setTimeout` / `?? clearTimeout` directly) so the
  // public timer handle stays an opaque unknown: DOM (number) and Node
  // (Timeout) callers and fakes all satisfy the same signature.
  const schedule = deps?.schedule ?? ((callback: () => void, ms: number): unknown => setTimeout(callback, ms));
  const cancel =
    deps?.cancel ?? ((timer: unknown): void => clearTimeout(timer as ReturnType<typeof setTimeout>));
  const refresh = deps?.refresh ?? (async () => undefined);
  const notify = deps?.notify;

  let state = createSchedulerState(now(), config ?? { intervalMs: DEFAULT_REFRESH_INTERVAL_MS });
  let timer: unknown = null;
  let stopped = false;
  // Single-flight lock (S4 SnapshotService pattern): concurrent ticks and
  // manual triggers share one in-flight refresh instead of piling up.
  let inFlight: Promise<void> | null = null;

  const scheduleNext = (): void => {
    if (stopped) {
      return;
    }
    if (timer !== null) {
      cancel(timer);
      timer = null;
    }
    timer = schedule(() => void tick(), msUntilNextRun(now(), state));
  };

  const doRefresh = async (): Promise<void> => {
    const at = now();
    try {
      await refresh();
      state = markRefreshSuccess(at, state);
    } catch {
      state = markRefreshFailure(at, state);
    }
    // Review #96 finding 1 (robustness): a throwing notify (e.g.
    // webContents.send on a destroyed window) must never reject the
    // refresh or kill the timer loop — swallow it, always reschedule.
    try {
      notify?.(toSchedulerUpdate(state));
    } catch {
      // Renderer teardown is not a scheduler failure; streak already stamped.
    } finally {
      scheduleNext();
    }
  };

  const runShared = (): Promise<void> => {
    if (inFlight !== null) {
      return inFlight;
    }
    const pending = doRefresh();
    inFlight = pending;
    const release = (): void => {
      if (inFlight === pending) {
        inFlight = null;
      }
    };
    pending.then(release, release);
    return pending;
  };

  const tick = (): void => {
    timer = null;
    if (stopped) {
      return;
    }
    // Due-gated: quiet ticks just reschedule; failures reschedule via the
    // backoff stamped by doRefresh, never via a fixed re-tick.
    if (!isRefreshDue(now(), state)) {
      scheduleNext();
      return;
    }
    void runShared();
  };

  const handle: SchedulerHandle = {
    getState: () => state,
    refreshNow: () => runShared(),
    stop: () => {
      stopped = true;
      if (timer !== null) {
        cancel(timer);
        timer = null;
      }
    },
  };

  activeHandle?.stop();
  activeHandle = handle;
  scheduleNext();
  return handle;
}

/** Stops the singleton started by `startScheduler` (safe when idle). */
export function stopScheduler(): void {
  activeHandle?.stop();
  activeHandle = null;
}

/**
 * Sprint 19 slice-3a: scheduler → app-logger bridge (guide §44 `scheduler`).
 * Wraps a refresh handler so success logs `info/scheduler` and failure logs
 * `error/scheduler` (with the failure message) into the retained main-owned
 * logger, then rethrows so the backoff stamps the streak as before. A null
 * logger is a pass-through; logger bugs never mask the inner outcome (a
 * throwing log on the success path is swallowed, on the failure path the
 * original error is rethrown). Cheapest S19 disconfirm: one pipeline caller
 * through the retained logger before any IPC/UI.
 */
export function createLoggingRefresh(
  logger: Pick<AppLogger, 'log'> | null | undefined,
  inner?: SchedulerRefreshHandler,
): SchedulerRefreshHandler {
  return async (): Promise<void> => {
    try {
      await inner?.();
    } catch (error) {
      try {
        await logger?.log(
          'error',
          'scheduler',
          `refresh failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      } catch {
        // Logging must not mask the refresh failure it observes.
      }
      throw error;
    }
    try {
      await logger?.log('info', 'scheduler', 'refresh succeeded');
    } catch {
      // A logging bug must not turn a successful refresh into a failure.
    }
  };
}
