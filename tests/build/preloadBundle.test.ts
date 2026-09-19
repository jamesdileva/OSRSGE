import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Guard for the unpacked-exe dead-bridge failure: Electron's sandboxed
// preload runner cannot resolve relative requires from inside app.asar
// ("module not found: ../shared/ipc.js" — bridge silently absent while
// the window renders fine). So the build bundles preload self-contained
// (esbuild, electron external) and stamps dist-electron type:commonjs
// (root package.json "type": "module" would otherwise crash the CJS
// main with "exports is not defined", no window at all).

describe('preload packaging guards (dead-bridge class)', () => {
  it('build:electron bundles preload self-contained via esbuild', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { scripts: Record<string, string> };
    const step = pkg.scripts['build:electron'] ?? '';
    expect(step).toMatch(/esbuild\s+electron\/preload\.ts\s+--bundle/);
    expect(step).toMatch(/--external:electron/);
    expect(step).toMatch(/--format=cjs/);
    expect(step).toMatch(/ensure-electron-cjs-package/);
  });

  it('preload source keeps runtime imports bundlable (electron + pure modules only)', () => {
    const preload = readFileSync('electron/preload.ts', 'utf8');
    // No node: builtins — the sandbox has no Node fs/process to offer.
    expect(preload).not.toMatch(/from\s*['"]node:/);
    expect(preload).toMatch(/exposeInMainWorld\('osrsApi'/);
  });

  it('emitted preload (when built) has no relative requires', () => {
    const out = 'dist-electron/electron/preload.js';
    if (!existsSync(out)) {
      return;
    }
    const bundled = readFileSync(out, 'utf8');
    expect(bundled).not.toMatch(/require\(["']\.\.?\//);
    expect(bundled).toMatch(/require\(["']electron["']\)/);
    expect(bundled).toMatch(/exposeInMainWorld/);
    // Channel contract rides along inlined (single source stays shared/ipc.ts).
    expect(bundled).toMatch(/market:getTop10/);
  });
});
