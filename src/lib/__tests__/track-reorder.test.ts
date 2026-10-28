import { describe, expect, it } from 'vitest';
import { parseScore } from '../../agent/parser';
import { buildTrackReorder, type TrackReorderContext } from '../track-reorder';

function contextFor(code: string): TrackReorderContext {
  const stackStart = code.indexOf('stack(');
  const openParen = code.indexOf('(', stackStart);
  let depth = 0;
  let stackTo = -1;
  for (let index = openParen; index < code.length; index++) {
    if (code[index] === '(') depth++;
    else if (code[index] === ')') {
      depth--;
      if (depth === 0) { stackTo = index + 1; break; }
    }
  }
  const stackRange = { from: stackStart, to: stackTo };
  const score = parseScore(code.slice(stackRange.from, stackRange.to));
  return {
    code,
    stackRange,
    tracks: score.layers.map((layer, index) => ({
      id: `4:${index}`,
      name: layer.name,
      colorKey: `color-${index}`,
      sourceRange: (() => {
        let from = stackRange.from + layer.rawStart;
        let to = stackRange.from + layer.rawEnd;
        while (from < to && /\s/.test(code[from])) from++;
        while (to > from && /\s/.test(code[to - 1])) to--;
        return { from, to };
      })(),
      markerRange: layer.markerRange
        ? { from: stackRange.from + layer.markerRange.from, to: stackRange.from + layer.markerRange.to }
        : undefined,
      nameRange: layer.nameRange
        ? { from: stackRange.from + layer.nameRange.from, to: stackRange.from + layer.nameRange.to }
        : undefined,
    })),
  };
}

describe('buildTrackReorder', () => {
  it('moves complete marked layers and keeps IDs, names, and color identities with the source', () => {
    const code = 'stack(\n  /* @layer 鼓 */ s("bd*4"),\n  /* @layer 贝斯 */ note("c2"),\n  /* @layer 铃 */ s("hh")\n)';
    const context = contextFor(code);
    const result = buildTrackReorder(context, '4:0', 2);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.nextCode).toBe('stack(\n  /* @layer 贝斯 */ note("c2"),\n  /* @layer 铃 */ s("hh"),\n  /* @layer 鼓 */ s("bd*4")\n)');
    expect(result.tracks.map(track => [track.id, track.name, track.colorKey])).toEqual([
      ['4:1', '贝斯', 'color-1'],
      ['4:2', '铃', 'color-2'],
      ['4:0', '鼓', 'color-0'],
    ]);
    expect(result.tracks.every(track => result.nextCode.slice(track.markerRange!.from, track.markerRange!.to).includes(track.name))).toBe(true);
    expect(result.nextCode.slice(result.stackRange.to - 1, result.stackRange.to)).toBe(')');
  });

  it('gives every auto-named layer an explicit identity before moving it', () => {
    const code = 'stack(\n  s("bd"),\n  note("c2"),\n  s("hh")\n)';
    const result = buildTrackReorder(contextFor(code), '4:2', 0);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.nextCode).toBe('stack(\n  /* @layer layer_2 */ s("hh"),\n  /* @layer layer_0 */ s("bd"),\n  /* @layer layer_1 */ note("c2")\n)');
    expect(parseScore(result.nextCode).layers.map(layer => layer.name)).toEqual(['layer_2', 'layer_0', 'layer_1']);
    expect(result.tracks.map(track => track.id)).toEqual(['4:2', '4:0', '4:1']);
  });

  it('preserves CRLF separators and a trailing comma', () => {
    const code = 'stack(\r\n  s("bd"),\r\n  /* @layer lead */ note("c4"),\r\n)';
    const result = buildTrackReorder(contextFor(code), '4:1', 0);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.nextCode).toContain('/* @layer lead */ note("c4"),\r\n  /* @layer layer_0 */ s("bd"),\r\n)');
    expect(result.tracks.map(track => track.name)).toEqual(['lead', 'layer_0']);
  });

  it('rejects stale source mappings and unknown identities without changing code', () => {
    const context = contextFor('stack(s("bd"),s("hh"))');
    expect(buildTrackReorder({
      ...context,
      tracks: context.tracks.map((track, index) => index === 0
        ? { ...track, sourceRange: { from: track.sourceRange!.from + 1, to: track.sourceRange!.to } }
        : track),
    }, '4:0', 1)).toEqual({ status: 'stale-code' });
    expect(buildTrackReorder(context, 'missing', 1)).toEqual({ status: 'unknown-track' });
    expect(buildTrackReorder(context, '4:0', 0)).toEqual({ status: 'unchanged' });
  });
});
