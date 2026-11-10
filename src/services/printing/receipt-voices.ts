import { parseScore } from '../../agent/parser';
import { drumPartLabel, isDrumKitSound, resolveDrumMachine, sampleLabel } from '../../lib/sample-catalog';
import type { LayerEvent, PatternEvent } from '../strudel';
import { formatRanges, receiptTiming, type ReceiptTiming } from './receipt-layers';

/**
 * Instrument rows for the share receipt when the code is not the agent's own shape
 * (one output `stack` with a layer per argument). Hand-written and pasted pieces
 * build instruments in variables and combine them through nested `stack`/`arrange`
 * sections, so the rows come from the variables instead: each instrument variable's
 * events are tagged in an offline query of the whole piece, so only what really
 * sounds is printed, with the stretches in which it sounds.
 */

export interface ReceiptRow {
  name: string;
  note: string;
  ranges: string[];
}

type Locale = 'zh-CN' | 'en';

const VOICE_KEY = '__receiptVoice';
const TAG_FN = '__receiptVoice';

interface Statement { start: number; end: number }

interface Declaration {
  name: string;
  valueStart: number;
  valueEnd: number;
  comment: string;
  kind: 'voice' | 'group' | 'other';
}

/** `code` with comment text and string contents blanked, so offsets line up with the original. */
function maskCode(code: string): string {
  const out = code.split('');
  const blank = (from: number, to: number) => {
    for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  for (let i = 0; i < code.length; i++) {
    const char = code[i];
    if (char === '/' && code[i + 1] === '/') {
      const end = code.indexOf('\n', i);
      const stop = end < 0 ? code.length : end;
      blank(i, stop);
      i = stop - 1;
    } else if (char === '/' && code[i + 1] === '*') {
      const close = code.indexOf('*/', i + 2);
      const stop = close < 0 ? code.length : close + 2;
      blank(i, stop);
      i = stop - 1;
    } else if (char === '"' || char === "'" || char === '`') {
      let end = i + 1;
      while (end < code.length && code[end] !== char) end += code[end] === '\\' ? 2 : 1;
      // Newlines inside a string are blanked too: a string never ends a statement.
      for (let k = i + 1; k < Math.min(end, code.length); k++) out[k] = ' ';
      i = end;
    }
  }
  return out.join('');
}

// A line that ends in one of these, or a next line that starts with one, continues the statement.
const CONTINUES_AFTER = new Set('=,([{+-*/%&|?:<>.!'.split(''));
const CONTINUES_BEFORE = new Set('.)]},?:+-*/%&|=<>'.split(''));

/** Top-level statements, split on `;` and on line breaks that end an expression. */
function splitStatements(masked: string): Statement[] {
  const statements: Statement[] = [];
  let depth = 0;
  let start = -1;
  let last = '';
  let lastIndex = -1;
  const close = () => {
    if (start >= 0) statements.push({ start, end: lastIndex + 1 });
    start = -1;
    last = '';
  };
  for (let i = 0; i < masked.length; i++) {
    const char = masked[i];
    if (/\s/.test(char)) {
      if (char === '\n' && depth === 0 && start >= 0 && !CONTINUES_AFTER.has(last)) {
        let next = i + 1;
        while (next < masked.length && /\s/.test(masked[next])) next++;
        if (next >= masked.length || !CONTINUES_BEFORE.has(masked[next])) close();
      }
      continue;
    }
    if (char === ';' && depth === 0) {
      close();
      continue;
    }
    if (start < 0) start = i;
    if ('([{'.includes(char)) depth++;
    else if (')]}'.includes(char)) depth = Math.max(0, depth - 1);
    last = char;
    lastIndex = i;
  }
  close();
  return statements;
}

/** The `//` comment lines directly above `offset`, joined; a blank line ends the block. */
function commentAbove(code: string, offset: number): string {
  const lines = code.slice(0, offset).split('\n');
  lines.pop();
  const block: string[] = [];
  while (lines.length > 0) {
    const line = lines.pop()!.trim();
    if (!line.startsWith('//')) break;
    block.unshift(line.replace(/^\/\/+\s*/, ''));
  }
  return block.join(' ').trim();
}

const DECLARATION = /^(?:let|const|var)\s+([A-Za-z_$][\w$]*)\s*=\s*/;
const INERT_CALL = /^(?:await\s+)?(?:setcps|setcpm|samples|hush)\s*\(/;
const NOT_OUTPUT = /^(?:import|export|function|async\s+function|class)\b/;
const COMBINATOR = /^(?:stack|arrange|cat|seq|sequence|fastcat|slowcat|timecat|timeCat|polymeter|polyrhythm|randcat|wrandcat|chooseCycles|wchooseCycles)\s*\(/;
const SOURCE = /(?:^|[^\w$.])(?:s|sound|note|n|chord|freq)\s*\(|\.(?:s|sound|note|n|bank|freq)\s*\(/;

interface Analysis {
  declarations: Declaration[];
  output: Statement | null;
}

function analyse(code: string): Analysis {
  const masked = maskCode(code);
  const declarations: Declaration[] = [];
  const kinds = new Map<string, Declaration['kind']>();
  let output: Statement | null = null;
  for (const statement of splitStatements(masked)) {
    const text = masked.slice(statement.start, statement.end);
    const match = text.match(DECLARATION);
    if (!match) {
      if (!INERT_CALL.test(text) && !NOT_OUTPUT.test(text)) output = statement;
      continue;
    }
    const name = match[1];
    const valueStart = statement.start + match[0].length;
    const value = masked.slice(valueStart, statement.end).trim();
    const kind = classify(value, kinds);
    kinds.set(name, kind);
    declarations.push({ name, valueStart, valueEnd: statement.end, comment: commentAbove(code, statement.start), kind });
  }
  return { declarations, output };
}

/**
 * An instrument ("voice") makes its own sound: it calls a sound source, or derives
 * from exactly one instrument (`sub_bass = bass.transpose(-12)`). A group only
 * combines or aliases other instruments; "other" is everything else (constants,
 * unsounded rhythms), which tags nothing.
 */
function classify(value: string, kinds: Map<string, Declaration['kind']>): Declaration['kind'] {
  let depth = 0;
  for (const char of value) {
    if ('([{'.includes(char)) depth++;
    else if (')]}'.includes(char)) depth--;
    else if (char === ',' && depth === 0) return 'other';
  }
  const voices: string[] = [];
  const groups: string[] = [];
  for (const [name, kind] of kinds) {
    if (kind === 'other') continue;
    const escaped = name.replace(/\$/g, '\\$');
    if (new RegExp(`(?<![\\w$.])${escaped}(?![\\w$])`).test(value)) (kind === 'voice' ? voices : groups).push(name);
  }
  if (voices.length === 0 && groups.length === 0) return SOURCE.test(value) ? 'voice' : 'other';
  if (kinds.has(value)) return 'group';
  if (!COMBINATOR.test(value) && groups.length === 0 && voices.length === 1) return 'voice';
  return 'group';
}

/**
 * True for the agent's own shape: the piece's output is the `stack(...)` the parser
 * splits, and its layers are named with `@layer` markers. A stack inside a variable
 * is only part of the piece, and an unmarked one has no names worth printing.
 */
export function isAgentShaped(code: string): boolean {
  const parsed = parseScore(code);
  if (!parsed.hasStack || parsed.layers.length === 0) return false;
  const { output } = analyse(code);
  return output !== null && output.start === parsed.stackStart
    && parsed.layers.some(layer => /^\s*\/\*\s*@layer\s/.test(code.slice(layer.rawStart, layer.rawEnd)));
}

/** The variable family a name belongs to: `bass_modified_2` and `bass` are one instrument. */
export function voiceStem(name: string): string {
  let stem = name;
  for (;;) {
    const next = stem.replace(/[_-]?(?:modified|mod|ext|extended|alt|variant|var|v?\d+)$/i, '');
    if (next === stem || next === '') return stem;
    stem = next;
  }
}

// Section headers and commented-out code sit above a variable without describing it.
const NOT_A_NOTE = /^(?:section|part|scene|movement|段落|第)\s*[\d一二三四五六七八九十]|[=;{}]|\.\w+\(/i;
// A short comment ("bumpin' that", "人声切片") labels the variable; a longer one
// explains how the code works, and the card prints the sound's name instead.
// Width counts a CJK character as two Latin ones.
const MAX_COMMENT_WIDTH = 28;
const noteWidth = (text: string) => Array.from(text).reduce((sum, char) => sum + (/[⺀-￿]/.test(char) ? 2 : 1), 0);

interface Row {
  name: string;
  members: string[];
  events: LayerEvent[];
  sounds: Map<string, { count: number; bank?: string; first: number }>;
  first: number;
}

/**
 * The receipt's rows for code that is not agent-shaped, or null when the piece has no
 * output to analyse or the engine cannot evaluate it.
 */
export async function resolveVoiceLayers(code: string, locale: Locale): Promise<ReceiptRow[] | null> {
  const { declarations, output } = analyse(code);
  if (!output) return null;
  const timing = receiptTiming(code);
  let events: PatternEvent[];
  try {
    const { queryPatternEvents } = await import('../strudel');
    events = await queryPatternEvents(tagVoices(code, declarations), timing.queryCycles, { [TAG_FN]: tagPattern });
  } catch {
    return null;
  }

  const rows = new Map<string, Row>();
  for (const event of events) {
    const value = event.value;
    if (!value || typeof value !== 'object') continue;
    const fields = value as Record<string, unknown>;
    const voice = typeof fields[VOICE_KEY] === 'string' ? fields[VOICE_KEY] as string : null;
    const sound = soundOf(fields);
    if (!voice && !sound) continue;
    const key = voice ? `voice:${voiceStem(voice)}` : `sound:${sound}`;
    let row = rows.get(key);
    if (!row) {
      row = { name: voice ? voiceStem(voice) : sound!, members: [], events: [], sounds: new Map(), first: event.begin };
      rows.set(key, row);
    }
    if (voice && !row.members.includes(voice)) row.members.push(voice);
    row.events.push({ begin: event.begin, end: event.end });
    row.first = Math.min(row.first, event.begin);
    if (sound) {
      const bank = typeof fields.bank === 'string' ? fields.bank : undefined;
      const entry = row.sounds.get(sound) ?? { count: 0, bank, first: event.begin };
      entry.count++;
      entry.first = Math.min(entry.first, event.begin);
      row.sounds.set(sound, entry);
    }
  }
  if (rows.size === 0) return null;

  const comments = new Map(declarations.map(declaration => [declaration.name, declaration.comment]));
  const { instruments, kits } = splitDrumKits([...rows.values()]);
  return [
    ...instruments.map(row => ({ first: row.first, row: { name: row.name, note: rowNote(row, comments), ranges: formatRanges(row.events, timing) } })),
    ...kits.map(kit => ({ first: kit.first, row: kitRow(kit, locale, timing) })),
  ]
    .sort((a, b) => a.first - b.first)
    .map(({ row }) => row);
}

interface DrumKit {
  machine?: string;
  events: LayerEvent[];
  // Each drum sound with its first hit, so the note lists them in order of entrance.
  sounds: Map<string, number>;
  first: number;
}

/**
 * Drums print as one kit per drum machine rather than one row per sound or per
 * variable: a row whose sounds are all kit pieces (the 试听 page's 鼓组 and 经典鼓机)
 * joins the kit of its machine, or the unbranded kit.
 */
function splitDrumKits(rows: Row[]): { instruments: Row[]; kits: DrumKit[] } {
  const instruments: Row[] = [];
  const kits = new Map<string, DrumKit>();
  for (const row of rows) {
    const sounds = [...row.sounds];
    if (sounds.length === 0 || !sounds.every(([sound, { bank }]) => machineSound(sound, bank) || (!bank && isDrumKitSound(sound)))) {
      instruments.push(row);
      continue;
    }
    const [sound, dominant] = [...sounds].sort((a, b) => b[1].count - a[1].count)[0];
    const machine = machineSound(sound, dominant.bank)?.machine;
    const key = machine ?? '';
    let kit = kits.get(key);
    if (!kit) {
      kit = { machine, events: [], sounds: new Map(), first: row.first };
      kits.set(key, kit);
    }
    kit.events.push(...row.events);
    kit.first = Math.min(kit.first, row.first);
    for (const [sound, entry] of sounds) {
      const first = Math.min(kit.sounds.get(sound) ?? Infinity, entry.first);
      kit.sounds.set(sound, first);
    }
  }
  return { instruments, kits: [...kits.values()] };
}

function kitRow(kit: DrumKit, locale: Locale, timing: ReceiptTiming): ReceiptRow {
  const zh = locale === 'zh-CN';
  const word = zh ? '鼓组' : 'drums';
  // The kit's name carries the machine, so each sound is just its part (底鼓, 闭镲).
  const sounds = [...kit.sounds].sort((a, b) => a[1] - b[1])
    .map(([sound]) => (kit.machine ? drumPartLabel(sound)?.[0] ?? sampleLabel(`${kit.machine}_${sound}`)?.[0] : undefined) ?? soundLabel(sound));
  return {
    name: kit.machine ? `${bankLabel(kit.machine)} ${word}` : word,
    note: [...new Set(sounds)].join('、'),
    ranges: formatRanges(kit.events, timing),
  };
}

/** Wraps every instrument variable's value so its events carry the variable's name. */
function tagVoices(code: string, declarations: Declaration[]): string {
  let tagged = code;
  for (const declaration of [...declarations].reverse()) {
    if (declaration.kind !== 'voice') continue;
    tagged = tagged.slice(0, declaration.valueStart)
      + `${TAG_FN}((`
      + tagged.slice(declaration.valueStart, declaration.valueEnd)
      // Single quotes: a plain string to the transpiler, not mini-notation.
      + `), '${declaration.name}')`
      + tagged.slice(declaration.valueEnd);
  }
  return tagged;
}

interface TaggablePattern { withValue(fn: (value: unknown) => unknown): unknown }

// A derived instrument re-tags its source's events, so the innermost variable wins.
function tagPattern(pattern: unknown, name: string): unknown {
  if (!pattern || typeof (pattern as TaggablePattern).withValue !== 'function') return pattern;
  return (pattern as TaggablePattern).withValue(value =>
    value && typeof value === 'object' ? { ...value as object, [VOICE_KEY]: name } : value);
}

function soundOf(fields: Record<string, unknown>): string | null {
  if (typeof fields.s === 'string' && fields.s) return fields.s;
  // Notes without a sound play Strudel's default synth.
  if (fields.note != null || fields.n != null || fields.freq != null) return 'triangle';
  return null;
}

// A note is Chinese wherever it can be: a Chinese comment, else the sound's name from the
// 试听 catalog. An English comment or the raw sample name ("采样 camera_flash") stands in
// for a sound the catalog does not know.
function rowNote(row: Row, comments: Map<string, string>): string {
  const own = row.members.length === 1 ? row.members[0] : row.members.find(member => member === row.name);
  const comment = own ? comments.get(own) ?? '' : '';
  const usable = comment !== '' && !NOT_A_NOTE.test(comment) && noteWidth(comment) <= MAX_COMMENT_WIDTH;
  if (usable && CHINESE.test(comment)) return comment;
  const [sound, entry] = [...row.sounds].sort((a, b) => b[1].count - a[1].count)[0] ?? [];
  if (!sound) return usable ? comment : '';
  return knownSoundLabel(sound, entry?.bank) ?? (usable ? comment : `采样 ${sound}`);
}

const CHINESE = /[一-鿿]/;

// For a sample the piece loaded itself, a family its name points to: `vox` → 人声采样.
const SAMPLE_FAMILIES: [RegExp, string][] = [
  [/vox|vocal|voice|choir|acapella/, '人声采样'],
  [/kick|snare|hihat|hat|drum|perc|clap/, '鼓采样'],
  [/bass/, '贝斯采样'],
  [/piano|keys/, '钢琴采样'],
  [/guitar|gtr/, '吉他采样'],
  [/string|violin|cello/, '弦乐采样'],
  [/pad/, '铺底采样'],
];

/** The machine-qualified catalog name of a sound played through `.bank()`, if it is one. */
function machineSound(sound: string, bank: string | undefined): { machine: string; name: string } | null {
  const machine = bank ? resolveDrumMachine(bank) : undefined;
  if (!machine || !isDrumKitSound(`${machine}_${sound}`)) return null;
  return { machine, name: `${machine}_${sound}` };
}

function knownSoundLabel(sound: string, bank?: string): string | undefined {
  const banked = machineSound(sound, bank);
  if (banked) {
    const part = drumPartLabel(sound)?.[0] ?? sampleLabel(banked.name)?.[0];
    return part ? `${bankLabel(banked.machine)} ${part}` : `${bankLabel(banked.machine)} ${sound}`;
  }
  const label = sampleLabel(sound)?.[0];
  if (label && label !== '未分类采样') return label;
  const lower = sound.toLowerCase();
  return SAMPLE_FAMILIES.find(([pattern]) => pattern.test(lower))?.[1];
}

/** A sound's name for the card, from the 试听 catalog: "TR-808 底鼓", "合成贝斯 2", "采样 camera_flash". */
export function soundLabel(sound: string, bank?: string): string {
  return knownSoundLabel(sound, bank) ?? `采样 ${sound}`;
}

/** "RolandTR808" → "TR-808". */
function bankLabel(bank: string): string {
  const model = bank.replace(/^(?:Roland|Korg|Yamaha|Linn|Akai|Boss|Emu|Casio|Oberheim|Alesis|Simmons|Sequential)/, '');
  return (model || bank).replace(/^([A-Za-z]+)(\d+)$/, '$1-$2');
}
