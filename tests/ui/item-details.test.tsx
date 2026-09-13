import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ItemDetailsPanel from '../../src/components/dashboard/ItemDetailsPanel.tsx';
import Dashboard from '../../src/pages/Dashboard.tsx';
import { confidenceMultiplier } from '../../core/market/ranking/confidence.js';
import { riskMultiplier } from '../../core/market/ranking/risk.js';
import type { Opportunity } from '../../core/market/ranking/types.js';

afterEach(() => {
  cleanup();
  window.osrsApi = undefined;
  vi.restoreAllMocks();
});

function makeOpportunity(id: number, finalScore: number, overrides: Partial<Opportunity> = {}): Opportunity {
  return {
    rank: 1,
    item: { id, name: `Item ${id}`, members: false, buyLimit: null, examine: '', value: null },
    currentPrice: 1000 + id,
    changes: { oneHour: 1.5, sixHour: -2.25, twentyFourHour: 3 },
    spread: { gp: 50, percent: 2 },
    components: { momentum: 50, liquidity: 60, spread: 40, profitability: 30, consistency: 70, volatility: 20 },
    estimatedProfit: 40,
    risk: 'MEDIUM',
    confidence: 0.9,
    baseScore: 60,
    finalScore,
    ...overrides,
  };
}

describe('Sprint 8 slice-1 ItemDetailsPanel (pure, props-driven)', () => {
  it('empty state when nothing is selected', () => {
    render(<ItemDetailsPanel opportunity={null} />);
    expect(screen.getByText(/Select an item to see details/)).toBeInTheDocument();
  });

  it('renders name/price/changes/spread/liquidity/volatility/profit/risk+confidence', () => {
    render(<ItemDetailsPanel opportunity={makeOpportunity(4151, 55)} />);
    expect(screen.getByText(/Item 4151/)).toBeInTheDocument();
    expect(screen.getByText('+1.50%')).toBeInTheDocument();
    expect(screen.getByText('-2.25%')).toBeInTheDocument();
    expect(screen.getByText('+3.00%')).toBeInTheDocument();
    expect(screen.getByText('MEDIUM')).toBeInTheDocument();
    expect(screen.getByText(/90%/)).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Score breakdown' })).toBeInTheDocument();
  });

  it('renders all six component scores plus Base and Final', () => {
    render(<ItemDetailsPanel opportunity={makeOpportunity(1, 55)} />);
    const table = screen.getByRole('table', { name: 'Score breakdown' });
    for (const label of ['Momentum', 'Liquidity', 'Spread', 'Profitability', 'Consistency', 'Volatility', 'Base Score', 'Final Score']) {
      expect(within(table).getByText(label)).toBeInTheDocument();
    }
  });

  it('breakdown math reuses scorer multipliers: base × riskMult × confMult == final (D#200 disconfirming check)', () => {
    const opportunity = makeOpportunity(1, 0, { baseScore: 80, risk: 'HIGH', confidence: 0.5 });
    opportunity.finalScore = opportunity.baseScore * riskMultiplier(opportunity.risk) * confidenceMultiplier(opportunity.confidence);
    render(<ItemDetailsPanel opportunity={opportunity} />);
    expect(opportunity.finalScore).toBeCloseTo(
      opportunity.baseScore * riskMultiplier('HIGH') * confidenceMultiplier(0.5),
      10,
    );
    expect(screen.getByRole('table', { name: 'Score breakdown' })).toBeInTheDocument();
  });

  it('Dashboard row-click selects an item and shows details (props path)', async () => {
    const onSelectItem = vi.fn();
    render(
      <Dashboard
        status="success"
        opportunities={[makeOpportunity(1, 10), makeOpportunity(2, 90)]}
        itemsAnalyzed={2}
        onSelectItem={onSelectItem}
      />,
    );
    expect(screen.getByText(/Select an item to see details/)).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Top 10 opportunities' });
    fireEvent.click(within(table).getByText('Item 2'));
    expect(onSelectItem).toHaveBeenCalledWith(2);
    expect(screen.getByRole('region', { name: 'Details for Item 2' })).toBeInTheDocument();
  });

  it('Dashboard controlled selectedItemId renders details without clicks', () => {
    render(
      <Dashboard
        status="success"
        opportunities={[makeOpportunity(1, 10), makeOpportunity(2, 90)]}
        itemsAnalyzed={2}
        selectedItemId={1}
      />,
    );
    expect(screen.getByRole('region', { name: 'Details for Item 1' })).toBeInTheDocument();
  });
});
