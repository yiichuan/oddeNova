import { describe, it, expect } from 'vitest';
import { MELODY_LIBRARY, findMelody } from '../melody-library';

describe('MELODY_LIBRARY structural integrity', () => {
  it('every entry has all required fields populated', () => {
    for (const entry of MELODY_LIBRARY) {
      expect(entry.id, 'id').toBeTruthy();
      expect(entry.melody.trim(), `melody of ${entry.id}`).toBeTruthy();
      expect(entry.key, `key of ${entry.id}`).toBeTruthy();
      expect(entry.bpm, `bpm of ${entry.id}`).toBeGreaterThan(0);
      expect(entry.names.length, `names of ${entry.id}`).toBeGreaterThan(0);
    }
  });

  it('no alias is an empty string', () => {
    for (const entry of MELODY_LIBRARY) {
      for (const name of entry.names) {
        expect(name.trim(), `alias in ${entry.id}`).toBeTruthy();
      }
    }
  });

  it('ids are globally unique', () => {
    const ids = MELODY_LIBRARY.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('findMelody', () => {
  it('matches a Chinese alias', () => {
    expect(findMelody('生日快乐')?.id).toBe('happy-birthday');
    expect(findMelody('小星星')?.id).toBe('twinkle-twinkle');
  });

  it('matches an English alias', () => {
    expect(findMelody('twinkle twinkle')?.id).toBe('twinkle-twinkle');
    expect(findMelody('ode to joy')?.id).toBe('ode-to-joy');
  });

  it('matches across case and punctuation variants', () => {
    expect(findMelody('Happy Birthday!')?.id).toBe('happy-birthday');
    expect(findMelody('  HAPPY   BIRTHDAY  ')?.id).toBe('happy-birthday');
  });

  it('matches when the query embeds the alias', () => {
    expect(findMelody('happy birthday to you')?.id).toBe('happy-birthday');
    expect(findMelody('弹个生日歌')?.id).toBe('happy-birthday');
  });

  it('returns undefined for an unknown song', () => {
    expect(findMelody('some unknown pop song')).toBeUndefined();
  });

  it('returns undefined for an empty query', () => {
    expect(findMelody('')).toBeUndefined();
    expect(findMelody('   ')).toBeUndefined();
  });
});
