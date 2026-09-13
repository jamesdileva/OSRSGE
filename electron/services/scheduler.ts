/**
 * Scheduler stub + pure timing core (roadmap Sprint 10, guide §§41–43).
 *
 * Slice-1 is pure by design: schedule state, due checks, and exponential
 * backoff with zero timers/IPC/UI. Timers, manual-refresh integration, and
 * renderer notification arrive in slice-2 — startScheduler/stopScheduler
 * stay explicit no-ops so main.ts already reflects the target lifecycle.
 *
 * All helpers take `nowMs` explicitly (never call Date.now) so timing is
 * deterministic under test. Helpers never mutate their inputs.
 */

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
  if (!Number.isFinite(nowMs)) {
    throw new Error(`Invalid timestamp: ${String(nowMs)}`);
  }
  const intervalMs = resolveInterval(config.intervalMs);
  return {
    intervalMs,
    maxBackoffMs: resolveMaxBackoff(config.maxBackoffMs, intervalMs),
    nextRunAt: nowMs + intervalMs,
    consecutiveFailures: 0,
  };
}

/** True once the clock has reached the scheduled run (inclusive). */
export function isRefreshDue(nowMs: number, state: SchedulerState): boolean {
  return nowMs >= state.nextRunAt;
}

/** Milliseconds until the next run (0 when already due). */
export function msUntilNextRun(nowMs: number, state: SchedulerState): number {
  return Math.max(0, state.nextRunAt - nowMs);
}

/** Success clears the failure streak; the next run is one interval out. */
export function markRefreshSuccess(nowMs: number, state: SchedulerState): SchedulerState {
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

export function startScheduler(): void {
  // No-op for Sprint 10 slice-1 (pure timing core only).
}

export function stopScheduler(): void {
  // No-op for Sprint 10 slice-1 (pure timing core only).
}
