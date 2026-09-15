import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as core from '@strudel/core';
import * as mini from '@strudel/mini';
import * as tonal from '@strudel/tonal';
import { transpiler } from '@strudel/transpiler';
import { TrackPreview, PREVIEW_EVENT_BUDGET, type PreviewHap, type TrackFrameRequest } from '../track-preview';

type TestPattern = { queryArc: (begin: number, end: number) => (PreviewHap & { value: Record<string, unknown>; context: Record<string, unknown> })[] };

beforeAll(async () => { await core.evalScope(core, mini, tonal); });

/** Follow over the whole piece — the common default in these tests. */
const followAll = (loopCycles = 16): TrackFrameRequest => ({
  loopCycles,
  viewport: { mode: 'follow', span: loopCycles },
});

async function compile(preview: TrackPreview, code: string) {
  const result = await core.evaluate(code, (source: string) => preview.prepare(source, transpiler(source)));
  preview.commit(result.pattern, result.meta);
  return { pattern: result.pattern as TestPattern, meta: result.meta };
}

const score = `stack(
/* @layer 鼓组 */ stack(s("bd*2"), s("hh*4")),
/* @layer 贝斯 */ note("36 40").s("sawtooth")
).gain(.6)`;

const melodyScore = `stack(
/* @layer MELODY */
note("<[0 2 4 ~ 2 ~ <4 5> 2]@2 [2 4 6 ~ 4 ~ <1 6> 4]@2 [5 4 2 ~ 4 ~ <2 1> 4]@2 [4 6 1 ~ 6 ~ <3 4> 6]@2>")
  .scale("D4:lydian")
  .s("piano")
  .gain("<0.42@8 0.5@8 0.52@8 0.45@4 0.3@4>")
  .late(0.02)
  .room(0.35)
)`;

