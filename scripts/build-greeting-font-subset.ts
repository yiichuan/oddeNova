/**
 * Builds the 京華老宋体 subset used by the app's two Chinese opening lines.
 *
 * The upstream face is a 33 MB TTF. It is referenced by exactly one element —
 * the greeting in ConversationView — which is short-lived (it disappears on the
 * first message) and unpreloaded, so with `font-display: swap` the greeting was
 * effectively always painted in the `serif` fallback: the download never
 * finished before the element unmounted. Subsetting to the ~90 characters the
 * greetings actually use takes it to ~40 KB, which lands well within the swap
 * period.
 *
 * Because the shipped face only carries those glyphs, `font-jinghua-laosongti`
 * must stay exclusive to the text named in `greetingSubsetText()`. Any other
 * text styled with it would silently fall back to `serif` per-glyph — so a new
 * consumer means widening that function, and the staleness test below is what
 * makes forgetting to loud.
 *
 * The source TTF lives outside `public/` on purpose — Vite copies `public/`
 * into `dist/` verbatim, and a 33 MB build artifact is not something to ship.
 *
 * Run: npm run fonts:greetings   (also wired into predev / prebuild)
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GREETINGS_ZH } from '../src/lib/greetings';
import { FAVORITES_EMPTY_ZH, THEME_SONG_INTRO_ZH } from '../src/lib/i18n';

const here = dirname(fileURLToPath(import.meta.url));

export const SOURCE_FONT = resolve(here, '../assets/fonts/京華老宋体v3.0.ttf');
export const OUTPUT_FONT = resolve(here, '../public/fonts/jinghua-laosongti-greetings.woff2');
export const MANIFEST = resolve(here, '../assets/fonts/greeting-subset.manifest.json');

export interface SubsetManifest {
  /** Every distinct character the shipped subset is able to render. */
  charset: string;
  sourceFont: string;
  sourceBytes: number;
  subsetBytes: number;
}

/**
 * The exact text the subset must cover: every distinct character across the
 * Chinese greeting pool, the Favorites page's empty line, and the theme song's
 * opening line — the three places the face is used — sorted so the manifest
 * stays diff-stable regardless of the order any of it is declared in.
 *
 * The theme song's line reaches the same slot the greetings do: it is the
 * opening message of the session seeded on a browser's first entry, flagged
 * `isGreeting`, so ConversationView paints it in this face. Left out of here it
 * would have rendered 35 of its characters in `serif`.
 */
export function greetingSubsetText(): string {
  const sources = [...GREETINGS_ZH, FAVORITES_EMPTY_ZH, THEME_SONG_INTRO_ZH];
  return [...new Set(sources.join(''))].sort().join('');
}

function readManifest(): SubsetManifest | null {
  try {
    return JSON.parse(readFileSync(MANIFEST, 'utf8')) as SubsetManifest;
  } catch {
    return null;
  }
}

export async function main(): Promise<void> {
  const text = greetingSubsetText();

  // The manifest alone is not proof: the font it describes has to still be
  // there. Trusting it on its own means a deleted subset stays deleted through
  // every prebuild, and the greeting silently falls back to `serif`.
  if (readManifest()?.charset === text && existsSync(OUTPUT_FONT)) {
    console.log(`greeting font subset: up to date (${[...text].length} chars)`);
    return;
  }

  // Imported lazily: this pulls in a harfbuzz wasm module, and the staleness
  // test only needs greetingSubsetText().
  const { default: subsetFont } = await import('subset-font');

  const source = readFileSync(SOURCE_FONT);
  // The licence for this face is the author's own declaration, and the only
  // copy of it that travels with the app is what the file carries: harfbuzz
  // keeps the copyright by default but drops the trademark record, so ask for
  // it back. See public/fonts/LICENSES.md.
  const subset = await subsetFont(source, text, {
    targetFormat: 'woff2',
    preserveNameIds: [7],
  });

  mkdirSync(dirname(OUTPUT_FONT), { recursive: true });
  writeFileSync(OUTPUT_FONT, subset);

  const manifest: SubsetManifest = {
    charset: text,
    sourceFont: 'assets/fonts/京華老宋体v3.0.ttf',
    sourceBytes: source.byteLength,
    subsetBytes: subset.byteLength,
  };
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;
  console.log(
    `greeting font subset: rebuilt ${[...text].length} chars — ` +
      `${kb(source.byteLength)} -> ${kb(subset.byteLength)}`,
  );
}

// Only build when run directly, not when imported by the staleness test.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
