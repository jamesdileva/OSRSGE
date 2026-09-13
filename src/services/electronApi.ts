import type {
  MarketHistoryRequest,
  MarketHistoryResponse,
  MarketRefreshUpdate,
  MarketTop10Request,
  MarketTop10Response,
  OsrsApi,
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
