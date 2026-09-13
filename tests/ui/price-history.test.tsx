import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Dashboard from '../../src/pages/Dashboard.tsx';
import PriceChart from '../../src/components/dashboard/PriceChart.tsx';
import { MARKET_GET_HISTORY } from '../../shared/ipc.ts';
import type { MarketHistoryResponse } from '../../shared/ipc.ts';
import { registerMarketHandlers } from '../../electron/ipc/market.handlers.ts';
import { getStubHistoryResponse } from '../../electron/ipc/marketStub.ts';
import { fetchItemHistory } from '../../src/services/electronApi.ts';
import type { MarketSnapshot } from '../../core/market/normalization/normalizer.ts';
import type { Opportunity } from '../../core/market/ranking/types.js';

afterEach(() => {
  cleanup();
  window.osrsApi = undefined;
  vi.restoreAllMocks();
});

function makeOpportunity(id: number, finalScore: number): Opportunity {
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
  };
}

function makePoints(itemId: number, prices: number[]): MarketSnapshot[] {
  const now = 1700000000000;
  return prices.map((p, i) => ({
    itemId,
    timestamp: now + i * 3_600_000,
    high: p + 10,
    low: p - 10,
  }));
}

function historyResponse(itemId: number, prices: number[]): MarketHistoryResponse {
  return { itemId, window: '24h', points: makePoints(itemId, prices) };
}

