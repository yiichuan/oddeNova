// Reproducible bundle report over Vite's build manifest.
//
// Reads dist/.vite/manifest.json, locates the HTML entry bundles, walks each
// import closure recursively, dedupes by file path, and reports raw/gzip
// sizes for:
//   1. Each entry's static closure (the JS/CSS the browser downloads before
//      the entry can render).
//   2. Every dynamic entry (dynamicImports) grouped by its static importer —
//      which capabilities load when a user navigates / opens a dialog. A
//      chunk that an eager (mount-time) effect would import must not be
//      hidden behind the "dynamic" label: the static-importer grouping keeps
//      it visible.
//
// Usage: node scripts/report-bundle-size.mjs [--dist <dir>] [--json <out>] [--app-closure <manifest-key>]
//
// --app-closure src/App.tsx: App is (after the entry split) a *dynamic* chunk
// of index.html. The HTML entry's static closure alone is not "first render":
// this flag walks the HTML entry's static imports PLUS the named chunk's
// static imports (deduped) and reports that combined set as the
// "App render" closure, so the split cannot be praised with a tiny main.js
// number while the app itself still has to arrive.

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';

const gzipAsync = promisify(gzip);

const DEFAULT_DIST = 'dist';
const MANIFEST_RELPATH = ['.vite', 'manifest.json'];

/** Walk all manifest chunk names, in stable manifest-key order. */
function manifestKeys(manifest) {
  return Object.keys(manifest).sort();
}

/**
 * Chunk entries are keyed by source path but the file/data they point at
 * carries the name. HTML entries are excluded from module accounting.
 */
function isHtmlEntry(chunk) {
  return chunk.isEntry && chunk.src?.toLowerCase().endsWith('.html');
}

function hashOf(data) {
  return createHash('sha256').update(data).digest('hex').slice(0, 12);
}

async function fileDigest(absolutePath) {
  const buf = await readFile(absolutePath);
  const gz = await gzipAsync(buf);
  return {
    raw: buf.byteLength,
    gzip: gz.byteLength,
    sha256: hashOf(buf),
  };
}

/**
 * Recursive BFS/DFS over `imports` (static only — `dynamicImports` is
 * reported separately). Returns { path → Set<number> of entry indices }
 * ordered by first discovery, deduped so shared chunks are counted once per
 * entry group.
 */
function collectImportClosure(manifest, startKeys) {
  const visited = new Set();
  const order = [];
  const walk = (key) => {
    if (visited.has(key)) return;
    visited.add(key);
    const chunk = manifest[key];
    order.push(key);
    for (const imported of chunk.imports ?? []) walk(imported);
    // cssFiles are emitted alongside the JS and loaded with it.
  };
  for (const key of startKeys) {
    if (!manifest[key]) {
      throw new Error(`Manifest has no chunk "${key}"`);
    }
    walk(key);
  }
  return order;
}

function assetPathsFor(manifest, chunkKeys) {
  const paths = new Set();
  for (const key of chunkKeys) {
    const chunk = manifest[key];
    paths.add(chunk.file);
    for (const css of chunk.css ?? []) paths.add(css);
    for (const asset of chunk.assets ?? []) paths.add(asset);
  }
  return [...paths].sort();
}

async function readManifest(distDir) {
  const manifestPath = join(distDir, ...MANIFEST_RELPATH);
  let raw;
  try {
    raw = await readFile(manifestPath, 'utf-8');
  } catch {
    throw new Error(
      `No Vite manifest at ${manifestPath}. Run the production build first (build.manifest is enabled in vite.config.ts).`,
    );
  }
  return JSON.parse(raw);
}

/** Map src file (e.g. "index.html") → manifest chunk key for HTML entries. */
function htmlEntryLookup(manifest) {
  const lookup = new Map();
  for (const key of manifestKeys(manifest)) {
    const chunk = manifest[key];
    if (isHtmlEntry(chunk)) lookup.set(chunk.src.replace(/\\/g, '/'), key);
  }
  return lookup;
}

/**
 * The report's two axes:
 *  - `entries`: one row per HTML entry (static closure sizes).
 *  - `dynamics`: dynamic chunks grouped by the entry each was first reached
 *    from via their static importers, so an eagerly-fetched dynamic chunk
 *    shows against the entry that pulls it.
 */
/**
 * Entry-closure rows for the HTML entries, plus (optionally) the combined
 * "app render" closure: an HTML entry whose render needs a dynamic chunk
 * (e.g. src/App.tsx) is measured with that chunk's own static imports folded
 * in. The union is deduped by manifest key before sizes are summed.
 */
