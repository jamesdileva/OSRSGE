import { describe, expect, it } from 'vitest';
import type { BacktestPick, BacktestPricePoint } from '../../core/market/backtest/backtester.js';
import { runRankedBacktest, settlePicks, summarizeTrades } from '../../core/market/backtest/backtester.js';

const HOUR = 3_600_000;

function series(points: Array<[number, number]>): BacktestPricePoint[] {
  return points.map(([timestamp, price]) => ({ timestamp, price }));
}

describe('settlePicks', () => {
  it('settles a basic win as a simple percent move', () => {
    const prices = new Map([[1, series([[0, 100], [HOUR, 110]])]]);
    const { trades, unsettled } = settlePicks(
      [{ itemId: 1, entryTime: 0, entryPrice: 100 }],
      prices,
      HOUR,
    );
    expect(unsettled).toBe(0);
    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({
      itemId: 1,
      entryTime: 0,
      exitTime: HOUR,
      exitPrice: 110,
      returnPct: 10,
      win: true,
    });
  });

  it('keeps losses negative with no zero floor', () => {
    const prices = new Map([[1, series([[0, 100], [HOUR, 80]])]]);
    const { trades } = settlePicks([{ itemId: 1, entryTime: 0, entryPrice: 100 }], prices, HOUR);
    expect(trades[0]?.returnPct).toBeCloseTo(-20, 9);
    expect(trades[0]?.win).toBe(false);
  });

  it('counts picks with no series or no future point as unsettled, not errors', () => {
    const prices = new Map([[1, series([[0, 100]])]]);
    const picks: BacktestPick[] = [
      { itemId: 1, entryTime: 0, entryPrice: 100 },
      { itemId: 2, entryTime: 0, entryPrice: 100 },
    ];
    const { trades, unsettled } = settlePicks(picks, prices, HOUR);
    expect(trades).toHaveLength(0);
    expect(unsettled).toBe(2);
  });

  it('skips future points beyond tolerance and takes the earliest in-tolerance point', () => {
    const prices = new Map([[1, series([[0, 100], [HOUR + 30_000, 120], [HOUR + 120_000, 130]])]]);
    const tight = settlePicks([{ itemId: 1, entryTime: 0, entryPrice: 100 }], prices, HOUR, 60);
    expect(tight.trades).toHaveLength(0);
    expect(tight.unsettled).toBe(1);
    const loose = settlePicks([{ itemId: 1, entryTime: 0, entryPrice: 100 }], prices, HOUR, 60_000);
    expect(loose.trades[0]).toMatchObject({ exitTime: HOUR + 30_000, exitPrice: 120 });
  });

  it('handles unsorted series deterministically', () => {
    const prices = new Map([[1, series([[HOUR, 110], [0, 100], [2 * HOUR, 130]])]]);
    const first = settlePicks([{ itemId: 1, entryTime: 0, entryPrice: 100 }], prices, HOUR);
    const second = settlePicks([{ itemId: 1, entryTime: 0, entryPrice: 100 }], prices, HOUR);
    expect(first.trades[0]).toMatchObject({ exitTime: HOUR, exitPrice: 110 });
    expect(second).toEqual(first);
  });

  it('throws on invalid horizon, prices, and picks — never clamps silently', () => {
    const prices = new Map([[1, series([[0, 100], [HOUR, 110]])]]);
    const pick: BacktestPick = { itemId: 1, entryTime: 0, entryPrice: 100 };
    expect(() => settlePicks([pick], prices, 0)).toThrow('horizonMs');
    expect(() => settlePicks([pick], prices, Number.NaN)).toThrow('horizonMs');
    expect(() => settlePicks([pick], prices, HOUR, -1)).toThrow('toleranceMs');
    expect(() => settlePicks([{ ...pick, entryPrice: 0 }], prices, HOUR)).toThrow('entryPrice');
    expect(() => settlePicks([{ ...pick, itemId: 1.5 }], prices, HOUR)).toThrow('itemId');
    expect(() =>
      settlePicks([pick], new Map([[1, series([[0, 100], [HOUR, Number.NaN]])]]), HOUR),
    ).toThrow('finite timestamp and price');
  });

  it('never mutates frozen inputs', () => {
    const picks: BacktestPick[] = [Object.freeze({ itemId: 1, entryTime: 0, entryPrice: 100 })];
    const points = [Object.freeze({ timestamp: 0, price: 100 }), Object.freeze({ timestamp: HOUR, price: 110 })];
    const prices = new Map([[1, Object.freeze(points) as readonly BacktestPricePoint[]]]);
    Object.freeze(picks);
    const { trades } = settlePicks(picks, prices, HOUR);
    expect(trades).toHaveLength(1);
    expect(picks[0]).toEqual({ itemId: 1, entryTime: 0, entryPrice: 100 });
  });
});

