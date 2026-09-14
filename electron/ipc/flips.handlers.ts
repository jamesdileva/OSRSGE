import { FLIP_CALCULATE } from '../../shared/ipc.js';
import type { FlipCalculateRequest, FlipCalculateResponse } from '../../shared/ipc.js';
import { calcFlip } from '../../core/market/flips/flipCalculator.js';
import type { FlipInput } from '../../core/market/flips/flipCalculator.js';
import type { IpcMainHandler } from './app.handlers.js';

export interface FlipsHandlerDeps {
  /** Pure calculator override for tests (defaults to calcFlip). */
  calculate?: (input: FlipInput) => FlipCalculateResponse['result'];
}

/**
 * Sprint 13 slice-2 flip-calculator IPC (roadmap §15).
 * Stateless: the handler applies the pure calcFlip to the caller's observed
 * prices and returns the result verbatim (cappedByLimit/cappedByCapital
 * flags and unaffordable-zero semantics preserved). No persistence, no
 * market-data fetching, no scheduler, no network. Invalid inputs throw
 * fail-closed via the pure validator — nothing is saved because there is
 * nothing to save.
 */
export function registerFlipsHandlers(ipcMain: IpcMainHandler, deps: FlipsHandlerDeps = {}): void {
  const calculate = deps.calculate ?? calcFlip;
  ipcMain.handle(FLIP_CALCULATE, async (_event: unknown, request?: unknown): Promise<FlipCalculateResponse> => {
    // ?? {} defaults (alerts-handler precedent): an absent request/input
    // fails with the pure validator's clean Invalid message, not a
    // TypeError on .input.
    const input = ((request as FlipCalculateRequest | undefined) ?? {}).input ?? {};
    // Pure helper throws on invalid prices/quantities/limits/capital/rate.
    const result = calculate(input as FlipInput);
    return { result };
  });
}
