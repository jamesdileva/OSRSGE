import type { JSX } from 'react';
import type { MembershipFilter, OpportunityFilters } from '../../../core/market/ranking/filters.js';
import type { RiskLevel } from '../../../core/market/ranking/types.js';

const RISK_LEVELS: readonly RiskLevel[] = ['LOW', 'MEDIUM', 'HIGH'];
const MEMBERSHIPS: readonly MembershipFilter[] = ['all', 'f2p', 'members'];

/**
 * Sprint 9 slice-2: pure filter controls (roadmap §11).
 * Props-driven, zero IPC/scheduler/network — every edit calls `onChange`
 * synchronously so the Dashboard applies `applyFilters` instantly as a
 * client-side view. Empty max-price means unbounded (Infinity over IPC
 * wire as null); empty numeric fields mean "no bound" (undefined).
 */
export interface FilterBarProps {
  filters: OpportunityFilters;
  onChange: (filters: OpportunityFilters) => void;
}

function numberOrUndefined(raw: string): number | undefined {
  if (raw.trim() === '') {
    return undefined;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

export default function FilterBar({ filters, onChange }: FilterBarProps): JSX.Element {
  const toggleRisk = (risk: RiskLevel): void => {
    const current = filters.allowedRisks ?? [...RISK_LEVELS];
    const next = current.includes(risk) ? current.filter((r) => r !== risk) : [...current, risk];
    onChange({ ...filters, allowedRisks: next });
  };

  return (
    <fieldset aria-label="Opportunity filters" className="filter-bar">
      <legend>Filters</legend>
      <label>
        Membership
        <select
          aria-label="Membership"
          value={filters.membership ?? 'all'}
          onChange={(event) => onChange({ ...filters, membership: event.target.value as MembershipFilter })}
        >
          {MEMBERSHIPS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>
      <label>
        Min price
        <input
          aria-label="Min price"
          type="number"
          min={0}
          value={filters.minPrice ?? ''}
          placeholder="0"
          onChange={(event) => onChange({ ...filters, minPrice: numberOrUndefined(event.target.value) })}
        />
      </label>
      <label>
        Max price
        <input
          aria-label="Max price"
          type="number"
          min={0}
          value={filters.maxPrice === Number.POSITIVE_INFINITY ? '' : (filters.maxPrice ?? '')}
          placeholder="No max"
          onChange={(event) => {
            const next = numberOrUndefined(event.target.value);
            onChange({ ...filters, maxPrice: next ?? Number.POSITIVE_INFINITY });
          }}
        />
      </label>
      <fieldset aria-label="Risk levels">
        <legend>Risk</legend>
        {RISK_LEVELS.map((risk) => {
          const checked = (filters.allowedRisks ?? [...RISK_LEVELS]).includes(risk);
          return (
            <label key={risk}>
              <input
                type="checkbox"
                aria-label={`Risk ${risk}`}
                checked={checked}
                onChange={() => toggleRisk(risk)}
              />
              {risk}
            </label>
          );
        })}
      </fieldset>
      <label>
        Min liquidity
        <input
          aria-label="Min liquidity"
          type="number"
          min={0}
          max={100}
          value={filters.minLiquidity ?? ''}
          placeholder="0"
          onChange={(event) => onChange({ ...filters, minLiquidity: numberOrUndefined(event.target.value) })}
        />
      </label>
      <label>
        Min score
        <input
          aria-label="Min score"
          type="number"
          min={0}
          value={filters.minScore ?? ''}
          placeholder="0"
          onChange={(event) => onChange({ ...filters, minScore: numberOrUndefined(event.target.value) })}
        />
      </label>
    </fieldset>
  );
}
