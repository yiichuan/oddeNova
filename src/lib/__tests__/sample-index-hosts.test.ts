import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { repairPaths, splitByHost, type SampleIndex } from '../sample-index-hosts';

const index = (name: string): SampleIndex =>
  JSON.parse(readFileSync(join(__dirname, '../../../public/sample-index', `${name}.json`), 'utf8'));

describe('splitByHost', () => {
  it('moves only the sounds with a comma in a path to the passthrough', () => {
    const [direct, rerouted] = splitByHost({
      _base: 'https://raw.githubusercontent.com/sgossner/VCSL/master/',
      plain: ['x/y.wav'],
      comma: ['Snare%20Drum%2C%20Rope/z.wav'],
      pitched: { c4: ['Piano, Grand/c4.wav'], d4: ['Piano, Grand/d4.wav'] },
    });
    expect(direct).toEqual({ _base: 'https://raw.githubusercontent.com/sgossner/VCSL/master/', plain: ['x/y.wav'] });
    expect(rerouted).toEqual({
      _base: '/api/vcsl?path=',
      comma: ['Snare%20Drum%2C%20Rope/z.wav'],
      pitched: { c4: ['Piano, Grand/c4.wav'], d4: ['Piano, Grand/d4.wav'] },
    });
  });

  it('leaves a repository with no passthrough alone, commas or not', () => {
    const other = { _base: 'https://raw.githubusercontent.com/a/b/main/', comma: ['Drum, Big/1.wav'] };
    expect(splitByHost(other)).toEqual([other]);
  });

  it('hands an index with nothing to move back as it was', () => {
    const plain = { _base: 'https://raw.githubusercontent.com/sgossner/VCSL/master/', bd: ['bd/1.wav'] };
    expect(splitByHost(plain)).toEqual([plain]);
  });

  it('reroutes the VCSL snares, and keeps every sound exactly once', () => {
    const vcsl = index('vcsl');
    const parts = splitByHost(vcsl);
    expect(parts).toHaveLength(2);
    const [direct, rerouted] = parts;
    for (const name of ['snare_hi', 'snare_low', 'snare_modern', 'snare_rim']) {
      expect(rerouted[name]).toEqual(vcsl[name]);
      expect(direct[name]).toBeUndefined();
    }
    expect(direct.bassdrum1).toEqual(vcsl.bassdrum1);
    const names = (part: SampleIndex) => Object.keys(part).filter((name) => name !== '_base');
    expect([...names(direct), ...names(rerouted)].sort()).toEqual(names(vcsl).sort());
  });
});

describe('repairPaths', () => {
  it('puts back the folder VCSL\'s tom_mallet lost, and touches nothing else', () => {
    const vcsl = index('vcsl');
    const repaired = repairPaths(vcsl);
    const mallet = repaired.tom_mallet as string[];
    expect(mallet.length).toBe((vcsl.tom_mallet as string[]).length);
    expect(mallet.every((path) => path.startsWith('Membranophones/Struck%20Membranophones/Tom%201/'))).toBe(true);
    const others = (part: SampleIndex) => ({ ...part, tom_mallet: undefined });
    expect(others(repaired)).toEqual(others(vcsl));
  });

  it('escapes a bare percent sign in a file name, and leaves real escapes alone', () => {
    const dirt = index('dirt-samples');
    const repaired = repairPaths(dirt);
    expect(repaired.h).toEqual((dirt.h as string[]).map((path) => path.replace('%_', '%25_')));
    expect((repaired.h as string[]).some((path) => path.includes('200%25_1000'))).toBe(true);
    expect(repairPaths({ _base: 'https://x/', a: ['Snare%20Drum%2C/a.wav'] }))
      .toEqual({ _base: 'https://x/', a: ['Snare%20Drum%2C/a.wav'] });
    const others = (part: SampleIndex) => ({ ...part, h: undefined });
    expect(others(repaired)).toEqual(others(dirt));
  });
});
