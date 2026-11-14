import { FEATURE_OPTIONS, type SampleQuery } from './sample-search';

export const DEFAULT_SAMPLE_LIMIT = 3;

export interface SampleRoleQuery extends SampleQuery {
  id: string;
  query: string;
}

export interface SampleBatchQuery {
  queries: SampleRoleQuery[];
}

export type SampleSearchResult =
  | { id: string; ok: true; candidates: unknown[] }
  | { id: string; ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Normalise old single-query calls as well as the current batched tool input. */
export function parseSampleSearchInput(value: unknown) {
  if (!isRecord(value)) throw Error('Invalid sample query');
  const legacy = !('queries' in value);
  if (!legacy && Object.keys(value).some(key => key !== 'queries')) throw Error('Ambiguous sample query');
  const raw = legacy ? [{ ...value, id: 'query', limit: value.limit === undefined ? 5 : value.limit }] : value.queries;
  if (!Array.isArray(raw) || raw.length < 1) {
    throw Error('Invalid sample query count');
  }
  const ids = new Set<string>();
  const queries = raw.map((item): SampleRoleQuery & { limit: number } => {
    if (!isRecord(item) || Object.keys(item).some(key => !['id', 'query', 'category', 'features', 'limit'].includes(key)) ||
        typeof item.id !== 'string' || !item.id.trim() || item.id.length > 100 || ids.has(item.id) ||
        typeof item.query !== 'string' || !item.query.trim() || item.query.length > 500 ||
        (item.category !== undefined && (typeof item.category !== 'string' || item.category.length > 100)) ||
        (item.limit !== undefined && (typeof item.limit !== 'number' || !Number.isInteger(item.limit) || item.limit < 1))) {
      throw Error('Invalid sample query or duplicate id');
    }
    const features = item.features;
    if (features !== undefined && (!isRecord(features) || Object.entries(features).some(([key, feature]) => {
      const options = Object.hasOwn(FEATURE_OPTIONS, key) ? FEATURE_OPTIONS[key] : undefined;
      return !options || (key === 'texture_tags'
        ? !Array.isArray(feature) || feature.some(v => typeof v !== 'string' || !options.includes(v))
        : typeof feature !== 'string' || !options.includes(feature));
    }))) throw Error('Invalid listening features');
    ids.add(item.id);
    return {
      id: item.id, query: item.query,
      category: item.category as string | undefined,
      features: features as SampleQuery['features'],
      limit: (item.limit as number | undefined) ?? DEFAULT_SAMPLE_LIMIT,
    };
  });
  return { queries, legacy };
}
