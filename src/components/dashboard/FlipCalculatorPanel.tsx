import { useState } from 'react';
import type { JSX } from 'react';
import { GE_TAX_RATE } from '../../../core/market/flips/flipCalculator.js';
import type { FlipInput, FlipResult } from '../../../core/market/flips/flipCalculator.js';

export interface FlipCalculatorPanelProps {
  result: FlipResult | null;
  error: string | null;
  onCalculate: (input: FlipInput) => void;
}

function parseRequiredNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return null;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptionalNumber(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return undefined;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Sprint 13 slice-2: pure flip-calculator panel (roadmap §15).
 * Props-driven, zero IPC/network/scheduler/persistence — the Dashboard owns
 * calculation (bridge calculateFlip with pure-calcFlip fallback) and passes
 * the result back. Tax math stays centralized in core (GE_TAX_RATE is
 * imported for the label only, never recomputed here). All displayed
 * values are CALCULATED estimates from caller-supplied observed prices —
 * nothing is fetched or inferred here.
 */
export default function FlipCalculatorPanel({
  result,
  error,
  onCalculate,
}: FlipCalculatorPanelProps): JSX.Element {
  const [buyPrice, setBuyPrice] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [buyLimit, setBuyLimit] = useState('');
  const [availableCapital, setAvailableCapital] = useState('');
  const [flipsPerHour, setFlipsPerHour] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const handleCalculate = (): void => {
    const buy = parseRequiredNumber(buyPrice);
    const sell = parseRequiredNumber(sellPrice);
    const qty = parseRequiredNumber(quantity);
    if (buy === null || sell === null || qty === null) {
      setFormError('Enter a buy price, sell price, and quantity.');
      return;
    }
    setFormError(null);
    onCalculate({
      buyPrice: buy,
      sellPrice: sell,
      quantity: qty,
      ...(parseOptionalNumber(buyLimit) !== undefined ? { buyLimit: parseOptionalNumber(buyLimit) as number } : {}),
      ...(parseOptionalNumber(availableCapital) !== undefined
        ? { availableCapital: parseOptionalNumber(availableCapital) as number }
        : {}),
      ...(parseOptionalNumber(flipsPerHour) !== undefined
        ? { flipsPerHour: parseOptionalNumber(flipsPerHour) as number }
        : {}),
    });
  };

  return (
    <div aria-label="Flip calculator">
      <p className="placeholder">
        Estimates only — type observed buy/sell prices in. Tax is {(GE_TAX_RATE * 100).toFixed(0)}% of sell
        per unit.
      </p>
      <form
        aria-label="Calculate flip"
        onSubmit={(event) => {
          event.preventDefault();
          handleCalculate();
        }}
      >
        <label>
          Buy price
          <input aria-label="Buy price" type="number" value={buyPrice} onChange={(event) => setBuyPrice(event.target.value)} />
        </label>
        <label>
          Sell price
          <input aria-label="Sell price" type="number" value={sellPrice} onChange={(event) => setSellPrice(event.target.value)} />
        </label>
        <label>
          Quantity
          <input aria-label="Quantity" type="number" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
        </label>
        <label>
          Buy limit (optional)
          <input aria-label="Buy limit" type="number" value={buyLimit} onChange={(event) => setBuyLimit(event.target.value)} />
        </label>
        <label>
          Available capital (optional)
          <input
            aria-label="Available capital"
            type="number"
            value={availableCapital}
            onChange={(event) => setAvailableCapital(event.target.value)}
          />
        </label>
        <label>
          Flips per hour (optional)
          <input
            aria-label="Flips per hour"
            type="number"
            value={flipsPerHour}
            onChange={(event) => setFlipsPerHour(event.target.value)}
          />
        </label>
        <button type="submit">Calculate</button>
      </form>
      {formError !== null && <p className="notice notice-error">{formError}</p>}
      {error !== null && <p className="notice notice-error">Flip unavailable: {error}</p>}
      {result !== null && (
        <dl aria-label="Flip result">
          <dt>Effective quantity</dt>
          <dd>
            {result.effectiveQuantity} of {result.requestedQuantity}
            {result.cappedByLimit ? ' (capped by buy limit)' : ''}
            {result.cappedByCapital ? ' (capped by capital)' : ''}
          </dd>
          <dt>Unit net</dt>
          <dd>{result.unitNet.toFixed(2)} gp</dd>
          <dt>Total net</dt>
          <dd>{result.netProfit.toFixed(2)} gp</dd>
          <dt>Capital required</dt>
          <dd>{result.capitalRequired.toFixed(2)} gp</dd>
          <dt>ROI</dt>
          <dd>{(result.roi * 100).toFixed(2)}%</dd>
          {result.effectiveQuantity === 0 && <p className="placeholder">Nothing affordable — zero-quantity result, not an error.</p>}
          {result.profitPerHour !== undefined && (
            <>
              <dt>Profit per hour</dt>
              <dd>{result.profitPerHour.toFixed(2)} gp</dd>
            </>
          )}
        </dl>
      )}
    </div>
  );
}
