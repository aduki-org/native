/**
 * scripts/bun.js
 *
 * Development dist builder using Bun's native bundler (Bun runtime).
 * Run: bun scripts/bun.js
 *      bun run build:bun
 *
 * Produces one self-contained, minified ESM file per subpath export
 * under dist/, mirroring the package.json exports map exactly.
 */

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
  const start = performance.now();

  // Build all entry points in parallel — Bun.build() is async per call
  await Promise.all(entries.map(async ({ out, src }) => {
    const result = await Bun.build({
      entrypoints: [src],
      format:      'esm',
      target:      'browser',
      minify:      true,
      splitting:   false,
    });

    if (!result.success) {
      for (const log of result.logs) {
        console.error(log);
      }
      throw new Error(`Bun build failed for entry: ${src}`);
    }

    // Write each bundle to dist/<name>.js
    for (const output of result.outputs) {
      await Bun.write(`dist/${out}.js`, output);
    }
  }));

  // Generate dist/importmap.json pointing at the flat dist/ files
  const base = 'https://cdn.jsdelivr.net/npm/@adukiorg/native@0.1.0/dist';
  const map = { imports: {} };
  for (const { out } of entries) {
    const key = out === 'index' ? '@adukiorg/native' : `@adukiorg/native/${out}`;
    map.imports[key] = `${base}/${out}.js`;
  }
  await Bun.write('dist/importmap.json', JSON.stringify(map, null, 2) + '\n');

  const ms = (performance.now() - start).toFixed(1);
  console.log(`✓ dist/ built via bun in ${ms}ms (${entries.length} bundles + importmap.json)`);
}

build().catch((err) => {
  console.error('Build failed:', err.message);
  process.exit(1);
});
