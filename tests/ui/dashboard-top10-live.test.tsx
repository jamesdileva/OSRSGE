import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Dashboard from '../../src/pages/Dashboard.tsx';
import type { MarketTop10Response, OsrsApi } from '../../shared/ipc.ts';
import { MARKET_GET_TOP10 } from '../../shared/ipc.ts';
import type { Opportunity } from '../../core/market/ranking/types.js';

afterEach(() => {
  cleanup();
  window.osrsApi = undefined;
  vi.restoreAllMocks();
});

function makeOpportunity(id: number, finalScore: number): Opportunity {
  return {
    rank: 0,
    item: { id, name: `Live Item ${id}`, members: false, buyLimit: null, examine: '', value: null },
    currentPrice: 2000 + id,
    changes: { oneHour: 1, sixHour: 2, twentyFourHour: 3 },
    spread: { gp: 60, percent: 2.5 },
    components: { momentum: 55, liquidity: 65, spread: 45, profitability: 35, consistency: 75, volatility: 25 },
    risk: id % 3 === 0 ? 'HIGH' : id % 3 === 1 ? 'LOW' : 'MEDIUM',
    confidence: 0.85,
    baseScore: finalScore,
    finalScore,
  };
}

/** Sprint 7 slice-2 stub feed (D#163): main returns a fixture, never a live pipeline. */
function makeStubResponse(): MarketTop10Response {
  return {
    rankingVersion: '0.2-BALANCED-test',
    computedAt: 1700000000000,
    itemsAnalyzed: 3,
    opportunities: [makeOpportunity(1, 10), makeOpportunity(2, 90), makeOpportunity(3, 50)],
  };
}

function isValidOpportunity(o: Opportunity): boolean {
  return (
    Number.isFinite(o.currentPrice) &&
    (o.risk === 'LOW' || o.risk === 'MEDIUM' || o.risk === 'HIGH') &&
    Number.isFinite(o.confidence) &&
    o.confidence >= 0 &&
    o.confidence <= 1 &&
    Number.isFinite(o.baseScore) &&
    Number.isFinite(o.finalScore) &&
    Number.isInteger(o.item.id) &&
    typeof o.item.name === 'string'
  );
}

describe('Sprint 7 slice-2 dashboard live Top-10 (stub-feed IPC)', () => {
  it('uses the stub-feed channel contract', () => {
    expect(MARKET_GET_TOP10).toBe('market:getTop10');
  });

  it('stub payload validates against the Opportunity contract (D#163 disconfirming check)', () => {
    const stub = makeStubResponse();
    expect(typeof stub.rankingVersion).toBe('string');
    expect(Number.isFinite(stub.computedAt)).toBe(true);
    expect(stub.opportunities.length).toBeGreaterThan(0);
    for (const o of stub.opportunities) {
      expect(isValidOpportunity(o)).toBe(true);
    }
  });

  it('renders the live Top-10 from the mocked bridge feed when no statusProp', async () => {
    const stub = makeStubResponse();
    const fetchTop10 = vi.fn().mockResolvedValue(stub);
    window.osrsApi = { app: { getVersion: vi.fn().mockResolvedValue('0.1.0-test') }, market: { fetchTop10 } };
    render(<Dashboard />);

    const table = await screen.findByRole('table', { name: 'Top 10 opportunities' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    // Sorted by finalScore desc via the shared view-model.
    expect(within(rows[0]).getByText('Live Item 2')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Live Item 3')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Live Item 1')).toBeInTheDocument();
    expect(fetchTop10).toHaveBeenCalledTimes(1);
  });

  it('surfaces Top-10 IPC failures instead of failing silently', async () => {
    window.osrsApi = {
      app: { getVersion: vi.fn().mockResolvedValue('0.1.0-test') },
      market: { fetchTop10: vi.fn().mockRejectedValue(new Error('top10-timeout')) },
    };
    render(<Dashboard />);

    // Review #43: the Top-10 detail surfaces in the main error paragraph
    // (not just the generic fallback) plus the footer line.
    const errors = await screen.findAllByText(/top10-timeout/);
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });

  it('preserves the props path when statusProp is defined (no live fetch)', () => {
    const fetchTop10 = vi.fn().mockResolvedValue(makeStubResponse());
    window.osrsApi = { app: { getVersion: vi.fn() }, market: { fetchTop10 } };
    render(<Dashboard status="success" opportunities={[makeOpportunity(7, 42)]} itemsAnalyzed={1} />);

    expect(screen.getByText('Live Item 7')).toBeInTheDocument();
    expect(fetchTop10).not.toHaveBeenCalled();
  });

  it('falls back to the version-only path when the market surface is missing (old preload)', async () => {
    // Old-preload shape by design — cast keeps the runtime fallback covered
    // now that OsrsApi.market is required.
    window.osrsApi = { app: { getVersion: vi.fn().mockResolvedValue('0.1.0-test') } } as unknown as OsrsApi;
    render(<Dashboard />);

    expect(await screen.findByText(/IPC round-trip OK/)).toBeInTheDocument();
  });
});
