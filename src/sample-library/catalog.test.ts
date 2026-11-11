import { describe, expect, it } from 'vitest';
import { emptyFilters, filterCatalog, indexCatalog } from './catalog';
import { isSampleLibraryPath } from '../lib/routes';
import type { SearchSample, SampleVariant } from '../lib/sample-search';

const variant = (id: string, brightness: string, tail: string): SampleVariant => ({
  id, index: Number(id), sha256: null, rootNote: null, articulation: null, playback: `s("bd:${id}")`, annotationStatus: 'model_initial',
  features: { structure: { event_form: 'single_event', pitchedness: 'tonal' }, timbre: { brightness, body: 'full', texture_tags: ['metallic'], distortion: 'not_obvious' }, envelope: { attack: 'sharp', shape: 'decaying', tail }, space: { reverb: 'dry' } },
});
const samples: SearchSample[] = [{ key: 'bd', aliases: ['kick'], category: '底鼓', summary: '', variants: [variant('0', 'bright', 'short'), variant('1', 'dark', 'long'), { ...variant('2', 'bright', 'long'), features: null, annotationStatus: 'unavailable' }] }];
describe('annotation catalog browser', () => {
  const index = indexCatalog(samples);
  it('searches aliases and Chinese features, keeping only matching variants', () => {
    expect(filterCatalog(index, 'KICK 明亮', emptyFilters)[0].variants.map(v => v.id)).toEqual(['0']);
    expect(filterCatalog(index, '底鼓 偏暗', emptyFilters)[0].variants.map(v => v.id)).toEqual(['1']);
    expect(filterCatalog(index, 'bright long', emptyFilters)).toEqual([]);
  });
  it('retains unavailable variants when filtering by status and does not cap names at ten', () => {
    expect(filterCatalog(index, 'bd', { ...emptyFilters, status: 'unavailable' })[0].variants.map(v => v.id)).toEqual(['2']);
    expect(filterCatalog(index, '', { ...emptyFilters, status: 'expert_confirmed' })).toEqual([]);
    expect(filterCatalog(indexCatalog(Array.from({ length: 20 }, (_, i) => ({ ...samples[0], key: `kit${i}` }))), '', emptyFilters)).toHaveLength(20);
  });
  it('combines category, brightness and all textures on the same variant', () => {
    const dualTexture = variant('3', 'dark', 'short');
    dualTexture.features!.timbre.texture_tags.push('ringing');
    const withMissingCategory = indexCatalog([
      ...samples,
      { ...samples[0], key: 'other', category: null, variants: [variant('0', 'bright', 'short'), dualTexture] },
    ]);
    const filters = { ...emptyFilters, category: null, textures: ['metallic', 'ringing'] };
    expect(filterCatalog(withMissingCategory, '', { ...filters, brightness: 'bright' })).toEqual([]);
    expect(filterCatalog(withMissingCategory, '短', filters).map(result => ({
      key: result.sample.key, ids: result.variants.map(item => item.id), labels: result.matchedLabels,
    }))).toEqual([{ key: 'other', ids: ['3'], labels: ['金属感', '鸣响感', '短'] }]);
    expect(filterCatalog(index, '', { ...emptyFilters, brightness: 'bright' })[0].variants.map(item => item.id)).toEqual(['0']);
  });

  it('ranks names, aliases, categories and features, preserving order for ties', () => {
    const sample = (key: string, aliases: string[] = [], category: string | null = null): SearchSample =>
      ({ ...samples[0], key, aliases, category });
    const ranked = indexCatalog([
      sample('texture_a'), sample('category', [], 'metallic'), sample('alias', ['metallic']),
      sample('metallic_hi'), sample('texture_b'), sample('metallic'),
    ]);
    expect(filterCatalog(ranked, 'metallic', emptyFilters).map(result => result.sample.key))
      .toEqual(['metallic', 'metallic_hi', 'alias', 'category', 'texture_a', 'texture_b']);
    expect(filterCatalog(ranked, 'metallic short', emptyFilters).at(-1)?.matchedLabels).toEqual(['金属感', '短']);
  });

  it('routes only the page, leaving annotation assets and other paths alone', () => {
    expect(isSampleLibraryPath('/sample-library')).toBe(true);
    expect(isSampleLibraryPath('/sample-library/')).toBe(true);
    expect(isSampleLibraryPath('/sample-library-other')).toBe(false);
    expect(isSampleLibraryPath('/sample-annotations/catalog.json')).toBe(false);
  });
});
