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
  | 'synthwave'
  | 'trap'
  | 'jazz';

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
  /** Recommended scale mode(s) for melodic layers, e.g. "minor" or "dorian|lydian". */
  mode?: string;
  /** Typical emotional character, e.g. "dark|aggressive". Used in improvise hints. */
  emotion?: string;
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
    mode: 'minor|dorian',
    emotion: 'melancholic|dreamy',
    hint_for_improvise: {
      drums: 'lazy boom-bap groove, sparse ghost snares, swing feel; typical pattern: "bd ~ bd ~" with bank RolandTR808; for groove: add .late("[0 .01 0 .02]*4") for a lazy, drunk feel',
      bass: 'walking bass in minor, sparse, lots of rest; note range c2-g2, pattern like "c2 ~ eb2 ~", use .lpf(400); use .gain(perlin.range(.5,.8)) for organic breathing dynamics',
      pad: 'warm electric-piano feel using `.s("juno")` or synth `.s("sawtooth")`, slow attack, low gain ~0.35, add .room(2); add .lpf(sine.range(800,2000).slow(16)) for gentle warmth movement',
      hh: 'soft closed hi-hat, mostly off-beat, euclidean rhythm like hh(5,8), gain ≤0.45',
    },
  },
  {
    id: 'house',
    match: ['house', '舞曲', '夜店', 'four on the floor', '4/4', '128'],
    bpm: [118, 128],
    bank: 'RolandTR909',
    layers: ['drums', 'hh', 'bass', 'pad'],
    mode: 'minor|dorian',
    emotion: 'uplifting',
    hint_for_improvise: {
      drums: 'four-on-the-floor kick, clap on 2 and 4; pattern: "bd*4" paired with "~ cp ~ cp"',
      hh: 'open hi-hat on off-beats (the "tss" between kicks); pattern like "~ oh ~ oh", gain 0.4-0.5; use euclidean (5,8) or (3,8) pattern; add .gain(sine.range(.3,.6).slow(2)) for pumping feel',
      bass: 'pumping sub bass, root notes on every kick; note range c2-g2, use .lpf(400), pattern: "c2 c2 eb2 f2"; sidechain-like: .gain("<.2 1@3>*2") to duck under kick',
      pad: 'sustained chord stabs, side-chained feel via low gain ~0.4, add .room(1.5)',
    },
  },
  {
    id: 'dnb',
    match: ['dnb', 'd&b', 'drum and bass', 'jungle', '快节奏', 'breakbeat', 'amen'],
    bpm: [165, 180],
    bank: 'RolandTR909',
    layers: ['drums', 'bass', 'pad'],
    mode: 'minor',
    emotion: 'dark|aggressive',
    hint_for_improvise: {
      drums: 'amen-style break, snare on 2 and 4 with ghost notes, fast hi-hat; use euclidean rhythms for snare fills',
      bass: 'reese bass or sub-rolling bass, root note in c2-f2, use .lpf(350), keep pattern sparse with rests; add .lpf(sine.range(100,400).slow(8)) for growling filter movement',
      pad: 'atmospheric long pad in minor, very low gain ~0.3, use .room(3).attack(1)',
    },
  },
  {
    id: 'ambient',
    match: ['ambient', 'drone', '空灵', '冥想', '太空', 'pad-only', '无节奏'],
    bpm: [60, 90],
    bank: 'RolandTR808',
    layers: ['pad', 'lead', 'fx'],
    mode: 'major|lydian',
    emotion: 'dreamy|tense',
    hint_for_improvise: {
      pad: 'long evolving pad, attack > 1s, release > 2s, low gain ~0.3, must have .room(4).delay(0.5); MUST add .lpf(sine.range(200,800).slow(8)).lpq(3) — ambient always needs signal modulation',
      lead: 'sparse single notes, lots of ~ rests, with .room(0.7), scale in major or lydian',
      fx: 'occasional perlin-modulated noise or reverse cymbal swells; pattern like s("metal(3,16)").gain(0.2).room(2)',
      drums: 'no drums, or only a single soft kick every 4 bars',
    },
  },
  {
    id: 'techno',
    match: ['techno', '工业', '机械', 'driving', 'minimal', '硬核'],
    bpm: [125, 140],
    bank: 'RolandTR909',
    layers: ['drums', 'hh', 'bass', 'lead'],
    mode: 'minor|phrygian',
    emotion: 'dark|aggressive',
    hint_for_improvise: {
      drums: 'relentless four-on-the-floor kick, no swing; pattern: "bd*4", hard gain 0.85-0.9',
      hh: 'fast 16th hi-hat, slight gain modulation with perlin; pattern: "hh*16", use .hpf(6000); add .gain(perlin.range(.3,.7).slow(8)) for variation',
      bass: 'monotone driving bass on the root, .lpf modulated by sine; note range c1-c2, pattern: "c1*4" or "c1 ~ c1 ~"; add .lpf(sine.range(100,400).slow(4)) for acid sweep',
      lead: 'acid-style 303 bleeps with .lpf sweep, sparse; use euclidean rhythm like n("0(3,8)").scale("A4:phrygian")',
    },
  },
  {
    id: 'synthwave',
    match: ['synthwave', '合成器', '复古', '80s', 'retrowave', 'outrun'],
    bpm: [90, 110],
    bank: 'RolandTR707',
    layers: ['drums', 'bass', 'pad', 'lead'],
    mode: 'minor',
    emotion: 'melancholic|dreamy',
    hint_for_improvise: {
      drums: 'gated reverb snare on 2 and 4, simple kick pattern; pattern: "bd ~ ~ bd ~ ~ bd ~" with "~ sd ~ sd"',
      bass: 'arpeggiated bass in minor, eighth notes; note range c2-c3, use .lpf(500)',
      pad: 'lush analog pad with .vowel and slow .lpf modulation; gain ~0.4, .room(2)',
      lead: 'saw-wave lead with .delay(0.3).room(0.4), bright melody in minor pentatonic; add .delay(0.5).delaytime(0.375) for tempo-synced echo (0.375 = dotted-8th at 120BPM)',
    },
  },
  {
    id: 'trap',
    match: ['trap', '808', '切分', 'hi-hat rolls', 'drill', 'hip hop', '嘻哈'],
    bpm: [130, 160],
    bank: 'RolandTR808',
    layers: ['drums', 'hh', 'bass', 'pad'],
    mode: 'minor',
    emotion: 'dark|aggressive',
    hint_for_improvise: {
      drums: 'syncopated kick pattern with rests, snare on 2/4; pattern: "bd ~ ~ bd ~ bd ~ ~" with "~ ~ sd ~ ~ ~ sd ~"',
      hh: 'rolling 16th hi-hat at high density; pattern: "hh*16", gain 0.35-0.45; add occasional open hat with euclidean: "808oh(3,8)"; use .gain(saw.range(.3,.6).slow(2)) for variation',
      bass: '808 slide bass with pitch bending feel; use note() in c1-eb2, .s("808bd").decay(0.8), keep very sparse (4-8 notes max)',
      pad: 'sparse dark pad with long reverb tail; gain ~0.25, .room(3).attack(0.5), note range c3-g3 in minor',
    },
  },
  {
    id: 'jazz',
    match: ['jazz', 'jazzy', 'swing', '爵士', 'walking bass', 'bossa', '蓝调', 'blues'],
    bpm: [90, 110],
    bank: 'RolandTR909',
    layers: ['drums', 'bass', 'pad'],
    mode: 'dorian|lydian',
    emotion: 'tense|melancholic',
    hint_for_improvise: {
      drums: 'swing ride pattern with brush feel; use euclidean rhythms for hi-hat, soft gain 0.5-0.65, sparse kick; use .gain(perlin.range(.45,.65)) for human-feel dynamics',
      bass: 'walking bass in dorian or lydian, quarter-note feel; note range c2-g3, pattern with stepwise motion like "c2 d2 eb2 f2 g2", use .lpf(500)',
      pad: 'warm chord voicings with delay; gain ~0.4, .delay(0.3).room(1.5), short sustain',
      lead: 'melodic improvisation with lots of ~ rests, dorian scale, use .room(1)',
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
