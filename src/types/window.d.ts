import type { OsrsApi } from '../../shared/ipc.js';

declare global {
  /**
   * Typed preload bridge. Optional because plain `vite dev` (browser mode)
   * runs without Electron — use `services/electronApi.ts` to access it safely.
   */
  interface Window {
    osrsApi?: OsrsApi;
  }
}

export {};
