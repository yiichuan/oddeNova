import { describe, expect, it } from 'vitest';
import themeEn from '../../../themes/beta-1.0/theme.en.strudel.js?raw';
import themeZh from '../../../themes/beta-1.0/theme.zh.strudel.js?raw';
import { THEME_SONG_VERSION, themeSongCode } from '../theme-song';

/** The script with every comment line and blank line taken out. */
function musicOnly(script: string): string[] {
  return script
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line) && line.trim() !== '');
}

describe('theme song', () => {
  it('ships the two language variants of one piece, not two pieces', () => {
    // The comments differ by design; anything else differing means an edit
    // landed in one file and not the other, and half the visitors would then
    // hear something nobody wrote.
    expect(musicOnly(themeZh)).toEqual(musicOnly(themeEn));
  });

  it('pins its own tempo', () => {
    // `setcps` is global to the scheduler and outlives whoever set it, so a
    // piece that leaves its tempo to the engine plays at whatever ran before.
    expect(themeZh).toMatch(/^setcps\(/m);
  });

  it('comments each variant in its own language', () => {
    expect(themeZh).toMatch(/[一-鿿]/);
    expect(themeEn).not.toMatch(/[一-鿿]/);
  });

  it('serves a script, in whichever language the test environment reads as', () => {
    expect([themeZh, themeEn]).toContain(themeSongCode());
  });

  it('names the directory its scripts come from', () => {
    expect(THEME_SONG_VERSION).toBe('beta-1.0');
  });
});
