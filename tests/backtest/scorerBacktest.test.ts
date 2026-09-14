import { describe, expect, it } from 'vitest';
import type { MarketSnapshot } from '../../core/market/normalization/normalizer.js';
import type { RankingConfig } from '../../core/market/ranking/types.js';
import { runRankedBacktest, summarizeTrades } from '../../core/market/backtest/backtester.js';
import {
  createScorerRankAt,
  sliceHistoriesAt,
  sliceHistoryAt,
  snapshotsToPriceSeries,
} from '../../core/market/backtest/scorerBacktest.js';

const HOUR = 3_600_000;
const T = 24 * HOUR;

/** Flat snapshot with midpoint == price and zero spread. */
function snap(itemId: number, timestamp: number, price: number): MarketSnapshot {
  return { itemId, timestamp, high: price, low: price };
}

/** Momentum-only config so the rising item must outrank the flat one. */
const MOMENTUM_ONLY: RankingConfig = {
  preset: 'BALANCED',
  weights: { momentum: 1, liquidity: 0, spread: 0, profitability: 0, consistency: 0, volatility: 0 },
  minPrice: 1,
  minVolume: 0,
  minHistoryMinutes: 60,
};

/** Item 1 rises into T, item 2 stays flat; futures appended per test. */
function historiesWithFutures(item1Future: number, item2Future: number): Map<number, MarketSnapshot[]> {
  return new Map([
    [1, [snap(1, 0, 100), snap(1, 18 * HOUR, 105), snap(1, 23 * HOUR, 108), snap(1, T, 110), snap(1, 30 * HOUR, item1Future)]],
    [2, [snap(2, 0, 100), snap(2, 18 * HOUR, 100), snap(2, 23 * HOUR, 100), snap(2, T, 100), snap(2, 30 * HOUR, item2Future)]],
  ]);
}

describe('sliceHistoryAt / sliceHistoriesAt', () => {
  it('keeps only snapshots at/before T in a fresh array', () => {
    const history = [snap(1, 0, 100), snap(1, T, 110), snap(1, 30 * HOUR, 50)];
    const sliced = sliceHistoryAt(history, T);
    expect(sliced.map((s) => s.timestamp)).toEqual([0, T]);
    expect(sliced).not.toBe(history);
  });

  it('throws on non-finite slice times', () => {
    expect(() => sliceHistoryAt([snap(1, 0, 100)], Number.NaN)).toThrow('timeMs');
    expect(() => sliceHistoriesAt(new Map([[1, [snap(1, 0, 100)]]]), Number.NaN)).toThrow('timeMs');
  });
});

describe('snapshotsToPriceSeries', () => {
  it('projects midpoints, skips unpriced snapshots, sorts ascending', () => {
    const histories = new Map<number, MarketSnapshot[]>([
      [1, [{ itemId: 1, timestamp: T }, { itemId: 1, timestamp: 0, high: 110, low: 90 }]],
    ]);
    const series = snapshotsToPriceSeries(histories);
    expect(series.get(1)).toEqual([{ timestamp: 0, price: 100 }]);
  });
});

