/**
 * Shared IPC contract — the single source of truth for main ↔ preload ↔ renderer.
 * Both the Electron main process and the React renderer import channel names
 * and bridge types from here so they can never drift apart.
 */

/** Sprint 1 smoke channel: proves the preload bridge round-trips. */
export const APP_GET_VERSION = 'app:getVersion';

/** Minimal app bridge exposed to the renderer. Grows in later sprints (market, settings, history). */
export interface OsrsApiApp {
  getVersion(): Promise<string>;
}

export interface OsrsApi {
  app: OsrsApiApp;
}
