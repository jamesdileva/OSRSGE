import type { MarketTop10Request, MarketTop10Response, OsrsApi } from '../../shared/ipc.js';

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
  if (api?.market == null) {
    throw new Error('Desktop bridge unavailable');
  }
  return api.market.fetchTop10(request);
}
