// Curated library of well-known, public-domain melodies — the single
// authoritative source consumed by the `lookupMelody` agent tool.
//
// Each entry stores the melody as a bare Strudel mini-notation string (the
// content that goes inside `note("...")`), with rhythm embedded via `@N`
// (hold N beats), `~` (rest), and `[a b]` (sub-divide a beat). No `.s(...)`
// or effects — instrument and arrangement are left to the agent so the
// melody stays composable.
//
// IMPORTANT: melodies here are transcriptions and MUST be verified in-browser
// (transpiler pass + listen) before being trusted in production — that is the
// "seed validation" step of the design. The unit tests only cover structural
// integrity and the matcher, not audio correctness (Strudel's validate needs
// a browser AudioContext).
//
// Public-domain only. Do not add copyrighted melodies.

export interface MelodyEntry {
  /** Unique, stable id (kebab-case). */
  id: string;
  /** Multilingual aliases used for fuzzy matching (zh + en + common variants). */
  names: string[];
  /** Bare Strudel mini-notation: the content for `note("...")`, rhythm embedded. */
  melody: string;
  /** Key/scale for the agent to arrange around, e.g. 'C:major'. */
  key: string;
  /** Suggested tempo in BPM. */
  bpm: number;
  /** Optional time signature, e.g. '3/4'. */
  meter?: string;
}

export const MELODY_LIBRARY: MelodyEntry[] = [
  {
    id: 'happy-birthday',
    names: [
      '生日快乐',
      '生日快乐歌',
      '生日歌',
      'happy birthday',
      'happy birthday to you',
      'happy bday',
    ],
    melody:
      '[g4 g4] a4 g4 c5 b4@2 [g4 g4] a4 g4 d5 c5@2 [g4 g4] g5 e5 c5 b4 a4 [f5 f5] e5 c5 d5 c5@2',
    key: 'C:major',
    bpm: 120,
    meter: '3/4',
  },
  {
    id: 'twinkle-twinkle',
    names: [
      '小星星',
      '一闪一闪亮晶晶',
      'twinkle twinkle',
      'twinkle twinkle little star',
      'little star',
    ],
    melody:
      'c4 c4 g4 g4 a4 a4 g4@2 f4 f4 e4 e4 d4 d4 c4@2 g4 g4 f4 f4 e4 e4 d4@2 g4 g4 f4 f4 e4 e4 d4@2 c4 c4 g4 g4 a4 a4 g4@2 f4 f4 e4 e4 d4 d4 c4@2',
    key: 'C:major',
    bpm: 110,
    meter: '4/4',
  },
  {
    id: 'ode-to-joy',
    names: ['欢乐颂', '快乐颂', 'ode to joy', 'beethoven ode to joy'],
    melody:
      'e4 e4 f4 g4 g4 f4 e4 d4 c4 c4 d4 e4 e4@2 d4@2 e4 e4 f4 g4 g4 f4 e4 d4 c4 c4 d4 e4 d4@2 c4@2',
    key: 'C:major',
    bpm: 120,
    meter: '4/4',
  },
  {
    id: 'frere-jacques',
    names: [
      '两只老虎',
      '雅克兄弟',
      'frere jacques',
      'frère jacques',
      'are you sleeping',
      'brother john',
    ],
    melody:
      'c4 d4 e4 c4 c4 d4 e4 c4 e4 f4 g4@2 e4 f4 g4@2 [g4 a4] [g4 f4] e4 c4 [g4 a4] [g4 f4] e4 c4 c4 g3 c4@2 c4 g3 c4@2',
    key: 'C:major',
    bpm: 120,
    meter: '4/4',
  },
  {
    id: 'jingle-bells',
    names: ['铃儿响叮当', '叮叮当', 'jingle bells'],
    melody:
      'e4 e4 e4@2 e4 e4 e4@2 e4 g4 c4 d4 e4@4 f4 f4 f4 f4 f4 e4 e4 e4 e4 d4 d4 e4 d4@2 g4@2',
    key: 'C:major',
    bpm: 120,
    meter: '4/4',
  },
  {
    id: 'fur-elise',
    names: ['致爱丽丝', '献给爱丽丝', 'fur elise', 'für elise', 'bagatelle'],
    melody:
      'e5 ds5 e5 ds5 e5 b4 d5 c5 a4@2 c4 e4 a4 b4@2 e4 gs4 b4 c5@2',
    key: 'A:minor',
    bpm: 80,
    meter: '3/8',
  },
  {
    id: 'canon-in-d',
    names: ['卡农', 'd大调卡农', 'canon in d', 'pachelbel canon', 'pachelbel'],
    melody:
      'fs5 e5 d5 cs5 b4 a4 b4 cs5 d5 cs5 b4 a4 g4 fs4 g4 e4',
    key: 'D:major',
    bpm: 80,
    meter: '4/4',
  },
  {
    id: 'we-wish-you',
    names: [
      '圣诞快乐',
      '我们祝你圣诞快乐',
      'we wish you a merry christmas',
      'merry christmas',
    ],
    melody:
      'c4 f4 f4 g4 f4 e4 d4 d4 d4 g4 g4 a4 g4 f4 e4 c4 c4 a4 a4 bf4 a4 g4 f4 d4 c4 c4 d4 g4 e4 f4@2',
    key: 'C:major',
    bpm: 140,
    meter: '3/4',
  },
  {
    id: 'mary-had-a-little-lamb',
    names: ['玛丽有只小羊羔', '玛丽的小羊羔', 'mary had a little lamb', 'mary lamb'],
    melody:
      'e4 d4 c4 d4 e4 e4 e4@2 d4 d4 d4@2 e4 g4 g4@2 e4 d4 c4 d4 e4 e4 e4 e4 d4 d4 e4 d4 c4@2',
    key: 'C:major',
    bpm: 120,
    meter: '4/4',
  },
];

/**
 * Normalize a name/query for matching: lowercase, strip whitespace and
 * punctuation (Unicode-aware), keep CJK and alphanumerics.
 */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, '');
}

/**
 * Fuzzy-match a user query against the library. Returns the first entry whose
 * any alias is a substring of the query, or vice versa (after normalization).
 * Aliases shorter than 2 normalized chars are ignored to avoid spurious hits.
 */
export function findMelody(query: string): MelodyEntry | undefined {
  const q = normalize(query);
  if (!q) return undefined;
  return MELODY_LIBRARY.find((entry) =>
    entry.names.some((name) => {
      const n = normalize(name);
      return n.length >= 2 && (q.includes(n) || n.includes(q));
    })
  );
}