export async function buildReport(distDir, appClosureKey = null) {
  const manifest = await readManifest(distDir);
  const htmlEntries = htmlEntryLookup(manifest);

  const entryRows = [];
  for (const [src, key] of htmlEntries) {
    const closureKeys = collectImportClosure(manifest, [key]);
    const paths = assetPathsFor(manifest, closureKeys);
    const sizes = { raw: 0, gzip: 0 };
    const files = [];
    for (const relpath of paths) {
      const file = join(distDir, relpath);
      let digest;
      try {
        digest = await fileDigest(file);
      } catch (error) {
        throw new Error(`Bundle report: failed to read "${relpath}" (${error.message})`);
      }
      sizes.raw += digest.raw;
      sizes.gzip += digest.gzip;
      files.push({ file: relpath, ...digest });
    }
    entryRows.push({ entry: src, jsChunks: closureKeys.length, assets: files, totals: sizes });
  }

  if (appClosureKey) {
    const htmlKey = htmlEntries.get('index.html');
    if (!htmlKey) throw new Error('Bundle report: no index.html entry to anchor the app closure');
    if (!manifest[appClosureKey]) {
      throw new Error(`Bundle report: unknown manifest key "${appClosureKey}"`);
    }
    const closureKeys = collectImportClosure(manifest, [htmlKey, appClosureKey]);
    const paths = assetPathsFor(manifest, closureKeys);
    const sizes = { raw: 0, gzip: 0 };
    const files = [];
    for (const relpath of paths) {
      const digest = await fileDigest(join(distDir, relpath));
      sizes.raw += digest.raw;
      sizes.gzip += digest.gzip;
      files.push({ file: relpath, ...digest });
    }
    entryRows.push({
      entry: `index.html + ${appClosureKey} (App render closure)`,
      jsChunks: closureKeys.length,
      assets: files,
      totals: sizes,
    });
  }

  // Group each dynamic-import-only chunk under the closest static importer.
  const dynamicRows = [];
  const htmlKeys = new Set(htmlEntries.values());
  for (const key of manifestKeys(manifest)) {
    const chunk = manifest[key];
    if (!chunk.dynamicImports || chunk.dynamicImports.length === 0) continue;
    for (const dynamicKey of chunk.dynamicImports) {
      if (htmlKeys.has(dynamicKey)) continue;
      dynamicRows.push({
        dynamicEntry: manifest[dynamicKey]?.file ?? dynamicKey,
        importedStaticallyBy: chunk.src ?? key,
        importerEntryFile: chunk.file,
      });
    }
  }
  dynamicRows.sort((a, b) => a.dynamicEntry.localeCompare(b.dynamicEntry));

  return { dist: distDir, entries: entryRows, dynamics: dynamicRows };
}

function fmtBytes(n) {
  if (n >= 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  return `${(n / 1024).toFixed(1)} KB`;
}

async function main() {
  const argv = process.argv.slice(2);
  let distArg = DEFAULT_DIST;
  let jsonOutPath = null;
  let appClosureKey = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dist') distArg = argv[++i] ?? distArg;
    else if (argv[i] === '--json') jsonOutPath = argv[++i] ?? jsonOutPath;
    else if (argv[i] === '--app-closure') appClosureKey = argv[++i] ?? appClosureKey;
  }
  const distDir = resolve(distArg);
  const report = await buildReport(distDir, appClosureKey);

  const lines = [];
  for (const entry of report.entries) {
    lines.push(`Entry ${entry.entry}`);
    lines.push(`  chunks: ${entry.jsChunks}, assets (incl. css): ${entry.assets.length}`);
    lines.push(`  raw:    ${fmtBytes(entry.totals.raw)} (${entry.totals.raw} bytes)`);
    lines.push(`  gzip:   ${fmtBytes(entry.totals.gzip)} (${entry.totals.gzip} bytes)`);
    for (const asset of entry.assets) {
      lines.push(`    ${asset.file}  raw ${fmtBytes(asset.raw)}  gzip ${fmtBytes(asset.gzip)}  ${asset.sha256}`);
    }
  }
  if (dynamicRowsEmpty(report)) lines.push('(no dynamic chunks)');
  else {
    lines.push('Dynamic entries (importedStaticallyBy → chunk):');
    for (const row of report.dynamics) {
      lines.push(`  ${row.importedStaticallyBy} → ${row.dynamicEntry}`);
    }
  }
  const text = lines.join('\n');
  console.log(text);
  if (jsonOutPath) {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(jsonOutPath, JSON.stringify(report, null, 2));
    console.log(`\nJSON report: ${jsonOutPath}`);
  }
}

function dynamicRowsEmpty(report) {
  return report.dynamics.length === 0;
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.url.replace(/^file:\/\//, ''));
if (isDirectRun) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
