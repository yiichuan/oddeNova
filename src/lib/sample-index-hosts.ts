/**
 * Loading the bundled sample indexes (public/sample-index/*.json) with two
 * repairs on the way in.
 *
 * 1. Known path mistakes in the upstream indexes are put right (PATH_REPAIRS),
 *    and a bare `%` in a file name — Dirt-Samples' `h` has `…200%_1000…` — is
 *    escaped, since a browser sends it as is and GitHub answers 400.
 *
 * 2. GitHub's raw host answers every file with
 *    `Content-Disposition: attachment; filename=<the file's path>`, the path
 *    left unquoted. A path with a comma in it — VCSL's "Snare Drum, Rope
 *    Tension", its pianos, ocarinas, kalimbas and shakers — then reads as two
 *    such headers, and Chrome refuses the whole response
 *    (ERR_RESPONSE_HEADERS_MULTIPLE_CONTENT_DISPOSITION): the sound is
 *    registered but can never be fetched. Those sounds are handed to
 *    superdough under our own same-origin passthrough instead
 *    (server/vcsl-proxy.ts), which fetches the file server-side and sends it
 *    on without the header. Everything else is left on GitHub exactly as the
 *    index says. (jsDelivr is no way round it: VCSL is past its 50 MB
 *    repository limit, and it refuses any file it has not already cached.)
 *
 * The index files themselves stay verbatim mirrors of upstream
 * (scripts/check-sample-index.mjs), which is why both repairs are made here
 * rather than in them.
 */

import { DIRT_SAMPLE_ALIASES, FEATURED_SAMPLE_BASE, FEATURED_SAMPLE_FILES } from './additional-sample-sources';

export type SampleIndex = Record<string, unknown>;

/** Annotation inventory order. Later libraries own any duplicate name. */
export const SAMPLE_LIBRARIES = ['dirt-samples', 'tidal-drum-machines', 'piano', 'vcsl', 'mridangam', 'uzu-drumkit'] as const;

export const FEATURED_SAMPLE_INDEX = { _base: FEATURED_SAMPLE_BASE, ...FEATURED_SAMPLE_FILES };

export function withDirtSampleAliases(index: SampleIndex): SampleIndex {
  return { ...index, ...Object.fromEntries(DIRT_SAMPLE_ALIASES
    .filter(([source]) => Object.hasOwn(index, source))
    .map(([source, alias]) => [alias, index[source]])) };
}

/*
 * Paths the upstream indexes have wrong, mended before anything is fetched:
 * for each base, a path prefix and what it should have been. VCSL's
 * `tom_mallet` lost the leading `Membranophones/` every other drum has, so as
 * indexed it is a 404 on every take.
 */
const PATH_REPAIRS: Record<string, readonly (readonly [string, string])[]> = {
  'https://raw.githubusercontent.com/sgossner/VCSL/master/': [
    ['Struck%20Membranophones/', 'Membranophones/Struck%20Membranophones/'],
  ],
};

/* A `%` that does not start an escape is a literal percent sign in the file's name. */
const escapeBarePercents = (path: string) => path.replace(/%(?![0-9A-Fa-f]{2})/g, '%25');

const mendPaths = (entry: unknown, repairs: readonly (readonly [string, string])[]): unknown => {
  if (typeof entry === 'string') {
    const repair = repairs.find(([wrong]) => entry.startsWith(wrong));
    return escapeBarePercents(repair ? repair[1] + entry.slice(repair[0].length) : entry);
  }
  if (Array.isArray(entry)) return entry.map((path) => mendPaths(path, repairs));
  if (entry && typeof entry === 'object') {
    return Object.fromEntries(Object.entries(entry).map(([key, value]) => [key, mendPaths(value, repairs)]));
  }
  return entry;
};

/** The index with the known upstream path mistakes put right. */
export function repairPaths(index: SampleIndex): SampleIndex {
  const repairs = (typeof index._base === 'string' ? PATH_REPAIRS[index._base] : undefined) ?? [];
  return Object.fromEntries(Object.entries(index).map(([name, entry]) => (
    name === '_base' ? [name, entry] : [name, mendPaths(entry, repairs)]
  )));
}

/*
 * Where the sounds GitHub cannot serve are fetched from instead, per base.
 * Mirrors VCSL_UPSTREAM / VCSL_PROXY_BASE in server/vcsl-proxy.ts, which only
 * passes that one repository through.
 */
const PROXY_BASES: Record<string, string> = {
  'https://raw.githubusercontent.com/sgossner/VCSL/master/': '/api/vcsl?path=',
};

/* A sound is a list of paths, or a map from note names to lists of them. */
const pathsOf = (entry: unknown): string[] => {
  if (typeof entry === 'string') return [entry];
  if (Array.isArray(entry)) return entry.filter((path): path is string => typeof path === 'string');
  if (entry && typeof entry === 'object') return Object.values(entry).flatMap(pathsOf);
  return [];
};

const hasComma = (path: string) => path.includes(',') || /%2C/i.test(path);

/**
 * The index as the one or two maps superdough should be handed: the sounds
 * GitHub can serve, under the index's own base, and — only if there are any —
 * the sounds it cannot, under the passthrough for that base.
 */
export function splitByHost(index: SampleIndex): SampleIndex[] {
  const base = typeof index._base === 'string' ? index._base : null;
  const proxy = base ? PROXY_BASES[base] : undefined;
  if (!proxy) return [index];

  const direct: SampleIndex = {};
  const rerouted: SampleIndex = { _base: proxy };
  for (const [name, entry] of Object.entries(index)) {
    const target = name !== '_base' && pathsOf(entry).some(hasComma) ? rerouted : direct;
    target[name] = entry;
  }
  return Object.keys(rerouted).length > 1 ? [direct, rerouted] : [index];
}

export async function fetchSampleIndexParts(url: string, signal?: AbortSignal): Promise<SampleIndex[]> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`error loading "${url}": ${response.status}`);
  const index = repairPaths(await response.json() as SampleIndex);
  return splitByHost(url === '/sample-index/dirt-samples.json' ? withDirtSampleAliases(index) : index);
}

/** Fetches one bundled index and registers it through superdough's `samples`. */
export async function loadSampleIndex(
  samples: (index: SampleIndex) => Promise<unknown>,
  url: string,
): Promise<void> {
  const parts = await fetchSampleIndexParts(url);
  await Promise.all(parts.map((part) => samples(part)));
}
