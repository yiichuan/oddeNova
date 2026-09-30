/**
 * The one practice piece the first-run guide walks through: `intro-piano-v1`.
 *
 * Everything about it is made ahead of time — the instruction the visitor
 * sends, the reply, and the complete adapted script — so the practice never
 * calls a model or runs the agent loop. Only the sound is live: both versions
 * play through the real Strudel engine.
 *
 * The original is the archived beta-1.0 theme song itself, imported from
 * `themes/` rather than copied (see `themes/README.md`). The adapted script
 * lives in `onboarding/intro-piano-v1/`, a directory of its own, because a
 * teaching asset is versioned with the case, not with the theme: when the
 * theme moves on, a new case is made against it rather than this one being
 * applied to a base it was never checked against.
 *
 * The change is additive and nothing else: every original layer and the tempo
 * stay exactly as they were, and one layer, `horizon_intro`, is added. The
 * test beside this file holds the scripts to that.
 */

import { zh } from '../lib/i18n';
import originalEn from '../../themes/beta-1.0/theme.en.strudel.js?raw';
import originalZh from '../../themes/beta-1.0/theme.zh.strudel.js?raw';
import adaptedEn from '../../onboarding/intro-piano-v1/adapted.en.strudel.js?raw';
import adaptedZh from '../../onboarding/intro-piano-v1/adapted.zh.strudel.js?raw';

export const INTRO_PIANO_CASE_ID = 'intro-piano-v1';
/** The theme release this case was made and checked against. */
export const INTRO_PIANO_BASE_THEME = 'beta-1.0';

/** Both scripts run at `setcps(0.4)`: one cycle is 2.5 seconds. */
export const INTRO_PIANO_CPS = 0.4;

/** A stretch of the piece measured from its very start, in cycles. */
export interface ListeningWindow {
  startCycle: number;
  endCycle: number;
}

/** 0–5 s: the stretch both versions are compared over. Required. */
export const COMPARE_WINDOW: ListeningWindow = { startCycle: 0, endCycle: 2 };
/** 0–12.5 s: hears the chord change at 5 s and the hand-over near 10 s. Optional. */
export const FULL_OPENING_WINDOW: ListeningWindow = { startCycle: 0, endCycle: 5 };
/** 0–10 s: where the added layer is allowed to start notes. */
export const ADDED_LAYER_WINDOW: ListeningWindow = { startCycle: 0, endCycle: 4 };

export function windowSeconds(window: ListeningWindow): number {
  return (window.endCycle - window.startCycle) / INTRO_PIANO_CPS;
}

export const INTRO_PIANO_CHANGE = {
  /** The layer this case adds. */
  addedLayer: 'horizon_intro',
  /** The layer it follows, which is left exactly as it was. */
  referenceLayer: 'horizon',
} as const;

/**
 * The soundfont notes the compare window needs, so a first listen does not
 * spend its opening seconds fetching instruments. `horizon`'s pad and the
 * added layer's electric piano are the only soundfonts sounding before 10 s.
 */
export const COMPARE_SOUND_DEPENDENCIES: readonly { sound: string; notes: readonly string[] }[] = [
  { sound: 'gm_pad_warm', notes: ['d3', 'a3', 'c4', 'e4', 'g3', 'b3', 'd4'] },
  { sound: 'gm_epiano1', notes: ['d4', 'a4', 'c5', 'e5', 'g4', 'b4', 'd5'] },
];

const COPY = {
  instruction: [
    '保留原来的背景和弦，只在开头 10 秒加一串清脆的电钢琴音符，跟着和弦一颗颗弹出来。',
    'Keep the background chords as they are, and add a run of bright electric piano notes in just the first 10 seconds, picking out the chords one note at a time.',
  ],
  reply: [
    '已保留原来的背景和弦，并在开头 10 秒加了一串电钢琴音符。它跟着原来的和弦逐个弹奏，随后退场。\n\n听 **0～5 秒**：原版主要是铺开的背景声，改编版会多出一颗颗清晰的琴音。',
    'The background chords are kept as they were, and a run of electric piano notes now plays through the first 10 seconds. It follows the original chords one note at a time, then steps aside.\n\nListen to **0–5 s**: the original is mostly a wide wash of background sound; the new version adds clear, single piano notes on top.',
  ],
} as const;

function pick(pair: readonly [string, string], lang: 'zh' | 'en'): string {
  return lang === 'zh' ? pair[0] : pair[1];
}

type Lang = 'zh' | 'en';
const readerLang = (): Lang => (zh ? 'zh' : 'en');

export function originalScript(lang: Lang = readerLang()): string {
  return lang === 'zh' ? originalZh : originalEn;
}

export function adaptedScript(lang: Lang = readerLang()): string {
  return lang === 'zh' ? adaptedZh : adaptedEn;
}

export function presetInstruction(lang: Lang = readerLang()): string {
  return pick(COPY.instruction, lang);
}

export function presetReply(lang: Lang = readerLang()): string {
  return pick(COPY.reply, lang);
}

/**
 * FNV-1a over the four pieces of text the case is made of. Stored with the
 * guide's progress, so a practice resumed after the assets changed is noticed
 * and restarted rather than continued against a piece it was not made for.
 */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function introPianoContentHash(lang: Lang = readerLang()): string {
  return fnv1a([
    originalScript(lang),
    adaptedScript(lang),
    presetInstruction(lang),
    presetReply(lang),
  ].join('\u0000'));
}
