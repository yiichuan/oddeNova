/**
 * Tracks of a score built from sections, for the receipt.
 *
 * Agent-written code is one `stack(...)` of layers, and the parser's layers are its
 * tracks. Hand-arranged pieces are built differently: instruments are functions,
 * sections are `let verse = stack(koto(...), drums(...))`, and the piece returns
 * `stack(arrange([8, verse], ...), noise_bed)`. There the parser's first `stack`
 * is just one section, so the card would list that section's arguments as
 * `layer_0`, `layer_1`, ... For such code this reads the tracks instead:
 *
 * - inside a section, each instrument call is a track named after its function
 *   (`koto`, `grooveInDrums`), merged across sections; a kit's bd/sd/hh are one
 *   instrument call, so they stay one track;
 * - a variable placed straight in the returned stack (`noise_bed`) is a track of
 *   its own name;
 * - `/* @layer NAME *\/` still names a track wherever it appears.
 *
 * Events are attributed by wrapping each track's expression in `__track(name, …)`,
 * which marks the events it produces; the innermost mark wins.
 */

import { parseScore } from '../../agent/parser';

export const TRACK_MARK = '__track';

export interface ReceiptTracks {
  /** Track names in order of first appearance. */
  names: string[];
  /** The code with every track expression wrapped in `__track('name', …)`. */
  instrumented: string;
}

interface Token {
  kind: 'word' | 'str' | 'punct';
  text: string;
  start: number;
  end: number;
}

const CONTAINERS = new Set(['arrange', 'cat', 'seq', 'slowcat', 'fastcat', 'sequence', 'timeCat', 'timecat']);
const LAYER_MARKER_RE = /\/\*\s*@layer\s+([^*]+?)\s*\*\//;
const OPEN = '([{';
const CLOSE = ')]}';
// A line break does not end a statement after these, nor before the ones below.
const CONTINUES_AFTER = new Set(['=', '=>', ',', '(', '[', '{', '+', '-', '*', '/', '%', '&', '|', '?', ':', '<', '>', '!', '.']);
const CONTINUES_BEFORE = new Set(['.', ',', ')', ']', '}', '?', ':', '+', '*', '/', '%', '&', '|', '=', '=>', '<', '>', '(', '[']);

