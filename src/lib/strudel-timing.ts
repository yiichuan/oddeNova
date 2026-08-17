import { parseScore } from '../agent/parser';

const DEFAULT_CPS = 0.5;
const MAX_DECIMAL_PLACES = 3;

// Chained calls that change how many cycles a pattern needs before repeating.
// `slow`/`fast` scale the whole chain they sit on; the others gate a variation
// every N cycles, so they only need to divide the loop.
const CYCLE_CALL_RE =
  /\b(slow|fast|every|chunk|chunkBack|iter|iterBack)\s*\(\s*(\d+(?:\.\d+)?)\s*[,)]/g;

// Continuous signals. A `.slow(20)` on one of these stretches an LFO, not the
// arrangement: it is bounded, it varies smoothly, and nothing about it lands on
// a beat, so the point where its phase realigns is not a place the music can be
// heard repeating. Their periods are also picked for feel (4, 6, 20) with no
// relation to the phrase grid, so folding them into the loop length multiplies
// it out to nonsense — a filter sweep is the reason a piece would claim to be
// 88 minutes long. Structure comes from patterns; these only ride on top.
const SIGNAL_ROOTS = new Set([
  'sine',
  'sine2',
  'cosine',
  'cosine2',
  'saw',
  'saw2',
  'isaw',
  'isaw2',
  'tri',
  'tri2',
  'itri',
  'square',
  'square2',
  'isquare',
  'pulse',
  'perlin',
  'rand',
  'irand',
  'brand',
  'brandBy',
  'signal',
  'time',
  'envL',
  'envLR',
  'envR',
]);

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    [x, y] = [y, x % y];
  }
  return x;
}

function lcm(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return Math.abs((a / gcd(a, b)) * b);
}

function decimalPlaces(value: number): number {
  const decimal = String(value).split('.')[1];
  return Math.min(decimal?.length ?? 0, MAX_DECIMAL_PLACES);
}

function leastCommonPeriod(periods: number[]): number {
  const valid = periods.filter((period) => Number.isFinite(period) && period > 0);
  if (valid.length === 0) return 1;

  const scale = 10 ** Math.max(...valid.map(decimalPlaces));
  const scaled = valid.map((period) => Math.round(period * scale));
  return scaled.reduce((period, next) => lcm(period, next), scale) / scale;
}

interface ScannedCode {
  /** Contents of every string literal, comments excluded. */
  strings: string[];
  /** The code with string bodies and comments blanked out, brackets intact. */
  masked: string;
}

