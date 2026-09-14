/**
 * Sprint 13 slice-1: pure flip calculator (roadmap §15).
 * Pure — no fs, no IPC, no scheduler, no UI, no network.
 *
 * Scope contract (slice-1):
 * - `calcFlip` turns user inputs (buy/sell/quantity + optional
 *   buy-limit / available-capital / flips-per-hour) into calculated
 *   values (gross, tax, net, ROI, capital efficiency, profit/hour).
 *   All outputs are CALCULATED estimates — callers pass observed market
 *   data in; nothing is fetched or inferred here.
 * - GE tax is an explicit 1% of the sell price per unit (`GE_TAX_RATE`),
 *   matching the scorer's assumed 1% bite (`core/market/ranking/scorer.ts`)
 *   and guide §57 (`netProfit = sellPrice − buyPrice − applicableTax`).
 *   Centralized here — never hard-code tax math in React (guide §57).
 * - Effective quantity respects both constraints:
 *   `min(requested, buyLimit ?? ∞, floor(capital / buyPrice) ?? ∞)`.
 *   An unaffordable flip (capital < one unit) is a valid zero-quantity
 *   result, not an error — strict-throw covers invalid inputs only.
 * - Strict on invalid: non-finite/non-positive prices, non-integer or
 *   non-positive quantity/limit, negative/non-finite capital, and
 *   non-positive/non-finite flips-per-hour all throw. Never clamps
 *   garbage silently.
 * - Frozen-input safe: inputs are primitives/readonly — nothing is mutated.
 * - Later slices own IPC channels, persistence, and UI; profit-per-hour
 *   stays an explicit caller assumption (`flipsPerHour`), never a claim
 *   about market depth or execution (guide §56).
 */

/** Assumed GE tax bite: 1% of the sell price per unit. */
export const GE_TAX_RATE = 0.01;

/** User inputs for one flip calculation. Prices in gp. */
export interface FlipInput {
  /** Per-unit buy price in gp (finite, > 0). */
  buyPrice: number;
  /** Per-unit sell price in gp (finite, > 0). */
  sellPrice: number;
  /** Desired units (positive integer). */
  quantity: number;
  /** GE 4h buy limit for the item, when known (positive integer). */
  buyLimit?: number;
  /** GP available to spend (finite, >= 0). Caps affordable units. */
  availableCapital?: number;
  /** Assumed completed flips per hour (finite, > 0) for the estimate. */
  flipsPerHour?: number;
}

/** Calculated flip outcome. Every gp value derives from the input. */
export interface FlipResult {
  /** Requested units (echo of the input). */
  requestedQuantity: number;
  /** Units actually flipped after limit/capital caps. */
  effectiveQuantity: number;
  /** True when the buy limit reduced the quantity. */
  cappedByLimit: boolean;
  /** True when available capital reduced the quantity. */
  cappedByCapital: boolean;
  /** Per-unit gross: sell − buy. */
  unitGross: number;
  /** Per-unit tax: sell × 1%. */
  unitTax: number;
  /** Per-unit net: gross − tax (may be negative — a loss). */
  unitNet: number;
  /** Total gross over effective units. */
  grossProfit: number;
  /** Total tax over effective units. */
  tax: number;
  /** Total net over effective units. */
  netProfit: number;
  /** GP tied up: buy × effective units (0 when nothing affordable). */
  capitalRequired: number;
  /** Net / capital (0 when no capital required). */
  roi: number;
  /** Net / capital (guide §55 `estimatedProfit / capitalRequired`). */
  capitalEfficiency: number;
  /** Net × flips/hour — present only when `flipsPerHour` was given. */
  profitPerHour?: number;
}

function assertPrice(value: number, name: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || !(value > 0)) {
    throw new Error(`Invalid ${name}: ${String(value)} (expected finite number > 0)`);
  }
}

function assertPositiveInt(value: number, name: string): void {
  if (typeof value !== 'number' || !Number.isInteger(value) || !(value > 0)) {
    throw new Error(`Invalid ${name}: ${String(value)} (expected positive integer)`);
  }
}

/**
 * Calculate a flip. Pure: no I/O, no mutation, throws on invalid input.
 */
export function calcFlip(input: FlipInput): FlipResult {
  if (input === null || typeof input !== 'object') {
    throw new Error(`Invalid flip input: ${String(input)} (expected object)`);
  }
  assertPrice(input.buyPrice, 'buyPrice');
  assertPrice(input.sellPrice, 'sellPrice');
  assertPositiveInt(input.quantity, 'quantity');
  if (input.buyLimit !== undefined) {
    assertPositiveInt(input.buyLimit, 'buyLimit');
  }
  if (input.availableCapital !== undefined) {
    if (
      typeof input.availableCapital !== 'number' ||
      !Number.isFinite(input.availableCapital) ||
      input.availableCapital < 0
    ) {
      throw new Error(
        `Invalid availableCapital: ${String(input.availableCapital)} (expected finite number >= 0)`,
      );
    }
  }
  if (input.flipsPerHour !== undefined) {
    if (
      typeof input.flipsPerHour !== 'number' ||
      !Number.isFinite(input.flipsPerHour) ||
      !(input.flipsPerHour > 0)
    ) {
      throw new Error(
        `Invalid flipsPerHour: ${String(input.flipsPerHour)} (expected finite number > 0)`,
      );
    }
  }

  const limitCapped =
    input.buyLimit !== undefined ? Math.min(input.quantity, input.buyLimit) : input.quantity;
  const cappedByLimit = limitCapped < input.quantity;

  const affordable =
    input.availableCapital !== undefined ? Math.floor(input.availableCapital / input.buyPrice) : limitCapped;
  const effectiveQuantity = Math.max(0, Math.min(limitCapped, affordable));
  const cappedByCapital = effectiveQuantity < limitCapped;

  const unitGross = input.sellPrice - input.buyPrice;
  const unitTax = input.sellPrice * GE_TAX_RATE;
  const unitNet = unitGross - unitTax;

  const grossProfit = unitGross * effectiveQuantity;
  const tax = unitTax * effectiveQuantity;
  const netProfit = unitNet * effectiveQuantity;
  const capitalRequired = input.buyPrice * effectiveQuantity;
  const roi = capitalRequired > 0 ? netProfit / capitalRequired : 0;

  const result: FlipResult = {
    requestedQuantity: input.quantity,
    effectiveQuantity,
    cappedByLimit,
    cappedByCapital,
    unitGross,
    unitTax,
    unitNet,
    grossProfit,
    tax,
    netProfit,
    capitalRequired,
    roi,
    capitalEfficiency: roi,
  };
  if (input.flipsPerHour !== undefined) {
    result.profitPerHour = netProfit * input.flipsPerHour;
  }
  return result;
}
