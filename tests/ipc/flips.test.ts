import { afterEach, describe, expect, it, vi } from 'vitest';
import { FLIP_CALCULATE } from '../../shared/ipc.ts';
import { registerFlipsHandlers } from '../../electron/ipc/flips.handlers.ts';
import { calculateFlipRequest } from '../../src/services/electronApi.ts';

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

describe('Sprint 13 slice-2 flips IPC (stateless calcFlip, offline-pure)', () => {
  it('exposes a stable flip channel', () => {
    expect(FLIP_CALCULATE).toBe('flip:calculate');
  });

  it('calculates via the pure calcFlip and preserves caps + unaffordable-zero semantics', async () => {
    const { handlers, ipcMain } = mockIpc();
    registerFlipsHandlers(ipcMain);
    const calc = handlers.get(FLIP_CALCULATE);
    expect(calc).toBeTypeOf('function');
    const capped = (await calc?.(undefined, {
      input: { buyPrice: 100, sellPrice: 120, quantity: 500, buyLimit: 100, availableCapital: 5000 },
    })) as { result: { effectiveQuantity: number; cappedByLimit: boolean; cappedByCapital: boolean } };
    expect(capped.result.effectiveQuantity).toBe(50);
    expect(capped.result.cappedByLimit).toBe(true);
    expect(capped.result.cappedByCapital).toBe(true);
    const broke = (await calc?.(undefined, {
      input: { buyPrice: 1000, sellPrice: 1100, quantity: 10, availableCapital: 500 },
    })) as { result: { effectiveQuantity: number; netProfit: number; roi: number } };
    expect(broke.result.effectiveQuantity).toBe(0);
    expect(broke.result.netProfit).toBe(0);
    expect(broke.result.roi).toBe(0);
  });

  it('fails closed on invalid inputs and absent requests (no TypeError)', async () => {
    const { handlers, ipcMain } = mockIpc();
    registerFlipsHandlers(ipcMain);
    const calc = handlers.get(FLIP_CALCULATE);
    await expect(calc?.(undefined, { input: { buyPrice: 0, sellPrice: 1100, quantity: 1 } })).rejects.toThrow(
      'buyPrice',
    );
    await expect(calc?.(undefined, { input: { buyPrice: 100, sellPrice: 120, quantity: 1.5 } })).rejects.toThrow(
      'quantity',
    );
    await expect(calc?.(undefined, undefined)).rejects.toThrow();
    await expect(calc?.(undefined, {})).rejects.toThrow();
  });

  it('renderer bridge helper throws when the bridge is absent or stale', async () => {
    window.osrsApi = undefined;
    await expect(
      calculateFlipRequest({ input: { buyPrice: 1000, sellPrice: 1100, quantity: 10 } }),
    ).rejects.toThrow('Desktop bridge unavailable');

    window.osrsApi = {
      app: { getVersion: vi.fn() },
      market: { fetchTop10: vi.fn(), fetchHistory: vi.fn() },
    };
    await expect(
      calculateFlipRequest({ input: { buyPrice: 1000, sellPrice: 1100, quantity: 10 } }),
    ).rejects.toThrow('Desktop bridge unavailable');
  });

  it('renderer bridge helper delegates to the preload surface', async () => {
    const calculateFlip = vi.fn().mockResolvedValue({
      result: {
        requestedQuantity: 10,
        effectiveQuantity: 10,
        cappedByLimit: false,
        cappedByCapital: false,
        unitGross: 100,
        unitTax: 11,
        unitNet: 89,
        grossProfit: 1000,
        tax: 110,
        netProfit: 890,
        capitalRequired: 10_000,
        roi: 0.089,
        capitalEfficiency: 0.089,
      },
    });
    window.osrsApi = {
      app: { getVersion: vi.fn() },
      market: { fetchTop10: vi.fn(), fetchHistory: vi.fn() },
      flips: { calculateFlip },
    };
    const response = await calculateFlipRequest({ input: { buyPrice: 1000, sellPrice: 1100, quantity: 10 } });
    expect(response.result.netProfit).toBe(890);
    expect(calculateFlip).toHaveBeenCalledWith({ input: { buyPrice: 1000, sellPrice: 1100, quantity: 10 } });
  });
});
