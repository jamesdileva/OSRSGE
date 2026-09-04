import { describe, expect, it } from 'vitest';
import { APP_USER_AGENT } from '../../shared/constants.js';
import type { FetchFn } from '../../core/market/providers/httpClient.js';
import { HttpError, requestJson } from '../../core/market/providers/httpClient.js';

interface SeenRequest {
  url: string;
  userAgent: string | null;
}

function recordingStub(
  respond: (url: string, call: number) => Response | Promise<Response>,
): { fetchFn: FetchFn; seen: SeenRequest[]; calls: () => number } {
  const seen: SeenRequest[] = [];
  const fetchFn: FetchFn = (input, init) => {
    const headers = new Headers(init?.headers);
    seen.push({ url: String(input), userAgent: headers.get('user-agent') });
    return Promise.resolve(respond(String(input), seen.length));
  };
  return { fetchFn, seen, calls: () => seen.length };
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('httpClient', () => {
  it('sends the descriptive Wiki User-Agent', async () => {
    const { fetchFn, seen } = recordingStub(() => jsonResponse(200, { ok: true }));

    await requestJson('https://example.test/x', fetchFn, { retries: 0 });

    expect(seen).toHaveLength(1);
    expect(seen[0]?.userAgent).toBe(APP_USER_AGENT);
  });

  it('retries once on HTTP 500, then returns the recovered body', async () => {
    const bodies = [null, { data: {} }];
    const { fetchFn, calls } = recordingStub((_url, call) =>
      call === 1 ? jsonResponse(500, 'boom') : jsonResponse(200, bodies[call - 1]),
    );

    const result = await requestJson('https://example.test/x', fetchFn);

    expect(result).toEqual({ data: {} });
    expect(calls()).toBe(2);
  });

  it('throws a non-retryable HttpError on 404 without retrying', async () => {
    const { fetchFn, calls } = recordingStub(() => jsonResponse(404, 'nope'));

    await expect(requestJson('https://example.test/x', fetchFn, { retries: 3 })).rejects.toMatchObject({
      status: 404,
      retryable: false,
    } satisfies Partial<HttpError>);
    expect(calls()).toBe(1);
  });

  it('recovers when the first attempt fails with a network error', async () => {
    let attempts = 0;
    const fetchFn: FetchFn = () => {
      attempts += 1;
      if (attempts === 1) {
        return Promise.reject(new Error('socket hangup'));
      }
      return Promise.resolve(jsonResponse(200, { ok: true }));
    };

    await expect(requestJson('https://example.test/x', fetchFn)).resolves.toEqual({ ok: true });
    expect(attempts).toBe(2);
  });

  it('throws a retryable HttpError once retries are exhausted', async () => {
    const fetchFn: FetchFn = () => Promise.reject(new Error('down'));

    await expect(requestJson('https://example.test/x', fetchFn, { retries: 0 })).rejects.toMatchObject({
      retryable: true,
    } satisfies Partial<HttpError>);
  });
});
