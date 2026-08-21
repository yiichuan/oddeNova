/**
 * Captures one frame of the real ASCII galaxy.
 *
 * `public/animation/galaxy-ascii.html` is a single self-contained IIFE that
 * paints a canvas with `fillText`. Rather than redraw an approximation of it,
 * this runs that exact script in a VM against a stub canvas that records every
 * `fillText` call, then reads the frame back out of the recording. Whatever the
 * animation does, the capture follows.
 *
 * `Math.random` is seeded so the frame is reproducible: the star field is built
 * once from unseeded randomness, so an unseeded run would return a different
 * galaxy every time.
 */

import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';

export interface AsciiFrame {
  columns: number;
  rows: number;
  cellWidth: number;
  cellHeight: number;
  fontSize: number;
  /** Glyph per cell, one string per row; a space means an unpainted cell. */
  glyphRows: string[];
  /** Opacity per cell as an index into `opacities`, '0' meaning unpainted. */
  opacityRows: string[];
  opacities: number[];
  color: string;
}

interface Painted {
  char: string;
  x: number;
  y: number;
  color: string;
  align: string;
  size: number;
}

/** Mulberry32 — small, seeded, and good enough for a star field. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function captureAsciiFrame(options: {
  width: number;
  height: number;
  seed: number;
  /** Seconds of animation to advance before the frame that gets kept. */
  time: number;
}): AsciiFrame {
  const html = readFileSync('public/animation/galaxy-ascii.html', 'utf8');
  const source = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  if (!source) throw new Error('no <script> found in galaxy-ascii.html');

  let painted: Painted[] = [];
  let fontSize = 0;

  const context2d = {
    font: '',
    fillStyle: '#000',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
    setTransform() {},
    // Each frame repaints the background first, which is where a frame starts.
    fillRect() {
      painted = [];
    },
    measureText(text: string) {
      // The animation derives its cell width from the '@' advance. Monospace
      // faces at weight 600 advance 0.6em, which is what the browser would
      // report for the stack the canvas asks for.
      return { width: text.length * parseFontSize(context2d.font) * 0.6 };
    },
    fillText(char: string, x: number, y: number) {
      fontSize = parseFontSize(context2d.font);
      painted.push({ char, x, y, color: context2d.fillStyle, align: context2d.textAlign, size: fontSize });
    },
  };

  const canvas = { width: 0, height: 0, style: {}, getContext: () => context2d };

  /* One slot for the callback the animation registers. It is an array rather
     than a `let` because the only assignment happens inside the sandbox object
     below: flow analysis cannot see through that, so a `let` still reads as its
     initialiser here and the guard on it would narrow to `never`. */
  const nextFrame: ((timestamp: number) => void)[] = [];
  const listeners = new Map<string, () => void>();

  const window_ = {
    innerWidth: options.width,
    innerHeight: options.height,
    devicePixelRatio: 1,
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    addEventListener: (type: string, listener: () => void) => listeners.set(type, listener),
    removeEventListener: () => {},
    // Self-parent: the audio tap looks for host globals that a capture has no
    // business providing, finds none, and leaves the frame in its quiet state.
    parent: null as unknown,
  };
  window_.parent = window_;

  const sandbox = {
    window: window_,
    document: { getElementById: () => canvas, addEventListener() {}, body: {} },
    requestAnimationFrame: (callback: (timestamp: number) => void) => {
      nextFrame[0] = callback;
      return 0;
    },
    performance: { now: () => 0 },
    console,
    __seededRandom: seededRandom(options.seed),
  };

  const context = createContext(sandbox);
  // Patched from inside: the VM's Math is its own global's, not this one's.
  runInContext('Math.random = __seededRandom;', context);
  runInContext(source, context);

  if (nextFrame.length === 0) throw new Error('the animation never asked for a frame');

  // 30fps: step the clock the way the browser would, so time-based motion lands
  // where it would have after `time` seconds rather than jumping there.
  const step = 1000 / 30;
  for (let elapsed = 0; elapsed <= options.time * 1000; elapsed += step) {
    // Re-read every step: the animation re-registers a callback each frame.
    nextFrame[0](elapsed);
  }

  return toFrame(painted, fontSize, options);
}

function parseFontSize(font: string): number {
  return Number(font.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? 0);
}

function toFrame(
  painted: Painted[],
  fontSize: number,
  options: { width: number; height: number },
): AsciiFrame {
  const cellWidth = fontSize * 0.6;
  const cellHeight = fontSize * 1.08;
  const columns = Math.max(1, Math.ceil(options.width / cellWidth));
  const rows = Math.max(1, Math.ceil(options.height / cellHeight));

  const opacities: number[] = [];
  const glyphs = Array.from({ length: rows }, () => new Array<string>(columns).fill(' '));
  const levels = Array.from({ length: rows }, () => new Array<number>(columns).fill(0));

  for (const cell of painted) {
    // Accents are drawn centred in the cell, the base grid from its corner.
    const column = Math.round(cell.align === 'center' ? cell.x / cellWidth - 0.5 : cell.x / cellWidth);
    const row = Math.round(cell.align === 'center' ? cell.y / cellHeight - 0.5 : cell.y / cellHeight);
    if (column < 0 || column >= columns || row < 0 || row >= rows) continue;

    const alpha = Number(cell.color.match(/,\s*([\d.]+)\s*\)$/)?.[1] ?? 1);
    let level = opacities.indexOf(alpha);
    if (level === -1) level = opacities.push(alpha) - 1;

    glyphs[row][column] = cell.char;
    levels[row][column] = level + 1;
  }

  return {
    columns,
    rows,
    cellWidth,
    cellHeight,
    fontSize,
    glyphRows: glyphs.map((row) => row.join('')),
    opacityRows: levels.map((row) => row.map((level) => level.toString(36)).join('')),
    opacities,
    color: 'rgb(194, 197, 194)',
  };
}
