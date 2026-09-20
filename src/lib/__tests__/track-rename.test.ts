import { describe, expect, it } from 'vitest';
import { parseScore } from '../../agent/parser';
import {
  MAX_TRACK_NAME_LENGTH,
  buildTrackRename,
  validateTrackName,
  type TrackRenameContext,
  type TrackRenameTrack,
} from '../track-rename';

function contextFor(code: string): TrackRenameContext {
  // Locate the top-level stack the way TrackPreview does, then parse its slice.
  const stackFrom = code.indexOf('stack');
  const openParen = code.indexOf('(', stackFrom);
  let depth = 0;
  let stackTo = -1;
  for (let i = openParen; i < code.length; i++) {
    if (code[i] === '(') depth++;
    else if (code[i] === ')') {
      depth--;
      if (depth === 0) { stackTo = i + 1; break; }
    }
  }
  const score = parseScore(code.slice(stackFrom, stackTo));
  const tracks: TrackRenameTrack[] = score.layers.map((layer, i) => ({
    id: `1:${i}`,
    name: layer.name,
    sourceRange: {
      from: stackFrom + layer.rawStart,
      to: stackFrom + layer.rawEnd,
    },
    markerRange: layer.markerRange
      ? { from: stackFrom + layer.markerRange.from, to: stackFrom + layer.markerRange.to }
      : undefined,
    nameRange: layer.nameRange
      ? { from: stackFrom + layer.nameRange.from, to: stackFrom + layer.nameRange.to }
      : undefined,
  }));
  return { code, tracks, stackRange: { from: stackFrom, to: stackTo } };
}

const SCORED = 'stack(\n  /* @layer 鼓组 */ s("bd*4"),\n  /* @layer 贝斯 */ note("c2").s("sawtooth")\n)';

describe('validateTrackName', () => {
  it('trims surrounding whitespace and keeps interior spaces', () => {
    expect(validateTrackName('  主 鼓组 ')).toEqual({ name: '主 鼓组' });
  });

  it('rejects empty and whitespace-only names', () => {
    expect(validateTrackName('   ')).toEqual({ reason: 'empty' });
  });

  it('counts length in Unicode code points, not UTF-16 units', () => {
    const emoji = '🎵'.repeat(MAX_TRACK_NAME_LENGTH);
    expect(validateTrackName(emoji)).toEqual({ name: emoji });
    expect(validateTrackName(emoji + 'a')).toEqual({ reason: 'too-long' });
  });

  it.each(['a\nb', 'a* b', 'a\u2028b', 'a\u0000b', 'a\u2029b'])('rejects %p', (name) => {
    expect(validateTrackName(name)).toEqual({ reason: 'invalid-character' });
  });

  it('allows emoji, CJK, hyphens and digits', () => {
    expect(validateTrackName('鼓组-2 🎵')).toEqual({ name: '鼓组-2 🎵' });
  });
});

describe('buildTrackRename — 已有标记', () => {
  it('replaces only the name characters and keeps every other byte', () => {
    const context = contextFor(SCORED);
    const result = buildTrackRename(context, '1:0', '主鼓');
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.patch).toEqual({ from: SCORED.indexOf('鼓组'), to: SCORED.indexOf('鼓组') + 2, insert: '主鼓' });
    expect(result.nextCode).toBe(SCORED.replace('鼓组', '主鼓'));
    // The patch is exactly the replacement of the old name with the new one.
    expect(
      context.code.slice(0, result.patch.from) + result.patch.insert + context.code.slice(result.patch.to),
    ).toBe(result.nextCode);
  });

  it('re-derives ranges for the target and the following tracks', () => {
    const context = contextFor(SCORED);
    const result = buildTrackRename(context, '1:0', '主鼓组变长了');
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    const [drums, bass] = result.tracks;
    expect(drums.name).toBe('主鼓组变长了');
    expect(result.nextCode.slice(drums.nameRange!.from, drums.nameRange!.to)).toBe('主鼓组变长了');
    expect(result.nextCode.slice(bass.nameRange!.from, bass.nameRange!.to)).toBe('贝斯');
    expect(result.nextCode.slice(bass.sourceRange!.from, bass.sourceRange!.to)).toContain('note("c2")');
  });

  it('renames a later track without moving earlier ranges', () => {
    const context = contextFor(SCORED);
    const result = buildTrackRename(context, '1:1', 'bassline');
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.nextCode.slice(result.tracks[1].nameRange!.from, result.tracks[1].nameRange!.to)).toBe('bassline');
    expect(result.tracks[0].nameRange).toEqual(context.tracks[0].nameRange);
  });

  it('supports CRLF documents and emoji names with correct UTF-16 offsets', () => {
    const code = 'stack(\r\n  /* @layer 鼓组 */ s("bd"),\r\n  /* @layer 贝斯 */ s("cp")\r\n)';
    const context = contextFor(code);
    const result = buildTrackRename(context, '1:0', '旋律🎵');
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.nextCode.slice(result.tracks[0].nameRange!.from, result.tracks[0].nameRange!.to)).toBe('旋律🎵');
    const reparsed = parseScore(result.nextCode);
    expect(reparsed.layers.map(l => l.name)).toEqual(['旋律🎵', '贝斯']);
  });

  it('keeps a duplicate name elsewhere untouched', () => {
    const code = 'stack(/* @layer drums */ s("bd"), /* @layer drums */ s("hh"))';
    const context = contextFor(code);
    const result = buildTrackRename(context, '1:1', 'hihat');
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.tracks.map(t => t.name)).toEqual(['drums', 'hihat']);
    expect(result.nextCode).toBe('stack(/* @layer drums */ s("bd"), /* @layer hihat */ s("hh"))');
  });
});

