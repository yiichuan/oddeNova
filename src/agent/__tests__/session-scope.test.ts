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

  it('removes just the authorized stack layer without editing surrounding code', () => {
    const original = [
      '// UK Garage | BPM: 132',
      'setcps(0.55)',
      'let chords = chord("<Cm7 Fm7 Abmaj7 Bb7>").dict("ireal").voicing()',
      'stack(',
      '  /* @layer DRUMS */',
      '  (s("bd").gain("<1 0>")),',
      '  /* @layer HATS */',
      '  s("hh").pan(0.62),',
      '',
      '  /* @layer BASS */',
      '  // Remove this layer and its own comment.',
      '  note("c2").s("sawtooth").gain(0.72),',
      '',
      '  /* @layer CHORDS */',
      '  chords.s("gm_drawbar_organ:5")',
      ').gain(0.9)',
    ].join('\n');
    const removal = original.replace('\n  /* @layer BASS */\n  // Remove this layer and its own comment.\n  note("c2").s("sawtooth").gain(0.72),\n', '');
    const permit = createScopeValidator({ kind: 'remove_layers', targets: ['layer-3'] }, original);

    expect(describeEditTargets(original).canRemoveLayers).toBe(true);
    expect(permit(removal)).toBe(true);
    expect(permit(removal.replace('pan(0.62)', 'pan(0.4)'))).toBe(false);
    expect(permit(removal.replace('/* @layer CHORDS */', '/* @layer KEYS */'))).toBe(false);
    expect(permit(removal.replace('setcps(0.55)', 'setcps(0.5)'))).toBe(false);
    expect(permit(removal.replace(').gain(0.9)', ')'))).toBe(false);
    expect(permit(removal.replace('(s("bd").gain("<1 0>"))', 's("bd").gain("<1 0>")'))).toBe(false);
    expect(permit(original.replace('gain(0.72)', 'gain(0)'))).toBe(false);
    expect(createScopeValidator({ kind: 'layers', targets: ['layer-3'] }, original)(removal)).toBe(false);
  });

  it('handles deleted edge layers and rejects extra deletions or unsupported stacks', () => {
    const original = 'stack(s("bd"), s("hh"), s("sd"), /* keep this mix note */)';
    const allowsRemoval = (targets: string[], candidate: string) =>
      createScopeValidator({ kind: 'remove_layers', targets }, original)(candidate);
    expect(allowsRemoval(['layer-1', 'layer-3'], 'stack(s("hh") /* keep this mix note */)')).toBe(true);
    expect(allowsRemoval(['layer-1', 'layer-3'], 'stack(s("hh"))')).toBe(false);
    expect(allowsRemoval(['layer-1'], 'stack(s("sd"), s("hh"), /* keep this mix note */)')).toBe(false);
    expect(allowsRemoval(['layer-1', 'layer-2', 'layer-3'], 'stack()')).toBe(false);
    expect(allowsRemoval(['layer-999'], 'stack(s("hh"), s("sd"), /* keep this mix note */)')).toBe(false);
    expect(describeEditTargets('stack(s("bd"))').canRemoveLayers).toBe(false);
    expect(describeEditTargets('stack(s("bd"), s("hh"))\nstack(s("sd"))').canRemoveLayers).toBe(false);
  });

  it('allows a numeric tempo expression while protecting the rest of the score', () => {
    const permits = createScopeValidator({ kind: 'tempo' }, score);
    expect(permits(score.replace('0.5', '132/240'))).toBe(true);
    expect(permits(score.replace('setcps(0.5)', 'setcps(changeTempo())'))).toBe(false);
    expect(permits(score.replace('setcps(0.5)', 'setcpm(30)'))).toBe(false);
  });
});
