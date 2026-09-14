import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WatchlistPanel from '../../src/components/dashboard/WatchlistPanel.tsx';
import Dashboard from '../../src/pages/Dashboard.tsx';
import type { Opportunity } from '../../core/market/ranking/types.js';
import type { WatchlistEntry } from '../../core/watchlist/watchlist.js';
import { buildWatchlistView } from '../../core/watchlist/watchlistView.js';

const T0 = 1_700_000_000_000;

afterEach(() => {
  cleanup();
  window.osrsApi = undefined;
  vi.restoreAllMocks();
});

function makeOpportunity(id: number, name: string, finalScore = 50): Opportunity {
  return {
    rank: 0,
    item: { id, name, members: false, buyLimit: null, examine: '', value: null },
    currentPrice: 1000 + id,
    changes: { oneHour: 1, sixHour: 2, twentyFourHour: 3 },
    spread: { gp: 50, percent: 2 },
    components: { momentum: 50, liquidity: 60, spread: 40, profitability: 30, consistency: 70, volatility: 20 },
    risk: 'LOW',
    confidence: 0.9,
    baseScore: finalScore,
    finalScore,
  };
}

describe('Sprint 11 slice-2 part 2b watchlist UI', () => {
  it('panel empty state renders no table (offline-pure)', () => {
    render(<WatchlistPanel rows={[]} />);
    expect(screen.getByText(/No watched items yet/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('panel renders known rows in store order with remove actions', () => {
    const entries: WatchlistEntry[] = [
      { itemId: 561, addedAt: T0 + 1 },
      { itemId: 4151, addedAt: T0 },
    ];
    const rows = buildWatchlistView(entries, [
      makeOpportunity(4151, 'Abyssal whip', 90),
      makeOpportunity(561, 'Nature rune', 10),
    ]);
    const onRemoveItem = vi.fn();
    render(<WatchlistPanel rows={rows} onRemoveItem={onRemoveItem} />);
    const table = screen.getByRole('table', { name: 'Watchlist' });
    const body = within(table).getAllByRole('row').slice(1);
    expect(body.map((r) => within(r).getAllByRole('cell')[0]?.textContent)).toEqual([
      'Nature rune',
      'Abyssal whip',
    ]);
    fireEvent.click(screen.getByLabelText('Remove 561 from watchlist'));
    expect(onRemoveItem).toHaveBeenCalledWith(561);
  });

  it('panel renders unknown/stale ids gracefully (no crash)', () => {
    const rows = buildWatchlistView([{ itemId: 999_999, addedAt: T0 }], []);
    render(<WatchlistPanel rows={rows} />);
    expect(screen.getByText('Unknown item #999999')).toBeInTheDocument();
  });

  it('view dedupes duplicate entry ids first-wins (review #106 nit)', () => {
    const rows = buildWatchlistView(
      [
        { itemId: 4151, addedAt: T0 },
        { itemId: 4151, addedAt: T0 + 999 },
      ],
      [makeOpportunity(4151, 'Abyssal whip')],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.addedAt).toBe(T0);
  });

  it('dashboard props path renders the watchlist with zero IPC and reports add/remove', () => {
    const fetchTop10 = vi.fn();
    window.osrsApi = {
      app: { getVersion: vi.fn() },
      market: { fetchTop10, fetchHistory: vi.fn() },
    };
    const onAddWatch = vi.fn();
    const onRemoveWatch = vi.fn();
    render(
      <Dashboard
        status="success"
        opportunities={[makeOpportunity(4151, 'Abyssal whip', 90), makeOpportunity(561, 'Nature rune', 10)]}
        itemsAnalyzed={2}
        watchlist={[{ itemId: 4151, addedAt: T0 }]}
        onAddWatch={onAddWatch}
        onRemoveWatch={onRemoveWatch}
      />,
    );
    const table = screen.getByRole('table', { name: 'Watchlist' });
    expect(within(table).getByText('Abyssal whip')).toBeInTheDocument();
    expect(fetchTop10).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('Remove 4151 from watchlist'));
    expect(onRemoveWatch).toHaveBeenCalledWith(4151);
    expect(onAddWatch).not.toHaveBeenCalled();
  });

  it('dashboard props path Watch button reports add for the selected item', () => {
    window.osrsApi = undefined;
    const onAddWatch = vi.fn();
    render(
      <Dashboard
        status="success"
        opportunities={[makeOpportunity(4151, 'Abyssal whip', 90)]}
        itemsAnalyzed={1}
        selectedItemId={4151}
        watchlist={[]}
        onAddWatch={onAddWatch}
        onRemoveWatch={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText('Watch 4151'));
    expect(onAddWatch).toHaveBeenCalledWith(4151);
  });

  it('dashboard live path fetches the watchlist once and persists add IDs-only', async () => {
    const getWatchlist = vi.fn().mockResolvedValue({ entries: [{ itemId: 4151, addedAt: T0 }] });
    const addToWatchlist = vi
      .fn()
      .mockResolvedValue({ entries: [{ itemId: 4151, addedAt: T0 }, { itemId: 561, addedAt: T0 + 1 }] });
    window.osrsApi = {
      app: { getVersion: vi.fn().mockResolvedValue('0.1.0-test') },
      market: {
        fetchTop10: vi.fn().mockResolvedValue({
          rankingVersion: '0.2-BALANCED-test',
          computedAt: T0,
          itemsAnalyzed: 2,
          opportunities: [makeOpportunity(4151, 'Abyssal whip', 90), makeOpportunity(561, 'Nature rune', 10)],
        }),
        fetchHistory: vi.fn().mockResolvedValue({ itemId: 4151, window: '24h', points: [] }),
      },
      watchlist: { getWatchlist, addToWatchlist, removeFromWatchlist: vi.fn().mockResolvedValue({ entries: [] }) },
    };
    render(<Dashboard />);
    const table = await screen.findByRole('table', { name: 'Watchlist' });
    expect(within(table).getByText('Abyssal whip')).toBeInTheDocument();
    expect(getWatchlist).toHaveBeenCalledTimes(1);
    // Persist IDs only: no price/spread/risk on the wire.
    await screen.findByRole('table', { name: 'Top 10 opportunities' });
    const topTable = screen.getByRole('table', { name: 'Top 10 opportunities' });
    fireEvent.click(within(topTable).getByText('Nature rune'));
    fireEvent.click(await screen.findByLabelText('Watch 561'));
    expect(addToWatchlist).toHaveBeenCalledWith({ itemId: 561 });
  });

  it('dashboard live path renders stale watch ids as graceful null rows', async () => {
    window.osrsApi = {
      app: { getVersion: vi.fn().mockResolvedValue('0.1.0-test') },
      market: {
        fetchTop10: vi.fn().mockResolvedValue({
          rankingVersion: '0.2-BALANCED-test',
          computedAt: T0,
          itemsAnalyzed: 1,
          opportunities: [makeOpportunity(4151, 'Abyssal whip', 90)],
        }),
        fetchHistory: vi.fn().mockResolvedValue({ itemId: 4151, window: '24h', points: [] }),
      },
      watchlist: {
        getWatchlist: vi.fn().mockResolvedValue({ entries: [{ itemId: 999_999, addedAt: T0 }] }),
        addToWatchlist: vi.fn(),
        removeFromWatchlist: vi.fn(),
      },
    };
    render(<Dashboard />);
    expect(await screen.findByText('Unknown item #999999')).toBeInTheDocument();
  });
});
