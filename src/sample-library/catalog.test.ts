import { describe, expect, it } from 'vitest';
import { filterCatalog, indexCatalog } from './catalog';
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
    expect(filterCatalog(index, 'KICK 明亮', 'all')[0].variants.map(v => v.id)).toEqual(['0']);
    expect(filterCatalog(index, '底鼓 偏暗', 'all')[0].variants.map(v => v.id)).toEqual(['1']);
    expect(filterCatalog(index, 'bright long', 'all')).toEqual([]);
  });
  it('retains unavailable variants when filtering by status and does not cap names at ten', () => {
    expect(filterCatalog(index, 'bd', 'unavailable')[0].variants.map(v => v.id)).toEqual(['2']);
    expect(filterCatalog(index, '', 'expert_confirmed')).toEqual([]);
    expect(filterCatalog(indexCatalog(Array.from({ length: 20 }, (_, i) => ({ ...samples[0], key: `kit${i}` }))), '', 'all')).toHaveLength(20);
  });
  it('routes only the page, leaving annotation assets and other paths alone', () => {
    expect(isSampleLibraryPath('/sample-library')).toBe(true);
    expect(isSampleLibraryPath('/sample-library/')).toBe(true);
    expect(isSampleLibraryPath('/sample-library-other')).toBe(false);
    expect(isSampleLibraryPath('/sample-annotations/catalog.json')).toBe(false);
  });
});
