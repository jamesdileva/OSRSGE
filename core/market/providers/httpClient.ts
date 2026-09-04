import {
  APP_USER_AGENT,
  HTTP_MAX_RETRIES,
  HTTP_RETRY_DELAY_MS,
  HTTP_TIMEOUT_MS,
} from '../../../shared/constants.js';

/**
 * Centralized HTTP layer (implementation guide §11).
 * All external network access goes through `requestJson` — nothing else
 * in the codebase may call `fetch` directly.
 */

export type FetchFn = typeof fetch;

export interface RequestOptions {
  timeoutMs?: number;
  retries?: number;
}

export class HttpError extends Error {
  readonly status: number | undefined;
  readonly retryable: boolean;

  constructor(message: string, opts: { status?: number; retryable: boolean }) {
    super(message);
    this.name = 'HttpError';
    this.status = opts.status;
    this.retryable = opts.retryable;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * GET `url` and parse the body as JSON.
 * Retries timeouts, network errors, and retryable statuses with linear backoff.
 * Never retries 4xx (except 429). Throws HttpError when all attempts fail.
 */
export async function requestJson(
  url: string,
  fetchFn: FetchFn = fetch,
  opts: RequestOptions = {},
): Promise<unknown> {
  const timeoutMs = opts.timeoutMs ?? HTTP_TIMEOUT_MS;
  const maxRetries = opts.retries ?? HTTP_MAX_RETRIES;

  let attempt = 0;
  for (;;) {
    let response: Response;
    try {
      response = await fetchFn(url, {
        headers: { 'User-Agent': APP_USER_AGENT },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err: unknown) {
      if (attempt < maxRetries) {
        attempt += 1;
        await sleep(HTTP_RETRY_DELAY_MS * attempt);
        continue;
      }
      throw new HttpError(
        `Request failed (attempt ${attempt + 1}): ${err instanceof Error ? err.message : 'network error'}`,
        { retryable: true },
      );
    }

    if (response.ok) {
      return (await response.json()) as unknown;
    }
    if (isRetryableStatus(response.status) && attempt < maxRetries) {
      attempt += 1;
      await sleep(HTTP_RETRY_DELAY_MS * attempt);
      continue;
    }
    throw new HttpError(`Request failed: HTTP ${response.status} for ${url}`, {
      status: response.status,
      retryable: isRetryableStatus(response.status),
    });
  }
}
