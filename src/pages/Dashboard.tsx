import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import type { Opportunity } from '../../core/market/ranking/types.js';
import MarketSummary from '../components/dashboard/MarketSummary.tsx';
import TopOpportunityTable from '../components/dashboard/TopOpportunityTable.tsx';
import { buildDashboardViewModel } from '../components/dashboard/dashboardViewModel.ts';
import { fetchAppVersion, fetchTop10, getDesktopApi, isDesktopBridgeAvailable } from '../services/electronApi.ts';
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
  // Sprint 7 slice-2 live state: stub-feed Top-10 (D#163 — no scheduler).
  const [liveOpportunities, setLiveOpportunities] = useState<Opportunity[] | null>(null);
  const [liveItemsAnalyzed, setLiveItemsAnalyzed] = useState<number | null>(null);
  const [liveComputedAt, setLiveComputedAt] = useState<number | undefined>(undefined);
  const [top10Error, setTop10Error] = useState<string | null>(null);
  const bridgeAvailable = isDesktopBridgeAvailable();

  const status = statusProp ?? bridgeStatus;
  const error = errorProp ?? (statusProp !== undefined ? bridgeError : null);
  // Props path is preserved for browser-mode + existing tests; the live path
  // overrides only when the bridge delivers a stub feed with no statusProp.
  const effectiveOpportunities = liveOpportunities ?? opportunities;
  const effectiveItemsAnalyzed = liveItemsAnalyzed ?? itemsAnalyzed;
  const effectiveLastUpdated = liveComputedAt ?? lastUpdated;
  const viewModel = buildDashboardViewModel({
    opportunities: effectiveOpportunities,
    itemsAnalyzed: effectiveItemsAnalyzed,
    lastUpdated: effectiveLastUpdated,
  });

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
          // Don't clobber a live Top-10 result that already arrived; only
          // leave loading when no live data and no Top-10 error is pending.
          setBridgeStatus((prev) => (prev === 'loading' ? 'success' : prev));
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setBridgeError(err instanceof Error ? err.message : 'Unknown error');
          setBridgeStatus('error');
        }
      });
    // Live Top-10 path (D#163): bridge available AND no statusProp. Missing
    // market surface = old preload — skip silently so Sprint 1 version-only
    // tests and browser-mode fallback keep working.
    if (getDesktopApi()?.market == null) {
      return () => {
        cancelled = true;
      };
    }
    fetchTop10()
      .then((response) => {
        if (!cancelled) {
          setLiveOpportunities(response.opportunities);
          setLiveItemsAnalyzed(response.itemsAnalyzed);
          setLiveComputedAt(response.computedAt);
          setBridgeStatus('success');
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setTop10Error(err instanceof Error ? err.message : 'Unknown error');
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
        <p className="notice notice-error">IPC failed: {top10Error ?? bridgeError}</p>
      )}
    </section>
  );
}
