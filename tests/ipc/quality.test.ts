import { afterEach, describe, expect, it, vi } from 'vitest';
import { QUALITY_ASSESS } from '../../shared/ipc.ts';
import { registerQualityHandlers } from '../../electron/ipc/quality.handlers.ts';
import { assessQualityRequest } from '../../src/services/electronApi.ts';

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

afterEach(() => {
  window.osrsApi = undefined;
  vi.restoreAllMocks();
});

describe('Sprint 16 slice-2 quality IPC (stateless assessDataQuality, offline-pure)', () => {
  it('exposes a stable quality channel', () => {
    expect(QUALITY_ASSESS).toBe('quality:assess');
  });

  it('assesses via the pure orchestrator and preserves verdict semantics', async () => {
    const NOW = 1_788_500_000_000;
    const { handlers, ipcMain } = mockIpc();
    registerQualityHandlers(ipcMain);
    const assess = handlers.get(QUALITY_ASSESS);
    expect(assess).toBeTypeOf('function');
    const fresh = (await assess?.(undefined, {
      input: { snapshots: [{ itemId: 1, timestamp: NOW, high: 100, low: 90 }], nowMs: NOW },
    })) as { assessment: { freshnessScore: number; stale: boolean; impossibleCount: number } };
    expect(fresh.assessment.freshnessScore).toBe(1);
    expect(fresh.assessment.stale).toBe(false);
    expect(fresh.assessment.impossibleCount).toBe(0);
    const staleDup = (await assess?.(undefined, {
      input: {
        snapshots: [{ itemId: 1, timestamp: NOW - 3_600_000, high: 90, low: 100 }],
        nowMs: NOW,
        existingTimestamps: [NOW - 3_600_000],
        candidateTimestamp: NOW - 3_600_000,
        totalRecords: 10,
        invalidRecords: 6,
        excluded: 0,
      },
    })) as {
      assessment: { stale: boolean; impossibleCount: number; duplicateBatch: boolean; health: { status: string } };
    };
    expect(staleDup.assessment.stale).toBe(true);
    expect(staleDup.assessment.impossibleCount).toBe(1);
    expect(staleDup.assessment.duplicateBatch).toBe(true);
    expect(staleDup.assessment.health.status).toBe('DOWN');
  });

  it('fails closed on invalid inputs and absent requests (no TypeError)', async () => {
    const { handlers, ipcMain } = mockIpc();
    registerQualityHandlers(ipcMain);
    const assess = handlers.get(QUALITY_ASSESS);
    await expect(
      assess?.(undefined, { input: { snapshots: [{ itemId: 1, timestamp: 1, high: 0 }], nowMs: 2 } }),
    ).rejects.toThrow('Invalid snapshot price side');
    await expect(assess?.(undefined, { input: { snapshots: [], nowMs: Number.NaN } })).rejects.toThrow(
      'Invalid nowMs',
    );
    await expect(assess?.(undefined, undefined)).rejects.toThrow();
    await expect(assess?.(undefined, {})).rejects.toThrow();
  });

  it('renderer bridge helper throws when the bridge is absent or stale', async () => {
    window.osrsApi = undefined;
    await expect(assessQualityRequest({ input: { snapshots: [], nowMs: 1 } })).rejects.toThrow(
      'Desktop bridge unavailable',
    );

    window.osrsApi = {
      app: { getVersion: vi.fn() },
      market: { fetchTop10: vi.fn(), fetchHistory: vi.fn() },
    };
    await expect(assessQualityRequest({ input: { snapshots: [], nowMs: 1 } })).rejects.toThrow(
      'Desktop bridge unavailable',
    );
  });

  it('renderer bridge helper delegates to the preload surface', async () => {
    const assessQuality = vi.fn().mockResolvedValue({
      assessment: {
        stalenessMs: 0,
        freshnessScore: 1,
        stale: false,
        missingSides: { total: 1, missingHigh: 0, missingLow: 0 },
        missingItems: [],
        impossibleCount: 0,
        duplicateBatch: null,
        health: null,
      },
    });
    window.osrsApi = {
      app: { getVersion: vi.fn() },
      market: { fetchTop10: vi.fn(), fetchHistory: vi.fn() },
      quality: { assessQuality },
    };
    const response = await assessQualityRequest({ input: { snapshots: [], nowMs: 1 } });
    expect(response.assessment.stale).toBe(false);
    expect(assessQuality).toHaveBeenCalledWith({ input: { snapshots: [], nowMs: 1 } });
  });
});
