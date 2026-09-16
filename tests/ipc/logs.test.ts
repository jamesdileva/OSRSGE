import { afterEach, describe, expect, it, vi } from 'vitest';
import { LOG_GET_RECENT, LOG_GET_SUMMARY } from '../../shared/ipc.ts';
import { registerLogsHandlers } from '../../electron/ipc/logs.handlers.ts';
import { createAppLogger } from '../../electron/services/appLogger.js';
import { createLoggingRefresh } from '../../electron/services/scheduler.js';
import { fetchLogRecent, fetchLogSummary } from '../../src/services/electronApi.ts';

function mockIpc(): {
  handlers: Map<string, (event: unknown, ...args: unknown[]) => unknown>;
  ipcMain: { handle: (channel: string, listener: (event: unknown, ...args: unknown[]) => unknown) => void };
} {
  const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
  return {
    handlers,
    ipcMain: {
      handle: (channel, listener) => {
        handlers.set(channel, listener);
      },
    },
  };
}

const T0 = 1_786_000_000_000;
function stubNow(start: number = T0): () => number {
  let t = start;
  return () => t++;
}

afterEach(() => {
  window.osrsApi = undefined;
  vi.restoreAllMocks();
});

describe('S19 slice-3b read-only log IPC (offline-pure)', () => {
  it('exposes stable log channels', () => {
    expect(LOG_GET_RECENT).toBe('logs:getRecent');
    expect(LOG_GET_SUMMARY).toBe('logs:getSummary');
  });

  it('returns recent events verbatim with newest-N limit slicing', async () => {
    const logger = createAppLogger({ now: stubNow() });
    await logger.log('info', 'startup', 'boot');
    await logger.log('error', 'api-failure', 'timeout');
    await logger.log('info', 'scheduler', 'tick');
    const { handlers, ipcMain } = mockIpc();
    registerLogsHandlers(ipcMain, { getLogger: () => logger });
    const getRecent = handlers.get(LOG_GET_RECENT);
    expect(getRecent).toBeTypeOf('function');
    const all = (await getRecent?.(undefined, undefined)) as { events: { message: string }[] };
    expect(all.events.map((e) => e.message)).toEqual(['boot', 'timeout', 'tick']);
    const limited = (await getRecent?.(undefined, { limit: 2 })) as { events: { message: string }[] };
    expect(limited.events.map((e) => e.message)).toEqual(['timeout', 'tick']);
    // Oversized limit returns the full ring; fresh array per call.
    const over = (await getRecent?.(undefined, { limit: 99 })) as { events: unknown[] };
    expect(over.events).toHaveLength(3);
  });

  it('fails closed on invalid limits', async () => {
    const logger = createAppLogger({ now: stubNow() });
    await logger.log('info', 'startup', 'boot');
    const { handlers, ipcMain } = mockIpc();
    registerLogsHandlers(ipcMain, { getLogger: () => logger });
    const getRecent = handlers.get(LOG_GET_RECENT);
    await expect(getRecent?.(undefined, { limit: 0 })).rejects.toThrow('Invalid log limit');
    await expect(getRecent?.(undefined, { limit: 1.5 })).rejects.toThrow('Invalid log limit');
    await expect(getRecent?.(undefined, { limit: -2 })).rejects.toThrow('Invalid log limit');
    await expect(getRecent?.(undefined, { limit: Number.NaN })).rejects.toThrow('Invalid log limit');
  });

  it('returns the summary verbatim (counts + last error)', async () => {
    const logger = createAppLogger({ now: stubNow() });
    await logger.log('info', 'startup', 'boot');
    await logger.log('error', 'api-failure', 'timeout');
    const { handlers, ipcMain } = mockIpc();
    registerLogsHandlers(ipcMain, { getLogger: () => logger });
    const getSummary = handlers.get(LOG_GET_SUMMARY);
    const response = (await getSummary?.(undefined)) as {
      summary: { total: number; byLevel: { error: number }; lastError: { message: string } | null };
    };
    expect(response.summary.total).toBe(2);
    expect(response.summary.byLevel.error).toBe(1);
    expect(response.summary.lastError?.message).toBe('timeout');
  });

  it('returns empty reads when the logger is not yet initialized (never throws)', async () => {
    const { handlers, ipcMain } = mockIpc();
    registerLogsHandlers(ipcMain, { getLogger: () => null });
    const recent = (await handlers.get(LOG_GET_RECENT)?.(undefined, undefined)) as { events: unknown[] };
    expect(recent.events).toEqual([]);
    const summary = (await handlers.get(LOG_GET_SUMMARY)?.(undefined)) as {
      summary: { total: number; lastError: null; lastEventMs: null };
    };
    expect(summary.summary.total).toBe(0);
    expect(summary.summary.lastError).toBeNull();
    expect(summary.summary.lastEventMs).toBeNull();
  });

  it('resolves the logger lazily per request (no stale capture)', async () => {
    const a = createAppLogger({ now: stubNow() });
    await a.log('info', 'startup', 'from-a');
    const b = createAppLogger({ now: stubNow() });
    await b.log('info', 'startup', 'from-b');
    let current: typeof a | null = a;
    const { handlers, ipcMain } = mockIpc();
    registerLogsHandlers(ipcMain, { getLogger: () => current });
    const getRecent = handlers.get(LOG_GET_RECENT);
    const first = (await getRecent?.(undefined, undefined)) as { events: { message: string }[] };
    expect(first.events.map((e) => e.message)).toEqual(['from-a']);
    current = b;
    const second = (await getRecent?.(undefined, undefined)) as { events: { message: string }[] };
    expect(second.events.map((e) => e.message)).toEqual(['from-b']);
  });

  it('lazy refresh supplier sees the swapped logger (review #195 nit 2)', async () => {
    const a = createAppLogger({ now: stubNow() });
    const b = createAppLogger({ now: stubNow() });
    let current: typeof a | null = a;
    const refresh = createLoggingRefresh(() => current, async () => undefined);
    await refresh();
    expect(a.getRecent()).toHaveLength(1);
    expect(b.getRecent()).toHaveLength(0);
    current = b;
    await refresh();
    expect(a.getRecent()).toHaveLength(1);
    expect(b.getRecent()).toHaveLength(1);
  });

  it('stub refresh logs explicit stub semantics (review #195 nit 1)', async () => {
    const logger = createAppLogger({ now: stubNow() });
    await createLoggingRefresh(logger)();
    expect(logger.getRecent()[0]?.message).toBe('refresh succeeded (stub, no pipeline)');
    await createLoggingRefresh(logger, async () => undefined)();
    expect(logger.getRecent()[1]?.message).toBe('refresh succeeded');
  });

  it('renderer bridge helpers throw when the bridge is absent or stale', async () => {
    window.osrsApi = undefined;
    await expect(fetchLogRecent()).rejects.toThrow('Desktop bridge unavailable');
    await expect(fetchLogSummary()).rejects.toThrow('Desktop bridge unavailable');

    window.osrsApi = {
      app: { getVersion: vi.fn() },
      market: { fetchTop10: vi.fn(), fetchHistory: vi.fn() },
    };
    await expect(fetchLogRecent()).rejects.toThrow('Desktop bridge unavailable');
    await expect(fetchLogSummary()).rejects.toThrow('Desktop bridge unavailable');
  });

  it('renderer bridge helpers delegate to the preload surface', async () => {
    const getRecent = vi.fn().mockResolvedValue({ events: [] });
    const getSummary = vi.fn().mockResolvedValue({
      summary: {
        total: 0,
        byLevel: { info: 0, warn: 0, error: 0 },
        byCategory: {
          startup: 0,
          'api-refresh': 0,
          'api-failure': 0,
          snapshots: 0,
          ranking: 0,
          storage: 0,
          scheduler: 0,
        },
        lastError: null,
        lastEventMs: null,
      },
    });
    window.osrsApi = {
      app: { getVersion: vi.fn() },
      market: { fetchTop10: vi.fn(), fetchHistory: vi.fn() },
      logs: { getRecent, getSummary },
    };
    await fetchLogRecent({ limit: 5 });
    expect(getRecent).toHaveBeenCalledWith({ limit: 5 });
    await fetchLogSummary();
    expect(getSummary).toHaveBeenCalledWith();
  });
});