describe('summarizeTrades', () => {
  it('computes avg/median/win-rate with false-positive and hit rate as complements', () => {
    const summary = summarizeTrades([
      { itemId: 1, entryTime: 0, entryPrice: 100, exitTime: HOUR, exitPrice: 110, returnPct: 10, win: true },
      { itemId: 2, entryTime: 0, entryPrice: 100, exitTime: HOUR, exitPrice: 120, returnPct: 20, win: true },
      { itemId: 3, entryTime: 0, entryPrice: 100, exitTime: HOUR, exitPrice: 94, returnPct: -6, win: false },
    ]);
    expect(summary.tradeCount).toBe(3);
    expect(summary.avgReturn).toBeCloseTo(8, 9);
    expect(summary.medianReturn).toBeCloseTo(10, 9);
    expect(summary.winRate).toBeCloseTo(2 / 3, 9);
    expect(summary.falsePositiveRate).toBeCloseTo(1 / 3, 9);
    expect(summary.hitRate).toBeCloseTo(2 / 3, 9);
    expect(summary.falsePositiveRate + summary.hitRate).toBeCloseTo(1, 9);
  });

  it('measures max drawdown over the additive equity curve', () => {
    const summary = summarizeTrades([
      { itemId: 1, entryTime: 0, entryPrice: 100, exitTime: HOUR, exitPrice: 110, returnPct: 10, win: true },
      { itemId: 2, entryTime: 0, entryPrice: 100, exitTime: 2 * HOUR, exitPrice: 94, returnPct: -6, win: false },
      { itemId: 3, entryTime: 0, entryPrice: 100, exitTime: 3 * HOUR, exitPrice: 96, returnPct: -4, win: false },
    ]);
    // Equity: 10 → 4 → 0; peak 10, trough 0.
    expect(summary.maxDrawdown).toBeCloseTo(10, 9);
  });

  it('returns an all-zeros summary for empty trade lists', () => {
    expect(summarizeTrades([])).toEqual({
      tradeCount: 0,
      avgReturn: 0,
      medianReturn: 0,
      winRate: 0,
      maxDrawdown: 0,
      falsePositiveRate: 0,
      hitRate: 0,
    });
  });
});

describe('runRankedBacktest', () => {
  it('runs the rank → settle → summarize loop passing each T verbatim to rankAt', () => {
    const seen: number[] = [];
    const prices = new Map([
      [1, series([[0, 100], [HOUR, 110], [2 * HOUR, 121]])],
      [2, series([[0, 200], [HOUR, 190], [2 * HOUR, 180]])],
    ]);
    const result = runRankedBacktest({
      evaluationTimes: [0, HOUR],
      horizonMs: HOUR,
      rankAt: (timeMs) => {
        seen.push(timeMs);
        return [
          { itemId: 1, entryTime: timeMs, entryPrice: timeMs === 0 ? 100 : 110 },
          { itemId: 2, entryTime: timeMs, entryPrice: timeMs === 0 ? 200 : 190 },
        ];
      },
      pricesByItem: prices,
    });
    expect(seen).toEqual([0, HOUR]);
    expect(result.trades).toHaveLength(4);
    expect(result.unsettled).toBe(0);
    expect(result.summary.tradeCount).toBe(4);
    // Item 1 wins twice (+10%, +10%), item 2 loses twice (−5%, −5.26…%).
    expect(result.summary.winRate).toBeCloseTo(0.5, 9);
  });

  it('rejects rankAt picks entered away from their evaluation time (fail-closed ordering)', () => {
    expect(() =>
      runRankedBacktest({
        evaluationTimes: [0],
        horizonMs: HOUR,
        rankAt: () => [{ itemId: 1, entryTime: HOUR, entryPrice: 100 }],
        pricesByItem: new Map([[1, series([[0, 100], [HOUR, 110], [2 * HOUR, 120]])]]),
      }),
    ).toThrow('evaluation time');
  });
});
