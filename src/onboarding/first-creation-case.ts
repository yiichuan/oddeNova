/**
 * The practice the desktop first-run guide walks through: `first-creation-v1`.
 *
 * Four instructions, each answered by a reply and a complete script made ahead
 * of time. Nothing here reaches a model or the agent loop; only the sound is
 * live, through the real Strudel engine. The practice starts from an empty
 * piece — the default theme song stays ordinary history and takes no part.
 */

import { zh } from '../lib/i18n';
import { TURN_COPY, type Pair } from './first-creation-copy';
import step1En from '../../onboarding/first-creation-v1/step-1.en.strudel.js?raw';
import step1Zh from '../../onboarding/first-creation-v1/step-1.zh.strudel.js?raw';
import step2En from '../../onboarding/first-creation-v1/step-2.en.strudel.js?raw';
import step2Zh from '../../onboarding/first-creation-v1/step-2.zh.strudel.js?raw';
import step3En from '../../onboarding/first-creation-v1/step-3.en.strudel.js?raw';
import step3Zh from '../../onboarding/first-creation-v1/step-3.zh.strudel.js?raw';
import step4En from '../../onboarding/first-creation-v1/step-4.en.strudel.js?raw';
import step4Zh from '../../onboarding/first-creation-v1/step-4.zh.strudel.js?raw';

export const FIRST_CREATION_CASE_ID = 'first-creation-v1';
export const FIRST_CREATION_TURN_COUNT = 4;

export type CreationLang = 'zh' | 'en';
export const CREATION_LANGS: readonly CreationLang[] = ['zh', 'en'];
export const readerCreationLang = (): CreationLang => (zh ? 'zh' : 'en');

const SCRIPTS: readonly Pair[] = [
  [step1Zh, step1En],
  [step2Zh, step2En],
  [step3Zh, step3En],
  [step4Zh, step4En],
];

/**
 * The layers each turn introduces, by `@layer` name. The guide frames these in
 * the code panel after turns 2 and 3; turn 1 points at the whole panel.
 */
const ADDED_LAYERS: readonly (readonly string[])[] = [
  ['KICK', 'SNARE', 'HAT'],
  ['PIANO'],
  ['PAD', 'TEXTURE'],
  ['FILL'],
];

/** One answered instruction, 1-based by `turn`. */
export interface CreationTurn {
  turn: number;
  instruction: string;
  reasoning: string;
  reply: string;
  /** The complete script after this turn. */
  code: string;
  /** The script before it: the previous turn's, or empty for the first. */
  beforeCode: string;
  addedLayers: readonly string[];
}

const pick = (pair: Pair, lang: CreationLang) => (lang === 'zh' ? pair[0] : pair[1]);

export function creationScript(turn: number, lang: CreationLang): string {
  if (turn < 1) return '';
  return pick(SCRIPTS[turn - 1], lang);
}

export function creationTurn(turn: number, lang: CreationLang): CreationTurn {
  const copy = TURN_COPY[turn - 1];
  return {
    turn,
    instruction: pick(copy.instruction, lang),
    reasoning: pick(copy.reasoning, lang),
    reply: pick(copy.reply, lang),
    code: creationScript(turn, lang),
    beforeCode: creationScript(turn - 1, lang),
    addedLayers: ADDED_LAYERS[turn - 1],
  };
}

/** FNV-1a over everything the case is made of, per language. */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function firstCreationContentHash(lang: CreationLang): string {
  const parts: string[] = [];
  for (let turn = 1; turn <= FIRST_CREATION_TURN_COUNT; turn++) {
    const t = creationTurn(turn, lang);
    parts.push(t.instruction, t.reasoning, t.reply, t.code);
  }
  return fnv1a(parts.join('\u0000'));
}

/** The language a stored progress was made in, read off its hash. */
export function langOfContentHash(hash: string): CreationLang | null {
  return CREATION_LANGS.find((lang) => firstCreationContentHash(lang) === hash) ?? null;
}
