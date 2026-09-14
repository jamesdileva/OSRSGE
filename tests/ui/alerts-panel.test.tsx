import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AlertsPanel from '../../src/components/dashboard/AlertsPanel.tsx';
import Dashboard from '../../src/pages/Dashboard.tsx';
import type { AlertRule } from '../../core/alerts/alertRules.js';
import type { Opportunity } from '../../core/market/ranking/types.js';

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
    changes: { oneHour: 1, sixHour: 2, twentyFourHour: 6 },
    spread: { gp: 50, percent: 2 },
    components: { momentum: 50, liquidity: 60, spread: 40, profitability: 30, consistency: 70, volatility: 20 },
    risk: 'LOW',
    confidence: 0.9,
    baseScore: finalScore,
    finalScore,
  };
}

function makeRule(id: string, overrides: Partial<AlertRule> = {}): AlertRule {
  return {
    id,
    itemId: null,
    kind: 'finalScore',
    threshold: 80,
    enabled: true,
    createdAt: T0,
    ...overrides,
  };
}

describe('Sprint 12 slice-2 part 3 alerts UI (in-app only)', () => {
  it('panel empty states render with no table (offline-pure)', () => {
    render(<AlertsPanel rules={[]} events={[]} />);
    expect(screen.getByText(/No alerts firing/)).toBeInTheDocument();
    expect(screen.getByText(/No alert rules yet/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('panel renders rules with toggle/remove actions and fired events', () => {
    const onToggleRule = vi.fn();
    const onRemoveRule = vi.fn();
    render(
      <AlertsPanel
        rules={[makeRule('whip-score'), makeRule('off-rule', { enabled: false })]}
        events={[{ ruleId: 'whip-score', itemId: 4151, metricValue: 90, threshold: 80, triggeredAt: T0 }]}
        onToggleRule={onToggleRule}
        onRemoveRule={onRemoveRule}
      />,
    );
    expect(screen.getByText(/whip-score: item #4151/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Disable whip-score'));
    expect(onToggleRule).toHaveBeenCalledWith('whip-score', false);
    fireEvent.click(screen.getByLabelText('Enable off-rule'));
    expect(onToggleRule).toHaveBeenCalledWith('off-rule', true);
    fireEvent.click(screen.getByLabelText('Remove whip-score'));
    expect(onRemoveRule).toHaveBeenCalledWith('whip-score');
  });

  it('panel add-form reports a draft (no IPC)', () => {
    const onAddRule = vi.fn();
    render(<AlertsPanel rules={[]} events={[]} selectedItemId={4151} onAddRule={onAddRule} />);
    fireEvent.change(screen.getByLabelText('Threshold'), { target: { value: '85' } });
    fireEvent.click(screen.getByText('Add alert'));
    expect(onAddRule).toHaveBeenCalledTimes(1);
    const draft = onAddRule.mock.calls[0]?.[0] as { kind: string; threshold: number; itemId: number | null };
    expect(draft.kind).toBe('finalScore');
    expect(draft.threshold).toBe(85);
    expect(draft.itemId).toBeNull();
  });

  it('panel add-form with this-item-only scopes to the selected item', () => {
    const onAddRule = vi.fn();
    render(<AlertsPanel rules={[]} events={[]} selectedItemId={4151} onAddRule={onAddRule} />);
    fireEvent.click(screen.getByLabelText('This item only'));
    fireEvent.click(screen.getByText('Add alert'));
    const draft = onAddRule.mock.calls[0]?.[0] as { itemId: number | null };
    expect(draft.itemId).toBe(4151);
  });

  it('dashboard props path evaluates alerts renderer-side with zero IPC', () => {
    const fetchTop10 = vi.fn();
    window.osrsApi = {
      app: { getVersion: vi.fn() },
      market: { fetchTop10, fetchHistory: vi.fn() },
    };
    const onRemoveAlert = vi.fn();
    const onToggleAlert = vi.fn();
    render(
      <Dashboard
        status="success"
        opportunities={[makeOpportunity(4151, 'Abyssal whip', 90)]}
        itemsAnalyzed={1}
        alertRules={[makeRule('whip-score')]}
        onAddAlert={vi.fn()}
        onRemoveAlert={onRemoveAlert}
        onToggleAlert={onToggleAlert}
      />,
    );
    // Renderer-side evaluation fired the rule in-app (no scheduler, no OS notify).
    expect(screen.getByText(/whip-score: item #4151/)).toBeInTheDocument();
    expect(fetchTop10).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('Disable whip-score'));
    expect(onToggleAlert).toHaveBeenCalledWith('whip-score', false);
    fireEvent.click(screen.getByLabelText('Remove whip-score'));
    expect(onRemoveAlert).toHaveBeenCalledWith('whip-score');
  });

  it('dashboard props path stays silent for disabled rules and unmet thresholds', () => {
    window.osrsApi = undefined;
    render(
      <Dashboard
        status="success"
        opportunities={[makeOpportunity(4151, 'Abyssal whip', 90)]}
        itemsAnalyzed={1}
        alertRules={[
          makeRule('disabled', { enabled: false }),
          makeRule('too-high', { threshold: 99 }),
        ]}
        onAddAlert={vi.fn()}
        onRemoveAlert={vi.fn()}
        onToggleAlert={vi.fn()}
      />,
    );
    expect(screen.getByText(/No alerts firing/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Fired alerts/)).toBeNull();
  });

  it('dashboard live path fetches rules once and persists add/toggle via the bridge', async () => {
    const getAlerts = vi.fn().mockResolvedValue({ rules: [makeRule('whip-score')] });
    const addAlertRule = vi
      .fn()
      .mockResolvedValue({ rules: [makeRule('whip-score'), makeRule('ore-change', { kind: 'change24h', threshold: 5 })] });
    const setAlertRuleEnabled = vi.fn().mockResolvedValue({ rules: [makeRule('whip-score', { enabled: false })] });
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
      alerts: {
        getAlerts,
        addAlertRule,
        removeAlertRule: vi.fn().mockResolvedValue({ rules: [] }),
        setAlertRuleEnabled,
      },
    };
    render(<Dashboard />);
    const rulesTable = await screen.findByRole('table', { name: 'Alert rules' });
    expect(within(rulesTable).getByText('Any item: finalScore > 80')).toBeInTheDocument();
    expect(within(rulesTable).getByLabelText('Disable whip-score')).toBeInTheDocument();
    expect(getAlerts).toHaveBeenCalledTimes(1);
    // Fired in-app from the live stub Top-10 (90 > 80).
    expect(await screen.findByText(/whip-score: item #4151/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Disable whip-score'));
    expect(setAlertRuleEnabled).toHaveBeenCalledWith({ id: 'whip-score', enabled: false });
  });
});
