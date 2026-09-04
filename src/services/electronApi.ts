import type { OsrsApi } from '../../shared/ipc.js';

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
