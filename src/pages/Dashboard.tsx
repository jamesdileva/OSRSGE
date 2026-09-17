import { useEffect, useState } from 'react';
import type { JSX } from 'react';
import type { MarketSnapshot } from '../../core/market/normalization/normalizer.js';
import type { Opportunity } from '../../core/market/ranking/types.js';
import type { WatchlistEntry } from '../../core/watchlist/watchlist.js';
import { addToWatchlist as addToWatchlistPure, removeFromWatchlist as removeFromWatchlistPure } from '../../core/watchlist/watchlist.js';
import { buildWatchlistView } from '../../core/watchlist/watchlistView.js';
import type { AlertRule, AlertRuleDraft } from '../../core/alerts/alertRules.js';
import {
  addAlertRule as addAlertRulePure,
  evaluateAlerts,
  removeAlertRule as removeAlertRulePure,
  setAlertRuleEnabled as setAlertRuleEnabledPure,
} from '../../core/alerts/alertRules.js';
import { DEFAULT_FILTERS, applyFilters, encodeFiltersForIpc } from '../../core/market/ranking/filters.js';
import type { OpportunityFilters } from '../../core/market/ranking/filters.js';
import { calcFlip } from '../../core/market/flips/flipCalculator.js';
import type { FlipInput, FlipResult } from '../../core/market/flips/flipCalculator.js';
import { assessDataQuality } from '../../core/market/quality/qualityAssessment.js';
import type { QualityAssessment } from '../../core/market/quality/qualityAssessment.js';
import { MAX_LOG_ENTRIES, summarizeLog } from '../../core/diagnostics/appLog.js';
import type { AppLogEvent, LogSummary } from '../../core/diagnostics/appLog.js';
import MarketSummary from '../components/dashboard/MarketSummary.tsx';
import FilterBar from '../components/dashboard/FilterBar.tsx';
import ItemDetailsPanel from '../components/dashboard/ItemDetailsPanel.tsx';
import PriceChart from '../components/dashboard/PriceChart.tsx';
import TopOpportunityTable from '../components/dashboard/TopOpportunityTable.tsx';
import WatchlistPanel from '../components/dashboard/WatchlistPanel.tsx';
import AlertsPanel from '../components/dashboard/AlertsPanel.tsx';
import FlipCalculatorPanel from '../components/dashboard/FlipCalculatorPanel.tsx';
import DataQualityPanel from '../components/dashboard/DataQualityPanel.tsx';
import LogViewerPanel from '../components/dashboard/LogViewerPanel.tsx';
import { buildDashboardViewModel } from '../components/dashboard/dashboardViewModel.ts';
import { addAlertRuleRequest, addWatchedItem, assessQualityRequest, calculateFlipRequest, fetchAlertRules, fetchLogRecent, fetchLogSummary, fetchTop10, fetchWatchlist, fetchAppVersion, fetchItemHistory, getDesktopApi, isDesktopBridgeAvailable, removeAlertRuleRequest, removeWatchedItem, setAlertRuleEnabledRequest } from '../services/electronApi.ts';
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
  /**
   * Sprint 11 slice-2 part 2b: optional props-path watchlist. When defined,
   * the Dashboard renders it directly (offline-pure, zero IPC) and reports
   * add/remove via onAddWatch/onRemoveWatch. When undefined, the Dashboard
   * fetches via fetchWatchlist (bridge) and persists via
   * addWatchedItem/removeWatchedItem, falling back to an in-memory list in
   * bridge-absent browser mode.
   */
  watchlist?: WatchlistEntry[];
  onAddWatch?: (itemId: number) => void;
  onRemoveWatch?: (itemId: number) => void;
  /**
   * Sprint 12 slice-2 part 3: optional props-path alert rules. When defined,
   * the Dashboard renders them directly (offline-pure, zero IPC, evaluated
   * renderer-side via evaluateAlerts) and reports add/remove/toggle via the
   * callbacks. When undefined, the Dashboard fetches via fetchAlertRules and
   * persists via add/remove/setEnabled round-trips, falling back to an
   * in-memory list in bridge-absent browser mode. Delivery is in-app only
   * (no scheduler hook, no OS notification — roadmap §14).
   */
  alertRules?: AlertRule[];
  onAddAlert?: (draft: AlertRuleDraft) => void;
  onRemoveAlert?: (id: string) => void;
  onToggleAlert?: (id: string, enabled: boolean) => void;
}

