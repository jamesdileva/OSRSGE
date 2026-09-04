import { describe, expect, it } from 'vitest';
import { APP_GET_VERSION } from '../../shared/ipc.ts';
import { registerAppHandlers } from '../../electron/ipc/app.handlers.ts';

describe('IPC contract', () => {
  it('exposes a stable app:getVersion channel', () => {
    expect(APP_GET_VERSION).toBe('app:getVersion');
  });

  it('registers app:getVersion and resolves the injected version', async () => {
    const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
    registerAppHandlers(
      {
        handle: (channel, listener) => {
          handlers.set(channel, listener);
        },
      },
      { getVersion: () => '0.1.0' },
    );

    const listener = handlers.get(APP_GET_VERSION);
    expect(listener).toBeTypeOf('function');
    expect(await listener?.(undefined)).toBe('0.1.0');
  });
});