describe('buildTrackRename — 无标记层', () => {
  it('inserts a marker before the expression, preserving indentation and the rest', () => {
    const code = 'stack(\n  s("bd*4"),\n  note("c2")\n)';
    const context = contextFor(code);
    const result = buildTrackRename(context, '1:0', '主鼓');
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.nextCode).toBe('stack(\n  /* @layer 主鼓 */ s("bd*4"),\n  note("c2")\n)');
    const reparsed = parseScore(result.nextCode);
    expect(reparsed.layers.map(l => l.name)).toEqual(['主鼓', 'layer_0']);
    expect(reparsed.layers.map(l => l.source)).toEqual(['s("bd*4")', 'note("c2")']);
  });

  it('inserts before a leading line comment without eating it', () => {
    const code = 'stack(\n  // 提供稳定的节奏\n  s("bd*4")\n)';
    const context = contextFor(code);
    const result = buildTrackRename(context, '1:0', '鼓');
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.nextCode).toBe('stack(\n  /* @layer 鼓 */ // 提供稳定的节奏\n  s("bd*4")\n)');
    expect(parseScore(result.nextCode).layers[0].source).toContain('// 提供稳定的节奏');
  });

  it('renumbering: naming the first auto layer shifts later auto names, and metadata agrees with a re-parse', () => {
    const code = 'stack(\n  s("bd"),\n  s("hh"),\n  s("cp")\n)';
    const context = contextFor(code);
    const result = buildTrackRename(context, '1:0', '鼓组');
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.tracks.map(t => t.name)).toEqual(['鼓组', 'layer_0', 'layer_1']);
    const reparsed = parseScore(result.nextCode);
    expect(reparsed.layers.map(l => l.name)).toEqual(['鼓组', 'layer_0', 'layer_1']);
    expect(result.tracks.map(t => t.id)).toEqual(['1:0', '1:1', '1:2']);
  });

  it('a second rename on the freshly marked layer is a pure replacement', () => {
    const code = 'stack(\n  s("bd*4"),\n  note("c2")\n)';
    const first = buildTrackRename(contextFor(code), '1:0', '主鼓');
    if (first.status !== 'ok') throw new Error('first rename failed');
    const second = buildTrackRename(contextFor(first.nextCode), '1:0', '主鼓组');
    expect(second.status).toBe('ok');
    if (second.status !== 'ok') return;
    expect(second.nextCode).toBe(first.nextCode.replace('主鼓 ', '主鼓组 '));
    expect(second.patch).toEqual({
      from: first.nextCode.indexOf('主鼓'),
      to: first.nextCode.indexOf('主鼓') + 2,
      insert: '主鼓组',
    });
  });
});

describe('buildTrackRename — 校验与拒绝', () => {
  it('rejects invalid names with a reason and no side effects', () => {
    const context = contextFor(SCORED);
    expect(buildTrackRename(context, '1:0', '   ')).toEqual({ status: 'invalid-name', reason: 'empty' });
    expect(buildTrackRename(context, '1:0', 'a'.repeat(MAX_TRACK_NAME_LENGTH + 1))).toEqual({ status: 'invalid-name', reason: 'too-long' });
    expect(buildTrackRename(context, '1:0', '鼓*组')).toEqual({ status: 'invalid-name', reason: 'invalid-character' });
    expect(buildTrackRename(context, '1:0', 'a\nb')).toEqual({ status: 'invalid-name', reason: 'invalid-character' });
  });

  it('rejects unknown tracks', () => {
    expect(buildTrackRename(contextFor(SCORED), '9:9', 'x').status).toBe('unknown-track');
  });

  it('rejects when the ranges no longer describe the document', () => {
    const context = contextFor(SCORED);
    // An extra layer appeared inside the stack since the mapping was made.
    const drifted = { ...context, code: SCORED.replace('stack(', 'stack(s("cp"), ') };
    expect(buildTrackRename(drifted, '1:0', '主鼓').status).toBe('stale-code');
  });

  it('rejects a name that would not survive a re-parse (structure changed)', () => {
    // A crafted context whose stored ranges lie about the document: the
    // re-parse verification must catch the mismatch instead of patching blind.
    const context = contextFor(SCORED);
    const lying: TrackRenameContext = {
      ...context,
      tracks: context.tracks.map((track, i) => i === 0 ? { ...track, name: 'wrong' } : track),
    };
    expect(buildTrackRename(lying, '1:0', '主鼓').status).toBe('stale-code');
  });
});
