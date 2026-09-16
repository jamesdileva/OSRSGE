/**
 * Sprint 19 slice-1: pure application-log core (roadmap §20, guide §44).
 * Pure — no fs, no Electron, no IPC, no scheduler, no UI, no network,
 * no Date.now. Callers pass `timestampMs` explicitly; inputs are only
 * read; outputs are fresh (frozen-input safe).
 *
 * Guide §44 categories covered 1:1 (startup, API refresh, API failures,
 * snapshot count, ranking count, storage failures, scheduler events).
 * The summary answers "Why didn't the rankings update?" by surfacing
 * counts plus the last error event — no diagnosis beyond the stored
 * events is attempted here.
 *
 * Privacy: the app collects no credentials or personal data, so there
 * is nothing sensitive to redact. `details` is caller-supplied context
 * only (counts, timestamps, error messages) and is never auto-captured
 * from anywhere; formatting truncates it so a chatty caller cannot
 * blow up the log file.
 *
 * No-duplication boundary (review #190 — what this module does NOT do):
 * - No file persistence (slice-2 owns the file sink and rotation).
 * - No Electron/main wiring and no history-backend touch: slice-3
 *   (history selector main wiring) waits for the live refresh pipeline
 *   scope — this slice never imports any repository or selector.
 * - No diagnosis engine: `summarizeLog` reports the last error, it does
 *   not infer causality between categories.
 */

export type LogLevel = 'info' | 'warn' | 'error';

export type LogCategory =
  | 'startup'
  | 'api-refresh'
  | 'api-failure'
  | 'snapshots'
  | 'ranking'
  | 'storage'
  | 'scheduler';

export const LOG_LEVELS: readonly LogLevel[] = ['info', 'warn', 'error'];

export const LOG_CATEGORIES: readonly LogCategory[] = [
  'startup',
  'api-refresh',
  'api-failure',
  'snapshots',
  'ranking',
  'storage',
  'scheduler',
];

/** Ring-buffer cap: newest events win, oldest drop. */
export const MAX_LOG_ENTRIES = 500;
/** Single-line budget for the human message. */
export const MAX_MESSAGE_CHARS = 500;
/** JSON budget for the caller-supplied details object. */
export const MAX_DETAILS_CHARS = 2000;