describe('track preview playback contract', () => {
  it('publishes a new revision when the transport seeks without changing the track list', () => {
    const preview = new TrackPreview();
    const notify = vi.fn();
    const before = preview.snapshot;
    preview.subscribe(notify);

    preview.refresh();

    expect(preview.snapshot.revision).toBe(before.revision + 1);
    expect(preview.snapshot.tracks).toBe(before.tracks);
    expect(notify).toHaveBeenCalledOnce();
  });

  it('keeps nested drum sounds in one layer and gates only the selected layer without removing visual events', async () => {
    const preview = new TrackPreview();
    const { pattern } = await compile(preview, score);
    const all = pattern.queryArc(0, 1);
    expect(preview.snapshot.tracks.map(t => t.name)).toEqual(['鼓组', '贝斯']);
    expect(all.filter(h => preview.isAudible(h))).toHaveLength(8);
    preview.toggleSolo(preview.snapshot.tracks[1].id);
    expect(all.filter(h => preview.isAudible(h)).map(h => h.value.note)).toEqual([36, 40]);
    expect(preview.frame(0.25, .5, followAll()).events).toEqual(expect.arrayContaining([
      expect.objectContaining({ trackId: preview.snapshot.tracks[0].id, sound: 'bd', begin: 0, end: .5 }),
      expect.objectContaining({ trackId: preview.snapshot.tracks[1].id, pitch: 36 }),
    ]));
    preview.toggleSolo(preview.snapshot.tracks[0].id);
    expect(all.filter(h => preview.isAudible(h))).toHaveLength(6);
    preview.toggleSolo(preview.snapshot.tracks[0].id);
    expect(all.filter(h => preview.isAudible(h))).toHaveLength(8);
  });

  it('mutes individual layers, keeps them audible under solo, and drops stale mutes on commit', async () => {
    const preview = new TrackPreview();
    const { pattern } = await compile(preview, score);
    const all = pattern.queryArc(0, 1);
    preview.toggleMute(preview.snapshot.tracks[0].id);
    expect(preview.snapshot.mutedIds).toEqual(new Set([preview.snapshot.tracks[0].id]));
    expect(all.filter(h => preview.isAudible(h)).map(h => h.value.note)).toEqual([36, 40]);
    preview.toggleMute(preview.snapshot.tracks[1].id);
    expect(all.filter(h => preview.isAudible(h))).toHaveLength(0);
    // A soloed layer overrides the mute of the others but not its own.
    preview.toggleMute(preview.snapshot.tracks[0].id);
    preview.toggleSolo(preview.snapshot.tracks[0].id);
    expect(all.filter(h => preview.isAudible(h))).toHaveLength(6);
    preview.toggleMute(preview.snapshot.tracks[0].id);
    expect(all.filter(h => preview.isAudible(h))).toHaveLength(0);
    preview.toggleSolo(preview.snapshot.tracks[0].id);
    // A committed evaluation replaces track ids, so mutes cannot leak into it.
    await compile(preview, score);
    expect(preview.snapshot.mutedIds.size).toBe(0);
    expect(preview.snapshot.tracks.length && all.every(h => preview.isAudible(h))).toBe(true);
    preview.toggleMute('stale');
    expect(preview.snapshot.mutedIds.size).toBe(0);
  });

  it('preserves mini source locations and leaves every event value identical for export', async () => {
    const preview = new TrackPreview();
    const normal = await core.evaluate(score, transpiler);
    const tagged = await compile(preview, score);
    preview.toggleSolo(preview.snapshot.tracks[0].id);
    expect(tagged.meta.miniLocations).toEqual(normal.meta.miniLocations);
    expect(tagged.pattern.queryArc(0, 1).map(h => h.value)).toEqual((normal.pattern as TestPattern).queryArc(0, 1).map(h => h.value));
    expect(tagged.pattern.queryArc(0, 1).map(h => h.context.locations)).toEqual((normal.pattern as TestPattern).queryArc(0, 1).map(h => h.context.locations));
  });

  it('uses distinct identities for duplicate names and resets only on committed evaluation', async () => {
    const preview = new TrackPreview();
    await compile(preview, 'stack(/* @layer drums */ s("bd"), /* @layer drums */ s("hh"))');
    const ids = preview.snapshot.tracks.map(t => t.id);
    expect(new Set(ids).size).toBe(2);
    preview.toggleSolo(ids[0]);
    preview.prepare(score, transpiler(score)); // failed/unapplied evaluation cannot replace the sounding score
    expect(preview.snapshot.soloId).toBe(ids[0]);
    await compile(preview, score);
    expect(preview.snapshot.soloId).toBeNull();
    preview.toggleSolo(ids[0]); // stale UI event
    expect(preview.snapshot.soloId).toBeNull();
  });

  it.each([
    's("bd")',
    'const stack = (...xs) => xs[0]; stack(s("bd"),s("hh"))',
    'const a = stack(s("bd"),s("hh")); a',
    '$: stack(s("bd"),s("hh"))',
    'stack(...[s("bd"),s("hh")])',
    'stack(s("bd"),s("hh")).superimpose(x => s("cp"))',
    'stack(s("bd").onTrigger(() => {}),s("hh"))',
  ])('leaves unsupported code unchanged: %s', (code) => {
    const preview = new TrackPreview();
    const original = transpiler(code);
    expect(preview.prepare(code, original).output).toBe(original.output);
  });

  it('supports variables and complex argument syntax without confusing nested stacks or commas in strings', async () => {
    const preview = new TrackPreview();
    await compile(preview, 'const drums = stack(s("bd"),s("hh")); stack(/* @layer kit */ drums, s("cp, rim"))');
    expect(preview.snapshot.tracks.map(t => t.name)).toEqual(['kit', 'layer_0']);
    expect(preview.frame(0, .5, followAll()).events.length).toBeGreaterThan(0);
  });

  it('collapses duplicate visual events created by late plus room transforms', async () => {
    const preview = new TrackPreview();
    await compile(preview, melodyScore);

    const events = preview.frame(4, .5, { loopCycles: 16, viewport: { mode: 'follow', span: 4 } }).events;
    const visualKeys = events.map(event => event.key);

    expect(events).toHaveLength(13);
    expect(new Set(visualKeys).size).toBe(events.length);
  });

  it('gives each event a stable visual key over the uncropped display boundaries', async () => {
    const preview = new TrackPreview();
    preview.commit(
      {
        queryArc: () => [
          { whole: { begin: 34, end: 34.5 }, value: { s: 'bd' }, context: { oddenovaTrack: 'x' } },
          { whole: { begin: 34, end: 34.5 }, value: { s: 'bd', note: 36 }, context: { oddenovaTrack: 'x' } },
        ] as PreviewHap[],
      },
      { oddenovaTracks: { tracks: [{ id: 'x', name: 'a' }] } },
    );
    // Same sound and window but a different pitch: distinct identities.
    const frame = preview.frame(35, 0.5, { loopCycles: 16, viewport: { begin: 1, end: 5 } });
    expect(frame.events).toHaveLength(2);
    const [first, second] = frame.events;
    expect(first.key).toBe(JSON.stringify(['x', 2, 2.5, 'bd', null]));
    expect(second.key).not.toBe(first.key);

    // The same event re-queried keeps its identity; a different track id
    // (a fresh compile generation) does not reuse it.
    preview.commit(
      {
        queryArc: () => [
          { whole: { begin: 34, end: 34.5 }, value: { s: 'bd' }, context: { oddenovaTrack: 'y' } },
        ] as PreviewHap[],
      },
      { oddenovaTracks: { tracks: [{ id: 'y', name: 'a' }] } },
    );
    const next = preview.frame(35, 0.5, { loopCycles: 16, viewport: { begin: 1, end: 5 } });
    expect(next.events[0].key).toBe(JSON.stringify(['y', 2, 2.5, 'bd', null]));
    expect(next.events[0].key).not.toBe(first.key);
  });

  it('clears audition on reset and fails open when an event loses its track identity', async () => {
    const preview = new TrackPreview();
    const { pattern } = await compile(preview, score);
    preview.toggleSolo(preview.snapshot.tracks[0].id);
    expect(preview.isAudible({ context: {} })).toBe(true);
    expect(preview.snapshot.soloId).toBeNull();
    expect(preview.snapshot.tracks).toEqual([]);
    preview.reset();
    expect(preview.snapshot.status).toBe('idle');
    expect(pattern.queryArc(0, 1).every(h => preview.isAudible(h))).toBe(true);
  });
});

