import type { JSX } from 'react';
import type { WatchlistViewRow } from '../../../core/watchlist/watchlistView.js';

export interface WatchlistPanelProps {
  rows: WatchlistViewRow[];
  selectedItemId?: number | null;
  onSelectItem?: (itemId: number) => void;
  onRemoveItem?: (itemId: number) => void;
}

function formatGp(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  return `${Math.round(value).toLocaleString()} gp`;
}

function formatPct(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

/**
 * Sprint 11 slice-2 part 2b: pure watchlist panel (roadmap §13).
 * Props-driven, zero IPC/scheduler/network — the Dashboard owns fetching
 * (fetchWatchlist) and persistence (addWatchedItem/removeWatchedItem) and
 * passes derived rows via buildWatchlistView. Unknown/stale ids (row with
 * opportunity null) render a graceful placeholder, never a crash.
 */
export default function WatchlistPanel({
  rows,
  selectedItemId = null,
  onSelectItem,
  onRemoveItem,
}: WatchlistPanelProps): JSX.Element {
  if (rows.length === 0) {
    return <p className="placeholder">No watched items yet — select an item to watch it.</p>;
  }
  return (
    <table className="watchlist-table" aria-label="Watchlist">
      <thead>
        <tr>
          <th scope="col">Item</th>
          <th scope="col">Price</th>
          <th scope="col">24h</th>
          <th scope="col">Risk</th>
          <th scope="col">Score</th>
          <th scope="col">Actions</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const name = row.opportunity?.item.name ?? `Unknown item #${row.itemId}`;
          const selectable = row.opportunity !== null && onSelectItem !== undefined;
          return (
            <tr
              key={row.itemId}
              onClick={selectable ? () => onSelectItem(row.itemId) : undefined}
              onKeyDown={
                selectable
                  ? (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onSelectItem(row.itemId);
                      }
                    }
                  : undefined
              }
              tabIndex={selectable ? 0 : undefined}
              aria-selected={selectedItemId === row.itemId}
              className={selectedItemId === row.itemId ? 'selected' : undefined}
            >
              <td>{name}</td>
              <td>{row.opportunity ? formatGp(row.opportunity.currentPrice) : '—'}</td>
              <td>{row.opportunity ? formatPct(row.opportunity.changes.twentyFourHour) : '—'}</td>
              <td>{row.opportunity?.risk ?? '—'}</td>
              <td>{row.opportunity ? row.opportunity.finalScore.toFixed(1) : '—'}</td>
              <td>
                {onRemoveItem && (
                  <button
                    type="button"
                    aria-label={`Remove ${row.itemId} from watchlist`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemoveItem(row.itemId);
                    }}
                  >
                    Remove
                  </button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