export interface AppLogEvent {
  readonly timestampMs: number;
  readonly level: LogLevel;
  readonly category: LogCategory;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface LogSummary {
  readonly total: number;
  readonly byLevel: Record<LogLevel, number>;
  readonly byCategory: Record<LogCategory, number>;
  /** Newest error-level event, or null when the buffer holds no errors. */
  readonly lastError: AppLogEvent | null;
  /** Newest event timestamp, or null when the buffer is empty. */
  readonly lastEventMs: number | null;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function assertTimestampMs(timestampMs: number): void {
  if (!Number.isFinite(timestampMs) || timestampMs <= 0) {
    throw new Error(`Invalid log timestampMs: ${String(timestampMs)}`);
  }
}

function assertLevel(level: unknown): asserts level is LogLevel {
  if (level !== 'info' && level !== 'warn' && level !== 'error') {
    throw new Error(`Invalid log level: ${String(level)}`);
  }
}

function assertCategory(category: unknown): asserts category is LogCategory {
  if (
    category !== 'startup' &&
    category !== 'api-refresh' &&
    category !== 'api-failure' &&
    category !== 'snapshots' &&
    category !== 'ranking' &&
    category !== 'storage' &&
    category !== 'scheduler'
  ) {
    throw new Error(`Invalid log category: ${String(category)}`);
  }
}

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

function assertDetails(details: unknown): void {
  if (details === undefined) return;
  if (!isPlainRecord(details)) {
    throw new Error('Invalid log details: must be a plain object when present');
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(details) ?? '';
  } catch {
    throw new Error('Invalid log details: not JSON-serializable');
  }
  if (serialized === undefined) {
    throw new Error('Invalid log details: not JSON-serializable');
  }
}

/**
 * Validate + freeze one log event. Over-long messages are truncated
 * (logging must never blow up the sink); empty messages throw
 * (caller bug, fail-closed). The stored `details` is a frozen shallow
 * copy so later caller mutation cannot rewrite history.
 */
export function createLogEvent(
  timestampMs: number,
  level: LogLevel,
  category: LogCategory,
  message: string,
  details?: Record<string, unknown>,
): AppLogEvent {
  assertTimestampMs(timestampMs);
  assertLevel(level);
  assertCategory(category);
  if (typeof message !== 'string' || message.trim().length === 0) {
    throw new Error('Invalid log message: must be a non-empty string');
  }
  assertDetails(details);
  return Object.freeze({
    timestampMs,
    level,
    category,
    message: truncate(message, MAX_MESSAGE_CHARS),
    ...(details === undefined ? {} : { details: Object.freeze({ ...details }) }),
  });
}

/**
 * Append one event, returning a fresh array. Never mutates the input
 * array or the event. Beyond `maxEntries` the oldest events drop
 * (newest wins). `maxEntries` must be a positive integer.
 */
export function appendLogEvent(
  events: readonly AppLogEvent[],
  event: AppLogEvent,
  maxEntries: number = MAX_LOG_ENTRIES,
): AppLogEvent[] {
  if (!Number.isInteger(maxEntries) || maxEntries <= 0) {
    throw new Error(`Invalid maxEntries: ${String(maxEntries)}`);
  }
  if (!Array.isArray(events)) {
    throw new Error('Invalid log buffer: must be an array');
  }
  // Re-validate the incoming event so a hand-built object cannot bypass
  // the factory (fail-closed on caller bugs).
  const stored = createLogEvent(
    event.timestampMs,
    event.level,
    event.category,
    event.message,
    event.details === undefined ? undefined : { ...(event.details as Record<string, unknown>) },
  );
  const next = [...events, stored];
  return next.length > maxEntries ? next.slice(next.length - maxEntries) : next;
}

/** Single-line file format: `[ISO] LEVEL category: message {details}`. */
export function formatLogEvent(event: AppLogEvent): string {
  const valid = createLogEvent(
    event.timestampMs,
    event.level,
    event.category,
    event.message,
    event.details === undefined ? undefined : { ...(event.details as Record<string, unknown>) },
  );
  const head = `[${new Date(valid.timestampMs).toISOString()}] ${valid.level.toUpperCase()} ${valid.category}: ${valid.message}`;
  if (valid.details === undefined) return head;
  const serialized = truncate(
    JSON.stringify(valid.details) ?? '{}',
    MAX_DETAILS_CHARS,
  );
  return `${head} ${serialized}`;
}

/** Counts plus the newest error — the "why didn't rankings update" entry point. */
export function summarizeLog(events: readonly AppLogEvent[]): LogSummary {
  if (!Array.isArray(events)) {
    throw new Error('Invalid log buffer: must be an array');
  }
  const byLevel: Record<LogLevel, number> = { info: 0, warn: 0, error: 0 };
  const byCategory: Record<LogCategory, number> = {
    startup: 0,
    'api-refresh': 0,
    'api-failure': 0,
    snapshots: 0,
    ranking: 0,
    storage: 0,
    scheduler: 0,
  };
  let lastError: AppLogEvent | null = null;
  let lastEventMs: number | null = null;
  for (const event of events) {
    const valid = createLogEvent(
      event.timestampMs,
      event.level,
      event.category,
      event.message,
      event.details === undefined ? undefined : { ...(event.details as Record<string, unknown>) },
    );
    byLevel[valid.level] += 1;
    byCategory[valid.category] += 1;
    if (lastEventMs === null || valid.timestampMs > lastEventMs) {
      lastEventMs = valid.timestampMs;
    }
    if (valid.level === 'error' && (lastError === null || valid.timestampMs >= lastError.timestampMs)) {
      lastError = valid;
    }
  }
  return { total: events.length, byLevel, byCategory, lastError, lastEventMs };
}
