import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_DATA_DIR_NAME, appLogFile, defaultBaseDir, historyDir, logDir } from '../../storage/paths.js';

describe('storage paths', () => {
  it('keeps history under the application data directory', () => {
    expect(historyDir('/base')).toBe(path.join('/base', 'history'));
  });

  it('keeps the app log under logs/ (S19 slice-2, guide §16)', () => {
    expect(logDir('/base')).toBe(path.join('/base', 'logs'));
    expect(appLogFile('/base')).toBe(path.join('/base', 'logs', 'app.log'));
  });

  it('resolves a product-named base directory', () => {
    expect(defaultBaseDir()).toContain(APP_DATA_DIR_NAME);
    expect(path.basename(defaultBaseDir())).toBe(APP_DATA_DIR_NAME);
  });
});
