/**
 * Shared IPC contract — the single source of truth for main ↔ preload ↔ renderer.
 * Both the Electron main process and the React renderer import channel names
 * and bridge types from here so they can never drift apart.
 */
import type { Opportunity } from '../core/market/ranking/types.js';
import type { OpportunityFiltersWire } from '../core/market/ranking/filters.js';
import type { MarketSnapshot } from '../core/market/normalization/normalizer.js';
import type { WatchlistEntry } from '../core/watchlist/watchlist.js';
import type { AlertRule, AlertRuleDraft } from '../core/alerts/alertRules.js';

/** Sprint 1 smoke channel: proves the preload bridge round-trips. */
export const APP_GET_VERSION = 'app:getVersion';

/** Sprint 7 slice-2: stub-feed Top-10 channel (no scheduler, no live pipeline). */
export const MARKET_GET_TOP10 = 'market:getTop10';

/** Sprint 8 slice-2: stub-first item history channel (no live provider yet). */
export const MARKET_GET_HISTORY = 'market:getHistory';

/**
 * Sprint 10 slice-2: manual-refresh trigger (renderer invoke → main runs
 * one scheduler refresh now, bypassing the due check) and schedule-update
 * push (main → renderer after every refresh). Payload is schedule state
 * only — no market data rides this channel (stub-only data, D#163).
 */
export const MARKET_REFRESH_NOW = 'market:refreshNow';
export const MARKET_REFRESH_UPDATED = 'market:refreshUpdated';

/**
 * Sprint 11 slice-2: watchlist persistence channels (roadmap §13).
 * Main owns the JSON repository (S11 slice-1); the renderer never touches
 * files directly. Payloads carry ID-only entries — price/change/spread/
 * risk resolve at view time via buildWatchlistView (never persisted).
 */
export const WATCHLIST_GET = 'watchlist:get';
export const WATCHLIST_ADD = 'watchlist:add';
export const WATCHLIST_REMOVE = 'watchlist:remove';

/**
 * Sprint 12 slice-2 part 2: alert-rule persistence channels (roadmap §14).
 * Main owns the JSON repository (part 1); the renderer never touches
 * files directly. Responses return the full updated rule list
 * ({ rules }) so the renderer stays in sync with a single round-trip
 * (no separate re-fetch after add/remove/toggle — S11 watchlist precedent).
 * Evaluation stays renderer-side via evaluateAlerts; no OS notification.
 */
export const ALERTS_GET = 'alerts:get';
export const ALERTS_ADD = 'alerts:add';
export const ALERTS_REMOVE = 'alerts:remove';
export const ALERTS_SET_ENABLED = 'alerts:setEnabled';

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
  /**
   * Sprint 9 slice-2: optional IPC-safe view filters (wire form —
   * `maxPrice: null` means unbounded/Infinity). Main applies them as a
   * post-rank view filter over the stub fixture; the renderer also applies
   * the domain form instantly client-side, so this param proves the
   * null-safe round-trip without triggering refetches (no scheduler).
   */
  filters?: OpportunityFiltersWire;
}

export interface MarketTop10Response {
  rankingVersion: string;
  computedAt: number;
  itemsAnalyzed: number;
  opportunities: Opportunity[];
}

export interface OsrsApiMarket {
  fetchTop10(request?: MarketTop10Request): Promise<MarketTop10Response>;
  /**
   * Sprint 8 slice-2 stub-first history (D#163 scope guardrail): main
   * returns a fixture of MarketSnapshot points — never a live
   * provider/history pipeline. Window is an explicit union (no free-form
   * strings); points reuse the MarketSnapshot shape (no parallel types).
   */
  fetchHistory(request: MarketHistoryRequest): Promise<MarketHistoryResponse>;
  /**
   * Sprint 10 slice-2 manual refresh: invokes one scheduler refresh now
   * (single-flight shared with timer ticks) and resolves with the fresh
   * schedule snapshot. Stub-only data — never a live pipeline. Optional
   * so a stale preload predating slice-2 still typechecks; the renderer
   * keeps a runtime `typeof !== 'function'` guard (S7/S8 precedent).
   */
  triggerRefreshNow?: () => Promise<MarketRefreshUpdate>;
  /**
   * Sprint 10 slice-2 push subscription: listener fires after every
   * scheduler refresh with the fresh schedule snapshot. Returns an
   * unsubscribe function; the renderer owns cleanup. Optional for the
   * same stale-preload reason as triggerRefreshNow.
   */
  onRefreshUpdated?: (listener: (update: MarketRefreshUpdate) => void) => () => void;
}

