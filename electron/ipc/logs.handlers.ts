import { LOG_GET_RECENT, LOG_GET_SUMMARY } from '../../shared/ipc.js';
import type { LogRecentRequest, LogRecentResponse, LogSummaryResponse } from '../../shared/ipc.js';
import { summarizeLog } from '../../core/diagnostics/appLog.js';
import type { AppLogger } from '../services/appLogger.js';
import { getAppLogger } from '../services/appLogger.js';
import type { IpcMainHandler } from './app.handlers.js';

export interface LogsHandlerDeps {
  /**
   * Logger supplier, resolved per request (lazy) so a swapped instance
   * (tests, main restart) is always the current one — never a stale
   * capture from registration time (review #195 nit 2). Defaults to the
   * retained main-owned logger. Null means pre-init: reads return empty,
   * never throw (mirrors the tolerant-read precedent — missing file → []).
   */
  getLogger?: () => AppLogger | null;
}

function resolveLimit(request: LogRecentRequest | undefined): number | null {
  const limit = (request ?? {}).limit;
  if (limit === undefined) return null;
  if (!Number.isInteger(limit) || (limit as number) <= 0) {
    throw new Error(`Invalid log limit: ${String(limit)}`);
  }
  return limit as number;
}

/**
 * Sprint 19 slice-3b read-only log IPC (guide §44).
 * Exposes the main-owned memory ring to the renderer: recent events +
 * summary. No writes, no clearing, no diagnosis, no history-backend
 * touch (no repository/selector imports), no file parsing (summaries
 * come from the memory buffer, never by re-reading app.log).
 */
export function registerLogsHandlers(ipcMain: IpcMainHandler, deps: LogsHandlerDeps = {}): void {
  const getLogger = deps.getLogger ?? getAppLogger;
  ipcMain.handle(LOG_GET_RECENT, async (_event: unknown, request?: unknown): Promise<LogRecentResponse> => {
    const logger = getLogger();
    if (logger === null) return { events: [] };
    const limit = resolveLimit(request as LogRecentRequest | undefined);
    const recent = logger.getRecent();
    if (limit === null) return { events: recent };
    return { events: recent.slice(Math.max(0, recent.length - limit)) };
  });
  ipcMain.handle(LOG_GET_SUMMARY, async (): Promise<LogSummaryResponse> => {
    const logger = getLogger();
    if (logger === null) return { summary: summarizeLog([]) };
    return { summary: logger.getSummary() };
  });
}
