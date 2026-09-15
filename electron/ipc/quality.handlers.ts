import { QUALITY_ASSESS } from '../../shared/ipc.js';
import type { QualityAssessRequest, QualityAssessResponse } from '../../shared/ipc.js';
import { assessDataQuality } from '../../core/market/quality/qualityAssessment.js';
import type { QualityAssessmentInput } from '../../core/market/quality/qualityAssessment.js';
import type { IpcMainHandler } from './app.handlers.js';

export interface QualityHandlerDeps {
  /** Pure assessor override for tests (defaults to assessDataQuality). */
  assess?: (input: QualityAssessmentInput) => QualityAssessResponse['assessment'];
}

/**
 * Sprint 16 slice-2 data-quality IPC (roadmap §18).
 * Stateless: the handler applies the pure assessDataQuality to the caller's
 * observed batch and returns the verdict verbatim (freshness/stale, missing
 * sides/items, impossible count, duplicate flag, provider health). No
 * persistence, no market-data fetching, no scheduler, no network. Invalid
 * inputs throw fail-closed via the pure validators — nothing is saved
 * because there is nothing to save.
 */
export function registerQualityHandlers(ipcMain: IpcMainHandler, deps: QualityHandlerDeps = {}): void {
  const assess = deps.assess ?? assessDataQuality;
  ipcMain.handle(QUALITY_ASSESS, async (_event: unknown, request?: unknown): Promise<QualityAssessResponse> => {
    // ?? {} defaults (flips-handler precedent): an absent request/input
    // fails with the pure validator's clean Invalid message, not a
    // TypeError on .input.
    const input = ((request as QualityAssessRequest | undefined) ?? {}).input ?? {};
    // Pure orchestrator throws on invalid snapshots/clocks/counters.
    const assessment = assess(input as QualityAssessmentInput);
    return { assessment };
  });
}
