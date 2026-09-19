import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Regression guard for #57 win-unpack white screen.
// Packaged renderer loads via file:// loadFile(dist/index.html), so the
// vite emit must use relative asset URLs (base './'). This guard fails
// if the base regresses to the default absolute '/' or if src/** gains
// a hardcoded absolute ref that bypasses the base.

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      walk(full, out);
    } else if (/\.(ts|tsx|css)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe('win-unpack relative base guard (#57)', () => {
  it('vite base stays relative', () => {
    const config = readFileSync('vite.config.ts', 'utf8');
    expect(config).toMatch(/base:\s*['"]\.\/['"]/);
  });

  it('packaged branch stays loadFile(dist/index.html), dev branch stays loadURL', () => {
    const main = readFileSync('electron/main.ts', 'utf8');
    expect(main).toMatch(/loadFile\(.*dist.*index\.html/);
    expect(main).toMatch(/loadURL/);
    // Branch correctness: !isPackaged -> loadURL, else -> loadFile.
    // Coexistence alone would still pass if the branches swapped.
    expect(main).toMatch(
      /if\s*\(\s*!app\.isPackaged\s*\)[\s\S]*?loadURL[\s\S]*?\}\s*else\s*\{[\s\S]*?loadFile/,
    );
  });

  it('root index.html gains no new absolute bypass beyond Vite-rewritten entries', () => {
    // Source keeps href="/favicon.svg" + src="/src/main.tsx" (Vite rewrites
    // both to ./ at emit under base './' — verified in dist). Any other
    // absolute href/src or /assets/ ref would bypass the base, so fail.
    const html = readFileSync('index.html', 'utf8');
    const absolutes = [...html.matchAll(/(?:href|src)\s*=\s*["'](\/[^"']*)["']/g)].map(
      (m) => m[1],
    );
    const knownRewritten = new Set(['/favicon.svg', '/src/main.tsx']);
    const unexpected = absolutes.filter((ref) => !knownRewritten.has(ref));
    expect(unexpected).toEqual([]);
    expect(html).not.toMatch(/["']\/assets\//);
  });

  it('src/** has no hardcoded absolute bypass of the base', () => {
    const files = walk('src');
    expect(files.length).toBeGreaterThan(0);
    const offenders: string[] = [];
    const banned = [
      /fetch\(\s*['"]\//,
      /["']\/assets\//,
      /href\s*=\s*["']\//,
      /src\s*=\s*["']\//,
      /url\(\s*\//,
    ];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      if (banned.some((re) => re.test(text))) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
