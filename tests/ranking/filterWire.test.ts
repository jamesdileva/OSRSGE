import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FILTERS,
  decodeFiltersFromIpc,
  encodeFiltersForIpc,
} from '../../core/market/ranking/filters.js';
import { getStubTop10Response } from '../../electron/ipc/marketStub.ts';
import { registerMarketHandlers } from '../../electron/ipc/market.handlers.ts';
import { MARKET_GET_TOP10 } from '../../shared/ipc.ts';

describe('Sprint 9 slice-2 filter IPC wire (Infinity-null)', () => {
  it('encodes maxPrice Infinity as null for IPC', () => {
    const wire = encodeFiltersForIpc({ ...DEFAULT_FILTERS });
    expect(wire.maxPrice).toBeNull();
  });

  it('decodes wire null back to Infinity', () => {
    const decoded = decodeFiltersFromIpc({ maxPrice: null });
    expect(decoded.maxPrice).toBe(Number.POSITIVE_INFINITY);
  });

  it('round-trips DEFAULT_FILTERS through the wire as pass-everything', () => {
    const wire = encodeFiltersForIpc({ ...DEFAULT_FILTERS });
    // Wire form must survive a JSON round-trip (the IPC null-loss case).
    const overIpc = JSON.parse(JSON.stringify(wire)) as typeof wire;
    expect(overIpc.maxPrice).toBeNull();
    const decoded = decodeFiltersFromIpc(overIpc);
    expect(decoded.maxPrice).toBe(Number.POSITIVE_INFINITY);
    expect(decoded).toMatchObject({
      membership: 'all',
      minPrice: 0,
      minLiquidity: 0,
      minScore: 0,
    });
  });

  it('stub applies wire filters as a post-rank view (risk allowlist)', () => {
    const all = getStubTop10Response();
    expect(all.opportunities).toHaveLength(3);
    const lowOnly = getStubTop10Response({
      filters: { allowedRisks: ['LOW'] },
    });
    expect(lowOnly.opportunities.map((o) => o.item.name)).toEqual(['Abyssal whip']);
    // Universe size is preserved so the summary can distinguish view from universe.
    expect(lowOnly.itemsAnalyzed).toBe(3);
  });

  it('stub applies price filters after wire Infinity-null decode', () => {
    const wire = encodeFiltersForIpc({ minPrice: 1000, maxPrice: Number.POSITIVE_INFINITY });
    expect(wire.maxPrice).toBeNull();
    const response = getStubTop10Response({ filters: wire });
    expect(response.opportunities.map((o) => o.item.name)).toEqual(['Abyssal whip', 'Dragon bones']);
  });

  it('limit caps the filtered view, not the universe', () => {
    const response = getStubTop10Response({ limit: 1, filters: { allowedRisks: ['LOW', 'MEDIUM', 'HIGH'] } });
    expect(response.opportunities).toHaveLength(1);
    expect(response.itemsAnalyzed).toBe(3);
  });

  it('handler forwards the filters param to the stub provider', async () => {
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
    const response = (await listener?.(undefined, {
      filters: { allowedRisks: ['HIGH'] },
    })) as ReturnType<typeof getStubTop10Response>;
    expect(received).toEqual({ filters: { allowedRisks: ['HIGH'] } });
    expect(response.opportunities.map((o) => o.item.name)).toEqual(['Nature rune']);
  });
});
