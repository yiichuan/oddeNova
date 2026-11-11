import { fetchSampleIndexParts, SAMPLE_LIBRARIES, type SampleIndex } from '../lib/sample-index-hosts';
import type { SampleVariant } from '../lib/sample-search';

export function indexPreviewSources(parts: readonly SampleIndex[]) {
  const sources = new Map<string, { base: string; entry: unknown }>();
  for (const part of parts) {
    const base = part._base;
    if (typeof base !== 'string') continue;
    for (const [key, entry] of Object.entries(part)) {
      if (!key.startsWith('_')) sources.set(key.toLowerCase(), { base, entry });
    }
  }
  return sources;
}

export type PreviewSources = ReturnType<typeof indexPreviewSources>;

export async function loadPreviewSources(signal: AbortSignal): Promise<PreviewSources> {
  const indexes = await Promise.all(SAMPLE_LIBRARIES.map(library =>
    fetchSampleIndexParts(`/sample-index/${library}.json`, signal)));
  return indexPreviewSources(indexes.flat());
}

export function resolvePreviewUrl(
  sources: PreviewSources,
  key: string,
  { index, rootNote }: Pick<SampleVariant, 'index' | 'rootNote'>,
): string | null {
  const source = sources.get(key.toLowerCase());
  if (!source || !Number.isInteger(index) || index < 0) return null;

  const { base, entry } = source;
  const pitched = entry !== null && typeof entry === 'object' && !Array.isArray(entry);
  if (pitched !== (rootNote !== null)) return null;
  const files = rootNote === null ? entry : (entry as Record<string, unknown>)[rootNote];
  const path = Array.isArray(files) ? files[index] : index === 0 ? files : null;
  if (typeof path !== 'string' || !path) return null;

  // Both the upstream base and the VCSL proxy expect an already escaped path.
  return base + path.replaceAll(' ', '%20').replaceAll('#', '%23').replaceAll('?', '%3F');
}
