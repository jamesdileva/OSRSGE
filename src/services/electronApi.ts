import type {
  AlertsAddRequest,
  AlertsGetResponse,
  AlertsRemoveRequest,
  AlertsSetEnabledRequest,
  FlipCalculateRequest,
  FlipCalculateResponse,
  LogRecentRequest,
  LogRecentResponse,
  LogSummaryResponse,
  MarketHistoryRequest,
  MarketHistoryResponse,
  MarketRefreshUpdate,
  MarketTop10Request,
  MarketTop10Response,
  OsrsApi,
  QualityAssessRequest,
  QualityAssessResponse,
  WatchlistAddRequest,
  WatchlistGetResponse,
  WatchlistRemoveRequest,
} from '../../shared/ipc.js';

/**
 * Sole access point to the preload bridge. Components never touch
 * `window.osrsApi` directly so bridge-absent (browser dev) mode is handled
 * in exactly one place.
 */
export function getDesktopApi(): OsrsApi | null {
  if (typeof window === 'undefined' || typeof window.osrsApi === 'undefined') {
    return null;
  }
  return window.osrsApi;
}

export function isDesktopBridgeAvailable(): boolean {
  return getDesktopApi() !== null;
}

export async function fetchAppVersion(): Promise<string> {
  const api = getDesktopApi();
  if (api === null) {
    throw new Error('Desktop bridge unavailable');
  }
  return api.app.getVersion();
}

/**
 * Sprint 7 slice-2 live path: stub-feed Top-10 via the preload bridge.
 * Throws when the bridge is absent so the Dashboard can fall back to props
 * (browser dev mode stays working). The `market == null` runtime guard is
 * kept for stale preloads predating the required market surface.
 */
export async function fetchTop10(request?: MarketTop10Request): Promise<MarketTop10Response> {
  const api = getDesktopApi();
  if (api?.market == null || typeof api.market.fetchTop10 !== 'function') {
    throw new Error('Desktop bridge unavailable');
  }
  return api.market.fetchTop10(request);
}

/**
 * Sprint 8 slice-2: stub-first item history via the preload bridge.
 * Throws when the bridge (or the market surface on a stale preload) is
 * absent so the Dashboard can fall back to a history-unavailable notice.
 */
export async function fetchItemHistory(request: MarketHistoryRequest): Promise<MarketHistoryResponse> {
  const api = getDesktopApi();
  if (api?.market == null || typeof api.market.fetchHistory !== 'function') {
    throw new Error('Desktop bridge unavailable');
  }
  return api.market.fetchHistory(request);
}

/**
 * Sprint 10 slice-2 manual refresh: invokes one scheduler refresh now via
 * the preload bridge. Throws when the bridge (or the market surface on a
 * stale preload) is absent so callers can fall back. Stale-preload guard
 * mirrors fetchTop10/fetchItemHistory.
 */
export async function triggerManualRefresh(): Promise<MarketRefreshUpdate> {
  const api = getDesktopApi();
  if (api?.market == null || typeof api.market.triggerRefreshNow !== 'function') {
    throw new Error('Desktop bridge unavailable');
  }
  return api.market.triggerRefreshNow();
}

/**
 * Sprint 10 slice-2 push subscription: fires after every scheduler
 * refresh. Returns the preload unsubscribe for caller-owned cleanup.
 * Throws when the bridge is absent or stale.
 */
export function subscribeToRefreshUpdates(listener: (update: MarketRefreshUpdate) => void): () => void {
  const api = getDesktopApi();
  if (api?.market == null || typeof api.market.onRefreshUpdated !== 'function') {
    throw new Error('Desktop bridge unavailable');
  }
  return api.market.onRefreshUpdated(listener);
}

/**
 * Sprint 11 slice-2 watchlist persistence via the preload bridge.
 * Throws when the bridge is absent or the preload predates the watchlist
 * surface so callers can fall back (S7/S8/S10 stale-preload precedent).
 */
export async function fetchWatchlist(): Promise<WatchlistGetResponse> {
  const api = getDesktopApi();
  if (api?.watchlist == null || typeof api.watchlist.getWatchlist !== 'function') {
    throw new Error('Desktop bridge unavailable');
  }
  return api.watchlist.getWatchlist();
}

