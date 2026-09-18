import type { JSX } from 'react';
import { confidenceMultiplier } from '../../../core/market/ranking/confidence.js';
import { riskMultiplier } from '../../../core/market/ranking/risk.js';
import type { Opportunity, RiskLevel } from '../../../core/market/ranking/types.js';

const RISK_ARROW: Record<RiskLevel, string> = {
  LOW: '↓',
  MEDIUM: '→',
  HIGH: '↑',
};

function formatPct(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function formatGp(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  return `${Math.round(value).toLocaleString()} gp`;
}

export interface ItemDetailsPanelProps {
  /** Null/undefined = nothing selected yet (empty state). */
  opportunity?: Opportunity | null;
}

const BREAKDOWN_ROWS = [
  { key: 'momentum', label: 'Momentum' },
  { key: 'liquidity', label: 'Liquidity' },
  { key: 'spread', label: 'Spread' },
  { key: 'profitability', label: 'Profitability' },
  { key: 'consistency', label: 'Consistency' },
  { key: 'volatility', label: 'Volatility' },
] as const;

/**
 * Sprint 8 slice-1: pure props-driven item details + score breakdown
 * (roadmap §10, guide §32). Zero IPC, zero chart.js, zero history fetch —
 * renders one Opportunity the Dashboard selects via row-click. Chart +
 * getItemHistory arrive in slice-2.
 *
 * S21 #48: display-only cached metadata (members/buyLimit/examine/value)
 * surfaced from `opportunity.item` — already served by the pipeline via
 * the mappingCache snapshot (zero new bulk pull). Miss/invalid stays
 * fail-open neutrals (never throws, never writes pipeline state, no
 * filter/ranking input change).
 * Serve/display parity: the panel re-applies the rankEntries serve
 * strictness (members === true, buyLimit integer > 0, value integer
 * >= 0, examine trimmed non-empty) so a non-pipeline Opportunity can
 * never display a value the serve path would null out.
 */
export default function ItemDetailsPanel({ opportunity }: ItemDetailsPanelProps): JSX.Element {
  if (opportunity == null) {
    return <p className="placeholder">Select an item to see details.</p>;
  }
  // Reuse the scorer multipliers (never reimplement): the displayed
  // Base → Final chain must equal base × riskMult × confMult.
  const riskMult = riskMultiplier(opportunity.risk);
  const confMult = confidenceMultiplier(opportunity.confidence);
  return (
    <section aria-label={`Details for ${opportunity.item.name}`}>
      <h3>
        {opportunity.item.name} <small>#{opportunity.item.id}</small>
      </h3>
      <dl>
        <dt>Price</dt>
        <dd>{formatGp(opportunity.currentPrice)}</dd>
        <dt>1h change</dt>
        <dd>{formatPct(opportunity.changes.oneHour)}</dd>
        <dt>6h change</dt>
        <dd>{formatPct(opportunity.changes.sixHour)}</dd>
        <dt>24h change</dt>
        <dd>{formatPct(opportunity.changes.twentyFourHour)}</dd>
        <dt>Spread</dt>
        <dd>
          {formatGp(opportunity.spread.gp)} ({formatPct(opportunity.spread.percent)})
        </dd>
        <dt>Liquidity</dt>
        <dd>{Number.isFinite(opportunity.components.liquidity) ? Math.round(opportunity.components.liquidity) : '—'}</dd>
        <dt>Volatility</dt>
        <dd>{Number.isFinite(opportunity.components.volatility) ? Math.round(opportunity.components.volatility) : '—'}</dd>
        <dt>Estimated profit</dt>
        <dd>{opportunity.estimatedProfit === undefined ? '—' : formatGp(opportunity.estimatedProfit)}</dd>
        <dt>Risk</dt>
        <dd>
          <span className={`risk risk-${opportunity.risk.toLowerCase()}`}>
            {opportunity.risk} <span aria-hidden="true">{RISK_ARROW[opportunity.risk]}</span>
          </span>{' '}
          (×{riskMult.toFixed(2)})
        </dd>
        <dt>Confidence</dt>
        <dd>
          {Math.round(opportunity.confidence * 100)}% (×{confMult.toFixed(3)})
        </dd>
        <dt>Membership</dt>
        <dd>{opportunity.item.members === true ? 'Members' : 'Free-to-play'}</dd>
        <dt>Buy limit</dt>
        <dd>
          {typeof opportunity.item.buyLimit === 'number' &&
          Number.isInteger(opportunity.item.buyLimit) &&
          opportunity.item.buyLimit > 0
            ? opportunity.item.buyLimit.toLocaleString()
            : '—'}
        </dd>
        <dt>Examine</dt>
        <dd>
          {typeof opportunity.item.examine === 'string' && opportunity.item.examine.trim() !== ''
            ? opportunity.item.examine.trim()
            : '—'}
        </dd>
        <dt>Value</dt>
        <dd>
          {typeof opportunity.item.value === 'number' &&
          Number.isInteger(opportunity.item.value) &&
          opportunity.item.value >= 0
            ? formatGp(opportunity.item.value)
            : '—'}
        </dd>
      </dl>
      <table aria-label="Score breakdown">
        <thead>
          <tr>
            <th scope="col">Component</th>
            <th scope="col">Score</th>
          </tr>
        </thead>
        <tbody>
          {BREAKDOWN_ROWS.map((row) => (
            <tr key={row.key}>
              <td>{row.label}</td>
              <td>{opportunity.components[row.key].toFixed(1)}</td>
            </tr>
          ))}
          <tr>
            <td>Base Score</td>
            <td>{opportunity.baseScore.toFixed(1)}</td>
          </tr>
          <tr>
            <td>Final Score</td>
            <td>{opportunity.finalScore.toFixed(1)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}
