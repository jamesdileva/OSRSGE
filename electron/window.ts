import type { BrowserWindowConstructorOptions } from 'electron';

/**
 * Centralized secure window options (architecture §6, implementation guide §6).
 * Kept in a pure factory so the security flags are unit-testable without
 * launching Electron: contextIsolation on, nodeIntegration off, sandbox on.
 */
export function getWindowOptions(preloadPath: string): BrowserWindowConstructorOptions {
  return {
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  };
}