export async function addWatchedItem(request: WatchlistAddRequest): Promise<WatchlistGetResponse> {
  const api = getDesktopApi();
  if (api?.watchlist == null || typeof api.watchlist.addToWatchlist !== 'function') {
    throw new Error('Desktop bridge unavailable');
  }
  return api.watchlist.addToWatchlist(request);
}

export async function removeWatchedItem(request: WatchlistRemoveRequest): Promise<WatchlistGetResponse> {
  const api = getDesktopApi();
  if (api?.watchlist == null || typeof api.watchlist.removeFromWatchlist !== 'function') {
    throw new Error('Desktop bridge unavailable');
  }
  return api.watchlist.removeFromWatchlist(request);
}

/**
 * Sprint 12 slice-2 part 2 alert-rule persistence via the preload bridge.
 * Throws when the bridge is absent or the preload predates the alerts
 * surface so callers can fall back (S7/S8/S10/S11 stale-preload precedent).
 */
export async function fetchAlertRules(): Promise<AlertsGetResponse> {
  const api = getDesktopApi();
  if (api?.alerts == null || typeof api.alerts.getAlerts !== 'function') {
    throw new Error('Desktop bridge unavailable');
  }
  return api.alerts.getAlerts();
}

export async function addAlertRuleRequest(request: AlertsAddRequest): Promise<AlertsGetResponse> {
  const api = getDesktopApi();
  if (api?.alerts == null || typeof api.alerts.addAlertRule !== 'function') {
    throw new Error('Desktop bridge unavailable');
  }
  return api.alerts.addAlertRule(request);
}

export async function removeAlertRuleRequest(request: AlertsRemoveRequest): Promise<AlertsGetResponse> {
  const api = getDesktopApi();
  if (api?.alerts == null || typeof api.alerts.removeAlertRule !== 'function') {
    throw new Error('Desktop bridge unavailable');
  }
  return api.alerts.removeAlertRule(request);
}

export async function setAlertRuleEnabledRequest(
  request: AlertsSetEnabledRequest,
): Promise<AlertsGetResponse> {
  const api = getDesktopApi();
  if (api?.alerts == null || typeof api.alerts.setAlertRuleEnabled !== 'function') {
    throw new Error('Desktop bridge unavailable');
  }
  return api.alerts.setAlertRuleEnabled(request);
}

/**
 * Sprint 13 slice-2 flip calculation via the preload bridge.
 * Throws when the bridge is absent or the preload predates the flips
 * surface so callers can fall back to the pure calcFlip
 * (S7/S8/S10/S11/S12 stale-preload precedent).
 */
export async function calculateFlipRequest(request: FlipCalculateRequest): Promise<FlipCalculateResponse> {
  const api = getDesktopApi();
  if (api?.flips == null || typeof api.flips.calculateFlip !== 'function') {
    throw new Error('Desktop bridge unavailable');
  }
  return api.flips.calculateFlip(request);
}

/**
 * Sprint 16 slice-2 quality assessment via the preload bridge.
 * Throws when the bridge is absent or the preload predates the quality
 * surface so callers can fall back to the pure assessDataQuality
 * (S7/S8/S10/S11/S12/S13 stale-preload precedent).
 */
export async function assessQualityRequest(request: QualityAssessRequest): Promise<QualityAssessResponse> {
  const api = getDesktopApi();
  if (api?.quality == null || typeof api.quality.assessQuality !== 'function') {
    throw new Error('Desktop bridge unavailable');
  }
  return api.quality.assessQuality(request);
}

/**
 * Sprint 19 slice-3b log reads via the preload bridge.
 * Throws when the bridge is absent or the preload predates the logs
 * surface so callers fall back to a log-unavailable notice
 * (S7/S8/S10/S11/S12/S13/S16 stale-preload precedent). Read-only:
 * no writes, no clearing — the memory ring stays main-owned.
 */
export async function fetchLogRecent(request?: LogRecentRequest): Promise<LogRecentResponse> {
  const api = getDesktopApi();
  if (api?.logs == null || typeof api.logs.getRecent !== 'function') {
    throw new Error('Desktop bridge unavailable');
  }
  return api.logs.getRecent(request);
}

export async function fetchLogSummary(): Promise<LogSummaryResponse> {
  const api = getDesktopApi();
  if (api?.logs == null || typeof api.logs.getSummary !== 'function') {
    throw new Error('Desktop bridge unavailable');
  }
  return api.logs.getSummary();
}
