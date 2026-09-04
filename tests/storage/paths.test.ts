import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_DATA_DIR_NAME, defaultBaseDir, historyDir } from '../../storage/paths.js';

describe('storage paths', () => {
  it('keeps history under the application data directory', () => {
    expect(historyDir('/base')).toBe(path.join('/base', 'history'));
  });

  it('resolves a product-named base directory', () => {
    expect(defaultBaseDir()).toContain(APP_DATA_DIR_NAME);
    expect(path.basename(defaultBaseDir())).toBe(APP_DATA_DIR_NAME);
  });
});
