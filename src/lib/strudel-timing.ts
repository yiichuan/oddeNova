import { parseScore } from '../agent/parser';

const DEFAULT_CPS = 0.5;
const MAX_DECIMAL_PLACES = 3;

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

function stringContents(code: string): string[] {
  const strings: string[] = [];
  let quote: '"' | "'" | '`' | null = null;
  let value = '';
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = 0; index < code.length; index += 1) {
    const character = code[index];
    const next = code[index + 1];

    if (inLineComment) {
      if (character === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      if (character === '*' && next === '/') {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (character === '\\' && index + 1 < code.length) {
        value += character + code[index + 1];
        index += 1;
      } else if (character === quote) {
        strings.push(value);
        value = '';
        quote = null;
      } else {
        value += character;
      }
      continue;
    }
    if (character === '/' && next === '/') {
      inLineComment = true;
      index += 1;
    } else if (character === '/' && next === '*') {
      inBlockComment = true;
      index += 1;
    } else if (character === '"' || character === "'" || character === '`') {
      quote = character;
    }
  }

  return strings;
}

function countTopLevelItems(value: string): number {
  let depth = 0;
  let count = 0;
  let inItem = false;

  for (const character of value.trim()) {
    if ('([{'.includes(character)) depth += 1;
    if (')]}'.includes(character)) depth = Math.max(0, depth - 1);

    if (/\s/.test(character) && depth === 0) {
      inItem = false;
    } else if (!inItem) {
      count += 1;
      inItem = true;
    }
  }

  return Math.max(1, count);
}

/**
 * Returns the first point at which all pattern alternations line up again.
 * Explicit /N windows define their duration directly; @ weights are summed;
 * bare <a b> alternations span one cycle per top-level item.
 */
export function getStrudelLoopCycles(code: string): number {
  const periods: number[] = [1];
  const anglePattern = /<([^<>]*)>\s*(?:\/\s*(\d+(?:\.\d+)?))?/g;

  for (const contents of stringContents(code)) {
    let match: RegExpExecArray | null;
    anglePattern.lastIndex = 0;
    while ((match = anglePattern.exec(contents)) !== null) {
      const [, inner, explicitWindow] = match;
      if (explicitWindow) {
        periods.push(Number(explicitWindow));
        continue;
      }

      const weights = [...inner.matchAll(/@\s*(\d+(?:\.\d+)?)/g)];
      if (weights.length > 0) {
        periods.push(weights.reduce((sum, weight) => sum + Number(weight[1]), 0));
      } else {
        periods.push(countTopLevelItems(inner));
      }
    }
  }

  return leastCommonPeriod(periods);
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
