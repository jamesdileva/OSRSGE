import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Dashboard from '../../src/pages/Dashboard.tsx';
import type { Opportunity } from '../../core/market/ranking/types.js';

afterEach(() => {
  cleanup();
  window.osrsApi = undefined;
  vi.restoreAllMocks();
});

function makeOpportunity(
  id: number,
  name: string,
  overrides: Partial<Opportunity> = {},
): Opportunity {
  return {
    rank: 0,
    item: {
      id,
      name,
      members: id % 2 === 0,
      buyLimit: null,
      examine: '',
      value: null,
    },
    currentPrice: 1000 + id,
    changes: { oneHour: 1, sixHour: 2, twentyFourHour: 3 },
    spread: { gp: 50, percent: 2 },
    components: { momentum: 50, liquidity: 60, spread: 40, profitability: 30, consistency: 70, volatility: 20 },
    risk: 'LOW',
    confidence: 0.9,
    baseScore: 50,
    finalScore: 50,
    ...overrides,
  };
}

function rows(): HTMLElement[] {
  const table = screen.getByRole('table', { name: 'Top 10 opportunities' });
  return within(table).getAllByRole('row').slice(1);
}

describe('Sprint 9 slice-2 instant filter view (props path, zero IPC)', () => {
  it('renders the filter bar with no filtering by default', () => {
    render(
      <Dashboard
        status="success"
        opportunities={[makeOpportunity(1, 'Free item'), makeOpportunity(2, 'Members item')]}
        itemsAnalyzed={2}
      />,
    );
    expect(screen.getByRole('group', { name: 'Opportunity filters' })).toBeInTheDocument();
    expect(rows()).toHaveLength(2);
  });

  it('membership filter narrows the table instantly with no IPC', () => {
    const fetchTop10 = vi.fn();
    window.osrsApi = {
      app: { getVersion: vi.fn() },
      market: { fetchTop10, fetchHistory: vi.fn() },
    };
    render(
      <Dashboard
        status="success"
        opportunities={[makeOpportunity(1, 'Free item'), makeOpportunity(2, 'Members item')]}
        itemsAnalyzed={2}
      />,
    );
    fireEvent.change(screen.getByLabelText('Membership'), { target: { value: 'f2p' } });
    expect(rows()).toHaveLength(1);
    expect(screen.getByText('Free item')).toBeInTheDocument();
    expect(fetchTop10).not.toHaveBeenCalled();
  });

  it('risk checkbox filters instantly and unchecking all passes everything', () => {
    render(
      <Dashboard
        status="success"
        opportunities={[
          makeOpportunity(1, 'Safe', { risk: 'LOW' }),
          makeOpportunity(2, 'Wild', { risk: 'HIGH' }),
        ]}
        itemsAnalyzed={2}
      />,
    );
    fireEvent.click(screen.getByLabelText('Risk HIGH'));
    expect(rows()).toHaveLength(1);
    expect(screen.getByText('Safe')).toBeInTheDocument();
    // Uncheck LOW too — empty allowlist is pass-all by contract.
    fireEvent.click(screen.getByLabelText('Risk LOW'));
    fireEvent.click(screen.getByLabelText('Risk MEDIUM'));
    expect(rows()).toHaveLength(2);
  });

  it('min price narrows instantly; clearing max price means unbounded', () => {
    render(
      <Dashboard
        status="success"
        opportunities={[
          makeOpportunity(1, 'Cheap', { currentPrice: 100 }),
          makeOpportunity(2, 'Pricy', { currentPrice: 5000 }),
        ]}
        itemsAnalyzed={2}
      />,
    );
    fireEvent.change(screen.getByLabelText('Min price'), { target: { value: '1000' } });
    expect(rows()).toHaveLength(1);
    expect(screen.getByText('Pricy')).toBeInTheDocument();
    // Max price starts unbounded (Infinity); setting then clearing keeps all.
    fireEvent.change(screen.getByLabelText('Max price'), { target: { value: '50' } });
    expect(screen.queryByRole('table')).toBeNull();
    fireEvent.change(screen.getByLabelText('Max price'), { target: { value: '' } });
    expect(rows()).toHaveLength(1);
  });

  it('live path sends the Infinity-null wire baseline once and never refetches on edits', async () => {
    const fetchTop10 = vi.fn().mockResolvedValue({
      rankingVersion: '0.2-BALANCED-test',
      computedAt: 1700000000000,
      itemsAnalyzed: 2,
      opportunities: [
        makeOpportunity(1, 'Free item'),
        makeOpportunity(2, 'Members item'),
      ],
    });
    window.osrsApi = {
      app: { getVersion: vi.fn().mockResolvedValue('0.1.0-test') },
      market: { fetchTop10, fetchHistory: vi.fn().mockResolvedValue({ itemId: 1, window: '24h', points: [] }) },
    };
    render(<Dashboard />);
    await screen.findByRole('table', { name: 'Top 10 opportunities' });
    expect(fetchTop10).toHaveBeenCalledTimes(1);
    // Wire baseline: DEFAULT_FILTERS encodes maxPrice Infinity as null.
    expect(fetchTop10.mock.calls[0][0]).toMatchObject({ filters: { maxPrice: null } });
    fireEvent.change(screen.getByLabelText('Membership'), { target: { value: 'f2p' } });
    expect(rows()).toHaveLength(1);
    expect(fetchTop10).toHaveBeenCalledTimes(1);
  });
});
