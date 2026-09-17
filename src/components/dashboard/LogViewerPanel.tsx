import type { JSX } from 'react';
import { formatLogEvent } from '../../../core/diagnostics/appLog.js';
import type { AppLogEvent, LogSummary } from '../../../core/diagnostics/appLog.js';

export interface LogViewerPanelProps {
  events: AppLogEvent[] | null;
  summary: LogSummary | null;
  error: string | null;
  onRefresh: () => void;
}

/**
 * S20 slice-4: pure read-only log viewer (roadmap §20, guide §44).
 * Props-driven, zero IPC/network/scheduler/persistence/fetch — the Dashboard
 * owns reading (bridge fetchLogRecent/fetchLogSummary with empty-read
 * fallback) and passes the ring contents back. All displayed values are
 * OBSERVED log events from the main-owned memory ring — nothing is written,
 * cleared, diagnosed, or inferred here. Events arrive oldest-first from the
 * handler and render newest-first so the latest refresh outcome is on top.
 */
export default function LogViewerPanel({
  events,
  summary,
  error,
  onRefresh,
}: LogViewerPanelProps): JSX.Element {
  const newestFirst = events === null ? null : [...events].reverse();
  return (
    <div aria-label="Application log">
      <p className="placeholder">
        Read-only — shows why the rankings did or did not update. Nothing is written here.
      </p>
      <button type="button" onClick={onRefresh}>
        Refresh logs
      </button>
      {error !== null && <p className="notice notice-error">Logs unavailable: {error}</p>}
      {events === null && summary === null && error === null && (
        <p className="placeholder">No logs loaded yet — press Refresh logs.</p>
      )}
      {summary !== null && (
        <dl aria-label="Log summary">
          <dt>Total events</dt>
          <dd>{summary.total}</dd>
          <dt>By level</dt>
          <dd>
            {summary.byLevel.info} info, {summary.byLevel.warn} warn, {summary.byLevel.error} error
          </dd>
          <dt>Last error</dt>
          <dd>{summary.lastError === null ? 'none' : summary.lastError.message}</dd>
          <dt>Last event</dt>
          <dd>
            {summary.lastEventMs === null ? 'none' : new Date(summary.lastEventMs).toISOString()}
          </dd>
        </dl>
      )}
      {newestFirst !== null && newestFirst.length === 0 && error === null && (
        <p className="placeholder">No log events yet — run a refresh.</p>
      )}
      {newestFirst !== null && newestFirst.length > 0 && (
        <ul aria-label="Recent log events">
          {newestFirst.map((event, index) => (
            <li key={`${event.timestampMs}-${event.category}-${event.message}-${index}`}>{formatLogEvent(event)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
