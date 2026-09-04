/**
 * Shared constants — network policy and external service endpoints.
 * Single source of truth so the provider, scripts, and (later) the
 * scheduler can never disagree about where data comes from.
 */

/** OSRS Wiki Prices API v2 (verified against live docs 2026-09-04). */
export const WIKI_API_BASE_URL = 'https://prices.runescape.wiki/api/v2/osrs';

/**
 * Descriptive User-Agent, as required by the Wiki acceptable-use policy.
 * Generic agents (curl, python-requests, …) are blocked upstream.
 */
export const APP_USER_AGENT = 'osrs-ge-analyzer/0.1.0 (+https://github.com/jamesdileva/OSRSGE)';

/** Per-request timeout in milliseconds. */
export const HTTP_TIMEOUT_MS = 10_000;

/** Retries on timeout / network error / HTTP 5xx (never on 4xx). */
export const HTTP_MAX_RETRIES = 1;

/** Base delay between retries in milliseconds (linear backoff). */
export const HTTP_RETRY_DELAY_MS = 1_000;