describe('Sprint 8 slice-2 price history (stub-first IPC + pure chart)', () => {
  it('exposes a stable market:getHistory channel', () => {
    expect(MARKET_GET_HISTORY).toBe('market:getHistory');
  });

  it('stub history reuses the MarketSnapshot point shape with an explicit window', () => {
    const res24 = getStubHistoryResponse({ itemId: 4151, window: '24h' });
    const res7d = getStubHistoryResponse({ itemId: 4151, window: '7d' });
    expect(res24.itemId).toBe(4151);
    expect(res24.window).toBe('24h');
    expect(res24.points.length).toBeGreaterThanOrEqual(2);
    expect(res7d.points.length).toBeGreaterThanOrEqual(2);
    for (const p of res24.points) {
      expect(p.itemId).toBe(4151);
      expect(Number.isFinite(p.timestamp)).toBe(true);
      expect(p.high ?? p.low).toBeDefined();
    }
    // Oldest-first ordering.
    for (let i = 1; i < res24.points.length; i += 1) {
      expect(res24.points[i]!.timestamp).toBeGreaterThan(res24.points[i - 1]!.timestamp);
    }
  });

  it('registers market:getHistory and forwards the request', async () => {
    const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
    let received: unknown;
    registerMarketHandlers(
      { handle: (channel, listener) => { handlers.set(channel, listener); } },
      {
        getTop10: () => ({ rankingVersion: 'x', computedAt: 1, itemsAnalyzed: 0, opportunities: [] }),
        getHistory: (request) => {
          received = request;
          return getStubHistoryResponse(request);
        },
      },
    );
    const listener = handlers.get(MARKET_GET_HISTORY);
    expect(listener).toBeTypeOf('function');
    const response = (await listener?.(undefined, { itemId: 7, window: '24h' })) as MarketHistoryResponse;
    expect(received).toEqual({ itemId: 7, window: '24h' });
    expect(response.itemId).toBe(7);
    expect(response.points.length).toBeGreaterThan(0);
  });

  it('fetchItemHistory throws when the bridge is absent (browser fallback)', async () => {
    await expect(fetchItemHistory({ itemId: 1, window: '24h' })).rejects.toThrow('Desktop bridge unavailable');
  });

  it('fetchItemHistory throws on a stale preload without the market surface', async () => {
    window.osrsApi = { app: { getVersion: vi.fn() } } as unknown as NonNullable<typeof window.osrsApi>;
    await expect(fetchItemHistory({ itemId: 1, window: '24h' })).rejects.toThrow('Desktop bridge unavailable');
  });

  it('fetchItemHistory throws a friendly error on a fetchTop10-only stale preload', async () => {
    window.osrsApi = {
      app: { getVersion: vi.fn() },
      market: { fetchTop10: vi.fn() },
    } as unknown as NonNullable<typeof window.osrsApi>;
    await expect(fetchItemHistory({ itemId: 1, window: '24h' })).rejects.toThrow('Desktop bridge unavailable');
  });

  it('PriceChart is pure: renders an SVG slope with no bridge', () => {
    render(<PriceChart points={makePoints(1, [100, 110, 130])} itemName="Item 1" windowLabel="24h" />);
    expect(screen.getByRole('img', { name: /Price history for Item 1 \(24h\)/ })).toBeInTheDocument();
    expect(document.querySelector('polyline')).not.toBeNull();
  });

  it('PriceChart empty state on too few points', () => {
    render(<PriceChart points={[]} />);
    expect(screen.getByText(/Not enough history/)).toBeInTheDocument();
  });

  it('Dashboard shows the chart after row-click via the stub feed', async () => {
    const fetchHistory = vi.fn((request: { itemId: number }) =>
      Promise.resolve(historyResponse(request.itemId, [100, 110, 120, 130])),
    );
    window.osrsApi = {
      app: { getVersion: vi.fn() },
      market: { fetchTop10: vi.fn(), fetchHistory },
    };
    render(
      <Dashboard
        status="success"
        opportunities={[makeOpportunity(1, 10), makeOpportunity(2, 90)]}
        itemsAnalyzed={2}
      />,
    );
    fireEvent.click(screen.getByText('Item 2'));
    expect(await screen.findByRole('img', { name: /Price history for Item 2/ })).toBeInTheDocument();
    expect(fetchHistory).toHaveBeenCalledWith({ itemId: 2, window: '24h' });
  });

  it('rapid reselect keeps only the latest history (stale-response guard)', async () => {
    let resolveFirst!: (v: MarketHistoryResponse) => void;
    let resolveSecond!: (v: MarketHistoryResponse) => void;
    const fetchHistory = vi.fn((request: { itemId: number }) => {
      if (request.itemId === 1) {
        return new Promise<MarketHistoryResponse>((resolve) => { resolveFirst = resolve; });
      }
      return new Promise<MarketHistoryResponse>((resolve) => { resolveSecond = resolve; });
    });
    window.osrsApi = {
      app: { getVersion: vi.fn() },
      market: { fetchTop10: vi.fn(), fetchHistory },
    };
    render(
      <Dashboard
        status="success"
        opportunities={[makeOpportunity(1, 10), makeOpportunity(2, 90)]}
        itemsAnalyzed={2}
      />,
    );
    fireEvent.click(screen.getByText('Item 1'));
    fireEvent.click(screen.getByText('Item 2'));
    // Stale first response arrives last — it must not clobber item 2.
    resolveSecond(historyResponse(2, [200, 210, 220]));
    await screen.findByRole('img', { name: /Price history for Item 2/ });
    resolveFirst(historyResponse(1, [100, 101, 102]));
    await new Promise((r) => { setTimeout(r, 10); });
    expect(screen.getByRole('img', { name: /Price history for Item 2/ })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /Price history for Item 1/ })).toBeNull();
  });

  it('history failure surfaces a notice; errorProp wins the precedence chain', async () => {
    window.osrsApi = {
      app: { getVersion: vi.fn() },
      market: {
        fetchTop10: vi.fn(),
        fetchHistory: vi.fn().mockRejectedValue(new Error('history-timeout')),
      },
    };
    const { rerender } = render(
      <Dashboard
        status="success"
        opportunities={[makeOpportunity(1, 10)]}
        itemsAnalyzed={1}
        selectedItemId={1}
      />,
    );
    expect(await screen.findByText(/History unavailable: history-timeout/)).toBeInTheDocument();
    rerender(
      <Dashboard
        status="error"
        opportunities={[makeOpportunity(1, 10)]}
        itemsAnalyzed={1}
        selectedItemId={1}
        error="props-boom"
      />,
    );
    expect(screen.getByText('props-boom')).toBeInTheDocument();
  });

  it('controlled clear drops details (no stale internal id resurfaces)', () => {
    const { rerender } = render(
      <Dashboard
        status="success"
        opportunities={[makeOpportunity(1, 10), makeOpportunity(2, 90)]}
        itemsAnalyzed={2}
        selectedItemId={1}
        onSelectItem={() => {}}
      />,
    );
    expect(screen.getByRole('region', { name: 'Details for Item 1' })).toBeInTheDocument();
    rerender(
      <Dashboard
        status="success"
        opportunities={[makeOpportunity(1, 10), makeOpportunity(2, 90)]}
        itemsAnalyzed={2}
        selectedItemId={null}
        onSelectItem={() => {}}
      />,
    );
    expect(screen.getByText(/Select an item to see details/)).toBeInTheDocument();
  });

  it('keyboard Enter on a row selects the item', () => {
    const onSelectItem = vi.fn();
    render(
      <Dashboard
        status="success"
        opportunities={[makeOpportunity(1, 10), makeOpportunity(2, 90)]}
        itemsAnalyzed={2}
        onSelectItem={onSelectItem}
      />,
    );
    const table = screen.getByRole('table', { name: 'Top 10 opportunities' });
    const row = within(table).getByText('Item 1').closest('tr')!;
    fireEvent.keyDown(row, { key: 'Enter' });
    expect(onSelectItem).toHaveBeenCalledWith(1);
  });
});
