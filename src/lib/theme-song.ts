/**
 * oddeNova's own theme song — the piece a first-time visitor finds already
 * loaded in the code panel.
 *
 * The scripts live in `themes/<version>/`, one directory per release, and are
 * pulled in here as raw text rather than retyped into a module: a theme song is
 * a Strudel file first, and the archive under `themes/` is meant to stay
 * readable and playable on its own. See `themes/README.md`.
 *
 * Two files per version, identical line for line except in the language of
 * their comments. The comments are half of what the piece is for — someone
 * opening it is reading how it was built — so the one that gets loaded follows
 * the browser's language the way the rest of the interface does.
 */

import { zh } from './i18n';
import themeEn from '../../themes/beta-1.0/theme.en.strudel.js?raw';
import themeZh from '../../themes/beta-1.0/theme.zh.strudel.js?raw';

/**
 * The release whose theme song ships. It names the directory under `themes/`,
 * so moving to a new one is this constant plus the two imports above.
 */
export const THEME_SONG_VERSION = 'beta-1.0';

/** The script, commented in the reader's language. */
export function themeSongCode(): string {
  return zh ? themeZh : themeEn;
}

/**
 * Marks the browser as having been given the theme song already.
 *
 * This flag is the whole condition for seeding — deliberately, because the
 * obvious alternative is wrong. "Seed when the history is empty" only ever
 * reaches a brand new visitor, and on the day a version ships almost nobody is
 * one: everyone already using the app has rows in storage and would never be
 * given the piece at all.
 *
 * It also makes the seed a gesture rather than a fixture. It goes in once, and
 * after that the session belongs to the visitor — to keep, to rewrite, or to
 * delete, without it reappearing on the next visit.
 *
 * Scope is one browser, which is the most a `localStorage` key can promise. An
 * account seen from a second browser is a first sight as far as this is
 * concerned; the guest-to-account import is what keeps that from turning into
 * a second copy — see the seed in `useSessions`.
 */
export const THEME_SONG_SEEDED_KEY = 'oddenova_theme_song_seeded';

export function hasSeededThemeSong(storage: Storage = localStorage): boolean {
  try { return storage.getItem(THEME_SONG_SEEDED_KEY) === '1'; } catch { return true; }
}

export function markThemeSongSeeded(storage: Storage = localStorage): void {
  try { storage.setItem(THEME_SONG_SEEDED_KEY, '1'); } catch { /* private mode: seed once per page load */ }
}