function scanCode(code: string): ScannedCode {
  const strings: string[] = [];
  let masked = '';
  let quote: '"' | "'" | '`' | null = null;
  let value = '';
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < code.length; index += 1) {
    const character = code[index];
    const next = code[index + 1];

    if (inLineComment) {
      masked += character === '\n' ? '\n' : ' ';
      if (character === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      masked += ' ';
      if (character === '*' && next === '/') {
        masked += ' ';
        inBlockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (character === '\\' && index + 1 < code.length) {
        value += character + code[index + 1];
        masked += '  ';
        index += 1;
      } else if (character === quote) {
        strings.push(value);
        value = '';
        quote = null;
        masked += ' ';
      } else {
        value += character;
        masked += character === '\n' ? '\n' : ' ';
      }
      continue;
    }
    if (character === '/' && next === '/') {
      inLineComment = true;
      masked += '  ';
      index += 1;
    } else if (character === '/' && next === '*') {
      inBlockComment = true;
      masked += '  ';
      index += 1;
    } else if (character === '"' || character === "'" || character === '`') {
      quote = character;
      masked += ' ';
    } else {
      masked += character;
    }
  }

  return { strings, masked };
}

/** Paren nesting depth in front of every character of `masked`. */
function parenDepths(masked: string): number[] {
  const depths: number[] = [];
  let depth = 0;
  for (const character of masked) {
    depths.push(depth);
    if (character === '(') depth += 1;
    else if (character === ')') depth = Math.max(0, depth - 1);
  }
  return depths;
}

/**
 * Name the call chain that ends at `index` is built on: for
 * `.lpf(sine.range(200, 800).slow(6))` the `slow` sits on `sine`. Walks left
 * over balanced parens to the start of the sub-expression, so a nested chain
 * resolves to its own root rather than to the layer's.
 */
function chainRootBefore(masked: string, index: number): string {
  let depth = 0;
  let start = index - 1;
  while (start >= 0) {
    const character = masked[start];
    if (character === ')') {
      depth += 1;
    } else if (character === '(') {
      if (depth === 0) break;
      depth -= 1;
    } else if (depth === 0 && (character === ',' || character === ';')) {
      break;
    }
    start -= 1;
  }
  return /^\s*([A-Za-z_$][\w$]*)/.exec(masked.slice(start + 1, index))?.[1] ?? '';
}

/** Split mini-notation on whitespace that sits outside any bracket group. */
function topLevelTokens(value: string): string[] {
  const tokens: string[] = [];
  let depth = 0;
  let current = '';

  for (const character of value) {
    if ('([{<'.includes(character)) depth += 1;
    else if (')]}>'.includes(character)) depth = Math.max(0, depth - 1);

    if (/\s/.test(character) && depth === 0) {
      if (current) tokens.push(current);
      current = '';
    } else {
      current += character;
    }
  }
  if (current) tokens.push(current);

  return tokens;
}

/**
 * How many cycles one alternation slot occupies: `a` is 1, `a!3` repeats the
 * slot 3 times, `a@4` stretches it over 4, and bare `!`/`_` extend the
 * previous slot by one.
 */
function tokenCycles(token: string): number {
  if (token === '!' || token === '_') return 1;

  let depth = 0;
  let replicate = 1;
  let elongate = 1;

  for (let index = 0; index < token.length; index += 1) {
    const character = token[index];
    if ('([{<'.includes(character)) {
      depth += 1;
    } else if (')]}>'.includes(character)) {
      depth = Math.max(0, depth - 1);
    } else if (depth === 0 && (character === '!' || character === '@')) {
      const amount = /^(\d+(?:\.\d+)?)/.exec(token.slice(index + 1))?.[1];
      if (character === '!') replicate = amount ? Number(amount) : 2;
      else if (amount) elongate = Number(amount);
    }
  }

  return replicate * elongate;
}

/**
 * Cycle span of every top-level `<...>` alternation in a mini-notation string.
 * A bare `<a b c>` takes one cycle per slot; a trailing `/N` slows the whole
 * alternation (so `<a b>/16` runs for 32 cycles) and `*N` speeds it up.
 * Nested alternations advance once per pass of their parent, so their spans
 * multiply.
 */
function alternationCycles(text: string): number[] {
  const spans: number[] = [];
  let depth = 0;
  let start = -1;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '<') {
      if (depth === 0) start = index;
      depth += 1;
    } else if (character === '>') {
      depth = Math.max(0, depth - 1);
      if (depth === 0 && start >= 0) {
        const inner = text.slice(start + 1, index);
        const slots = topLevelTokens(inner).reduce((sum, token) => sum + tokenCycles(token), 0);
        const nested = alternationCycles(inner);
        let cycles = Math.max(1, slots) * leastCommonPeriod(nested);

        const operator = /^\s*([/*])\s*(\d+(?:\.\d+)?)/.exec(text.slice(index + 1));
        if (operator) {
          const amount = Number(operator[2]);
          if (amount > 0) cycles = operator[1] === '/' ? cycles * amount : cycles / amount;
        }

        spans.push(cycles);
        start = -1;
      }
    }
  }

  return spans;
}

/** Cycles one independent expression (a stack layer, or the surrounding code) runs for. */
function segmentCycles(segment: string): number {
  const { strings, masked } = scanCode(segment);
  const periods: number[] = [1];
  for (const text of strings) periods.push(...alternationCycles(text));

  const depths = parenDepths(masked);
  let scale = 1;
  let match: RegExpExecArray | null;
  CYCLE_CALL_RE.lastIndex = 0;
  while ((match = CYCLE_CALL_RE.exec(masked)) !== null) {
    const [, name, rawAmount] = match;
    const amount = Number(rawAmount);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    if (name !== 'slow' && name !== 'fast') {
      periods.push(amount);
      continue;
    }
    // An LFO's period is texture, not form — it never becomes the loop.
    if (SIGNAL_ROOTS.has(chainRootBefore(masked, match.index))) continue;

    // Only a call on the layer's own chain rescales it; a nested one (say a
    // `fast` inside `every`) just has to fit the loop.
    const onLayerChain = depths[match.index] === 0;
    if (name === 'slow') {
      if (onLayerChain) scale *= amount;
      else periods.push(amount);
    } else if (onLayerChain) {
      scale /= amount;
    }
  }

  const cycles = leastCommonPeriod(periods) * scale;
  return cycles > 0 ? Math.round(cycles * 1000) / 1000 : 1;
}

/**
 * Returns the first point at which every layer's pattern lines up again, i.e.
 * the length of the audible loop in cycles.
 */
export function getStrudelLoopCycles(code: string): number {
  const parsed = parseScore(code);
  const segments: string[] = [];

  if (parsed.hasStack && parsed.layers.length > 0) {
    for (const layer of parsed.layers) segments.push(layer.source);
    // Whatever wraps the stack (setcps, shared `let` patterns, chained calls).
    segments.push(code.slice(0, parsed.stackArgsStart) + code.slice(parsed.stackArgsEnd));
  } else {
    segments.push(code);
  }

  return leastCommonPeriod(segments.map(segmentCycles));
}

export function getStrudelLoopDurationSeconds(code: string): number {
  if (!code.trim()) return 0;
  const parsedCps = parseScore(code).cps;
  const cps = parsedCps != null && parsedCps > 0 ? parsedCps : DEFAULT_CPS;
  return getStrudelLoopCycles(code) / cps;
}

export function formatPlaybackTime(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(wholeSeconds / 60);
  const remainder = wholeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}
