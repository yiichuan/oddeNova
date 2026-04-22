// ============================================================================
// Style profiles. Six built-in genres the agent can match user descriptions
// against. Each profile is intentionally LIGHT — we record BPM range, sample
// bank, recommended layer roles, and per-role freeform hints. We deliberately
// do NOT store concrete `skeleton` snippets here, to avoid the agent locking
// onto one fixed pattern per genre.
//
// Consumed by:
//   - AGENT_SYSTEM_PROMPT (the keyword list is summarised inline there)
//   - `improvise` tool handler in src/agent/tools.ts (passes style + role into
//     improviseLLM so the sub-model gets the per-role hint)
//   - `matchStyle()` is exported for any caller that wants to suggest a style
//     given a free-text user instruction; the agent itself does the matching
//     in-prompt, but having a deterministic match also lets us test/extend.
// ============================================================================

export type StyleId =
  | 'lofi'
  | 'house'
  | 'dnb'
  | 'ambient'
  | 'techno'
  | 'synthwave';

export type Role = 'drums' | 'hh' | 'bass' | 'pad' | 'lead' | 'fx';

export interface StyleProfile {
  id: StyleId;
  /** Substrings (lowercased) that match this style in user instructions. */
  match: string[];
  /** Inclusive BPM range. The agent should pick a value in [min, max]. */
  bpm: [number, number];
  /** Strudel sample bank to prefer (passed via `.bank("...")` on drums). */
  bank: string;
  /** Recommended layer roles to build, in order. */
  layers: Role[];
  /** Per-role freeform hints — concatenated into the improvise sub-model prompt. */
  hint_for_improvise: Partial<Record<Role, string>>;
}

export const STYLES: StyleProfile[] = [
  {
    id: 'lofi',
    match: ['lo-fi', 'lofi', 'lo fi', '慢节奏', '安静', '夜晚', '学习', '放松', 'chill'],
    bpm: [70, 90],
    bank: 'RolandTR808',
    layers: ['drums', 'bass', 'pad'],
    hint_for_improvise: {
      drums: 'lazy boom-bap groove, sparse ghost snares, swing feel',
      bass: 'walking bass in minor, sparse, lots of rest',
      pad: 'warm Rhodes-like, slow attack, low gain ~0.35',
      hh: 'soft closed hi-hat, mostly off-beat',
    },
  },
  {
    id: 'house',
    match: ['house', '舞曲', '夜店', 'four on the floor', '4/4', '128'],
    bpm: [118, 128],
    bank: 'RolandTR909',
    layers: ['drums', 'hh', 'bass', 'pad'],
    hint_for_improvise: {
      drums: 'four-on-the-floor kick, clap on 2 and 4',
      hh: 'open hi-hat on off-beats (the "tss" between kicks)',
      bass: 'pumping sub bass, root notes on every kick',
      pad: 'sustained chord stabs, side-chained feel via low gain',
    },
  },
  {
    id: 'dnb',
    match: ['dnb', 'd&b', 'drum and bass', 'jungle', '快节奏', 'breakbeat', 'amen'],
    bpm: [165, 180],
    bank: 'RolandTR909',
    layers: ['drums', 'bass', 'pad'],
    hint_for_improvise: {
      drums: 'amen-style break, snare on 2 and 4 with ghost notes, fast hi-hat',
      bass: 'reese bass or sub-rolling bass, root note in c2-f2',
      pad: 'atmospheric long pad in minor, very low gain ~0.3',
    },
  },
  {
    id: 'ambient',
    match: ['ambient', 'drone', '空灵', '冥想', '太空', 'pad-only', '无节奏'],
    bpm: [60, 90],
    bank: 'RolandTR808',
    layers: ['pad', 'lead', 'fx'],
    hint_for_improvise: {
      pad: 'long evolving pad, attack > 1s, release > 2s, low gain',
      lead: 'sparse single notes, lots of space, with .room(0.7)',
      fx: 'occasional perlin-modulated noise or reverse cymbal swells',
      drums: 'no drums, or only a single soft kick every 4 bars',
    },
  },
  {
    id: 'techno',
    match: ['techno', '工业', '机械', 'driving', 'minimal', '硬核'],
    bpm: [125, 140],
    bank: 'RolandTR909',
    layers: ['drums', 'hh', 'bass', 'lead'],
    hint_for_improvise: {
      drums: 'relentless four-on-the-floor kick, no swing',
      hh: 'fast 16th hi-hat, slight gain modulation',
      bass: 'monotone driving bass on the root, .lpf modulated by sine',
      lead: 'acid-style 303 bleeps with .lpf sweep, sparse',
    },
  },
  {
    id: 'synthwave',
    match: ['synthwave', '合成器', '复古', '80s', 'retrowave', 'outrun'],
    bpm: [90, 110],
    bank: 'RolandTR707',
    layers: ['drums', 'bass', 'pad', 'lead'],
    hint_for_improvise: {
      drums: 'gated reverb snare on 2 and 4, simple kick pattern',
      bass: 'arpeggiated bass in minor, eighth notes',
      pad: 'lush analog pad with .vowel and slow .lpf modulation',
      lead: 'saw-wave lead with .delay(0.3).room(0.4), bright melody',
    },
  },
];

// Lowercased keyword → style id, built once at module load for O(1) match.
const KEYWORD_INDEX: Array<{ keyword: string; id: StyleId }> = STYLES.flatMap(
  (s) => s.match.map((m) => ({ keyword: m.toLowerCase(), id: s.id }))
);

/**
 * Best-effort keyword match. Returns the style id whose `match` array contains
 * the longest substring appearing in `userText`, or `null` if no keyword hits.
 *
 * Used by callers that want a deterministic suggestion. The agent itself does
 * its own matching in-prompt — having both lets us cross-check.
 */
export function matchStyle(userText: string): StyleId | null {
  if (!userText) return null;
  const lc = userText.toLowerCase();
  let best: { id: StyleId; len: number } | null = null;
  for (const { keyword, id } of KEYWORD_INDEX) {
    if (lc.includes(keyword)) {
      if (!best || keyword.length > best.len) {
        best = { id, len: keyword.length };
      }
    }
  }
  return best?.id ?? null;
}

export function getStyle(id: string): StyleProfile | null {
  return STYLES.find((s) => s.id === id) ?? null;
}

/**
 * Returns the per-role hint string for a given style + role pair, or '' when
 * the style/role combination has no specific guidance. Safe to interpolate
 * directly into a prompt.
 */
export function getRoleHint(styleId: string | undefined, role: string): string {
  if (!styleId) return '';
  const style = getStyle(styleId);
  if (!style) return '';
  const hint = style.hint_for_improvise[role as Role];
  return hint ?? '';
}
