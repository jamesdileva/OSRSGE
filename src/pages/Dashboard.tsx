import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import type { MarketSnapshot } from '../../core/market/normalization/normalizer.js';
import type { Opportunity } from '../../core/market/ranking/types.js';
import MarketSummary from '../components/dashboard/MarketSummary.tsx';
import ItemDetailsPanel from '../components/dashboard/ItemDetailsPanel.tsx';
import PriceChart from '../components/dashboard/PriceChart.tsx';
import TopOpportunityTable from '../components/dashboard/TopOpportunityTable.tsx';
import { buildDashboardViewModel } from '../components/dashboard/dashboardViewModel.ts';
import { fetchAppVersion, fetchItemHistory, fetchTop10, getDesktopApi, isDesktopBridgeAvailable } from '../services/electronApi.ts';
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
  // Sprint 8 slice-1: row-click selection. Controlled when selectedItemId
  // is passed, uncontrolled (internal state) otherwise so the live path
  // works with no props. onSelectItem is always notified. Review #54 fix:
  // only write internal state when uncontrolled (prop is null) so a stale
  // internal id cannot resurface after a controlled clear.
  const [internalSelectedItemId, setInternalSelectedItemId] = useState<number | null>(null);
  const effectiveSelectedItemId = selectedItemId ?? internalSelectedItemId;
  const handleSelectItem = (itemId: number): void => {
    if (selectedItemId == null) {
      setInternalSelectedItemId(itemId);
    }
    onSelectItem?.(itemId);
  };
  // Sprint 8 slice-2: stub-first item history for the selected row.
  const [historyPoints, setHistoryPoints] = useState<MarketSnapshot[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const bridgeAvailable = isDesktopBridgeAvailable();

  const status = statusProp ?? bridgeStatus;
  // Live Top-10 detail surfaces in the main error paragraph (review #43);
  // props path is unaffected (top10Error is always null when statusProp is
  // defined, bridgeError stays null because the effect returns early), and
  // the old-preload version-only path still falls back to props gracefully.
  // Review #54: history errors join the same chain (errorProp wins, then
  // history, then Top-10, then bridge) so a failed chart never masks props.
  const error = errorProp ?? historyError ?? top10Error ?? bridgeError;
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

  const selectedOpportunity = viewModel.top10.find(
    (opportunity) => opportunity.item.id === effectiveSelectedItemId,
  ) ?? null;

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

  // Sprint 8 slice-2 history path: fetch stub points for the selected item.
  // Cancelled-flag + captured-id guard drops stale responses on rapid
  // reselect (review #54 condition 2); stale preloads (market == null) and
  // bridge-absent browser mode skip silently with history left null.
  useEffect(() => {
    if (effectiveSelectedItemId == null) {
      setHistoryPoints(null);
      setHistoryError(null);
      setHistoryLoading(false);
      return;
    }
    if (getDesktopApi()?.market == null) {
      setHistoryPoints(null);
      setHistoryError(null);
      setHistoryLoading(false);
      return;
    }
    const requestedId = effectiveSelectedItemId;
    let cancelled = false;
    setHistoryLoading(true);
    setHistoryError(null);
    fetchItemHistory({ itemId: requestedId, window: '24h' })
      .then((response) => {
        if (!cancelled && response.itemId === requestedId) {
          setHistoryPoints(response.points);
          setHistoryLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setHistoryError(err instanceof Error ? err.message : 'Unknown error');
          setHistoryPoints(null);
          setHistoryLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [effectiveSelectedItemId]);

  return (
    <section aria-label="Market dashboard">
      <MarketSummary summary={viewModel.summary} />

      <h2>Top 10 Daily Opportunities</h2>
      {status === 'loading' && <p className="placeholder">Loading market data…</p>}
      {status === 'error' && <p className="notice notice-error">{error ?? 'Market data unavailable.'}</p>}
      {(status === 'idle' || status === 'success') && (
        <TopOpportunityTable
          opportunities={viewModel.top10}
          selectedItemId={effectiveSelectedItemId}
          onSelectItem={handleSelectItem}
        />
      )}
      {(status === 'idle' || status === 'success') && viewModel.top10.length > 0 && (
        <>
          <h2>Item details</h2>
          <ItemDetailsPanel opportunity={selectedOpportunity} />
          {selectedOpportunity !== null && (
            <>
              <h3>Price history (24h)</h3>
              {historyLoading && <p className="placeholder">Loading price history…</p>}
              {!historyLoading && historyError !== null && (
                <p className="notice notice-error">History unavailable: {historyError}</p>
              )}
              {!historyLoading && historyError === null && historyPoints !== null && (
                <PriceChart points={historyPoints} itemName={selectedOpportunity.item.name} windowLabel="24h" />
              )}
              {!historyLoading && historyError === null && historyPoints === null && (
                <p className="placeholder">Price history unavailable — launch via Electron to load the chart feed.</p>
              )}
            </>
          )}
        </>
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
