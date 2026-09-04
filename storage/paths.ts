import { env } from 'node:process';
import { homedir, platform } from 'node:os';
import path from 'node:path';

/**
 * Local data locations (guide §16, architecture §20).
 * Never write persistent data into src/, dist/, or the project root.
 * Inside Electron, prefer `app.getPath('userData')`; `defaultBaseDir()`
 * mirrors its platform conventions for scripts and tests.
 */

export const APP_DATA_DIR_NAME = 'OSRS-GE-Analyzer';

export function defaultBaseDir(): string {
  const home = homedir();
  if (platform() === 'win32') {
    return path.join(env.APPDATA ?? path.join(home, 'AppData', 'Roaming'), APP_DATA_DIR_NAME);
  }
  if (platform() === 'darwin') {
    return path.join(home, 'Library', 'Application Support', APP_DATA_DIR_NAME);
  }
  return path.join(env.XDG_CONFIG_HOME ?? path.join(home, '.config'), APP_DATA_DIR_NAME);
}

export function historyDir(baseDir: string): string {
  return path.join(baseDir, 'history');
}
