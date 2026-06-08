#!/usr/bin/env node
/**
 * Check whether bundled sample index JSONs are out of date with upstream.
 *
 * Usage:
 *   node scripts/check-sample-index.mjs          # report only
 *   node scripts/check-sample-index.mjs --fix    # overwrite local files with upstream
 */

import { readFileSync, writeFileSync } from 'fs';
import { createHash } from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const SOURCES = [
  {
    name: 'dirt-samples',
    url: 'https://raw.githubusercontent.com/tidalcycles/dirt-samples/main/strudel.json',
    local: 'public/sample-index/dirt-samples.json',
  },
  {
    name: 'tidal-drum-machines',
    url: 'https://raw.githubusercontent.com/felixroos/dough-samples/main/tidal-drum-machines.json',
    local: 'public/sample-index/tidal-drum-machines.json',
  },
  {
    name: 'piano',
    url: 'https://raw.githubusercontent.com/felixroos/dough-samples/main/piano.json',
    local: 'public/sample-index/piano.json',
  },
  {
    name: 'vcsl',
    url: 'https://raw.githubusercontent.com/felixroos/dough-samples/main/vcsl.json',
    local: 'public/sample-index/vcsl.json',
  },
  {
    name: 'mridangam',
    url: 'https://raw.githubusercontent.com/felixroos/dough-samples/main/mridangam.json',
    local: 'public/sample-index/mridangam.json',
  },
  {
    name: 'uzu-drumkit',
    url: 'https://raw.githubusercontent.com/tidalcycles/uzu-drumkit/main/strudel.json',
    local: 'public/sample-index/uzu-drumkit.json',
  },
  {
    name: 'tidal-drum-machines-alias',
    url: 'https://raw.githubusercontent.com/todepond/samples/main/tidal-drum-machines-alias.json',
    local: 'public/sample-index/tidal-drum-machines-alias.json',
  },
];

function sha256(text) {
  return createHash('sha256').update(text).digest('hex').slice(0, 12);
}

const fix = process.argv.includes('--fix');
let anyDiff = false;

console.log('Checking sample index files against upstream…\n');

for (const { name, url, local } of SOURCES) {
  const localPath = join(ROOT, local);
  let localText;
  try {
    localText = readFileSync(localPath, 'utf8');
  } catch {
    console.error(`  ✗  ${name}: local file missing at ${local}`);
    anyDiff = true;
    continue;
  }

  let upstreamText;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    upstreamText = await res.text();
  } catch (err) {
    console.error(`  ✗  ${name}: failed to fetch upstream — ${err.message}`);
    anyDiff = true;
    continue;
  }

  if (localText === upstreamText) {
    console.log(`  ✓  ${name}`);
  } else {
    anyDiff = true;
    const localHash = sha256(localText);
    const upstreamHash = sha256(upstreamText);
    const localSize = (localText.length / 1024).toFixed(1);
    const upstreamSize = (upstreamText.length / 1024).toFixed(1);
    if (fix) {
      writeFileSync(localPath, upstreamText, 'utf8');
      console.log(`  ↑  ${name}: updated (${localSize}KB → ${upstreamSize}KB, ${localHash} → ${upstreamHash})`);
    } else {
      console.log(`  ≠  ${name}: OUTDATED (local ${localHash} ${localSize}KB, upstream ${upstreamHash} ${upstreamSize}KB)`);
    }
  }
}

console.log('');

if (!anyDiff) {
  console.log('All sample index files are up to date.');
  process.exit(0);
} else if (fix) {
  console.log('Updated local files. Commit the changes to public/sample-index/.');
  process.exit(0);
} else {
  console.log('Some files are outdated. Run with --fix to update, or re-run the download commands in the PR that added these files.');
  process.exit(1);
}
