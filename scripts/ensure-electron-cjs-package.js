// build:electron helper — stamp dist-electron/package.json {"type":"commonjs"}.
//
// Why: the electron sources compile to CommonJS (tsconfig.electron.json)
// because Electron's *sandboxed preload runner* cannot parse ESM `import`
// statements (bridge-unavailable white-dashboard in the unpacked exe).
// But the packed app.asar/package.json (copied from the root, which must
// stay "type": "module" for Vite) makes Node treat every .js file as ESM —
// so the CJS main/preload crash with "exports is not defined in ES module
// scope" and the app never opens a window. The nested marker re-roots
// module-type resolution for dist-electron/** back to CommonJS, in dev
// (`electron dist-electron/electron/main.js`) and packaged alike.
// dist-electron/ is gitignored build output, so this runs on every build.
import { mkdirSync, writeFileSync } from 'node:fs';

const dir = new URL('../dist-electron', import.meta.url);
mkdirSync(dir, { recursive: true });
writeFileSync(new URL('../dist-electron/package.json', import.meta.url), `${JSON.stringify({ type: 'commonjs' })}\n`);
console.log('dist-electron/package.json: {"type":"commonjs"}');
