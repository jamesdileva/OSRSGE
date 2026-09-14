import { ALERTS_ADD, ALERTS_GET, ALERTS_REMOVE, ALERTS_SET_ENABLED } from '../../shared/ipc.js';
import type {
  AlertsAddRequest,
  AlertsGetResponse,
  AlertsRemoveRequest,
  AlertsSetEnabledRequest,
} from '../../shared/ipc.js';
import type { AlertRule, AlertRuleDraft } from '../../core/alerts/alertRules.js';
import { addAlertRule, removeAlertRule, setAlertRuleEnabled } from '../../core/alerts/alertRules.js';
import type { IpcMainHandler } from './app.handlers.js';

export interface AlertsHandlerDeps {
  load: () => Promise<AlertRule[]> | AlertRule[];
  save: (rules: readonly AlertRule[]) => Promise<void> | void;
  /** Clock override for tests (defaults to Date.now). */
  now?: () => number;
}

/**
 * Sprint 12 slice-2 part 2 alert-rule IPC (roadmap §14).
 * Main owns persistence: handlers load the rule store, apply the pure
 * add/remove/toggle helpers (strict validation, fail-closed), save the
 * whole list, and return the fresh rule list. Evaluation never runs here —
 * the renderer evaluates via evaluateAlerts; no scheduler, no OS
 * notification, no network.
 */
export function registerAlertsHandlers(ipcMain: IpcMainHandler, deps: AlertsHandlerDeps): void {
  const nowMs = (): number => (deps.now !== undefined ? deps.now() : Date.now());

  ipcMain.handle(ALERTS_GET, async (): Promise<AlertsGetResponse> => {
    const rules = await deps.load();
    // Copy for symmetry with mutating handlers: safe across real IPC
    // (structured clone) and avoids aliasing for in-process callers.
    return { rules: rules.map((rule) => ({ ...rule })) };
  });

  ipcMain.handle(ALERTS_ADD, async (_event: unknown, request?: unknown): Promise<AlertsGetResponse> => {
    // ?? {} defaults (SET_ENABLED precedent): an absent request/draft fails
    // with the clean Invalid-rule message, not a TypeError on .draft/.id.
    // Still fail-closed — the pure helper throws before any save.
    const draft = ((request as AlertsAddRequest | undefined) ?? {}).draft ?? {};
    const current = await deps.load();
    // Pure helper throws on invalid drafts/duplicate ids (fail-closed).
    const updated = addAlertRule(current, draft as AlertRuleDraft, nowMs());
    await deps.save(updated);
    return { rules: updated };
  });

  ipcMain.handle(ALERTS_REMOVE, async (_event: unknown, request?: unknown): Promise<AlertsGetResponse> => {
    const id = (request as AlertsRemoveRequest | undefined)?.id;
    const current = await deps.load();
    const updated = removeAlertRule(current, id as string);
    await deps.save(updated);
    return { rules: updated };
  });

  ipcMain.handle(
    ALERTS_SET_ENABLED,
    async (_event: unknown, request?: unknown): Promise<AlertsGetResponse> => {
      const { id, enabled } = (request as AlertsSetEnabledRequest | undefined) ?? {};
      const current = await deps.load();
      const updated = setAlertRuleEnabled(current, id as string, enabled as boolean);
      await deps.save(updated);
      return { rules: updated };
    },
  );
}