/**
 * Sprint 8 slice-2 history window — explicit union so main/preload/
 * renderer can never drift (review #54 condition 1).
 */
export type HistoryWindow = '24h' | '7d';

export interface MarketHistoryRequest {
  itemId: number;
  window: HistoryWindow;
}

export interface MarketHistoryResponse {
  itemId: number;
  window: HistoryWindow;
  /** Price points, oldest first; reuses the Sprint 3 MarketSnapshot shape. */
  points: MarketSnapshot[];
}

/**
 * Sprint 10 slice-2 schedule snapshot: pushed after every refresh and
 * returned by the manual-refresh trigger. Schedule state only — the
 * renderer re-fetches Top-10 itself when it cares about data.
 */
export interface MarketRefreshUpdate {
  nextRunAt: number;
  consecutiveFailures: number;
  lastRunAt?: number;
  lastSuccessAt?: number;
}

/**
 * Sprint 11 slice-2 watchlist IPC contract. Responses return the full
 * updated entry list ({ entries }) so the renderer stays in sync with a
 * single round-trip (no separate re-fetch after add/remove).
 */
export interface WatchlistGetResponse {
  entries: WatchlistEntry[];
}

export interface WatchlistAddRequest {
  itemId: number;
}

export interface WatchlistRemoveRequest {
  itemId: number;
}

export interface OsrsApiWatchlist {
  getWatchlist(): Promise<WatchlistGetResponse>;
  addToWatchlist(request: WatchlistAddRequest): Promise<WatchlistGetResponse>;
  removeFromWatchlist(request: WatchlistRemoveRequest): Promise<WatchlistGetResponse>;
}

/**
 * Sprint 12 slice-2 part 2 alert-rule IPC contract. Add carries a draft
 * (createdAt stamped main-side from the injected clock); remove/toggle
 * carry the rule id. All responses return the full updated rule list.
 */
export interface AlertsGetResponse {
  rules: AlertRule[];
}

export interface AlertsAddRequest {
  draft: AlertRuleDraft;
}

export interface AlertsRemoveRequest {
  id: string;
}

export interface AlertsSetEnabledRequest {
  id: string;
  enabled: boolean;
}

export interface OsrsApiAlerts {
  getAlerts(): Promise<AlertsGetResponse>;
  addAlertRule(request: AlertsAddRequest): Promise<AlertsGetResponse>;
  removeAlertRule(request: AlertsRemoveRequest): Promise<AlertsGetResponse>;
  setAlertRuleEnabled(request: AlertsSetEnabledRequest): Promise<AlertsGetResponse>;
}

export interface OsrsApi {
  app: OsrsApiApp;
  /**
   * Required since the slice-2 main/preload stub landed (agent-b 7317cfa,
   * review #43). Renderer keeps a runtime old-preload guard
   * (`getDesktopApi()?.market == null`) so a stale preload without the
   * market surface still falls back to the props path.
   */
  market: OsrsApiMarket;
  /**
   * Sprint 11 slice-2 watchlist surface. Optional so a stale preload
   * predating slice-2 still typechecks; the renderer keeps a runtime
   * `typeof !== 'function'` guard (S7/S8/S10 precedent).
   */
  watchlist?: OsrsApiWatchlist;
  /**
   * Sprint 12 slice-2 part 2 alert-rule surface. Optional so a stale
   * preload predating slice-2 still typechecks; the renderer keeps a
   * runtime `typeof !== 'function'` guard (S7/S8/S10/S11 precedent).
   */
  alerts?: OsrsApiAlerts;
}
