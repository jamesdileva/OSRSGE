import { describe, expect, it } from 'vitest';
import { MARKET_GET_TOP10 } from '../../shared/ipc.ts';
import type { Opportunity } from '../../core/market/ranking/types.js';
import { registerMarketHandlers } from '../../electron/ipc/market.handlers.ts';
import { getStubTop10Response } from '../../electron/ipc/marketStub.ts';

function isValidOpportunity(o: Opportunity): boolean {
  return (
    Number.isFinite(o.currentPrice) &&
    (o.risk === 'LOW' || o.risk === 'MEDIUM' || o.risk === 'HIGH') &&
    Number.isFinite(o.confidence) &&
    o.confidence >= 0 &&
    o.confidence <= 1 &&
    Number.isFinite(o.baseScore) &&
    Number.isFinite(o.finalScore) &&
    Number.isInteger(o.item.id) &&
    typeof o.item.name === 'string'
  );
}

describe('Sprint 7 slice-2 market stub IPC (main half, offline-pure)', () => {
  it('exposes a stable market:getTop10 channel', () => {
    expect(MARKET_GET_TOP10).toBe('market:getTop10');
  });

  it('registers market:getTop10 and returns the injected stub', async () => {
    const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
    const stub = getStubTop10Response();
    registerMarketHandlers(
      {
        handle: (channel, listener) => {
          handlers.set(channel, listener);
        },
      },
      { getTop10: () => stub },
    );

    const listener = handlers.get(MARKET_GET_TOP10);
    expect(listener).toBeTypeOf('function');
    expect(await listener?.(undefined)).toBe(stub);
  });

  it('forwards the request (limit) to the stub provider', async () => {
    const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
    let received: unknown;
    registerMarketHandlers(
      {
        handle: (channel, listener) => {
          handlers.set(channel, listener);
        },
      },
      {
        getTop10: (request) => {
          received = request;
          return getStubTop10Response(request);
        },
      },
    );

    const listener = handlers.get(MARKET_GET_TOP10);
    const response = (await listener?.(undefined, { limit: 2 })) as ReturnType<typeof getStubTop10Response>;
    expect(received).toEqual({ limit: 2 });
    expect(response.opportunities).toHaveLength(2);
  });

  it('stub payload validates against the Opportunity contract', () => {
    const stub = getStubTop10Response();
    expect(typeof stub.rankingVersion).toBe('string');
    expect(Number.isFinite(stub.computedAt)).toBe(true);
    expect(stub.opportunities.length).toBeGreaterThan(0);
    for (const o of stub.opportunities) {
      expect(isValidOpportunity(o)).toBe(true);
    }
  });
});