export default function Dashboard({
  status: statusProp,
  opportunities = [],
  itemsAnalyzed = 0,
  lastUpdated,
  error: errorProp = null,
  selectedItemId = null,
  onSelectItem,
  watchlist: watchlistProp,
  onAddWatch,
  onRemoveWatch,
  alertRules: alertRulesProp,
  onAddAlert,
  onRemoveAlert,
  onToggleAlert,
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
  // Sprint 9 slice-2: instant view filters. Client-side only — edits call
  // setFilters synchronously and re-render via applyFilters below; the
  // effect deps stay [statusProp]/[effectiveSelectedItemId] so filter edits
  // never trigger IPC refetches or scheduler work.
  const [filters, setFilters] = useState<OpportunityFilters>({});
  // Sprint 8 slice-2: stub-first item history for the selected row.
  const [historyPoints, setHistoryPoints] = useState<MarketSnapshot[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  // Sprint 11 slice-2 part 2b: watchlist entries. Props path (watchlistProp
  // defined) renders directly with zero IPC; live path fetches via the
  // bridge once and persists add/remove round-trips; bridge-absent mode
  // keeps an in-memory list via the pure store helpers (IDs only).
  const [liveWatchlist, setLiveWatchlist] = useState<WatchlistEntry[] | null>(null);
  const [watchlistError, setWatchlistError] = useState<string | null>(null);
  const effectiveWatchlist = watchlistProp ?? liveWatchlist ?? [];
  // Sprint 12 slice-2 part 3: alert rules. Props path renders directly with
  // zero IPC; live path fetches via the bridge once and persists add/remove/
  // toggle round-trips; bridge-absent mode keeps an in-memory list via the
  // pure store helpers. Evaluation is renderer-side (evaluateAlerts below).
  const [liveAlertRules, setLiveAlertRules] = useState<AlertRule[] | null>(null);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  const effectiveAlertRules = alertRulesProp ?? liveAlertRules ?? [];
  // Sprint 13 slice-2: flip result. The Dashboard owns calculation — bridge
  // calculateFlip when the preload has the flips surface, pure calcFlip
  // fallback otherwise (stale-preload/browser-mode precedent). No market
  // data is fetched; the panel supplies observed prices.
  const [flipResult, setFlipResult] = useState<FlipResult | null>(null);
  const [flipError, setFlipError] = useState<string | null>(null);
  // Sprint 16 slice-2: quality verdict. The Dashboard owns assessment —
  // bridge assessQuality when the preload has the quality surface, pure
  // assessDataQuality fallback otherwise (S13 flip precedent). Input is the
  // history batch already held (no fetch); empty when nothing is loaded.
  const [qualityAssessment, setQualityAssessment] = useState<QualityAssessment | null>(null);
  const [qualityError, setQualityError] = useState<string | null>(null);
  // S20 slice-4: log-viewer reads. The Dashboard owns reading — bridge
  // fetchLogRecent/fetchLogSummary with empty-read fallback otherwise
  // (S19 slice-3b null-logger precedent). Manual refresh only: no auto-poll
  // on mount, no scheduler-notify subscription (minimal scope, D#1102).
  const [logEvents, setLogEvents] = useState<AppLogEvent[] | null>(null);
  const [logSummary, setLogSummary] = useState<LogSummary | null>(null);
  const [logError, setLogError] = useState<string | null>(null);
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
  // Sprint 9 slice-2 instant view: post-rank view filter applied
  // client-side BEFORE the view-model sorts+ranks, so the displayed Top-10
  // is the filtered view ranked 1..k. (The pure applyFilters preserves gaps
  // on already-ranked arrays; the Dashboard re-ranks the filtered view for
  // display — isCandidate stays the pre-rank gate upstream.)
  const filteredOpportunities = applyFilters(effectiveOpportunities, filters);
  const viewModel = buildDashboardViewModel({
    opportunities: filteredOpportunities,
    itemsAnalyzed: effectiveItemsAnalyzed,
    lastUpdated: effectiveLastUpdated,
  });

  const selectedOpportunity = viewModel.top10.find(
    (opportunity) => opportunity.item.id === effectiveSelectedItemId,
  ) ?? null;
  // Watchlist view: store order (first-watch-wins), unknown/stale ids as
  // null rows. Derived from the UNFILTERED effective list so a watched item
  // hidden by a filter still shows in the watchlist.
  const watchlistRows = buildWatchlistView(effectiveWatchlist, effectiveOpportunities);
  // Sprint 12 slice-2 part 3: in-app alert evaluation. Renderer-side via the
  // pure evaluateAlerts over the UNFILTERED effective list (a rule on an item
  // hidden by a view filter still fires); invalid stored rules are skipped
  // fail-closed by the evaluator. In-app only: no scheduler, no OS notify.
  const firedAlerts = evaluateAlerts(effectiveAlertRules, effectiveOpportunities, Date.now());
  const isSelectedWatched =
    effectiveSelectedItemId !== null && effectiveWatchlist.some((entry) => entry.itemId === effectiveSelectedItemId);

  const handleAddWatch = (itemId: number): void => {
    if (watchlistProp !== undefined) {
      onAddWatch?.(itemId);
      return;
    }
    if (getDesktopApi()?.watchlist == null) {
      setLiveWatchlist((prev) => addToWatchlistPure(prev ?? [], itemId, Date.now()));
      return;
    }
    addWatchedItem({ itemId })
      .then((response) => {
        setLiveWatchlist(response.entries);
        setWatchlistError(null);
      })
      .catch((err: unknown) => {
        setWatchlistError(err instanceof Error ? err.message : 'Unknown error');
      });
  };

  const handleRemoveWatch = (itemId: number): void => {
    if (watchlistProp !== undefined) {
      onRemoveWatch?.(itemId);
      return;
    }
    if (getDesktopApi()?.watchlist == null) {
      setLiveWatchlist((prev) => removeFromWatchlistPure(prev ?? [], itemId));
      return;
    }
    removeWatchedItem({ itemId })
      .then((response) => {
        setLiveWatchlist(response.entries);
        setWatchlistError(null);
      })
      .catch((err: unknown) => {
        setWatchlistError(err instanceof Error ? err.message : 'Unknown error');
      });
  };

  const handleAddAlert = (draft: AlertRuleDraft): void => {
    if (alertRulesProp !== undefined) {
      onAddAlert?.(draft);
      return;
    }
    if (getDesktopApi()?.alerts == null) {
      try {
        setLiveAlertRules((prev) => addAlertRulePure(prev ?? [], draft, Date.now()));
        setAlertsError(null);
      } catch (err: unknown) {
        setAlertsError(err instanceof Error ? err.message : 'Unknown error');
      }
      return;
    }
    addAlertRuleRequest({ draft })
      .then((response) => {
        setLiveAlertRules(response.rules);
        setAlertsError(null);
      })
      .catch((err: unknown) => {
        setAlertsError(err instanceof Error ? err.message : 'Unknown error');
      });
  };

  const handleRemoveAlert = (id: string): void => {
    if (alertRulesProp !== undefined) {
      onRemoveAlert?.(id);
      return;
    }
    if (getDesktopApi()?.alerts == null) {
      try {
        setLiveAlertRules((prev) => removeAlertRulePure(prev ?? [], id));
        setAlertsError(null);
      } catch (err: unknown) {
        setAlertsError(err instanceof Error ? err.message : 'Unknown error');
      }
      return;
    }
    removeAlertRuleRequest({ id })
      .then((response) => {
        setLiveAlertRules(response.rules);
        setAlertsError(null);
      })
      .catch((err: unknown) => {
        setAlertsError(err instanceof Error ? err.message : 'Unknown error');
      });
  };

  const handleToggleAlert = (id: string, enabled: boolean): void => {
    if (alertRulesProp !== undefined) {
      onToggleAlert?.(id, enabled);
      return;
    }
    if (getDesktopApi()?.alerts == null) {
      try {
        setLiveAlertRules((prev) => setAlertRuleEnabledPure(prev ?? [], id, enabled));
        setAlertsError(null);
      } catch (err: unknown) {
        setAlertsError(err instanceof Error ? err.message : 'Unknown error');
      }
      return;
    }
    setAlertRuleEnabledRequest({ id, enabled })
      .then((response) => {
        setLiveAlertRules(response.rules);
        setAlertsError(null);
      })
      .catch((err: unknown) => {
        setAlertsError(err instanceof Error ? err.message : 'Unknown error');
      });
  };

  const handleAssessQuality = (): void => {
    const input = { snapshots: historyPoints ?? [], nowMs: Date.now() };
    const api = getDesktopApi();
    if (api?.quality == null || typeof api.quality.assessQuality !== 'function') {
      try {
        setQualityAssessment(assessDataQuality(input));
        setQualityError(null);
      } catch (err: unknown) {
        setQualityAssessment(null);
        setQualityError(err instanceof Error ? err.message : 'Unknown error');
      }
      return;
    }
    assessQualityRequest({ input })
      .then((response) => {
        setQualityAssessment(response.assessment);
        setQualityError(null);
      })
      .catch((err: unknown) => {
        setQualityAssessment(null);
        setQualityError(err instanceof Error ? err.message : 'Unknown error');
      });
  };

  const handleRefreshLogs = (): void => {
    const api = getDesktopApi();
    if (api?.logs == null || typeof api.logs.getRecent !== 'function' || typeof api.logs.getSummary !== 'function') {
      setLogEvents([]);
      setLogSummary(summarizeLog([]));
      setLogError(null);
      return;
    }
    Promise.all([fetchLogRecent({ limit: MAX_LOG_ENTRIES }), fetchLogSummary()])
      .then(([recent, summaryResponse]) => {
        setLogEvents(recent.events);
        setLogSummary(summaryResponse.summary);
        setLogError(null);
      })
      .catch((err: unknown) => {
        setLogError(err instanceof Error ? err.message : 'Unknown error');
      });
  };

  const handleCalculateFlip = (input: FlipInput): void => {
    const api = getDesktopApi();
    if (api?.flips == null || typeof api.flips.calculateFlip !== 'function') {
      try {
        setFlipResult(calcFlip(input));
        setFlipError(null);
      } catch (err: unknown) {
        setFlipResult(null);
        setFlipError(err instanceof Error ? err.message : 'Unknown error');
      }
      return;
    }
    calculateFlipRequest({ input })
      .then((response) => {
        setFlipResult(response.result);
        setFlipError(null);
      })
      .catch((err: unknown) => {
        setFlipResult(null);
        setFlipError(err instanceof Error ? err.message : 'Unknown error');
      });
  };

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
    // Sprint 9 slice-2: the initial live fetch carries the pass-everything
    // baseline in wire form (DEFAULT_FILTERS encodes maxPrice Infinity as
    // null) to prove the null-safe round-trip. Later filter edits stay
    // client-side and never refetch (effect deps exclude `filters`).
    fetchTop10({ filters: encodeFiltersForIpc(DEFAULT_FILTERS) })
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

  // Sprint 11 slice-2 part 2b watchlist fetch: props path (watchlistProp
  // defined) never fetches; stale preloads (watchlist == null) and
  // bridge-absent mode skip silently with the in-memory list.
  useEffect(() => {
    if (watchlistProp !== undefined) {
      return;
    }
    if (getDesktopApi()?.watchlist == null) {
      return;
    }
    let cancelled = false;
    fetchWatchlist()
      .then((response) => {
        if (!cancelled) {
          setLiveWatchlist(response.entries);
          setWatchlistError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setWatchlistError(err instanceof Error ? err.message : 'Unknown error');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [watchlistProp]);

  // Sprint 12 slice-2 part 3 alerts fetch: props path (alertRulesProp
  // defined) never fetches; stale preloads (alerts == null) and
  // bridge-absent mode skip silently with the in-memory list.
  useEffect(() => {
    if (alertRulesProp !== undefined) {
      return;
    }
    if (getDesktopApi()?.alerts == null) {
      return;
    }
    let cancelled = false;
    fetchAlertRules()
      .then((response) => {
        if (!cancelled) {
          setLiveAlertRules(response.rules);
          setAlertsError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setAlertsError(err instanceof Error ? err.message : 'Unknown error');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [alertRulesProp]);

  return (
    <section aria-label="Market dashboard">
      <MarketSummary summary={viewModel.summary} />

      <h2>Top 10 Daily Opportunities</h2>
      {(status === 'idle' || status === 'success') && (
        <FilterBar filters={filters} onChange={setFilters} />
      )}
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
          {selectedOpportunity !== null && effectiveSelectedItemId !== null && (
            <button
              type="button"
              aria-label={isSelectedWatched ? `Unwatch ${effectiveSelectedItemId}` : `Watch ${effectiveSelectedItemId}`}
              onClick={() =>
                isSelectedWatched
                  ? handleRemoveWatch(effectiveSelectedItemId)
                  : handleAddWatch(effectiveSelectedItemId)
              }
            >
              {isSelectedWatched ? 'Unwatch' : 'Watch'}
            </button>
          )}
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
      {(status === 'idle' || status === 'success') && (
        <>
          <h2>Watchlist</h2>
          {watchlistError !== null && (
            <p className="notice notice-error">Watchlist unavailable: {watchlistError}</p>
          )}
          <WatchlistPanel
            rows={watchlistRows}
            selectedItemId={effectiveSelectedItemId}
            onSelectItem={handleSelectItem}
            onRemoveItem={handleRemoveWatch}
          />
        </>
      )}
      {(status === 'idle' || status === 'success') && (
        <>
          <h2>Alerts</h2>
          {alertsError !== null && (
            <p className="notice notice-error">Alerts unavailable: {alertsError}</p>
          )}
          <AlertsPanel
            rules={effectiveAlertRules}
            events={firedAlerts}
            selectedItemId={effectiveSelectedItemId}
            onAddRule={handleAddAlert}
            onRemoveRule={handleRemoveAlert}
            onToggleRule={handleToggleAlert}
          />
        </>
      )}
      {(status === 'idle' || status === 'success') && (
        <>
          <h2>Flip calculator</h2>
          <FlipCalculatorPanel result={flipResult} error={flipError} onCalculate={handleCalculateFlip} />
        </>
      )}
      {(status === 'idle' || status === 'success') && (
        <>
          <h2>Data quality</h2>
          <DataQualityPanel assessment={qualityAssessment} error={qualityError} onAssess={handleAssessQuality} />
        </>
      )}
      {(status === 'idle' || status === 'success') && (
        <>
          <h2>Application log</h2>
          <LogViewerPanel events={logEvents} summary={logSummary} error={logError} onRefresh={handleRefreshLogs} />
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
