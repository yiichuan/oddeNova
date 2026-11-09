import { describe, expect, it } from 'vitest';
import { parseScore } from '../../agent/parser';
import {
  CREATION_LANGS,
  FIRST_CREATION_TURN_COUNT,
  creationTurn,
  firstCreationContentHash,
  langOfContentHash,
} from '../first-creation-case';

const turns = [1, 2, 3, 4];

/** The script with its line comments taken out — what the engine runs. */
const withoutComments = (code: string) => code
  .split('\n')
  .map((line) => line.replace(/\s*\/\/.*$/, ''))
  .filter((line) => line.trim() !== '')
  .join('\n');

const layerNames = (code: string) => parseScore(code).layers.map((layer) => layer.name);
const layerSource = (code: string, name: string) =>
  withoutComments(parseScore(code).layers.find((layer) => layer.name === name)?.source ?? '');

describe('first-creation-v1 case', () => {
  it('has four turns, each a complete script at 108 BPM', () => {
    expect(FIRST_CREATION_TURN_COUNT).toBe(4);
    for (const lang of CREATION_LANGS) {
      for (const turn of turns) {
        const score = parseScore(creationTurn(turn, lang).code);
        expect(score.cps).toBe(0.45);
        expect(score.hasStack).toBe(true);
      }
    }
  });

  it('runs the same code in both languages; only the comments differ', () => {
    for (const turn of turns) {
      expect(withoutComments(creationTurn(turn, 'en').code)).toBe(withoutComments(creationTurn(turn, 'zh').code));
    }
  });

  it('adds exactly the layers each turn says it adds', () => {
    for (const lang of CREATION_LANGS) {
      for (const turn of turns) {
        const { code, beforeCode, addedLayers } = creationTurn(turn, lang);
        const before = new Set(layerNames(beforeCode));
        expect(layerNames(code).filter((name) => !before.has(name))).toEqual([...addedLayers]);
      }
    }
  });

  it('leaves the drums untouched while the melody and background are added', () => {
    for (const lang of CREATION_LANGS) {
      const first = creationTurn(1, lang).code;
      for (const turn of [2, 3]) {
        const code = creationTurn(turn, lang).code;
        for (const name of ['KICK', 'SNARE', 'HAT']) {
          expect(layerSource(code, name)).toBe(layerSource(first, name));
        }
      }
      // Turn 3's only change to the piano is the added delay.
      const piano2 = layerSource(creationTurn(2, lang).code, 'PIANO');
      const piano3 = layerSource(creationTurn(3, lang).code, 'PIANO');
      expect(piano3.replace(/\n\s*\.delay\(0\.18\)/, '')).toBe(piano2);
    }
  });

  it('starts from an empty piece and chains each turn on the one before', () => {
    expect(creationTurn(1, 'zh').beforeCode).toBe('');
    for (const turn of [2, 3, 4]) {
      expect(creationTurn(turn, 'zh').beforeCode).toBe(creationTurn(turn - 1, 'zh').code);
    }
  });

  it('tells its two languages apart by content hash', () => {
    expect(firstCreationContentHash('zh')).not.toBe(firstCreationContentHash('en'));
    expect(langOfContentHash(firstCreationContentHash('en'))).toBe('en');
    expect(langOfContentHash('nope')).toBeNull();
  });
});
