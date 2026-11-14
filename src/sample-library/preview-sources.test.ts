import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { FEATURED_SAMPLE_INDEX, repairPaths, SAMPLE_LIBRARIES, splitByHost, withDirtSampleAliases } from '../lib/sample-index-hosts';
import { indexPreviewSources, resolvePreviewUrl } from './preview-sources';

const sources = indexPreviewSources([...SAMPLE_LIBRARIES.flatMap(library => {
  const index = repairPaths(JSON.parse(readFileSync(`public/sample-index/${library}.json`, 'utf8')));
  return splitByHost(library === 'dirt-samples' ? withDirtSampleAliases(index) : index);
}), FEATURED_SAMPLE_INDEX]);

it('uses the active library for overlapping names and the correct path for VCSL files', () => {
  expect(resolvePreviewUrl(sources, 'sd', { index: 0, rootNote: null }))
    .toBe('https://raw.githubusercontent.com/tidalcycles/uzu-drumkit/main/sd/10_sd_switchangel-bounce-2.wav');
  expect(resolvePreviewUrl(sources, 'dirt_sd', { index: 0, rootNote: null })).toContain('/Dirt-Samples/master/sd/');
  expect(resolvePreviewUrl(sources, 'cover360_vocals', { index: 0, rootNote: null })).toContain('/samples/360_vocals.wav');
  expect(resolvePreviewUrl(sources, 'sax', { index: 0, rootNote: 'A#1' }))
    .toContain('/Aerophones/Reed%20Aerophones/Tenor%20Saxophone/Non-Vibrato/BrettTenor_NV_Main_A%231_vl3_rr1.wav');
  expect(resolvePreviewUrl(sources, 'snare_modern', { index: 0, rootNote: null }))
    .toBe('/api/vcsl?path=Membranophones/Struck%20Membranophones/Snare%20Drum%2C%20Modern%201/Snare2_HitNS_v2_rr1_Mid.wav');
  expect(resolvePreviewUrl(sources, 'tom_mallet', { index: 0, rootNote: null }))
    .toContain('/master/Membranophones/Struck%20Membranophones/Tom%201/Mallet/');
});

it('rejects missing names, notes, and indices without falling back to another recording', () => {
  expect(resolvePreviewUrl(sources, 'piano', { index: 0, rootNote: 'H4' })).toBeNull();
  expect(resolvePreviewUrl(sources, 'piano', { index: 1, rootNote: 'C4' })).toBeNull();
  expect(resolvePreviewUrl(sources, 'piano', { index: 0, rootNote: null })).toBeNull();
  expect(resolvePreviewUrl(sources, '808sd', { index: 25, rootNote: null })).toBeNull();
  expect(resolvePreviewUrl(sources, '808sd', { index: 0, rootNote: 'C4' })).toBeNull();
  expect(resolvePreviewUrl(sources, 'missing', { index: 0, rootNote: null })).toBeNull();
});
