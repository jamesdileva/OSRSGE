import { describe, expect, it } from 'vitest';
import { getWindowOptions } from '../../electron/window.ts';

describe('secure BrowserWindow defaults (architecture §6)', () => {
  it('enforces context isolation without node integration or sandbox escape', () => {
    const options = getWindowOptions('/abs/preload.js');

    expect(options.webPreferences?.preload).toBe('/abs/preload.js');
    expect(options.webPreferences?.contextIsolation).toBe(true);
    expect(options.webPreferences?.nodeIntegration).toBe(false);
    expect(options.webPreferences?.sandbox).toBe(true);
  });
});
