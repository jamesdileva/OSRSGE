import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Sidebar from '../../src/components/layout/Sidebar.tsx';
import Dashboard from '../../src/pages/Dashboard.tsx';
import type { MarketRefreshUpdate, MarketTop10Response } from '../../shared/ipc.ts';
import type { Opportunity } from '../../core/market/ranking/types.js';

afterEach(() => {
  cleanup();
  window.osrsApi = undefined;
  vi.restoreAllMocks();
});

function makeOpportunity(id: number, finalScore: number): Opportunity {
  return {
    rank: 0,
    item: { id, name: `Refresh Item ${id}`, members: false, buyLimit: null, examine: '', value: null },
    currentPrice: 2000 + id,
    changes: { oneHour: 1, sixHour: 2, twentyFourHour: 3 },
    spread: { gp: 60, percent: 2.5 },
    components: { momentum: 55, liquidity: 65, spread: 45, profitability: 35, consistency: 75, volatility: 25 },
    risk: 'LOW',
    confidence: 0.85,
    baseScore: finalScore,
    finalScore,
  };
}

function makeTop10(): MarketTop10Response {
  return {
    rankingVersion: '0.2-BALANCED-test',
    computedAt: 1700000000000,
    itemsAnalyzed: 2,
    opportunities: [makeOpportunity(1, 90), makeOpportunity(2, 10)],
  };
}

describe('sidebar section navigation (single-page, no router)', () => {
  it('renders all four tabs with Dashboard active', () => {
    render(<Sidebar activeSection="dashboard" onSelectSection={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Watchlist' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'History' })).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  it('notifies the tab selection on click', () => {
    const onSelectSection = vi.fn();
    render(<Sidebar activeSection="dashboard" onSelectSection={onSelectSection} />);
    fireEvent.click(screen.getByRole('button', { name: 'Watchlist' }));
    expect(onSelectSection).toHaveBeenCalledTimes(1);
    expect(onSelectSection).toHaveBeenCalledWith('watchlist');
  });

  it('keeps Settings visibly disabled with no selection', () => {
    const onSelectSection = vi.fn();
    render(<Sidebar activeSection="dashboard" onSelectSection={onSelectSection} />);
    const settings = screen.getByText('Settings');
    expect(settings).toHaveAttribute('aria-disabled', 'true');
    expect(settings.tagName).not.toBe('BUTTON');
    fireEvent.click(settings);
    expect(onSelectSection).not.toHaveBeenCalled();
  });
});

describe('dashboard section scroll', () => {
  it('scrolls to the watchlist section when the tab is selected', () => {
    const scrollIntoView = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;
    render(<Dashboard activeSection="watchlist" />);
    const heading = document.getElementById('section-watchlist');
    expect(heading).not.toBeNull();
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('scrolls nowhere without an active section (props path untouched)', () => {
    const scrollIntoView = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView;
    render(<Dashboard />);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});

describe('dashboard manual refresh button', () => {
  it('stays hidden in bridgeless browser mode', () => {
    render(<Dashboard />);
    expect(screen.queryByRole('button', { name: /refresh now/i })).toBeNull();
  });

  it('triggers a refresh then re-reads the live Top-10', async () => {
    const fetchTop10 = vi.fn().mockResolvedValue(makeTop10());
    const triggerRefreshNow = vi.fn().mockResolvedValue({} as MarketRefreshUpdate);
    window.osrsApi = {
      app: { getVersion: vi.fn().mockResolvedValue('0.1.0-test') },
      market: { fetchTop10, fetchHistory: vi.fn(), triggerRefreshNow, onRefreshUpdated: vi.fn() },
    };
    render(<Dashboard />);

    const button = await screen.findByRole('button', { name: /refresh now/i });
    fireEvent.click(button);
    await screen.findByText('Refresh Item 1');
    expect(triggerRefreshNow).toHaveBeenCalledTimes(1);
    // Mount fetch + post-refresh re-read share the one Top-10 call shape.
    expect(fetchTop10).toHaveBeenCalledTimes(2);
  });

  it('surfaces refresh failures inline without crashing', async () => {
    const fetchTop10 = vi.fn().mockResolvedValue(makeTop10());
    window.osrsApi = {
      app: { getVersion: vi.fn().mockResolvedValue('0.1.0-test') },
      market: {
        fetchTop10,
        fetchHistory: vi.fn(),
        triggerRefreshNow: vi.fn().mockRejectedValue(new Error('refresh-boom')),
        onRefreshUpdated: vi.fn(),
      },
    };
    render(<Dashboard />);

    fireEvent.click(await screen.findByRole('button', { name: /refresh now/i }));
    expect(await screen.findByText(/Refresh failed: refresh-boom/)).toBeInTheDocument();
  });
});
