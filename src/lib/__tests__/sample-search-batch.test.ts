import { describe, expect, it } from 'vitest';
import { parseSampleSearchInput } from '../sample-search-batch';
import { resolveModelSearchResults } from '../sample-model-candidates';
import { serializeFullCatalog } from '../sample-catalog-context';
import type { SearchCatalog } from '../sample-search';

const queries = [{ id: 'keys', query: 'soft piano', limit: 3 }, { id: 'drums', query: 'dry drums', limit: 1 }];
const catalog: SearchCatalog = {
  schemaVersion: 1,
  samples: [{
    key: 'piano', aliases: [], category: 'piano', summary: '',
    variants: [{ id: 'file', sha256: null, index: 2, rootNote: 'C4', articulation: 'soft', features: null,
      annotationStatus: 'unavailable', playback: 'note("C4").s("piano:2")' }],
  }],
};
const { rows } = serializeFullCatalog(catalog);
const candidate = { variantId: 'v1', reason: 'fits' };

describe('sample batch input', () => {
  it('defaults batched requests to 3 and preserves single-query compatibility at 5', () => {
    expect(parseSampleSearchInput({ queries: [{ id: 'keys', query: 'soft piano' }] })).toMatchObject({
      legacy: false, queries: [{ id: 'keys', limit: 3 }],
    });
    expect(parseSampleSearchInput({ query: 'soft piano' })).toMatchObject({ legacy: true, queries: [{ id: 'query', limit: 5 }] });
  });

  it.each([
    {}, { query: 'piano', limit: null }, { queries: [] }, { queries: 'piano' },
    { queries: queries, query: 'piano' },
    { queries: [queries[0], queries[0]] },
    { queries: [{ id: ' ', query: 'piano' }] },
    { queries: [{ id: 'x', query: ' ' }] },
    { queries: [{ id: 'x', query: 'piano', limit: 0 }] },
    { queries: [{ id: 'x', query: 'piano', limit: 1.5 }] },
    { queries: [{ id: 'x', query: 'piano', category: 42 }] },
    { queries: [{ id: 'x', query: 'piano', features: { brightness: 'invalid' } }] },
    { queries: [{ id: 'x', query: 'piano', features: { texture_tags: 'airy' } }] },
    { queries: [{ id: 'x', query: 'piano', features: { toString: 'bright' } }] },
  ])('rejects invalid input before searching: %j', input => {
    expect(() => parseSampleSearchInput(input)).toThrow();
  });

  it('keeps listening conditions separated', () => {
    const result = parseSampleSearchInput({ queries: queries.map((q, i) => ({ ...q, limit: 10, features: { brightness: i ? 'dark' : 'bright' } })) });
    expect(result.queries.map(q => q.features?.brightness)).toEqual(['bright', 'dark']);
  });
});

describe('model batch results', () => {
  it('matches ids rather than output order and retains empty groups', () => {
    const result = resolveModelSearchResults([
      { id: 'drums', candidates: [] }, { id: 'keys', candidates: [candidate] },
    ], rows, queries);
    expect(result).toMatchObject([
      { id: 'keys', ok: true, candidates: [{ name: 'piano', rootNote: 'C4', index: 2, selectionReason: 'fits' }] },
      { id: 'drums', ok: true, candidates: [] },
    ]);
  });

  it.each([
    [], [candidate, candidate], [{ variantId: 'invented', reason: 'fits' }], [{ variantId: 'v1', reason: '' }], null,
  ])('isolates missing or invalid candidates without losing valid groups: %j', candidates => {
    // Empty test input represents an omitted group; null represents a malformed one.
    const groups = [{ id: 'keys', candidates: [candidate] },
      ...(Array.isArray(candidates) && candidates.length === 0 ? [] : [{ id: 'drums', candidates }])];
    expect(resolveModelSearchResults(groups, rows, queries)).toMatchObject([
      { id: 'keys', ok: true }, { id: 'drums', ok: false },
    ]);
  });

  it('isolates duplicate result ids', () => {
    expect(resolveModelSearchResults([
      { id: 'keys', candidates: [candidate] }, { id: 'drums', candidates: [] }, { id: 'drums', candidates: [] },
    ], rows, queries)).toMatchObject([{ id: 'keys', ok: true }, { id: 'drums', ok: false }]);
  });

  it('allows the same file across independent groups', () => {
    expect(resolveModelSearchResults(queries.map(q => ({ id: q.id, candidates: [candidate] })), rows, queries)
      .map(r => r.ok)).toEqual([true, true]);
  });

  it('accepts arbitrarily many groups and candidates above target counts without a total budget', () => {
    const manyQueries = Array.from({ length: 8 }, (_, i) => ({ id: String(i), query: 'piano', limit: 100 }));
    expect(parseSampleSearchInput({ queries: manyQueries }).queries).toHaveLength(8);
    const { rows: manyRows } = serializeFullCatalog({ ...catalog, samples: [{ ...catalog.samples[0],
      variants: Array.from({ length: 15 }, (_, i) => ({ ...catalog.samples[0].variants[0], id: String(i), index: i })),
    }] });
    const candidates = Object.keys(manyRows).map(variantId => ({ variantId, reason: 'fits' }));
    const results = resolveModelSearchResults(manyQueries.map(q => ({ id: q.id, candidates })), manyRows,
      manyQueries.map(q => ({ ...q, limit: 1 })));
    expect(results).toHaveLength(8);
    for (const result of results) {
      expect(result.ok).toBe(true);
      expect(result.ok && result.candidates).toHaveLength(15);
    }
  });

  it('rejects unassignable results rather than accepting unknown ids', () => {
    expect(() => resolveModelSearchResults([{ id: 'invented', candidates: [] }], rows, queries)).toThrow('unknown query id');
    expect(() => resolveModelSearchResults(null, rows, queries)).toThrow('Missing results');
  });
});
