// Strudel code structural parser.
// Recognises `setcps(N)` and `stack(...)` calls, splitting the stack args into
// individually addressable layers. Layers may be tagged with an inline
// `/* @layer NAME */` marker; otherwise they get auto-names like `layer_0`.

export interface ParsedLayer {
  name: string;
  source: string;       // layer expression text without the @layer marker, trimmed
  rawStart: number;     // absolute index in code where this layer's slot begins
  rawEnd: number;       // absolute index (exclusive) where this layer's slot ends
}

export interface ParsedScore {
  raw: string;
  cps: number | null;
  bpm: number | null;
  setcpsMatch: { start: number; end: number } | null;
  hasStack: boolean;
  stackStart: number;       // index of 'stack' word
  stackArgsStart: number;   // index right after '('
  stackArgsEnd: number;     // index of matching ')'
  layers: ParsedLayer[];
}

const LAYER_MARKER_RE = /^\s*\/\*\s*@layer\s+([A-Za-z0-9_]+)\s*\*\//;

export function parseScore(code: string): ParsedScore {
  const result: ParsedScore = {
    raw: code,
    cps: null,
    bpm: null,
    setcpsMatch: null,
    hasStack: false,
    stackStart: -1,
    stackArgsStart: -1,
    stackArgsEnd: -1,
    layers: [],
  };
  if (!code || !code.trim()) return result;

  const setcps = findSetcps(code);
  if (setcps) {
    result.cps = setcps.cps;
    result.bpm = Math.round(setcps.cps * 240);
    result.setcpsMatch = { start: setcps.start, end: setcps.end };
  }

  const stackIdx = findTopLevelKeyword(code, 'stack');
  if (stackIdx >= 0) {
    const openParen = code.indexOf('(', stackIdx + 'stack'.length);
    if (openParen > 0) {
      const closeIdx = findMatchingClose(code, openParen);
      if (closeIdx > 0) {
        result.hasStack = true;
        result.stackStart = stackIdx;
        result.stackArgsStart = openParen + 1;
        result.stackArgsEnd = closeIdx;

        const argsText = code.slice(result.stackArgsStart, result.stackArgsEnd);
        const spans = splitTopLevelCommas(argsText);
        let autoIdx = 0;
        for (const span of spans) {
          const argText = argsText.slice(span.start, span.end);
          if (!argText.trim()) continue;
          const marker = argText.match(LAYER_MARKER_RE);
          let name: string;
          let sourceText: string;
          if (marker) {
            name = marker[1];
            sourceText = argText.slice(marker[0].length);
          } else {
            name = `layer_${autoIdx++}`;
            sourceText = argText;
          }
          if (!sourceText.trim()) continue;
          result.layers.push({
            name,
            source: sourceText.trim(),
            rawStart: result.stackArgsStart + span.start,
            rawEnd: result.stackArgsStart + span.end,
          });
        }
      }
    }
  }

  return result;
}

interface ScanState {
  inString: string | null;
  inLineComment: boolean;
  inBlockComment: boolean;
}

function newScanState(): ScanState {
  return { inString: null, inLineComment: false, inBlockComment: false };
}

// Updates state and returns true if char i is "ordinary code" (not in a
// string or comment). Caller may skip extra chars by returning the new
// position via the optional `skip` value (returned as 0 normally).
function step(code: string, i: number, st: ScanState): number {
  const ch = code[i];
  const prev = i > 0 ? code[i - 1] : '';
  if (st.inLineComment) {
    if (ch === '\n') st.inLineComment = false;
    return 0;
  }
  if (st.inBlockComment) {
    if (ch === '/' && prev === '*') st.inBlockComment = false;
    return 0;
  }
  if (st.inString) {
    if (ch === st.inString && prev !== '\\') st.inString = null;
    return 0;
  }
  if (ch === '"' || ch === "'" || ch === '`') {
    st.inString = ch;
    return 0;
  }
  if (ch === '/' && code[i + 1] === '/') {
    st.inLineComment = true;
    return 1;
  }
  if (ch === '/' && code[i + 1] === '*') {
    st.inBlockComment = true;
    return 1;
  }
  return -1; // signal "ordinary char, caller can act on it"
}

function findTopLevelKeyword(code: string, keyword: string): number {
  let depth = 0;
  const st = newScanState();
  for (let i = 0; i < code.length; i++) {
    const skip = step(code, i, st);
    if (skip > 0) {
      i += skip;
      continue;
    }
    if (skip === 0) continue;
    const ch = code[i];
    if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
      continue;
    }
    if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      continue;
    }
    if (depth === 0 && code.slice(i, i + keyword.length) === keyword) {
      const before = i > 0 ? code[i - 1] : '';
      const after = code[i + keyword.length];
      const isWordBefore = /[A-Za-z0-9_$]/.test(before);
      const isWordAfter = /[A-Za-z0-9_$]/.test(after || '');
      if (!isWordBefore && !isWordAfter) {
        return i;
      }
    }
  }
  return -1;
}

function findMatchingClose(code: string, openIdx: number): number {
  let depth = 0;
  const st = newScanState();
  for (let i = openIdx; i < code.length; i++) {
    const skip = step(code, i, st);
    if (skip > 0) {
      i += skip;
      continue;
    }
    if (skip === 0) continue;
    const ch = code[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function splitTopLevelCommas(text: string): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = [];
  let depth = 0;
  const st = newScanState();
  let segStart = 0;
  for (let i = 0; i < text.length; i++) {
    const skip = step(text, i, st);
    if (skip > 0) {
      i += skip;
      continue;
    }
    if (skip === 0) continue;
    const ch = text[i];
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    else if (ch === ',' && depth === 0) {
      spans.push({ start: segStart, end: i });
      segStart = i + 1;
    }
  }
  if (segStart < text.length) spans.push({ start: segStart, end: text.length });
  return spans;
}

function findSetcps(code: string): { cps: number; start: number; end: number } | null {
  const st = newScanState();
  for (let i = 0; i < code.length; i++) {
    const skip = step(code, i, st);
    if (skip > 0) {
      i += skip;
      continue;
    }
    if (skip === 0) continue;
    if (code.slice(i, i + 6) === 'setcps') {
      const before = i > 0 ? code[i - 1] : '';
      const after = code[i + 6];
      if (/[A-Za-z0-9_$]/.test(before)) continue;
      if (after !== '(' && !/\s/.test(after || '')) continue;
      const open = code.indexOf('(', i + 6);
      if (open < 0) continue;
      const close = findMatchingClose(code, open);
      if (close < 0) continue;
      const inner = code.slice(open + 1, close).trim();
      const num = parseFloat(inner);
      if (isNaN(num)) continue;
      return { cps: num, start: i, end: close + 1 };
    }
  }
  return null;
}

// Helpers used by tools.ts -----------------------------------------------------

export function bpmToCps(bpm: number): number {
  return Math.max(0.05, Math.min(8, bpm / 240));
}

export function summariseScore(score: ParsedScore): {
  bpm: number | null;
  layers: { name: string; preview: string }[];
} {
  return {
    bpm: score.bpm,
    layers: score.layers.map((l) => ({
      name: l.name,
      preview: l.source.length > 80 ? l.source.slice(0, 77) + '...' : l.source,
    })),
  };
}
