import { APP_GET_VERSION } from '../../shared/ipc.js';

/** Minimal structural type for ipcMain — keeps handlers unit-testable with a mock. */
export interface IpcMainHandler {
  handle(channel: string, listener: (event: unknown, ...args: unknown[]) => unknown): void;
}

export interface AppHandlerDeps {
  getVersion: () => string;
}

/** Sprint 1 IPC surface: a single version channel proving the bridge works. */
export function registerAppHandlers(ipcMain: IpcMainHandler, deps: AppHandlerDeps): void {
  ipcMain.handle(APP_GET_VERSION, () => deps.getVersion());
}
