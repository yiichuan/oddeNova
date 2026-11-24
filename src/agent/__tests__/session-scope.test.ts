import { describe, expect, it } from 'vitest';
import { createScopeValidator, describeEditTargets } from '../session-scope';

const score = 'setcps(0.5)\nstack(/* @layer kick */ s("bd").gain(0.8).pan(0), /* @layer bass */ note("c2").s("sine"))';

describe('Session edit authorization', () => {
  it('matches layer IDs and protects both unrelated layers and other parameters', () => {
    expect(describeEditTargets(score).layers).toMatchObject([
      { id: 'layer-1', label: 'kick' }, { id: 'layer-2', label: 'bass' },
    ]);
    const permits = createScopeValidator({ kind: 'parameter', targets: ['layer-1'], parameter: 'gain' }, score);
    const allowed = score.replace('gain(0.8)', 'gain(0.4)');
    expect(permits(allowed)).toBe(true);
    expect(permits(allowed.replace('pan(0)', 'pan(1)'))).toBe(false);
    expect(permits(allowed.replace('gain(0.4).pan(0)', 'pan(0).gain(0.4)'))).toBe(false);
    expect(permits(allowed.replace('"c2"', '"g2"'))).toBe(false);
    expect(permits(allowed.replace('0.4', 'getValue()'))).toBe(false);
  });

  it('supports labeled Strudel voices and a newly added numeric parameter', () => {
    const original = '$kick: s("bd")\n$bass: note("c2").s("sine")';
    const permits = createScopeValidator({ kind: 'parameter', targets: ['layer-1'], parameter: 'gain' }, original);
    expect(permits(original.replace('s("bd")', 's("bd").gain(0.4)'))).toBe(true);
    expect(permits(original.replace('s("sine")', 's("sine").gain(0.4)'))).toBe(false);
  });

  it('preserves duration and the other sections of an arrangement', () => {
    const original = 'arrange([4, s("bd")], [8, s("bd hh")])';
    const permits = createScopeValidator({ kind: 'section', targets: ['section-2'] }, original);
    const allowed = original.replace('"bd hh"', '"bd hh sd"');
    expect(permits(allowed)).toBe(true);
    expect(permits(allowed.replace('[8,', '[4,'))).toBe(false);
    expect(permits(allowed.replace('"bd"', '"sd"'))).toBe(false);
  });

  it('allows appending layers while rejecting changes to existing ones', () => {
    const permits = createScopeValidator({ kind: 'add_layers' }, score);
    expect(permits(score.slice(0, -1) + ', s("hh"))')).toBe(true);
    expect(permits(score.slice(0, -1) + '.gain(0.5), s("hh"))')).toBe(false);
  });

  it('allows a numeric tempo expression while protecting the rest of the score', () => {
    const permits = createScopeValidator({ kind: 'tempo' }, score);
    expect(permits(score.replace('0.5', '132/240'))).toBe(true);
    expect(permits(score.replace('setcps(0.5)', 'setcps(changeTempo())'))).toBe(false);
    expect(permits(score.replace('setcps(0.5)', 'setcpm(30)'))).toBe(false);
  });
});
