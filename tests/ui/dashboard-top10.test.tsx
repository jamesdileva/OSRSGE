import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import TopOpportunityTable from '../../src/components/dashboard/TopOpportunityTable.tsx';
import { buildDashboardViewModel } from '../../src/components/dashboard/dashboardViewModel.ts';
import Dashboard from '../../src/pages/Dashboard.tsx';
import type { Opportunity } from '../../core/market/ranking/types.js';

afterEach(() => {
  cleanup();
});

function makeOpportunity(id: number, finalScore: number): Opportunity {
  return {
    rank: 0,
    item: { id, name: `Item ${id}`, members: false, buyLimit: null, examine: '', value: null },
    currentPrice: 1000 + id,
    changes: { oneHour: 1, sixHour: 2, twentyFourHour: 3 },
    spread: { gp: 50, percent: 2 },
    components: { momentum: 50, liquidity: 60, spread: 40, profitability: 30, consistency: 70, volatility: 20 },
    risk: id % 3 === 0 ? 'HIGH' : id % 3 === 1 ? 'LOW' : 'MEDIUM',
    confidence: 0.9,
    baseScore: finalScore,
    finalScore,
  };
}

describe('Sprint 7 slice-1 dashboard Top-10', () => {
  it('view-model sorts by finalScore desc, slices 10, and assigns ranks', () => {
    const opportunities = Array.from({ length: 12 }, (_, i) => makeOpportunity(i + 1, (i + 1) * 5));
    const vm = buildDashboardViewModel({ opportunities, itemsAnalyzed: 12 });
    expect(vm.top10).toHaveLength(10);
    expect(vm.top10.map((o) => o.finalScore)).toEqual([60, 55, 50, 45, 40, 35, 30, 25, 20, 15]);
    expect(vm.top10.map((o) => o.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(vm.summary).toMatchObject({ itemsAnalyzed: 12, opportunitiesFound: 12 });
  });

  it('renders Top-10 sorted by finalScore desc with risk text (not color-only)', () => {
    const opportunities = [makeOpportunity(1, 10), makeOpportunity(2, 90), makeOpportunity(3, 50)];
    render(<Dashboard status="success" opportunities={opportunities} itemsAnalyzed={3} />);
    const table = screen.getByRole('table', { name: 'Top 10 opportunities' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByText('Item 2')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Item 3')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Item 1')).toBeInTheDocument();
    expect(screen.getByText(/HIGH/)).toBeInTheDocument();
    expect(screen.getByText(/LOW/)).toBeInTheDocument();
  });

  it('renders the empty state when there are no opportunities', () => {
    render(<Dashboard status="idle" opportunities={[]} itemsAnalyzed={0} />);
    expect(screen.getByText(/No market data yet/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('table empty state is offline-pure (no network)', () => {
    render(<TopOpportunityTable opportunities={[]} />);
    expect(screen.getByText(/No market data yet/)).toBeInTheDocument();
  });
});
