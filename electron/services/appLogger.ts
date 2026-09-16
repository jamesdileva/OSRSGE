import {
  MAX_LOG_ENTRIES,
  appendLogEvent,
  createLogEvent,
  summarizeLog,
  type AppLogEvent,
  type LogCategory,
  type LogLevel,
  type LogSummary,
} from '../../core/diagnostics/appLog.js';
import { FileAppLogSink } from '../../storage/log/FileAppLogSink.js';

/**
 * Sprint 19 slice-2: main-owned application logger (guide §44).
 * Owns the in-memory ring buffer plus the file sink; renderer, scheduler,
 * and future refresh-pipeline callers log through this service so the
 * "why didn't the rankings update?" answer lives in one place.
 *
 * Clock is injectable (`now`, defaults to Date.now — S10 scheduler / S11
 * watchlist `now`-dep precedent); the pure core still takes the explicit
 * timestamp, so tests stay deterministic.
 *
 * Sink failures never throw: the original event is already in the memory
 * buffer (memory truth preserved) and the failure is recorded as a
 * memory-only `storage` error event — itself a guide §44 category —
 * never re-sent to the failing sink (no recursion). Logging must not
 * crash the refresh pipeline it observes.
 *
 * What this module does NOT do (review #190 boundary):
 * - No history-backend touch: no repository or selector import.
 * - No IPC/UI: exposure to the renderer waits for a later slice.
 * - No diagnosis: `getSummary` reports the last error, it does not
 *   infer causality (S19 slice-1 contract).
 */

export interface AppLoggerSink {
  append(event: AppLogEvent): Promise<void>;
}

export interface AppLoggerOptions {
  /** File-sink root. When set (and no explicit `sink`), a FileAppLogSink is built. */
  baseDir?: string;
  /** Ring-buffer cap. Default MAX_LOG_ENTRIES. Must be a positive integer. */
  maxEntries?: number;
  /** Explicit sink override; `null` forces memory-only (tests, browser dev). */
  sink?: AppLoggerSink | null;
  /** Clock dep. Defaults to Date.now. */
  now?: () => number;
}

export interface AppLogger {
  log(
    level: LogLevel,
    category: LogCategory,
    message: string,
    details?: Record<string, unknown>,
  ): Promise<AppLogEvent>;
  getRecent(): AppLogEvent[];
  getSummary(): LogSummary;
}

export function createAppLogger(options: AppLoggerOptions = {}): AppLogger {
  const maxEntries = options.maxEntries ?? MAX_LOG_ENTRIES;
  if (!Number.isInteger(maxEntries) || maxEntries <= 0) {
    throw new Error(`Invalid maxEntries: ${String(maxEntries)}`);
  }
  const now = options.now ?? Date.now;
  let sink: AppLoggerSink | null;
  if (options.sink !== undefined) {
    sink = options.sink;
  } else if (options.baseDir !== undefined) {
    sink = new FileAppLogSink(options.baseDir);
  } else {
    sink = null;
  }

  let events: AppLogEvent[] = [];

  return {
    async log(level, category, message, details): Promise<AppLogEvent> {
      // Fail-closed: invalid inputs throw before buffer or file change.
      const event = createLogEvent(now(), level, category, message, details);
      events = appendLogEvent(events, event, maxEntries);
      if (sink !== null) {
        try {
          await sink.append(event);
        } catch (error) {
          const failure = createLogEvent(
            now(),
            'error',
            'storage',
            `log sink write failed: ${error instanceof Error ? error.message : String(error)}`,
          );
          events = appendLogEvent(events, failure, maxEntries);
        }
      }
      return event;
    },
    getRecent(): AppLogEvent[] {
      return [...events];
    },
    getSummary(): LogSummary {
      return summarizeLog(events);
    },
  };
}

/**
 * Sprint 19 slice-3a: module-level retention (review #193 carried nit).
 * main.ts retains the logger via `initAppLogger` at launch so pipeline
 * callers (scheduler refresh, future storage/API stages) log into the
 * same memory ring + file sink instead of a callback-local instance that
 * is discarded after startup. Tests reset via `resetAppLogger` / `setAppLogger`.
 */
let activeLogger: AppLogger | null = null;

/** Retained main-owned logger, or null before init / in renderer tests. */
export function getAppLogger(): AppLogger | null {
  return activeLogger;
}

/** Explicit override (tests, main restart). Pass null to clear. */
export function setAppLogger(logger: AppLogger | null): void {
  activeLogger = logger;
}

/** Create + retain in one step (main launch path). */
export function initAppLogger(options: AppLoggerOptions = {}): AppLogger {
  const logger = createAppLogger(options);
  activeLogger = logger;
  return logger;
}

/** Clear the retained instance (tests only; main never calls this). */
export function resetAppLogger(): void {
  activeLogger = null;
}
