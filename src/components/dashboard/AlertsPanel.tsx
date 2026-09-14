import { useState } from 'react';
import type { JSX } from 'react';
import type { AlertEvent, AlertMetricKind, AlertRule, AlertRuleDraft } from '../../../core/alerts/alertRules.js';

export interface AlertsPanelProps {
  rules: AlertRule[];
  events: AlertEvent[];
  /** Item scope default for the add-form; null = any item. */
  selectedItemId?: number | null;
  onAddRule?: (draft: AlertRuleDraft) => void;
  onRemoveRule?: (id: string) => void;
  onToggleRule?: (id: string, enabled: boolean) => void;
}

const KINDS: readonly AlertMetricKind[] = ['finalScore', 'change24h', 'spreadPct'];

function describeRule(rule: AlertRule): string {
  const scope = rule.itemId === null ? 'Any item' : `Item #${rule.itemId}`;
  return `${scope}: ${rule.kind} > ${rule.threshold}`;
}

/**
 * Sprint 12 slice-2 part 3: pure in-app alerts panel (roadmap §14).
 * Props-driven, zero IPC/scheduler/network/OS-notification — the Dashboard
 * owns fetching (fetchAlertRules) and persistence (add/remove/setEnabled
 * round-trips) and passes rules + renderer-side evaluateAlerts events.
 * Fired events render as an in-app list; disabled rules and rules with no
 * matching items stay silent (no crash, no OS notification).
 */
export default function AlertsPanel({
  rules,
  events,
  selectedItemId = null,
  onAddRule,
  onRemoveRule,
  onToggleRule,
}: AlertsPanelProps): JSX.Element {
  const [kind, setKind] = useState<AlertMetricKind>('finalScore');
  const [threshold, setThreshold] = useState('80');
  const [thisItemOnly, setThisItemOnly] = useState(false);

  const handleAdd = (): void => {
    if (onAddRule === undefined) {
      return;
    }
    const parsed = Number(threshold);
    if (!Number.isFinite(parsed)) {
      return;
    }
    onAddRule({
      id: `rule-${Date.now()}`,
      itemId: thisItemOnly && selectedItemId !== null ? selectedItemId : null,
      kind,
      threshold: parsed,
    });
  };

  return (
    <div aria-label="Alerts">
      {events.length === 0 ? (
        <p className="placeholder">No alerts firing — rules evaluate against the latest Top-10 in-app.</p>
      ) : (
        <ul aria-label="Fired alerts">
          {events.map((event, index) => (
            <li key={`${event.ruleId}-${event.itemId}-${index}`}>
              {event.ruleId}: item #{event.itemId} at {event.metricValue.toFixed(2)} (threshold{' '}
              {event.threshold})
            </li>
          ))}
        </ul>
      )}
      {rules.length === 0 ? (
        <p className="placeholder">No alert rules yet — add one below.</p>
      ) : (
        <table className="alerts-table" aria-label="Alert rules">
          <thead>
            <tr>
              <th scope="col">Rule</th>
              <th scope="col">Enabled</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr key={rule.id} className={rule.enabled ? undefined : 'disabled'}>
                <td>{describeRule(rule)}</td>
                <td>{rule.enabled ? 'On' : 'Off'}</td>
                <td>
                  {onToggleRule && (
                    <button
                      type="button"
                      aria-label={rule.enabled ? `Disable ${rule.id}` : `Enable ${rule.id}`}
                      onClick={() => onToggleRule(rule.id, !rule.enabled)}
                    >
                      {rule.enabled ? 'Disable' : 'Enable'}
                    </button>
                  )}
                  {onRemoveRule && (
                    <button
                      type="button"
                      aria-label={`Remove ${rule.id}`}
                      onClick={() => onRemoveRule(rule.id)}
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {onAddRule && (
        <form
          aria-label="Add alert rule"
          onSubmit={(event) => {
            event.preventDefault();
            handleAdd();
          }}
        >
          <label>
            Metric
            <select aria-label="Metric" value={kind} onChange={(event) => setKind(event.target.value as AlertMetricKind)}>
              {KINDS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label>
            Threshold
            <input
              aria-label="Threshold"
              type="number"
              value={threshold}
              onChange={(event) => setThreshold(event.target.value)}
            />
          </label>
          <label>
            <input
              aria-label="This item only"
              type="checkbox"
              checked={thisItemOnly}
              onChange={(event) => setThisItemOnly(event.target.checked)}
            />
            This item only
          </label>
          <button type="submit">Add alert</button>
        </form>
      )}
    </div>
  );
}
