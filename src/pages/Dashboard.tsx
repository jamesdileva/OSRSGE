import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import type { Opportunity } from '../../core/market/ranking/types.js';
import MarketSummary from '../components/dashboard/MarketSummary.tsx';
import TopOpportunityTable from '../components/dashboard/TopOpportunityTable.tsx';
import { buildDashboardViewModel } from '../components/dashboard/dashboardViewModel.ts';
import { fetchAppVersion, isDesktopBridgeAvailable } from '../services/electronApi.ts';
import '../styles/dashboard.css';

/** UI state model per implementation guide §35. */
export type DashboardStatus = 'idle' | 'loading' | 'success' | 'error';

export interface DashboardProps {
  status?: DashboardStatus;
  opportunities?: Opportunity[];
  itemsAnalyzed?: number;
  lastUpdated?: number;
  error?: string | null;
  selectedItemId?: number | null;
  onSelectItem?: (itemId: number) => void;
}

export default function Dashboard({
  status: statusProp,
  opportunities = [],
  itemsAnalyzed = 0,
  lastUpdated,
  error: errorProp = null,
  selectedItemId = null,
  onSelectItem,
}: DashboardProps): JSX.Element {
  const [bridgeStatus, setBridgeStatus] = useState<DashboardStatus>(() =>
    statusProp ?? (isDesktopBridgeAvailable() ? 'loading' : 'idle'),
  );
  const [version, setVersion] = useState<string | null>(null);
  const [bridgeError, setBridgeError] = useState<string | null>(null);
  const bridgeAvailable = isDesktopBridgeAvailable();

  const status = statusProp ?? 'idle';
  const error = errorProp ?? (statusProp !== undefined ? bridgeError : null);
  const viewModel = buildDashboardViewModel({ opportunities, itemsAnalyzed, lastUpdated });

  useEffect(() => {
    if (statusProp !== undefined) {
      return;
    }
    if (!isDesktopBridgeAvailable()) {
      return;
    }
    let cancelled = false;
    fetchAppVersion()
      .then((v) => {
        if (!cancelled) {
          setVersion(v);
          setBridgeStatus('success');
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setBridgeError(err instanceof Error ? err.message : 'Unknown error');
          setBridgeStatus('error');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [statusProp]);

  return (
    <section aria-label="Market dashboard">
      <MarketSummary summary={viewModel.summary} />

      <h2>Top 10 Daily Opportunities</h2>
      {status === 'loading' && <p className="placeholder">Loading market data…</p>}
      {status === 'error' && <p className="notice notice-error">{error ?? 'Market data unavailable.'}</p>}
      {(status === 'idle' || status === 'success') && (
        <TopOpportunityTable
          opportunities={viewModel.top10}
          selectedItemId={selectedItemId}
          onSelectItem={onSelectItem}
        />
      )}

      <h2>Desktop bridge</h2>
      {!bridgeAvailable && statusProp === undefined && (
        <p className="notice">Desktop bridge unavailable — running in browser dev mode. Launch via Electron to test IPC.</p>
      )}
      {bridgeAvailable && statusProp === undefined && bridgeStatus === 'loading' && (
        <p className="notice">Contacting desktop shell…</p>
      )}
      {bridgeAvailable && statusProp === undefined && bridgeStatus === 'success' && (
        <p className="notice notice-ok">
          IPC round-trip OK — app version: <strong>{version}</strong>
        </p>
      )}
      {bridgeAvailable && statusProp === undefined && bridgeStatus === 'error' && (
        <p className="notice notice-error">IPC failed: {bridgeError}</p>
      )}
    </section>
  );
}
