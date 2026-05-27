/**
 * scripts/esbuild.mjs
 *
 * Development dist builder using esbuild (Node runtime).
 * Run: node scripts/esbuild.mjs
 *      npm run build
 *
 * Produces one self-contained, minified ESM file per subpath export
 * under dist/, mirroring the package.json exports map exactly.
 */

import * as esbuild from 'esbuild';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

const entries = [
  { out: 'index',      src: 'src/index.js' },
  { out: 'api',        src: 'src/core/api/index.js' },
  { out: 'state',      src: 'src/core/state/index.js' },
  { out: 'events',     src: 'src/core/events/index.js' },
  { out: 'router',     src: 'src/core/router/index.js' },
  { out: 'storage',    src: 'src/core/storage/index.js' },
  { out: 'offline',    src: 'src/core/offline/index.js' },
  { out: 'animations', src: 'src/core/animations/index.js' },
  { out: 'workers',    src: 'src/core/workers/index.js' },
  { out: 'security',   src: 'src/core/security/index.js' },
  { out: 'platform',   src: 'src/core/platform/supports.js' },
  { out: 'ui',         src: 'src/core/ui/index.js' },
  { out: 'elements',   src: 'src/elements/index.js' },
];

async function build() {
  await mkdir('dist', { recursive: true });

  const start = performance.now();

  await esbuild.build({
    entryPoints: Object.fromEntries(entries.map(({ out, src }) => [out, src])),
    bundle:   true,
    format:   'esm',
    platform: 'browser',
    outdir:   'dist',
    target:   ['chrome105', 'firefox115', 'safari16'],
    minify:   true,
    logLevel: 'silent',
  });

  // Generate dist/importmap.json pointing at the flat dist/ files
  const base = 'https://cdn.jsdelivr.net/npm/@aduki/native@0.1.0/dist';
  const map = { imports: {} };
  for (const { out } of entries) {
    const key = out === 'index' ? '@aduki/native' : `@aduki/native/${out}`;
    map.imports[key] = `${base}/${out}.js`;
  }
  await writeFile(join('dist', 'importmap.json'), JSON.stringify(map, null, 2) + '\n');

  const ms = (performance.now() - start).toFixed(1);
  console.log(`✓ dist/ built via esbuild in ${ms}ms (${entries.length} bundles + importmap.json)`);
}

build().catch((err) => {
  console.error('Build failed:', err.message);
  process.exit(1);
});