function tokenize(code: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < code.length) {
    const ch = code[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (ch === '/' && code[i + 1] === '/') {
      while (i < code.length && code[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && code[i + 1] === '*') {
      const close = code.indexOf('*/', i + 2);
      i = close < 0 ? code.length : close + 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      let end = i + 1;
      while (end < code.length && code[end] !== ch) end += code[end] === '\\' ? 2 : 1;
      tokens.push({ kind: 'str', text: code.slice(i, end + 1), start: i, end: end + 1 });
      i = end + 1;
      continue;
    }
    if (/[A-Za-z0-9_$]/.test(ch)) {
      let end = i + 1;
      // A number keeps its decimal point; an identifier stops at `.`, so `a.b` is a chain.
      while (end < code.length && (/[A-Za-z0-9_$]/.test(code[end])
        || (code[end] === '.' && /[0-9]/.test(ch) && /[0-9]/.test(code[end + 1] ?? '')))) end++;
      tokens.push({ kind: 'word', text: code.slice(i, end), start: i, end });
      i = end;
      continue;
    }
    const text = ch === '=' && code[i + 1] === '>' ? '=>' : ch;
    tokens.push({ kind: 'punct', text, start: i, end: i + text.length });
    i += text.length;
  }
  return tokens;
}

/** Index of the token closing the bracket opened at `open`, or -1. */
function matching(tokens: Token[], open: number): number {
  let depth = 0;
  for (let k = open; k < tokens.length; k++) {
    if (tokens[k].kind !== 'punct') continue;
    if (OPEN.includes(tokens[k].text)) depth++;
    else if (CLOSE.includes(tokens[k].text) && --depth === 0) return k;
  }
  return -1;
}

/** Token ranges [from, to) of the top-level statements. */
function statements(code: string, tokens: Token[]): [number, number][] {
  const out: [number, number][] = [];
  let depth = 0;
  let from = 0;
  for (let k = 0; k < tokens.length; k++) {
    const token = tokens[k];
    if (depth === 0 && k > from && code.slice(tokens[k - 1].end, token.start).includes('\n')
      && !CONTINUES_AFTER.has(tokens[k - 1].text) && !CONTINUES_BEFORE.has(token.text)) {
      out.push([from, k]);
      from = k;
    }
    if (token.kind === 'punct') {
      if (OPEN.includes(token.text)) depth++;
      else if (CLOSE.includes(token.text)) depth--;
      else if (token.text === ';' && depth === 0) {
        if (k > from) out.push([from, k]);
        from = k + 1;
      }
    }
  }
  if (from < tokens.length) out.push([from, tokens.length]);
  return out;
}

/** Top-level comma-separated token ranges between `from` and `to`. */
function splitArgs(tokens: Token[], from: number, to: number): [number, number][] {
  const out: [number, number][] = [];
  let depth = 0;
  let start = from;
  for (let k = from; k < to; k++) {
    const text = tokens[k].kind === 'punct' ? tokens[k].text : '';
    if (OPEN.includes(text) && text) depth++;
    else if (CLOSE.includes(text) && text) depth--;
    else if (text === ',' && depth === 0) {
      out.push([start, k]);
      start = k + 1;
    }
  }
  out.push([start, to]);
  return out.filter(([a, b]) => b > a);
}

interface Declaration {
  isFunction: boolean;
  from: number;
  to: number;
}

const quote = (name: string) => `'${name.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

export function resolveReceiptTracks(code: string): ReceiptTracks | null {
  if (!code?.trim()) return null;
  const tokens = tokenize(code);
  const declarations = new Map<string, Declaration>();
  let result: [number, number] | null = null;
  for (const [from, to] of statements(code, tokens)) {
    const [first, second, third] = tokens.slice(from, from + 3);
    if (first.text === 'function' && second?.kind === 'word') {
      declarations.set(second.text, { isFunction: true, from, to });
      result = null;
    } else if (/^(const|let|var)$/.test(first.text) && second?.kind === 'word' && third?.text === '=') {
      const value = tokens[from + 3];
      const arrow = (value?.kind === 'word' && tokens[from + 4]?.text === '=>')
        || (value?.text === '(' && tokens[matching(tokens, from + 3) + 1]?.text === '=>')
        || value?.text === 'function' || value?.text === 'async';
      declarations.set(second.text, { isFunction: arrow, from: from + 3, to });
      result = null;
    } else {
      result = [from, to];
    }
  }
  if (!result) return null;

  const names: string[] = [];
  const wraps = new Map<string, { start: number; end: number; name: string }>();
  let expanded = false;
  let auto = 0;

  const markerOf = (from: number) => {
    const before = from > 0 ? tokens[from - 1].end : 0;
    return LAYER_MARKER_RE.exec(code.slice(before, tokens[from].start))?.[1];
  };
  const headOf = (from: number, to: number) => {
    const head = tokens[from];
    if (head.kind !== 'word' || /^[0-9]/.test(head.text)) return null;
    const call = tokens[from + 1]?.text === '(' && from + 1 < to ? matching(tokens, from + 1) : -1;
    return { name: head.text, call };
  };
  const leaf = (from: number, to: number, name: string) => {
    const start = tokens[from].start;
    const end = tokens[to - 1].end;
    if (wraps.has(`${start}:${end}`)) return;
    wraps.set(`${start}:${end}`, { start, end, name });
    if (!names.includes(name)) names.push(name);
  };
  const isContainer = (declaration: Declaration) => {
    const head = headOf(declaration.from, declaration.to);
    return head != null && head.call > 0 && CONTAINERS.has(head.name);
  };

  /** One track slot: a stack argument, or a section that is not a stack. */
  const track = (from: number, to: number, fallback: string, depth: number) => {
    const marker = markerOf(from);
    if (marker) return leaf(from, to, marker);
    const head = headOf(from, to);
    if (head?.name === 'silence' && to - from === 1) return;
    const declaration = head ? declarations.get(head.name) : undefined;
    if (head && declaration && !declaration.isFunction) {
      if (isContainer(declaration) && depth < 8) {
        expanded = true;
        return container(declaration.from, declaration.to, depth + 1);
      }
      return leaf(from, to, head.name);
    }
    if (head && declaration?.isFunction) return leaf(from, to, head.name);
    return leaf(from, to, fallback);
  };
  const section = (from: number, to: number, name: string, depth: number) => {
    const head = headOf(from, to);
    if (head?.name === 'stack' && head.call > 0) {
      for (const [a, b] of splitArgs(tokens, from + 2, head.call)) track(a, b, name, depth);
    } else {
      track(from, to, name, depth);
    }
  };
  const container = (from: number, to: number, depth: number) => {
    const head = headOf(from, to)!;
    for (const [a, b] of splitArgs(tokens, from + 2, head.call)) {
      let [x, y] = [a, b];
      // arrange's [bars, pattern] pairs: the pattern is the last element.
      if (tokens[x].text === '[' && matching(tokens, x) === y - 1) {
        const parts = splitArgs(tokens, x + 1, y - 1);
        if (parts.length === 0) continue;
        [x, y] = parts[parts.length - 1];
      }
      const inner = headOf(x, y);
      const declaration = inner && y - x === 1 ? declarations.get(inner.name) : undefined;
      if (inner && declaration && !declaration.isFunction && depth < 8) {
        expanded = true;
        section(declaration.from, declaration.to, inner.name, depth + 1);
      } else {
        section(x, y, `layer_${auto++}`, depth + 1);
      }
    }
  };
  const top = (from: number, to: number, depth: number): boolean => {
    const head = headOf(from, to);
    if (!head) return false;
    if (head.name === 'stack' && head.call > 0) {
      // Not the stack the parser reads its layers from: an earlier one is a section.
      if (tokens[from].start !== parseScore(code).stackStart) expanded = true;
      for (const [a, b] of splitArgs(tokens, from + 2, head.call)) track(a, b, `layer_${auto++}`, depth);
      return true;
    }
    if (CONTAINERS.has(head.name) && head.call > 0) {
      expanded = true;
      container(from, to, depth);
      return true;
    }
    const declaration = declarations.get(head.name);
    if (declaration && !declaration.isFunction && depth < 8) {
      expanded = true;
      return top(declaration.from, declaration.to, depth + 1);
    }
    return false;
  };

  if (!top(result[0], result[1], 0) || !expanded || names.length === 0) return null;

  let instrumented = code;
  const edits = [...wraps.values()].flatMap(({ start, end, name }) => [
    { at: end, text: ')', order: 0 },
    { at: start, text: `${TRACK_MARK}(${quote(name)}, `, order: 1 },
  ]);
  edits.sort((a, b) => b.at - a.at || a.order - b.order);
  for (const { at, text } of edits) instrumented = instrumented.slice(0, at) + text + instrumented.slice(at);
  return { names, instrumented };
}
