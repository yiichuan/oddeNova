import { readFileSync, statSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  MANIFEST,
  OUTPUT_FONT,
  greetingSubsetText,
  type SubsetManifest,
} from '../../../scripts/build-greeting-font-subset';
import { GREETINGS_ZH } from '../greetings';
import { FAVORITES_EMPTY_ZH, FEATURED_OPENED_INTRO_ZH, THEME_SONG_INTRO_ZH } from '../i18n';

const manifest = (): SubsetManifest => JSON.parse(readFileSync(MANIFEST, 'utf8')) as SubsetManifest;

describe('greetingSubsetText', () => {
  it('covers every character in the Chinese greeting pool', () => {
    const text = greetingSubsetText();
    for (const greeting of GREETINGS_ZH) {
      for (const char of greeting) {
        expect(text).toContain(char);
      }
    }
  });

  it('covers the other three lines set in this face', () => {
    // All three reach the same slot the greetings do — the Favorites empty
    // state, the opening line of the theme-song session seeded on first entry,
    // and the one a session opened from a featured piece starts with.
    const text = greetingSubsetText();
    for (const char of FAVORITES_EMPTY_ZH + THEME_SONG_INTRO_ZH + FEATURED_OPENED_INTRO_ZH) {
      expect(text).toContain(char);
    }
  });

  it('is deduplicated and order-stable', () => {
    const text = greetingSubsetText();
    expect([...text]).toEqual([...new Set(text)]);
    expect([...text]).toEqual([...text].sort());
  });
});

describe('the committed subset is in sync with the greeting pool', () => {
  // The failure this guards: a greeting gains a character the shipped 54 KB
  // face has no glyph for, and that one character silently renders in `serif`.
  it('matches the current greetings — run `npm run fonts:greetings` if this fails', () => {
    expect(manifest().charset).toBe(greetingSubsetText());
  });

  it('ships a subset, not the full face', () => {
    const { sourceBytes, subsetBytes } = manifest();
    expect(statSync(OUTPUT_FONT).size).toBe(subsetBytes);
    expect(subsetBytes).toBeLessThan(sourceBytes / 100);
  });
});
