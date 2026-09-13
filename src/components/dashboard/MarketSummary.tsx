import type { JSX } from 'react';
import type { DashboardSummary } from './dashboardViewModel.ts';

export default function MarketSummary({ summary }: { summary: DashboardSummary }): JSX.Element {
  return (
    <div className="market-summary">
      <div className="summary-card">
        <span className="summary-label">Items analyzed</span>
        <strong>{summary.itemsAnalyzed}</strong>
      </div>
      <div className="summary-card">
        <span className="summary-label">Opportunities</span>
        <strong>{summary.opportunitiesFound}</strong>
      </div>
      <div className="summary-card">
        <span className="summary-label">Last update</span>
        <strong>{summary.lastUpdated !== undefined ? new Date(summary.lastUpdated).toLocaleString() : '—'}</strong>
      </div>
    </div>
  );
}