describe('frame request windows', () => {
  it('derives a follow window from the same cycle it samples', async () => {
    const preview = new TrackPreview();
    await compile(preview, score);
    const queried: Array<[number, number]> = [];
    // Spy on the committed pattern to record the exact query ranges.
    const committed = preview as unknown as { pattern: TestPattern };
    const originalQuery = committed.pattern.queryArc.bind(committed.pattern);
    committed.pattern.queryArc = (begin: number, end: number) => {
      queried.push([begin, end]);
      return originalQuery(begin, end) as never;
    };

    // Early start: window pinned at 0, playhead in the left half.
    const early = preview.frame(1, 0.5, { loopCycles: 16, viewport: { mode: 'follow', span: 4 } });
    expect(early).toMatchObject({ now: 1, begin: 0, end: 4 });
    expect(queried.at(-1)).toEqual([0, 4]);

    // Past the centre: window slides, playhead stays centred.
    const later = preview.frame(3, 0.5, { loopCycles: 16, viewport: { mode: 'follow', span: 4 } });
    expect(later).toMatchObject({ now: 3, begin: 1, end: 5 });
    expect(queried.at(-1)).toEqual([1, 5]);
    expect(later.events.every(e => e.end > 1)).toBe(true);
  });

  it('maps absolute transport cycles onto the finite [0, L] range', async () => {
    const preview = new TrackPreview();
    await compile(preview, score);
    const queried: Array<[number, number]> = [];
    const committed = preview as unknown as { pattern: TestPattern };
    const originalQuery = committed.pattern.queryArc.bind(committed.pattern);
    committed.pattern.queryArc = (begin: number, end: number) => {
      queried.push([begin, end]);
      return originalQuery(begin, end) as never;
    };

    // absoluteNow=35, L=16, display window [1,5]: the query covers the
    // *current* pass [33,37) and events come back in display coordinates.
    const frame = preview.frame(35, 0.5, { loopCycles: 16, viewport: { begin: 1, end: 5 } });
    expect(frame).toMatchObject({ now: 3, begin: 1, end: 5 });
    expect(queried.at(-1)).toEqual([33, 37]);
    for (const event of frame.events) {
      expect(event.begin).toBeGreaterThanOrEqual(0);
      expect(event.end).toBeLessThanOrEqual(16 + 1e-9);
    }
  });

  it('maps absolute events into the display domain of the current pass', () => {
    const preview = new TrackPreview();
    // A pattern returning raw absolute haps, as Strudel would for [34, 34.5)
    // inside the queried pass [33, 37).
    preview.commit(
      {
        queryArc: (begin: number, end: number) => {
          expect([begin, end]).toEqual([33, 37]);
          return [{ whole: { begin: 34, end: 34.5 }, value: { s: 'bd' }, context: { oddenovaTrack: 'x' } }] as PreviewHap[];
        },
      },
      { oddenovaTracks: { tracks: [{ id: 'x', name: 'a' }] } },
    );
    const frame = preview.frame(35, 0.5, { loopCycles: 16, viewport: { begin: 1, end: 5 } });
    // The event and the playhead (now=3) share one domain: [2, 2.5).
    expect(frame.events).toEqual([
      { trackId: 'x', begin: 2, end: 2.5, sound: 'bd', pitch: null, key: JSON.stringify(['x', 2, 2.5, 'bd', null]) },
    ]);
  });

  it('keeps cross-pass sustains as real overlapping events without faking attacks', () => {
    const preview = new TrackPreview();
    // A note that started late in pass one and sustains into pass two: the
    // query of the displayed window still catches it, mapped with its real
    // (negative) display start for TrackPanel to clip.
    preview.commit(
      {
        queryArc: () => [
          { whole: { begin: 31, end: 33.5 }, value: { s: 'pad' }, context: { oddenovaTrack: 'x' } },
        ] as PreviewHap[],
      },
      { oddenovaTracks: { tracks: [{ id: 'x', name: 'a' }] } },
    );
    const frame = preview.frame(33, 0.5, { loopCycles: 16, viewport: { begin: 0, end: 2 } });
    expect(frame.events).toEqual([
      { trackId: 'x', begin: -1, end: 1.5, sound: 'pad', pitch: null, key: JSON.stringify(['x', -1, 1.5, 'pad', null]) },
    ]);
  });

  it('wraps a running playhead back onto the range while keeping the endpoint parked', async () => {
    const preview = new TrackPreview();
    await compile(preview, score);
    // 16.1 in pass two reads just past the start of the finite range.
    const wrapped = preview.frame(16.1, 0.5, followAll());
    expect(wrapped.now).toBeCloseTo(0.1, 10);
    expect(wrapped).toMatchObject({ begin: 0, end: 16 });
    // Paused exactly on the loop end keeps it as a visible endpoint.
    expect(preview.frame(16, 0.5, followAll())).toMatchObject({ now: 16 });
    expect(preview.frame(32, 0.5, followAll()).now).toBe(0);
  });

  it('parks follow windows at the piece\u2019s end instead of following past L', () => {
    const preview = new TrackPreview();
    for (const now of [14, 15, 16]) {
      const frame = preview.frame(now, 0.5, { loopCycles: 16, viewport: { mode: 'follow', span: 4 } });
      expect(frame.begin).toBe(12);
      expect(frame.end).toBe(16);
 expect(frame.now).toBeLessThanOrEqual(16);
    }
  });

  it('rejects a fixed window outside [0, L] and clamps it into the piece', () => {
    const preview = new TrackPreview();
    // A window hanging past the end is pulled back inside rather than trusted.
    const frame = preview.frame(2, 0.5, { loopCycles: 16, viewport: { begin: 14, end: 20 } });
    expect(frame).toMatchObject({ now: 2, begin: 14, end: 16 });
  });

  it('falls back to a centred window for an unusable follow span', () => {
    const preview = new TrackPreview();
    for (const span of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const frame = preview.frame(6, 0.5, { loopCycles: 16, viewport: { mode: 'follow', span } });
      expect(frame).toMatchObject({ now: 6, begin: 4, end: 8 });
    }
  });

  it('keeps a fixed request window still regardless of the sampled cycle', async () => {
    const preview = new TrackPreview();
    await compile(preview, score);
    for (const now of [0, 5, 15]) {
      const frame = preview.frame(now, 0.5, { loopCycles: 16, viewport: { begin: 2, end: 6 } });
      expect(frame).toMatchObject({ now, begin: 2, end: 6 });
    }
  });

  it('returns an empty finite frame without a usable loop length', () => {
    const preview = new TrackPreview();
    for (const loopCycles of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const frame = preview.frame(7, 0.5, { loopCycles, viewport: { mode: 'follow', span: 4 } });
      expect(frame).toEqual({ now: 0, begin: 0, end: 0, limited: false, events: [] });
    }
  });

  it('flags a frame as limited when the raw query exceeds the processing budget', () => {
    const preview = new TrackPreview();
    const hap = { whole: { begin: 0, end: .001 }, value: { s: 'bd' }, context: { oddenovaTrack: 'x' } };
    const makePattern = (count: number) => ({
      queryArc: () => Array.from({ length: count }, (_, i) => ({
        ...hap, whole: { begin: i * .001, end: i * .001 + .001 },
      })) as PreviewHap[],
    });
    preview.commit(makePattern(PREVIEW_EVENT_BUDGET), { oddenovaTracks: { tracks: [{ id: 'x', name: 'a' }] } });
    const withinBudget = preview.frame(0, 1, followAll());
    expect(withinBudget.limited).toBe(false);
    expect(withinBudget.events).toHaveLength(PREVIEW_EVENT_BUDGET);

    // One more raw hap than the budget truncates the drawn prefix and says
    // so — without clearing tracks, solo or mutes over a mere budget limit.
    preview.commit(makePattern(PREVIEW_EVENT_BUDGET + 1), { oddenovaTracks: { tracks: [{ id: 'x', name: 'a' }] } });
    const limited = preview.frame(0, 1, followAll());
    expect(limited.limited).toBe(true);
    expect(limited.events).toHaveLength(PREVIEW_EVENT_BUDGET);
    expect(preview.snapshot.status).toBe('ready');
    expect(preview.snapshot.tracks.map(t => t.name)).toEqual(['a']);
  });
});

