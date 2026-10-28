import { describe, expect, it } from 'vitest';
import { parseScore } from '../../agent/parser';
import {
  ADDED_LAYER_WINDOW,
  COMPARE_WINDOW,
  FULL_OPENING_WINDOW,
  INTRO_PIANO_CHANGE,
  adaptedScript,
  introPianoContentHash,
  originalScript,
  presetInstruction,
  presetReply,
  windowSeconds,
} from '../intro-piano-case';

/** The script with every comment line and blank line taken out. */
function musicOnly(script: string): string[] {
  return script
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line) && line.trim() !== '');
}

/** Layer name → source with its comment lines removed. */
function layerSources(script: string): Map<string, string> {
  return new Map(parseScore(script).layers.map((layer) => [
    layer.name,
    musicOnly(layer.source).map((line) => line.trim()).join('\n'),
  ]));
}

describe('intro-piano-v1 case', () => {
  it('ships the two language variants of one adapted piece', () => {
    expect(musicOnly(adaptedScript('zh'))).toEqual(musicOnly(adaptedScript('en')));
  });

  it.each(['zh', 'en'] as const)('keeps every original layer and the tempo, and adds exactly one (%s)', (lang) => {
    const original = parseScore(originalScript(lang));
    const adapted = parseScore(adaptedScript(lang));

    expect(adapted.cps).toBe(original.cps);

    const before = layerSources(originalScript(lang));
    const after = layerSources(adaptedScript(lang));
    const added = [...after.keys()].filter((name) => !before.has(name));
    expect(added).toEqual([INTRO_PIANO_CHANGE.addedLayer]);
    for (const [name, source] of before) {
      expect(after.get(name), name).toBe(source);
    }

    // Placed straight after the layer it follows, so the diff reads as one.
    const names = adapted.layers.map((layer) => layer.name);
    expect(names.indexOf(INTRO_PIANO_CHANGE.addedLayer))
      .toBe(names.indexOf(INTRO_PIANO_CHANGE.referenceLayer) + 1);
  });

  it('measures its listening windows in seconds at 0.4 cps', () => {
    expect(windowSeconds(COMPARE_WINDOW)).toBe(5);
    expect(windowSeconds(FULL_OPENING_WINDOW)).toBe(12.5);
    expect(windowSeconds(ADDED_LAYER_WINDOW)).toBe(10);
  });

  it('has copy in both languages and a stable content hash per language', () => {
    expect(presetInstruction('zh')).toMatch(/电钢琴/);
    expect(presetInstruction('en')).toMatch(/electric piano/);
    expect(presetReply('zh')).toMatch(/0～5 秒/);
    expect(presetReply('en')).toMatch(/0–5 s/);
    expect(introPianoContentHash('zh')).toBe(introPianoContentHash('zh'));
    expect(introPianoContentHash('zh')).not.toBe(introPianoContentHash('en'));
  });
});

/**
 * The two full scripts evaluated by the real engine and queried, so the
 * gate is checked by what sounds rather than by what the comment claims.
 */
describe('intro-piano-v1 played through Strudel', () => {
  async function evaluatePattern(code: string) {
    const core = await import('@strudel/core');
    const mini = await import('@strudel/mini');
    const tonal = await import('@strudel/tonal');
    const { transpiler } = await import('@strudel/transpiler');
    await core.evalScope(core, mini, tonal);
    const repl = core.repl({
      defaultOutput: () => {},
      getTime: () => 0,
      transpiler,
    });
    const pattern = await repl.evaluate(code, false);
    if (!pattern) throw new Error('script did not evaluate');
    return pattern as { queryArc: (b: number, e: number) => Hap[] };
  }

  interface Hap {
    whole?: { begin: { valueOf(): number } };
    value: Record<string, unknown>;
    hasOnset: () => boolean;
  }

  function onsets(pattern: { queryArc: (b: number, e: number) => Hap[] }, begin: number, end: number): string[] {
    return pattern.queryArc(begin, end)
      .filter((hap) => hap.hasOnset())
      .map((hap) => `${hap.whole!.begin.valueOf()} ${JSON.stringify(hap.value)}`)
      .sort();
  }

  it('adds notes only in the first 10 seconds and leaves the rest of the piece identical', async () => {
    const original = await evaluatePattern(originalScript('en'));
    const adapted = await evaluatePattern(adaptedScript('en'));

    // Past 80 s the arrangement has looped (32 cycles); a mask-based gate
    // would bring the opening back there. Queried well beyond it.
    const end = 70;
    const before = onsets(original, 0, end);
    const after = onsets(adapted, 0, end);
    // The whole arrangement, not an evaluation that quietly came back silent.
    expect(before.length).toBeGreaterThan(500);

    const beforeSet = new Set(before);
    const extra = after.filter((line) => !beforeSet.has(line));
    expect(after.length - extra.length).toBe(before.length);

    // Four notes a cycle, the last bar ending on a rest.
    expect(extra).toHaveLength(15);
    for (const line of extra) {
      const cycle = Number(line.split(' ')[0]);
      expect(cycle).toBeGreaterThanOrEqual(ADDED_LAYER_WINDOW.startCycle);
      expect(cycle).toBeLessThan(ADDED_LAYER_WINDOW.endCycle);
      expect(line).toContain('"s":"gm_epiano1"');
    }
  });

  it('follows horizon\'s chords: D A C E for 0–5 s, G B D E for 5–10 s', async () => {
    const adapted = await evaluatePattern(adaptedScript('en'));
    const introNotes = (begin: number, end: number) => adapted.queryArc(begin, end)
      .filter((hap) => hap.hasOnset() && hap.value.s === 'gm_epiano1')
      .map((hap) => String(hap.value.note).replace(/\d/g, ''));

    expect(new Set(introNotes(0, 2))).toEqual(new Set(['d', 'a', 'c', 'e']));
    expect(new Set(introNotes(2, 4))).toEqual(new Set(['g', 'b', 'd', 'e']));
  });
});
