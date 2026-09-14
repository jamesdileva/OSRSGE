import { afterEach, describe, expect, it, vi } from 'vitest';
import { ALERTS_ADD, ALERTS_GET, ALERTS_REMOVE, ALERTS_SET_ENABLED } from '../../shared/ipc.ts';
import type { AlertRule } from '../../core/alerts/alertRules.js';
import { registerAlertsHandlers } from '../../electron/ipc/alerts.handlers.ts';
import {
  addAlertRuleRequest,
  fetchAlertRules,
  removeAlertRuleRequest,
  setAlertRuleEnabledRequest,
} from '../../src/services/electronApi.ts';

const T0 = 1_700_000_000_000;

function rule(id: string, overrides: Partial<AlertRule> = {}): AlertRule {
  return {
    id,
    itemId: null,
    kind: 'finalScore',
    threshold: 80,
    enabled: true,
    createdAt: T0,
    ...overrides,
  };
}

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

describe('Sprint 12 slice-2 part 2 alerts IPC (main half + bridge guards, offline-pure)', () => {
  it('exposes stable alerts channels', () => {
    expect(ALERTS_GET).toBe('alerts:get');
    expect(ALERTS_ADD).toBe('alerts:add');
    expect(ALERTS_REMOVE).toBe('alerts:remove');
    expect(ALERTS_SET_ENABLED).toBe('alerts:setEnabled');
  });

  it('get returns copies of the loaded rules (no aliasing)', async () => {
    const { handlers, ipcMain } = mockIpc();
    const stored: AlertRule[] = [rule('r1')];
    registerAlertsHandlers(ipcMain, {
      load: () => stored,
      save: () => undefined,
    });
    const listener = handlers.get(ALERTS_GET);
    expect(listener).toBeTypeOf('function');
    const result = (await listener?.(undefined)) as { rules: AlertRule[] };
    expect(result).toEqual({ rules: stored });
    expect(result.rules[0]).not.toBe(stored[0]);
  });

  it('add stamps createdAt from the injected clock and persists', async () => {
    const { handlers, ipcMain } = mockIpc();
    let stored: AlertRule[] = [];
    const saved: AlertRule[][] = [];
    registerAlertsHandlers(ipcMain, {
      load: () => stored,
      save: (rules) => {
        saved.push([...rules]);
        stored = [...rules];
      },
      now: () => T0 + 100,
    });
    const add = handlers.get(ALERTS_ADD);
    const result = (await add?.(undefined, {
      draft: { id: 'whip-score', itemId: 4151, kind: 'finalScore', threshold: 80 },
    })) as { rules: AlertRule[] };
    expect(result.rules).toEqual([
      { id: 'whip-score', itemId: 4151, kind: 'finalScore', threshold: 80, enabled: true, createdAt: T0 + 100 },
    ]);
    expect(saved).toHaveLength(1);
  });

  it('add rejects duplicates and garbage drafts fail-closed (no save)', async () => {
    const { handlers, ipcMain } = mockIpc();
    const save = vi.fn();
    registerAlertsHandlers(ipcMain, {
      load: () => [rule('r1')],
      save,
      now: () => T0,
    });
    const add = handlers.get(ALERTS_ADD);
    await expect(
      add?.(undefined, { draft: { id: 'r1', itemId: null, kind: 'finalScore', threshold: 80 } }),
    ).rejects.toThrow();
    await expect(add?.(undefined, { draft: { id: '', itemId: null, kind: 'finalScore', threshold: 80 } })).rejects.toThrow();
    await expect(add?.(undefined, {})).rejects.toThrow();
    expect(save).not.toHaveBeenCalled();
  });

  it('remove drops the id and persists (unknown id is a fresh-array no-op)', async () => {
    const { handlers, ipcMain } = mockIpc();
    let stored: AlertRule[] = [rule('a'), rule('b')];
    registerAlertsHandlers(ipcMain, {
      load: () => stored,
      save: (rules) => {
        stored = [...rules];
      },
    });
    const remove = handlers.get(ALERTS_REMOVE);
    const after = (await remove?.(undefined, { id: 'a' })) as { rules: AlertRule[] };
    expect(after.rules.map((r) => r.id)).toEqual(['b']);
    const noop = (await remove?.(undefined, { id: 'missing' })) as { rules: AlertRule[] };
    expect(noop.rules.map((r) => r.id)).toEqual(['b']);
  });

  it('setEnabled toggles the rule and persists', async () => {
    const { handlers, ipcMain } = mockIpc();
    let stored: AlertRule[] = [rule('a'), rule('b')];
    let savedCount = 0;
    registerAlertsHandlers(ipcMain, {
      load: () => stored,
      save: (rules) => {
        savedCount += 1;
        stored = [...rules];
      },
    });
    const toggle = handlers.get(ALERTS_SET_ENABLED);
    const after = (await toggle?.(undefined, { id: 'a', enabled: false })) as { rules: AlertRule[] };
    expect(after.rules.find((r) => r.id === 'a')?.enabled).toBe(false);
    expect(after.rules.find((r) => r.id === 'b')?.enabled).toBe(true);
    expect(savedCount).toBe(1);
  });

  it('renderer bridge helpers throw when the bridge is absent or stale', async () => {
    window.osrsApi = undefined;
    await expect(fetchAlertRules()).rejects.toThrow('Desktop bridge unavailable');
    await expect(
      addAlertRuleRequest({ draft: { id: 'r', itemId: null, kind: 'finalScore', threshold: 80 } }),
    ).rejects.toThrow('Desktop bridge unavailable');
    await expect(removeAlertRuleRequest({ id: 'r' })).rejects.toThrow('Desktop bridge unavailable');
    await expect(setAlertRuleEnabledRequest({ id: 'r', enabled: false })).rejects.toThrow(
      'Desktop bridge unavailable',
    );

    // Stale preload without the alerts surface (S7/S10/S11 precedent).
    window.osrsApi = {
      app: { getVersion: vi.fn() },
      market: { fetchTop10: vi.fn(), fetchHistory: vi.fn() },
    };
    await expect(fetchAlertRules()).rejects.toThrow('Desktop bridge unavailable');
    await expect(
      addAlertRuleRequest({ draft: { id: 'r', itemId: null, kind: 'finalScore', threshold: 80 } }),
    ).rejects.toThrow('Desktop bridge unavailable');
  });

  it('renderer bridge helpers delegate to the preload surface', async () => {
    const getAlerts = vi.fn().mockResolvedValue({ rules: [rule('r1')] });
    const addAlertRule = vi.fn().mockResolvedValue({ rules: [rule('r1'), rule('r2')] });
    const removeAlertRule = vi.fn().mockResolvedValue({ rules: [] });
    const setAlertRuleEnabled = vi.fn().mockResolvedValue({ rules: [rule('r1', { enabled: false })] });
    window.osrsApi = {
      app: { getVersion: vi.fn() },
      market: { fetchTop10: vi.fn(), fetchHistory: vi.fn() },
      alerts: { getAlerts, addAlertRule, removeAlertRule, setAlertRuleEnabled },
    };
    await expect(fetchAlertRules()).resolves.toEqual({ rules: [rule('r1')] });
    const added = await addAlertRuleRequest({
      draft: { id: 'r2', itemId: null, kind: 'change24h', threshold: 5 },
    });
    expect(added.rules.map((r) => r.id)).toEqual(['r1', 'r2']);
    expect(addAlertRule).toHaveBeenCalledWith({
      draft: { id: 'r2', itemId: null, kind: 'change24h', threshold: 5 },
    });
    await removeAlertRuleRequest({ id: 'r1' });
    expect(removeAlertRule).toHaveBeenCalledWith({ id: 'r1' });
    await setAlertRuleEnabledRequest({ id: 'r1', enabled: false });
    expect(setAlertRuleEnabled).toHaveBeenCalledWith({ id: 'r1', enabled: false });
  });
});
