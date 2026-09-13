import type { JSX } from 'react';
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

export interface TopOpportunityTableProps {
  opportunities: Opportunity[];
  /** S8 placeholder: selected row id only, no details logic lives here. */
  selectedItemId?: number | null;
  onSelectItem?: (itemId: number) => void;
}

export default function TopOpportunityTable({
  opportunities,
  selectedItemId = null,
  onSelectItem,
}: TopOpportunityTableProps): JSX.Element {
  if (opportunities.length === 0) {
    return <p className="placeholder">No market data yet — the provider, storage, analytics, and ranking sprints will fill this table.</p>;
  }
  return (
    <>
      <table className="top10-table" aria-label="Top 10 opportunities">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col">Item</th>
            <th scope="col">Price</th>
            <th scope="col">1h</th>
            <th scope="col">6h</th>
            <th scope="col">24h</th>
            <th scope="col">Spread</th>
            <th scope="col">Liquidity</th>
            <th scope="col">Risk</th>
            <th scope="col">Score</th>
          </tr>
        </thead>
        <tbody>
          {opportunities.slice(0, 10).map((opportunity, index) => (
            <tr
              key={opportunity.item.id}
              onClick={onSelectItem ? () => onSelectItem(opportunity.item.id) : undefined}
            >
              <td>{opportunity.rank || index + 1}</td>
              <td>{opportunity.item.name}</td>
              <td>{formatGp(opportunity.currentPrice)}</td>
              <td>{formatPct(opportunity.changes.oneHour)}</td>
              <td>{formatPct(opportunity.changes.sixHour)}</td>
              <td>{formatPct(opportunity.changes.twentyFourHour)}</td>
              <td>{formatPct(opportunity.spread.percent)}</td>
              <td>{Math.round(opportunity.components.liquidity)}</td>
              <td>
                <span className={`risk risk-${opportunity.risk.toLowerCase()}`}>
                  {opportunity.risk} <span aria-hidden="true">{RISK_ARROW[opportunity.risk]}</span>
                </span>
              </td>
              <td>{opportunity.finalScore.toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {selectedItemId !== null && selectedItemId !== undefined && (
        <p className="placeholder">Details for item {selectedItemId} arrive in Sprint 8.</p>
      )}
    </>
  );
}