describe('createScorerRankAt', () => {
  it('ranks the rising item first with top-N picks entered at verbatim T', () => {
    const rankAt = createScorerRankAt({ historiesByItem: historiesWithFutures(121, 90), config: MOMENTUM_ONLY, topN: 1 });
    const picks = rankAt(T);
    expect(picks).toEqual([{ itemId: 1, entryTime: T, entryPrice: 110 }]);
    const both = createScorerRankAt({ historiesByItem: historiesWithFutures(121, 90), config: MOMENTUM_ONLY, topN: 2 })(T);
    expect(both.map((p) => p.itemId)).toEqual([1, 2]);
    expect(both.every((p) => p.entryTime === T)).toBe(true);
  });

  it('is past-only: future snapshots cannot change rankAt(T) (no-future-leak disconfirm)', () => {
    // At T item 1 is the clear riser; afterwards it crashes while item 2 spikes.
    const withFutures = historiesWithFutures(50, 200);
    const truncated = new Map(
      [...withFutures.entries()].map(([id, history]) => [id, history.filter((s) => s.timestamp <= T)] as const),
    );
    const rankedWithFutures = createScorerRankAt({ historiesByItem: withFutures, config: MOMENTUM_ONLY, topN: 2 })(T);
    const rankedTruncated = createScorerRankAt({ historiesByItem: truncated, config: MOMENTUM_ONLY, topN: 2 })(T);
    expect(rankedWithFutures).toEqual(rankedTruncated);
    expect(rankedWithFutures.map((p) => p.itemId)).toEqual([1, 2]);
  });

  it('never mutates frozen stored history and returns fresh picks', () => {
    const histories = historiesWithFutures(121, 90);
    for (const history of histories.values()) {
      for (const snapshot of history) {
        Object.freeze(snapshot);
      }
      Object.freeze(history);
    }
    const before = JSON.stringify([...histories.entries()]);
    const rankAt = createScorerRankAt({ historiesByItem: histories, config: MOMENTUM_ONLY, topN: 1 });
    const first = rankAt(T);
    const second = rankAt(T);
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    first[0]!.itemId = 999;
    expect(rankAt(T)[0]!.itemId).toBe(1);
    expect(JSON.stringify([...histories.entries()])).toBe(before);
  });

  it('throws on invalid topN and non-finite evaluation times', () => {
    const histories = historiesWithFutures(121, 90);
    expect(() => createScorerRankAt({ historiesByItem: histories, config: MOMENTUM_ONLY, topN: 0 })).toThrow('topN');
    const rankAt = createScorerRankAt({ historiesByItem: histories, config: MOMENTUM_ONLY, topN: 1 });
    expect(() => rankAt(Number.NaN)).toThrow('finite timestamps');
  });
});

describe('slice-2 summary correctness (review #137)', () => {
  it('derives wins from returnPct > 0, ignoring inconsistent win flags', () => {
    const summary = summarizeTrades([
      { itemId: 1, entryTime: 0, entryPrice: 100, exitTime: HOUR, exitPrice: 110, returnPct: 10, win: false },
      { itemId: 2, entryTime: 0, entryPrice: 100, exitTime: HOUR, exitPrice: 95, returnPct: -5, win: true },
      { itemId: 3, entryTime: 0, entryPrice: 100, exitTime: HOUR, exitPrice: 100, returnPct: 0, win: true },
    ]);
    // Only the +10% trade wins; the tie counts as a loss despite its flag.
    expect(summary.winRate).toBeCloseTo(1 / 3, 9);
    expect(summary.falsePositiveRate).toBeCloseTo(2 / 3, 9);
    expect(summary.hitRate).toBeCloseTo(1 / 3, 9);
  });

  it('measures drawdown in documented order regardless of input permutation', () => {
    const ordered = [
      { itemId: 1, entryTime: 0, entryPrice: 100, exitTime: HOUR, exitPrice: 110, returnPct: 10, win: true },
      { itemId: 2, entryTime: 0, entryPrice: 100, exitTime: 2 * HOUR, exitPrice: 94, returnPct: -6, win: false },
      { itemId: 3, entryTime: 0, entryPrice: 100, exitTime: 3 * HOUR, exitPrice: 96, returnPct: -4, win: false },
    ] as const;
    const forward = summarizeTrades(ordered.map((t) => ({ ...t })));
    const permuted = summarizeTrades([ordered[2], ordered[0], ordered[1]].map((t) => ({ ...t })));
    expect(forward.maxDrawdown).toBeCloseTo(10, 9);
    expect(permuted.maxDrawdown).toBeCloseTo(forward.maxDrawdown, 9);
    expect(permuted.avgReturn).toBeCloseTo(forward.avgReturn, 9);
  });
});

describe('scorer backtest end-to-end', () => {
  it('runs rank → settle → summarize through runRankedBacktest', () => {
    const histories = historiesWithFutures(121, 90);
    const result = runRankedBacktest({
      evaluationTimes: [T],
      horizonMs: 6 * HOUR,
      rankAt: createScorerRankAt({ historiesByItem: histories, config: MOMENTUM_ONLY, topN: 1 }),
      pricesByItem: snapshotsToPriceSeries(histories),
    });
    expect(result.trades).toHaveLength(1);
    expect(result.unsettled).toBe(0);
    expect(result.trades[0]).toMatchObject({ itemId: 1, entryTime: T, entryPrice: 110, exitPrice: 121 });
    expect(result.trades[0]!.returnPct).toBeCloseTo(10, 9);
    expect(result.summary.tradeCount).toBe(1);
    expect(result.summary.winRate).toBeCloseTo(1, 9);
  });
});