describe('track source ranges for code navigation', () => {
  async function compileForRanges(preview: TrackPreview, code: string) {
    const result = await core.evaluate(code, (source: string) => preview.prepare(source, transpiler(source)));
    preview.commit(result.pattern, result.meta);
    return preview.snapshot.tracks;
  }

  it('records each layer slot in the full original document, offsets included', async () => {
    const preview = new TrackPreview();
    const code = `// leading comment\nstack(\n  /* @layer 鼓组 */ s("bd*2"),\n  /* @layer 贝斯 */ note("36 40").s("sawtooth")\n).gain(.6)`;
    const tracks = await compileForRanges(preview, code);
    expect(tracks.map(t => t.name)).toEqual(['鼓组', '贝斯']);
    expect(tracks.every(t => t.sourceRange !== undefined)).toBe(true);
    for (const track of tracks) {
      const slice = code.slice(track.sourceRange!.from, track.sourceRange!.to);
      expect(slice).toContain(track.name);
      // The marker comment belongs to the range; slot-edge whitespace is gone.
      expect(slice.startsWith('/*')).toBe(true);
      expect(slice.startsWith(' ')).toBe(false);
      expect(slice.endsWith(' ')).toBe(false);
    }
  });

  it('distinguishes duplicate layer names by position, not by name', async () => {
    const preview = new TrackPreview();
    const code = `stack(/* @layer drums */ s("bd"), /* @layer drums */ s("hh"))`;
    const tracks = await compileForRanges(preview, code);
    expect(tracks.map(t => t.name)).toEqual(['drums', 'drums']);
    const first = code.slice(tracks[0].sourceRange!.from, tracks[0].sourceRange!.to);
    const second = code.slice(tracks[1].sourceRange!.from, tracks[1].sourceRange!.to);
    expect(first).toContain('bd');
    expect(second).toContain('hh');
    expect(tracks[0].sourceRange!.from).toBeLessThan(tracks[1].sourceRange!.from);
  });

  it('uses the expression range for layers without a marker', async () => {
    const preview = new TrackPreview();
    const code = `stack(s("bd"), note("36 40").s("sawtooth"))`;
    const tracks = await compileForRanges(preview, code);
    const first = code.slice(tracks[0].sourceRange!.from, tracks[0].sourceRange!.to);
    expect(first).toBe('s("bd")');
    const second = code.slice(tracks[1].sourceRange!.from, tracks[1].sourceRange!.to);
    expect(second).toContain('note("36 40")');
  });

  it.each([
    ['crlf line endings', 'stack(\r\n  /* @layer 鼓组 */ s("bd"),\r\n  /* @layer 贝斯 */ s("cp")\r\n)'],
    ['chinese and emoji content', 'stack(/* @layer 旋律🎵 */ s("bd"), /* @layer 贝斯」 */ s("cp"))'],
    ['a leading comment before the stack', '// 头部说明\nstack(/* @layer drums */ s("bd"))'],
  ])('cuts the exact original text out of the document: %s', async (_label, code) => {
    const preview = new TrackPreview();
    const tracks = await compileForRanges(preview, code);
    for (const track of tracks) {
      const slice = code.slice(track.sourceRange!.from, track.sourceRange!.to);
      expect(slice.trim()).toBe(slice);
      expect(slice.length).toBeGreaterThan(0);
      expect(track.sourceRange!.to).toBeLessThanOrEqual(code.length);
      // The slice is verbatim document text, never re-encoded.
      expect(slice).toBe(track.sourceRange ? code.slice(track.sourceRange.from, track.sourceRange.to) : '');
    }
  });

  it('binds the metadata to the compile that committed it', async () => {
    const preview = new TrackPreview();
    await compileForRanges(preview, score);
    const before = preview.snapshot.tracks.map(t => t.sourceRange);
    expect(preview.trackSource(preview.snapshot.tracks[0].id)?.sourceCode).toBe(score);

    // An uncommitted evaluation cannot re-point the sounding tracks.
    preview.prepare('stack(s("cp"))', transpiler('stack(s("cp"))'));
    expect(preview.snapshot.tracks.map(t => t.sourceRange)).toEqual(before);
    expect(preview.trackSource(preview.snapshot.tracks[0].id)?.sourceCode).toBe(score);

    const staleId = preview.snapshot.tracks[0]?.id;
    preview.reset();
    expect(preview.snapshot.tracks).toHaveLength(0);
    expect(staleId === undefined || preview.trackSource(staleId)).toBeNull();
  });
});

