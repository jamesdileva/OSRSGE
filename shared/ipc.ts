/**
 * Shared IPC contract — the single source of truth for main ↔ preload ↔ renderer.
 * Both the Electron main process and the React renderer import channel names
 * and bridge types from here so they can never drift apart.
 */
import type { Opportunity } from '../core/market/ranking/types.js';

/** Sprint 1 smoke channel: proves the preload bridge round-trips. */
export const APP_GET_VERSION = 'app:getVersion';

/** Sprint 7 slice-2: stub-feed Top-10 channel (no scheduler, no live pipeline). */
export const MARKET_GET_TOP10 = 'market:getTop10';

/** Minimal app bridge exposed to the renderer. Grows in later sprints (market, settings, history). */
export interface OsrsApiApp {
  getVersion(): Promise<string>;
}

/**
 * Sprint 7 slice-2 stub-feed Top-10 contract (D#163 scope guardrail):
 * main returns a STUB/fixture payload, never a live provider+scorer+history
 * pipeline (S10 scheduler territory). Renderer validates the stub against the
 * Opportunity contract before trusting it.
 */
export interface MarketTop10Request {
  limit?: number;
}

export interface MarketTop10Response {
  rankingVersion: string;
  computedAt: number;
  itemsAnalyzed: number;
  opportunities: Opportunity[];
}

export interface OsrsApiMarket {
  fetchTop10(request?: MarketTop10Request): Promise<MarketTop10Response>;
}

export interface OsrsApi {
  app: OsrsApiApp;
  /**
   * Optional until the main/preload stub lands (agent-b, task #7).
   * Renderer treats a missing market as "old preload" and falls back to
   * the props path so Sprint 1 bridge tests stay green.
   */
  market?: OsrsApiMarket;
}
