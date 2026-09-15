import type { JSX } from 'react';
import type { QualityAssessment } from '../../../core/market/quality/qualityAssessment.js';

export interface DataQualityPanelProps {
  assessment: QualityAssessment | null;
  error: string | null;
  onAssess: () => void;
}

/**
 * Sprint 16 slice-2: pure data-quality panel (roadmap §18).
 * Props-driven, zero IPC/network/scheduler/persistence/fetch — the Dashboard
 * owns assessment (bridge assessQuality with pure-assessDataQuality fallback)
 * and passes the verdict back. All displayed values are ASSESSED trust from
 * the caller-supplied observed batch — nothing is fetched or inferred here.
 */
export default function DataQualityPanel({
  assessment,
  error,
  onAssess,
}: DataQualityPanelProps): JSX.Element {
  return (
    <div aria-label="Data quality">
      <p className="placeholder">
        Trust only — assesses the batch you already hold. Nothing is fetched here.
      </p>
      <button type="button" onClick={onAssess}>
        Assess quality
      </button>
      {error !== null && <p className="notice notice-error">Quality unavailable: {error}</p>}
      {assessment !== null && (
        <dl aria-label="Quality assessment">
          <dt>Freshness</dt>
          <dd>
            {(assessment.freshnessScore * 100).toFixed(1)}%{assessment.stale ? ' (stale)' : ' (fresh)'}
          </dd>
          <dt>Staleness</dt>
          <dd>{Math.round(assessment.stalenessMs / 1000)}s ago</dd>
          <dt>Missing sides</dt>
          <dd>
            {assessment.missingSides.total} snapshots, {assessment.missingSides.missingHigh} missing high,{' '}
            {assessment.missingSides.missingLow} missing low
          </dd>
          <dt>Missing items</dt>
          <dd>
            {assessment.missingItems.length === 0
              ? 'none reported'
              : `missing: ${assessment.missingItems.join(', ')}`}
          </dd>
          <dt>Impossible prices</dt>
          <dd>{assessment.impossibleCount}</dd>
          <dt>Duplicate batch</dt>
          <dd>
            {assessment.duplicateBatch === null
              ? 'not checked'
              : assessment.duplicateBatch
                ? 'duplicate — already stored'
                : 'new batch'}
          </dd>
          <dt>Provider health</dt>
          <dd>
            {assessment.health === null
              ? 'not checked'
              : `${assessment.health.status} — ${assessment.health.reason}`}
          </dd>
        </dl>
      )}
    </div>
  );
}
