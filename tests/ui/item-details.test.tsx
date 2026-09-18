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

  it('breakdown math reuses scorer multipliers: rendered ×mults chain base to final (D#200 disconfirming check)', () => {
    const opportunity = makeOpportunity(1, 0, { baseScore: 80, risk: 'HIGH', confidence: 0.5 });
    const riskMult = riskMultiplier(opportunity.risk);
    const confMult = confidenceMultiplier(opportunity.confidence);
    opportunity.finalScore = opportunity.baseScore * riskMult * confMult;
    render(<ItemDetailsPanel opportunity={opportunity} />);
    // Rendered multiplier text must match the scorer (not a reimplementation).
    expect(screen.getByText(`(×${riskMult.toFixed(2)})`)).toBeInTheDocument();
    expect(screen.getByText(`(×${confMult.toFixed(3)})`, { exact: false })).toBeInTheDocument();
    // Displayed Base × displayed mults ≈ displayed Final within rounding.
    const table = screen.getByRole('table', { name: 'Score breakdown' });
    const baseCell = within(table).getByText(opportunity.baseScore.toFixed(1));
    const finalCell = within(table).getByText(opportunity.finalScore.toFixed(1));
    const displayedBase = Number(baseCell.textContent);
    const displayedFinal = Number(finalCell.textContent);
    expect(displayedBase * riskMult * confMult).toBeCloseTo(displayedFinal, 0);
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

  it('S21 #48: surfaces cached metadata display-only when present', () => {
    render(
      <ItemDetailsPanel
        opportunity={makeOpportunity(4151, 55, {
          item: {
            id: 4151,
            name: 'Abyssal whip',
            members: true,
            buyLimit: 70,
            examine: 'A weapon from the abyss.',
            value: 120001,
          },
        })}
      />,
    );
    expect(screen.getByText('Members')).toBeInTheDocument();
    expect(screen.getByText('70')).toBeInTheDocument();
    expect(screen.getByText('A weapon from the abyss.')).toBeInTheDocument();
    expect(screen.getByText('120,001 gp')).toBeInTheDocument();
  });

  it('S21 #48: miss stays fail-open neutrals (F2P / em-dash, no throw)', () => {
    render(<ItemDetailsPanel opportunity={makeOpportunity(999999, 55)} />);
    expect(screen.getByText('Free-to-play')).toBeInTheDocument();
    const details = screen.getByRole('region', { name: 'Details for Item 999999' });
    // Buy limit + examine + value all degrade to the em-dash neutral.
    expect(within(details).getAllByText('—').length).toBeGreaterThanOrEqual(3);
  });

  it('#50a: whitespace examine renders a dash, value 0 renders 0 gp (distinct from null)', () => {
    render(
      <ItemDetailsPanel
        opportunity={makeOpportunity(4151, 55, {
          item: {
            id: 4151,
            name: 'Abyssal whip',
            members: false,
            buyLimit: 70,
            examine: '   ',
            value: 0,
          },
        })}
      />,
    );
    const details = screen.getByRole('region', { name: 'Details for Abyssal whip' });
    // Whitespace-only examine degrades to the dash neutral, never a blank line.
    expect(within(details).getAllByText('—').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('0 gp')).toBeInTheDocument();
  });

  it('#50a: non-number buyLimit renders a dash (strict display guard, no throw)', () => {
    render(
      <ItemDetailsPanel
        opportunity={makeOpportunity(4151, 55, {
          item: {
            id: 4151,
            name: 'Abyssal whip',
            members: true,
            buyLimit: '70' as never,
            examine: 'A weapon from the abyss.',
            value: 120001,
          },
        })}
      />,
    );
    const details = screen.getByRole('region', { name: 'Details for Abyssal whip' });
    expect(within(details).getAllByText('—').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Members')).toBeInTheDocument();
  });

  it('serve/display parity: truthy members, non-positive buyLimit, invalid value all render neutrals', () => {
    render(
      <ItemDetailsPanel
        opportunity={makeOpportunity(4151, 55, {
          item: {
            id: 4151,
            name: 'Abyssal whip',
            members: 1 as never,
            buyLimit: 0 as never,
            examine: 'A weapon from the abyss.',
            value: -5 as never,
          },
        })}
      />,
    );
    const details = screen.getByRole('region', { name: 'Details for Abyssal whip' });
    // Serve path degrades members !== true to false, buyLimit <= 0 to null,
    // value < 0 to null — the panel must show the same fail-open neutrals.
    expect(screen.getByText('Free-to-play')).toBeInTheDocument();
    expect(within(details).getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('serve/display parity: fractional value renders a dash, value 0 still renders 0 gp', () => {
    render(
      <ItemDetailsPanel
        opportunity={makeOpportunity(4151, 55, {
          item: {
            id: 4151,
            name: 'Abyssal whip',
            members: true,
            buyLimit: 70,
            examine: 'A weapon from the abyss.',
            value: 12.5 as never,
          },
        })}
      />,
    );
    const fractional = screen.getByRole('region', { name: 'Details for Abyssal whip' });
    expect(within(fractional).getAllByText('—').length).toBeGreaterThanOrEqual(1);
    cleanup();
    render(
      <ItemDetailsPanel
        opportunity={makeOpportunity(4151, 55, {
          item: {
            id: 4151,
            name: 'Abyssal whip',
            members: true,
            buyLimit: 70,
            examine: 'A weapon from the abyss.',
            value: 0,
          },
        })}
      />,
    );
    expect(screen.getByText('0 gp')).toBeInTheDocument();
  });
});
