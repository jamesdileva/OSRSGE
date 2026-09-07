import { describe, expect, it } from 'vitest';
import type { MarketSnapshot } from '../../core/market/normalization/normalizer.js';
import {
  changePct,
  priceChange,
  priceChanges,
} from '../../core/market/analytics/priceChanges.js';

const HOUR = 60 * 60 * 1_000;
const NOW = 1_788_484_800_000;

function point(timestamp: number, price: number): MarketSnapshot {
  return { itemId: 1, timestamp, high: price, low: price };
}

describe('price changes', () => {
  it('computes percentage change with the textbook formula', () => {
    expect(changePct(110, 100)).toBeCloseTo(10, 10);
    expect(changePct(90, 100)).toBeCloseTo(-10, 10);
  });

  it('returns undefined for non-positive or non-finite past prices', () => {
    expect(changePct(110, 0)).toBeUndefined();
    expect(changePct(110, -5)).toBeUndefined();
    expect(changePct(Number.NaN, 100)).toBeUndefined();
  });

  it('aligns to the closest observation within tolerance', () => {
    const history = [
      point(NOW - HOUR - 5 * 60 * 1_000, 100), // 5 min early: inside 15-min tolerance
      point(NOW, 110),
    ];

    expect(priceChange(history, NOW, HOUR, 15 * 60 * 1_000)).toBeCloseTo(10, 10);
  });

  it('returns undefined when history coverage is insufficient', () => {
    expect(priceChange([point(NOW, 110)], NOW, HOUR, 15 * 60 * 1_000)).toBeUndefined();
    expect(priceChange([], NOW, HOUR, 15 * 60 * 1_000)).toBeUndefined();
  });

  it('computes all three windows at once', () => {
    const history = [
      point(NOW - 24 * HOUR, 100),
      point(NOW - 6 * HOUR, 105),
      point(NOW - HOUR, 108),
      point(NOW, 110),
    ];

    const changes = priceChanges(history, NOW);
    expect(changes.twentyFourHour).toBeCloseTo(10, 8);
    expect(changes.sixHour).toBeCloseTo((110 - 105) / 105 * 100, 8);
    expect(changes.oneHour).toBeCloseTo((110 - 108) / 108 * 100, 8);
  });
});