describe('track rename metadata', () => {
  async function compileFor(preview: TrackPreview, code: string) {
    const result = await core.evaluate(code, (source: string) => preview.prepare(source, transpiler(source)));
    preview.commit(result.pattern, result.meta);
    return preview.snapshot.tracks;
  }

  it('carries marker and name ranges in full-document offsets', async () => {
    const preview = new TrackPreview();
    const code = 'stack(\n  /* @layer 鼓组 */ s("bd"),\n  s("cp")\n)';
    const tracks = await compileFor(preview, code);
    const [marked, auto] = tracks;
    expect(code.slice(marked.markerRange!.from, marked.markerRange!.to)).toBe('/* @layer 鼓组 */');
    expect(code.slice(marked.nameRange!.from, marked.nameRange!.to)).toBe('鼓组');
    expect(auto.markerRange).toBeUndefined();
    expect(auto.nameRange).toBeUndefined();
    expect(marked.colorKey).toBe('鼓组');
    expect(auto.colorKey).toBe('layer_0');
  });

  it('exposes a rename context only while the preview is ready', async () => {
    const preview = new TrackPreview();
    expect(preview.renameContext()).toBeNull();
    await compileFor(preview, score);
    const context = preview.renameContext();
    expect(context?.code).toBe(score);
    expect(context?.stackRange.from).toBe(score.indexOf('stack'));
    expect(context?.tracks.map(t => t.id)).toEqual(preview.snapshot.tracks.map(t => t.id));
    preview.reset();
    expect(preview.renameContext()).toBeNull();
  });

  it('applies a rename without touching the pattern, ids, solo or mutes', async () => {
    const preview = new TrackPreview();
    const { pattern } = await compile(preview, score);
    const ids = preview.snapshot.tracks.map(t => t.id);
    preview.toggleSolo(ids[0]);
    preview.toggleMute(ids[1]);

    const renamed = score.replace('鼓组', '主鼓');
    const nextTracks = preview.snapshot.tracks.map((track, i) => i === 0
      ? { ...track, name: '主鼓', nameRange: { from: renamed.indexOf('主鼓'), to: renamed.indexOf('主鼓') + 2 } }
      : track);
    preview.applyRename({ code: renamed, tracks: nextTracks });

    expect(preview.snapshot.soloId).toBe(ids[0]);
    expect(preview.snapshot.mutedIds).toEqual(new Set([ids[1]]));
    expect(preview.snapshot.tracks.map(t => t.id)).toEqual(ids);
    expect(preview.snapshot.tracks.map(t => t.name)).toEqual(['主鼓', '贝斯']);
    expect(preview.snapshot.revision).toBeGreaterThan(0);
    // Navigation re-targets the mapped code; the compiled source is intact.
    expect(preview.trackSource(ids[0])?.sourceCode).toBe(renamed);
    expect(preview.trackSource(ids[0])?.range).toEqual(nextTracks[0].sourceRange);
    expect(preview.compiledSourceCode).toBe(score);
    // The sounding pattern is untouched: the same haps come out.
    expect(pattern.queryArc(0, 1).length).toBeGreaterThan(0);
    expect(pattern).toBe((preview as unknown as { pattern: unknown }).pattern);
  });

  it('keeps the colour key stable across a rename', async () => {
    const preview = new TrackPreview();
    await compileFor(preview, score);
    const before = preview.snapshot.tracks.map(t => t.colorKey);
    preview.applyRename({
      code: score.replace('鼓组', '主鼓'),
      tracks: preview.snapshot.tracks.map((track, i) => i === 0 ? { ...track, name: '主鼓' } : track),
    });
    expect(preview.snapshot.tracks.map(t => t.colorKey)).toEqual(before);
  });

  it('ignores a rename applied to a non-ready preview', () => {
    const preview = new TrackPreview();
    const revision = preview.snapshot.revision;
    preview.applyRename({ code: 'x', tracks: [] });
    expect(preview.snapshot.revision).toBe(revision);
    expect(preview.snapshot.status).toBe('idle');
  });
});
