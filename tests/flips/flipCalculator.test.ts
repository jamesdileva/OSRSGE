import { describe, expect, it } from 'vitest';
import { calcFlip, GE_TAX_RATE } from '../../core/market/flips/flipCalculator.js';

describe('flipCalculator (Sprint 13 slice-1)', () => {
  it('computes gross, 1% sell-side tax, net, ROI, and capital efficiency', () => {
    const result = calcFlip({ buyPrice: 1000, sellPrice: 1100, quantity: 10 });
    expect(GE_TAX_RATE).toBe(0.01);
    expect(result.unitGross).toBe(100);
    expect(result.unitTax).toBe(11);
    expect(result.unitNet).toBe(89);
    expect(result.grossProfit).toBe(1000);
    expect(result.tax).toBe(110);
    expect(result.netProfit).toBe(890);
    expect(result.capitalRequired).toBe(10_000);
    expect(result.roi).toBeCloseTo(0.089, 10);
    expect(result.capitalEfficiency).toBe(result.roi);
    expect(result.effectiveQuantity).toBe(10);
    expect(result.cappedByLimit).toBe(false);
    expect(result.cappedByCapital).toBe(false);
    expect(result.profitPerHour).toBeUndefined();
  });

  it('keeps a loss as a negative net instead of flooring at zero', () => {
    const result = calcFlip({ buyPrice: 1000, sellPrice: 900, quantity: 5 });
    expect(result.unitGross).toBe(-100);
    expect(result.unitTax).toBe(9);
    expect(result.unitNet).toBe(-109);
    expect(result.netProfit).toBe(-545);
    expect(result.roi).toBeCloseTo(-0.109, 10);
  });

  it('caps effective quantity at the buy limit', () => {
    const result = calcFlip({ buyPrice: 100, sellPrice: 120, quantity: 500, buyLimit: 100 });
    expect(result.effectiveQuantity).toBe(100);
    expect(result.cappedByLimit).toBe(true);
    expect(result.cappedByCapital).toBe(false);
    expect(result.netProfit).toBe(result.unitNet * 100);
  });

  it('caps effective quantity at affordable units from available capital', () => {
    const result = calcFlip({
      buyPrice: 1000,
      sellPrice: 1100,
      quantity: 10,
      availableCapital: 5500,
    });
    expect(result.effectiveQuantity).toBe(5);
    expect(result.cappedByLimit).toBe(false);
    expect(result.cappedByCapital).toBe(true);
    expect(result.capitalRequired).toBe(5000);
  });

  it('returns a valid zero-quantity result when no unit is affordable', () => {
    const result = calcFlip({
      buyPrice: 1000,
      sellPrice: 1100,
      quantity: 10,
      availableCapital: 500,
    });
    expect(result.effectiveQuantity).toBe(0);
    expect(result.cappedByCapital).toBe(true);
    expect(result.netProfit).toBe(0);
    expect(result.capitalRequired).toBe(0);
    expect(result.roi).toBe(0);
  });

  it('applies limit and capital together, taking the tighter cap', () => {
    const result = calcFlip({
      buyPrice: 100,
      sellPrice: 120,
      quantity: 500,
      buyLimit: 100,
      availableCapital: 5000,
    });
    expect(result.effectiveQuantity).toBe(50);
    expect(result.cappedByLimit).toBe(true);
    expect(result.cappedByCapital).toBe(true);
  });

  it('estimates profit per hour from the explicit flips-per-hour assumption', () => {
    const result = calcFlip({ buyPrice: 1000, sellPrice: 1100, quantity: 10, flipsPerHour: 4 });
    expect(result.profitPerHour).toBe(890 * 4);
  });

  it('throws on invalid prices, quantities, limits, capital, and rate', () => {
    expect(() => calcFlip({ buyPrice: 0, sellPrice: 1100, quantity: 1 })).toThrow('buyPrice');
    expect(() => calcFlip({ buyPrice: NaN, sellPrice: 1100, quantity: 1 })).toThrow('buyPrice');
    expect(() => calcFlip({ buyPrice: 1000, sellPrice: -5, quantity: 1 })).toThrow('sellPrice');
    expect(() => calcFlip({ buyPrice: 1000, sellPrice: Infinity, quantity: 1 })).toThrow(
      'sellPrice',
    );
    expect(() => calcFlip({ buyPrice: 1000, sellPrice: 1100, quantity: 0 })).toThrow('quantity');
    expect(() => calcFlip({ buyPrice: 1000, sellPrice: 1100, quantity: 1.5 })).toThrow('quantity');
    expect(() => calcFlip({ buyPrice: 100, sellPrice: 120, quantity: 5, buyLimit: 0 })).toThrow(
      'buyLimit',
    );
    expect(() =>
      calcFlip({ buyPrice: 100, sellPrice: 120, quantity: 5, availableCapital: -1 }),
    ).toThrow('availableCapital');
    expect(() =>
      calcFlip({ buyPrice: 100, sellPrice: 120, quantity: 5, flipsPerHour: 0 }),
    ).toThrow('flipsPerHour');
  });

  it('is frozen-input safe and leaves the input object untouched', () => {
    const input = Object.freeze({
      buyPrice: 1000,
      sellPrice: 1100,
      quantity: 10,
      buyLimit: 20,
      availableCapital: 50_000,
      flipsPerHour: 2,
    });
    const before = { ...input };
    const result = calcFlip(input);
    expect(input).toEqual(before);
    expect(result.effectiveQuantity).toBe(10);
    expect(result.profitPerHour).toBe(890 * 2);
  });
});
