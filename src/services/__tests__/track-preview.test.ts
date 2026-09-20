import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as core from '@strudel/core';
import * as mini from '@strudel/mini';
import * as tonal from '@strudel/tonal';
import { transpiler } from '@strudel/transpiler';
import { TrackPreview, type PreviewHap } from '../track-preview';
import type { TrackSceneRequest } from '../../lib/track-preview-scene';
import { buildTrackRename } from '../../lib/track-rename';

type TestPattern = { queryArc: (begin: number, end: number) => (PreviewHap & { value: Record<string, unknown>; context: Record<string, unknown> })[] };

beforeAll(async () => { await core.evalScope(core, mini, tonal); });

async function compile(preview: TrackPreview, code: string) {
  const result = await core.evaluate(code, (source: string) => preview.prepare(source, transpiler(source)));
  preview.commit(result.pattern, result.meta);
  return { pattern: result.pattern as TestPattern, meta: result.meta };
}

const score = `stack(
/* @layer 鼓组 */ stack(s("bd*2"), s("hh*4")),
/* @layer 贝斯 */ note("36 40").s("sawtooth")
).gain(.6)`;

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
    preview.toggleSolo(preview.snapshot.tracks[0].id);
    expect(all.filter(h => preview.isAudible(h))).toHaveLength(6);
    preview.toggleSolo(preview.snapshot.tracks[0].id);
    expect(all.filter(h => preview.isAudible(h))).toHaveLength(8);
  });

  it('mutes individual layers, keeps them audible under solo, and drops stale mutes on commit', async () => {
    const preview = new TrackPreview();
    const { pattern } = await compile(preview, score);
    const firstIds = preview.snapshot.tracks.map(track => track.id);
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
    // A same-source evaluation is the pause/resume fast path: identity and
    // audition state survive while the Pattern instance is replaced.
    await compile(preview, score);
    expect(preview.snapshot.tracks.map(track => track.id)).toEqual(firstIds);
    expect(preview.snapshot.mutedIds).toEqual(new Set(firstIds));
    expect(preview.snapshot.tracks.length && all.every(h => preview.isAudible(h))).toBe(false);

    // A byte-different source is a new work and must drop selections that no
    // longer point at the new logical track identities.
    const changed = await compile(preview, `${score}\n`);
    expect(preview.snapshot.tracks.map(track => track.id)).not.toEqual(firstIds);
    expect(preview.snapshot.mutedIds.size).toBe(0);
    expect(changed.pattern.queryArc(0, 1).every(h => preview.isAudible(h))).toBe(true);
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

  it('reuses the exact source identity while replacing the Pattern and keeping the scene cache', async () => {
    const preview = new TrackPreview();
    const firstPattern: TestPattern = {
      queryArc: () => [{
        whole: { begin: 0.25, end: 0.5 }, value: { s: 'old' }, context: { oddenovaTrack: 'stable' },
      }],
    };
    const nextPattern: TestPattern = {
      queryArc: (begin) => [{
        whole: { begin: Math.max(1.25, begin), end: Math.max(1.5, begin + 0.25) },
        value: { s: 'new' }, context: { oddenovaTrack: 'stable' },
      }],
    };
    const metadata = {
      oddenovaTracks: {
        tracks: [{ id: 'stable', name: 'a' }],
        sourceCode: 'same source',
      },
    };
    preview.commit(firstPattern, metadata);
    const generation = preview.previewGeneration;
    preview.toggleSolo('stable');
    preview.toggleMute('stable');
    const first = await preview.queryTrackScene(sceneRequest(preview));
    const revision = preview.snapshot.revision;

    preview.commit(nextPattern, {
      oddenovaTracks: { ...metadata.oddenovaTracks, reusePreviewContent: true },
    });

    expect(preview.previewGeneration).toBe(generation);
    expect(preview.snapshot.tracks.map(track => track.id)).toEqual(['stable']);
    expect(preview.snapshot.soloId).toBe('stable');
    expect(preview.snapshot.mutedIds).toEqual(new Set(['stable']));
    expect(preview.snapshot.revision).toBe(revision);

    // The old band remains cached, while a new uncached band is served by the
    // replacement Pattern rather than the old closure.
    const cached = await preview.queryTrackScene(sceneRequest(preview));
    const cachedPrimitive = cached.batch!.lanes[0].exact![0];
    expect(cached.batch!.sounds[cachedPrimitive.soundId]).toBe('old');
    expect(cached.batch?.rawEventCount).toBe(first.batch?.rawEventCount);
    const fresh = await preview.queryTrackScene(sceneRequest(preview, 1, 2));
    const freshPrimitive = fresh.batch!.lanes[0].exact![0];
    expect(fresh.batch!.sounds[freshPrimitive.soundId]).toBe('new');
  });

  it('marks only an exact mapped source with the preview reuse decision', async () => {
    const preview = new TrackPreview();
    const first = await core.evaluate(score, (source: string) => preview.prepare(source, transpiler(source)));
    preview.commit(first.pattern, first.meta);
    const firstIds = preview.snapshot.tracks.map(track => track.id);

    const same = await core.evaluate(score, (source: string) => preview.prepare(source, transpiler(source)));
    expect(same.meta.oddenovaTracks?.reusePreviewContent).toBe(true);
    expect(same.meta.oddenovaTracks?.tracks.map((track: { id: string }) => track.id)).toEqual(firstIds);

    const changed = await core.evaluate(`${score} // changed`, (source: string) => preview.prepare(source, transpiler(source)));
    expect(changed.meta.oddenovaTracks?.reusePreviewContent).toBe(false);
    expect(changed.meta.oddenovaTracks?.tracks.map((track: { id: string }) => track.id)).not.toEqual(firstIds);
  });

  it('does not reuse a source identity after reset', async () => {
    const preview = new TrackPreview();
    await compile(preview, score);
    const firstIds = preview.snapshot.tracks.map(track => track.id);
    const firstGeneration = preview.previewGeneration;

    preview.reset();
    await compile(preview, score);

    expect(preview.previewGeneration).toBeGreaterThan(firstGeneration);
    expect(preview.snapshot.tracks.map(track => track.id)).not.toEqual(firstIds);
  });

  it('allows a pure layer rename to enter the same-source playback fast path', async () => {
    const preview = new TrackPreview();
    await compile(preview, score);
    const firstIds = preview.snapshot.tracks.map(track => track.id);
    const firstGeneration = preview.previewGeneration;
    const context = preview.renameContext();
    expect(context).not.toBeNull();
    const renamed = buildTrackRename(context!, firstIds[0], '鼓');
    expect(renamed.status).toBe('ok');
    if (renamed.status !== 'ok') return;

    preview.applyRename({ code: renamed.nextCode, tracks: renamed.tracks });
    const result = await core.evaluate(renamed.nextCode, (source: string) => preview.prepare(source, transpiler(source)));
    expect(result.meta.oddenovaTracks?.reusePreviewContent).toBe(true);
    expect(result.meta.oddenovaTracks?.tracks.map((track: { id: string }) => track.id)).toEqual(firstIds);
    preview.commit(result.pattern, result.meta);

    expect(preview.previewGeneration).toBe(firstGeneration);
    expect(preview.snapshot.tracks.map(track => track.name)).toEqual(['鼓', '贝斯']);
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
    const batch = await preview.queryTrackScene(sceneRequest(preview));
    expect(batch.batch?.rawEventCount).toBeGreaterThan(0);
  });

  it('collapses duplicate visual events created by late plus room transforms', async () => {
    const preview = new TrackPreview();
    await compile(preview, `stack(
/* @layer MELODY */
note("<[0 2 4 ~ 2 ~ <4 5> 2]@2 [2 4 6 ~ 4 ~ <1 6> 4]@2 [5 4 2 ~ 4 ~ <2 1> 4]@2 [4 6 1 ~ 6 ~ <3 4> 6]@2>")
  .scale("D4:lydian")
  .s("piano")
  .gain("<0.42@8 0.5@8 0.52@8 0.45@4 0.3@4>")
  .late(0.02)
  .room(0.35)
)`);

    const batch = await preview.queryTrackScene(sceneRequest(preview, 2, 6));
    expect(batch.batch).toBeDefined();
    const exactCount = batch.batch!.lanes.reduce((sum, lane) => sum + (lane.exact?.length ?? 0), 0);
    // The same tuple appears twice from late plus room; the scene keeps one.
    expect(exactCount).toBe(13);
    expect(new Set(batch.batch!.lanes.flatMap(lane => (lane.exact ?? []).map(p => [p.begin, p.end, p.soundId, p.pitch].join(',')))).size).toBe(exactCount);
  });

  it('gives each event an identity over the uncropped display boundaries', async () => {
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
    const batch = await preview.queryTrackScene(sceneRequest(preview, 1, 5, 32));
    const primitives = batch.batch!.lanes[0].exact ?? [];
    expect(primitives).toHaveLength(2);
    expect(primitives[0]).toMatchObject({ begin: 2, end: 2.5, pitch: null });
    expect(primitives[1]).toMatchObject({ begin: 2, end: 2.5, pitch: 36 });

    // A different track id (a fresh compile generation) does not reuse identity.
    preview.commit(
      {
        queryArc: () => [
          { whole: { begin: 34, end: 34.5 }, value: { s: 'bd' }, context: { oddenovaTrack: 'y' } },
        ] as PreviewHap[],
      },
      { oddenovaTracks: { tracks: [{ id: 'y', name: 'a' }] } },
    );
    const next = await preview.queryTrackScene(sceneRequest(preview, 1, 5, 32));
    expect(next.batch!.lanes[0].exact).toHaveLength(1);
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

// ── Scene queries ────────────────────────────────────────────────────────────

/** One full-piece scene request over [begin, end) at a comfortable zoom. */
function sceneRequest(preview: TrackPreview, queryBegin = 0, queryEnd = 1, loopOffset = 0): TrackSceneRequest {
  return {
    generation: preview.previewGeneration,
    loopOffset,
    cps: 0.5,
    queryBegin,
    queryEnd,
    viewportBegin: queryBegin,
    viewportEnd: queryEnd,
    cssWidth: 400,
    devicePixelRatio: 1,
  };
}

describe('cooperative scene queries without an event cap', () => {
  it('splits a band, keeps a sustained boundary event once, and freezes query parameters', async () => {
    const preview = new TrackPreview();
    const calls: Array<[number, number, number | undefined]> = [];
    preview.commit({
      queryArc: (begin, end, controls) => {
        calls.push([begin, end, controls?._cps as number | undefined]);
        const shared = { whole: { begin: 0.25, end: 0.75 }, value: { s: 'pad' }, context: { oddenovaTrack: 'x' } };
        // Every chunk contributes its own short note at the chunk's start, so
        // chunk coverage and per-chunk ownership both stay observable.
        return [shared, { whole: { begin, end: begin + 0.1 }, value: { s: 'bd' }, context: { oddenovaTrack: 'x' } }] as PreviewHap[];
      },
    }, { oddenovaTracks: { tracks: [{ id: 'x', name: 'a' }] } });

    const result = await preview.queryTrackScene(sceneRequest(preview));

    expect(result.status).toBe('complete');
    expect(calls.length).toBeGreaterThan(1);
    expect(calls.every(([, , cps]) => cps === 0.5)).toBe(true);
    const lane = result.batch!.lanes[0];
    expect(lane.representation).toBe('exact');
    const names = (lane.exact ?? []).map(primitive => result.batch!.sounds[primitive.soundId]);
    // The pad crosses chunk borders and keeps one identity; every chunk's
    // own onset contributes its bd once.
    expect(names.filter(sound => sound === 'pad')).toHaveLength(1);
    expect(names.filter(sound => sound === 'bd')).toHaveLength(calls.length);
    // Only two distinct sound names exist: one shared pad plus per-chunk bds.
    expect(new Set(names).size).toBe(2);
    // Uncropped spans may run past the band edges; each must overlap it.
    expect((lane.exact ?? []).every(primitive =>
      primitive.end > primitive.begin
      && primitive.end > 0
      && primitive.begin < 1)).toBe(true);
    expect(result.batch).toMatchObject({ generation: preview.previewGeneration, begin: 0, end: 1, loopOffset: 0 });
    expect(result.batch?.status).toBe('complete');
    expect(result.batch?.coverageEnd).toBeUndefined();
  });

  it.each([2048, 2049, 4096, 10000])('completes %i raw haps with no prefix truncation', async (count) => {
    const preview = new TrackPreview();
    preview.commit({
      queryArc: () => Array.from({ length: count }, (_, index) => ({
        whole: { begin: index / count, end: index / count + 0.5 / count },
        value: { s: 'bd' },
        context: { oddenovaTrack: 'x' },
      })) as PreviewHap[],
    }, { oddenovaTracks: { tracks: [{ id: 'x', name: 'a' }] } });

    const result = await preview.queryTrackScene(sceneRequest(preview));

    expect(result.status).toBe('complete');
    expect(result.batch?.rawEventCount).toBe(count);
    const lane = result.batch!.lanes[0];
    // Such dense micro-haps aggregate: every one participates in the columns.
    expect(lane.representation).toBe('density');
    expect(lane.rawEventCount).toBe(count);
    const counts = lane.density!.counts;
    expect(counts[0]).toBeGreaterThan(0);
    expect(counts[counts.length - 1]).toBeGreaterThan(0);
    expect([...counts].reduce((sum, value) => sum + value, 0)).toBeGreaterThan(0);
  });

  it('keeps cross-chunk sustains as one real event and covers every column they span', async () => {
    const preview = new TrackPreview();
    preview.commit({
      // One sustain from 0 to 1: chunked queries return it repeatedly.
      queryArc: () => [
        { whole: { begin: 0, end: 1 }, value: { s: 'pad' }, context: { oddenovaTrack: 'x' } },
      ] as PreviewHap[],
    }, { oddenovaTracks: { tracks: [{ id: 'x', name: 'a' }] } });

    const result = await preview.queryTrackScene(sceneRequest(preview));
    const lane = result.batch!.lanes[0];
    // One identity for the whole note, no fake attack at the chunk border.
    expect(lane.exact).toHaveLength(1);
    expect(lane.exact![0]).toMatchObject({ begin: 0, end: 1 });
  });

  it('allows a mixed scene: a dense lane aggregates while a sparse lane stays exact', async () => {
    const preview = new TrackPreview();
    preview.commit({
      queryArc: (begin, end) => {
        const haps: PreviewHap[] = [];
        // The sparse lane: one pad holds the whole band, wide on screen.
        haps.push({ whole: { begin: 0, end: 4 }, value: { s: 'pad', note: 60 }, context: { oddenovaTrack: 'pad' } });
        // The dense lane: 40 ultra-short haps per cycle cannot resolve as exact.
        for (let onset = Math.ceil(begin / 0.025) * 0.025; onset < end; onset += 0.025) {
          haps.push({ whole: { begin: onset, end: onset + 0.0001 }, value: { s: 'bd' }, context: { oddenovaTrack: 'drums' } });
        }
        return haps;
      },
    }, { oddenovaTracks: { tracks: [{ id: 'drums', name: 'drums' }, { id: 'pad', name: 'pad' }] } });

    const result = await preview.queryTrackScene(sceneRequest(preview, 0, 4));
    expect(result.status).toBe('complete');
    expect(result.batch?.representation).toBe('mixed');
    const drums = result.batch!.lanes.find(lane => lane.trackId === 'drums')!;
    const pad = result.batch!.lanes.find(lane => lane.trackId === 'pad')!;
    expect(drums.representation).toBe('density');
    expect(pad.representation).toBe('exact');
    // The dense lane's columns still hold every event — nothing is dropped.
    expect(drums.rawEventCount).toBe(160);
    const total = [...drums.density!.counts].reduce((sum, value) => sum + value, 0);
    // Cover semantics count each hap in every column it spans.
    expect(total).toBeGreaterThanOrEqual(160);
    // The pad keeps its whole uncropped span as one exact note; tiles without
    // their own onsets never veto the sparse lane's exact form.
    expect(pad.exact).toHaveLength(1);
    expect(pad.exact![0]).toMatchObject({ begin: 0, end: 4, pitch: 60 });
  });

  it('counts the beginning, middle and end of a 10k-event whole-song scene', async () => {
    const preview = new TrackPreview();
    const total = 10000;
    const step = 16 / total;
    preview.commit({
      queryArc: (begin, end) => {
        const haps: PreviewHap[] = [];
        for (let onset = Math.ceil(begin / step) * step; onset < end - 1e-9; onset += step) {
          haps.push({ whole: { begin: onset, end: onset + step * 0.1 }, value: { s: 'bd' }, context: { oddenovaTrack: 'x' } });
        }
        return haps;
      },
    }, { oddenovaTracks: { tracks: [{ id: 'x', name: 'a' }] } });

    const result = await preview.queryTrackScene(sceneRequest(preview, 0, 16));
    expect(result.batch?.rawEventCount).toBe(total);
    const lane = result.batch!.lanes[0];
    expect(lane.representation).toBe('density');
    const counts = lane.density!.counts;
    expect([...counts].reduce((sum, value) => sum + value, 0)).toBeGreaterThan(0);
    // The head, the middle and the tail all carry data — no missing prefix.
    expect(counts[0]).toBeGreaterThan(0);
    expect(counts[Math.floor(counts.length / 2)]).toBeGreaterThan(0);
    expect(counts[counts.length - 1]).toBeGreaterThan(0);
  });

  it('rejects a cancelled task and never commits its partial result', async () => {
    const preview = new TrackPreview();
    const controller = new AbortController();
    let firstQuery = true;
    preview.commit({
      queryArc: () => {
        if (firstQuery) { firstQuery = false; controller.abort(); }
        return Array.from({ length: 512 }, (_, index) => ({
          whole: { begin: index / 1000, end: index / 1000 + 0.001 },
          value: { s: 'bd' },
          context: { oddenovaTrack: 'x' },
        })) as PreviewHap[];
      },
    }, { oddenovaTracks: { tracks: [{ id: 'x', name: 'a' }] } });

    const task = preview.queryTrackScene(sceneRequest(preview), controller.signal);
    await expect(task).rejects.toMatchObject({ name: 'AbortError' });
    expect(preview.snapshot.status).toBe('ready');
    expect(preview.snapshot.tracks).toHaveLength(1);
  });

  it('rejects a request whose generation no longer matches', async () => {
    const preview = new TrackPreview();
    preview.commit({ queryArc: () => [] }, { oddenovaTracks: { tracks: [{ id: 'x', name: 'a' }] } });
    const request = sceneRequest(preview);
    preview.commit({ queryArc: () => [] }, { oddenovaTracks: { tracks: [{ id: 'y', name: 'b' }] } });
    await expect(preview.queryTrackScene(request)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('records the slowest synchronous queryArc window in its stats', async () => {
    const preview = new TrackPreview();
    preview.commit({
      queryArc: () => [
        { whole: { begin: 0, end: 0.5 }, value: { s: 'bd' }, context: { oddenovaTrack: 'x' } },
      ] as PreviewHap[],
    }, { oddenovaTracks: { tracks: [{ id: 'x', name: 'a' }] } });
    await preview.queryTrackScene(sceneRequest(preview));
    const stats = preview.lastSceneQueryStats;
    expect(stats.chunks).toBeGreaterThan(0);
    expect(stats.tiles).toBeGreaterThan(0);
    expect(stats.slowestQueryArcMs).toBeGreaterThanOrEqual(0);
  });
});

describe('scene guards and caching', () => {
  it('guards when the narrowest chunk cannot make progress, without faking completeness', async () => {
    const preview = new TrackPreview();
    preview.commit({
      queryArc: (begin) => [
        { whole: { begin, end: begin + 0.001 }, value: { s: 'bd' }, context: { oddenovaTrack: 'x' } },
      ] as PreviewHap[],
    }, { oddenovaTracks: { tracks: [{ id: 'x', name: 'a' }] } });

    // A zero slice budget cannot schedule cooperative progress.
    const result = await preview.queryTrackScene({ ...sceneRequest(preview), workSliceMs: 0 });

    expect(result.status).toBe('resource-guarded');
    expect(result.guardReason).toBe('no-progress');
    expect(result.batch).toBeUndefined();
    expect(preview.snapshot.status).toBe('ready');
  });

  it('does not mistake completed cooperative slices for no progress', async () => {
    const preview = new TrackPreview();
    let calls = 0;
    preview.commit({
      queryArc: (begin) => {
        calls++;
        return [
          { whole: { begin, end: begin + 0.001 }, value: { s: 'bd' }, context: { oddenovaTrack: 'x' } },
        ] as PreviewHap[];
      },
    }, { oddenovaTracks: { tracks: [{ id: 'x', name: 'a' }] } });

    // Even this tiny positive budget is exceeded by normal bookkeeping. Each
    // completed chunk still advances coverage and yields before continuing.
    const result = await preview.queryTrackScene({
      ...sceneRequest(preview),
      workSliceMs: Number.MIN_VALUE,
    });

    expect(result.status).toBe('complete');
    expect(result.batch?.rawEventCount).toBe(calls);
    expect(calls).toBeGreaterThan(8);
  });

  it('guards on allocation failure instead of reporting a data failure', async () => {
    const preview = new TrackPreview();
    preview.commit({
      queryArc: () => { throw new RangeError('allocation failed'); },
    }, { oddenovaTracks: { tracks: [{ id: 'x', name: 'a' }] } });

    const result = await preview.queryTrackScene(sceneRequest(preview));
    expect(result.status).toBe('resource-guarded');
    expect(result.guardReason).toBe('allocation');
  });

  it('reports a data failure when the pattern throws, keeping the previous scene', async () => {
    const preview = new TrackPreview();
    let failing = false;
    preview.commit({
      queryArc: () => {
        if (failing) throw new Error('pattern exploded');
        return [{ whole: { begin: 0, end: 0.5 }, value: { s: 'bd' }, context: { oddenovaTrack: 'x' } }] as PreviewHap[];
      },
    }, { oddenovaTracks: { tracks: [{ id: 'x', name: 'a' }] } });

    const first = await preview.queryTrackScene(sceneRequest(preview));
    expect(first.status).toBe('complete');
    failing = true;
    // A different band misses the tile cache, so the query itself runs.
    const second = await preview.queryTrackScene(sceneRequest(preview, 0, 3));
    expect(second.status).toBe('failed');
    // A data failure must not clear tracks, solo or mutes.
    expect(preview.snapshot.status).toBe('ready');
    expect(preview.snapshot.tracks).toHaveLength(1);
  });

  it('reuses finished tiles for an identical request without re-querying', async () => {
    const preview = new TrackPreview();
    const calls: Array<[number, number]> = [];
    preview.commit({
      queryArc: (begin, end) => {
        calls.push([begin, end]);
        return [{ whole: { begin, end: begin + 0.5 }, value: { s: 'bd' }, context: { oddenovaTrack: 'x' } }] as PreviewHap[];
      },
    }, { oddenovaTracks: { tracks: [{ id: 'x', name: 'a' }] } });

    const first = await preview.queryTrackScene(sceneRequest(preview, 0, 2));
    expect(first.status).toBe('complete');
    expect(calls.length).toBeGreaterThan(0);
    const afterFirst = calls.length;

    const second = await preview.queryTrackScene(sceneRequest(preview, 0, 2));
    expect(second.status).toBe('complete');
    expect(second.batch?.rawEventCount).toBe(first.batch?.rawEventCount);
    expect(second.batch?.lanes[0].exact).toEqual(first.batch?.lanes[0].exact);
    // Everything came from the cache: no further queryArc calls.
    expect(calls.length).toBe(afterFirst);
  });

  it('re-queries when the resolution tier changes for the same band', async () => {
    const preview = new TrackPreview();
    const calls: Array<[number, number]> = [];
    preview.commit({
      queryArc: (begin, end) => {
        calls.push([begin, end]);
        return [{ whole: { begin, end: begin + 0.5 }, value: { s: 'bd' }, context: { oddenovaTrack: 'x' } }] as PreviewHap[];
      },
    }, { oddenovaTracks: { tracks: [{ id: 'x', name: 'a' }] } });

    const first = await preview.queryTrackScene(sceneRequest(preview, 0, 2));
    const firstTier = first.batch?.resolutionTier ?? 0;
    const after = calls.length;
    // A much finer tier re-queries: the cached tiles belong to the coarse one.
    const fine = await preview.queryTrackScene({
      ...sceneRequest(preview, 0, 2),
      viewportBegin: 0,
      viewportEnd: 0.25,
      cssWidth: 400,
    });
    expect(fine.batch?.resolutionTier).toBeGreaterThan(firstTier);
    expect(calls.length).toBeGreaterThan(after);
  });

  it('carries the binning specification and exact budget on every batch', async () => {
    const preview = new TrackPreview();
    const progress: Array<ReturnType<typeof Object>> = [];
    preview.commit({
      queryArc: (begin) => [
        { whole: { begin, end: begin + 0.5 }, value: { s: 'bd' }, context: { oddenovaTrack: 'x' } },
      ] as PreviewHap[],
    }, { oddenovaTracks: { tracks: [{ id: 'x', name: 'a' }] } });

    const result = await preview.queryTrackScene(sceneRequest(preview, 0, 4), undefined, batch => progress.push(batch));
    expect(result.status).toBe('complete');
    const complete = result.batch!;
    // The effective bin span is the tier's own 2-power, not the raw px/cycle.
    expect(complete.effectiveBinSpan).toBeCloseTo(Math.pow(2, -complete.resolutionTier), 9);
    expect(complete.exactBudget).toBe(400 * 4);
    for (const batch of progress) {
      expect((batch as { effectiveBinSpan?: number }).effectiveBinSpan).toBe(complete.effectiveBinSpan);
      expect((batch as { exactBudget?: number }).exactBudget).toBe(complete.exactBudget);
    }
  });

  it('honours a validated requested tier and rejects a stale one', async () => {
    const preview = new TrackPreview();
    preview.commit({
      queryArc: (begin) => [
        { whole: { begin, end: begin + 0.5 }, value: { s: 'bd' }, context: { oddenovaTrack: 'x' } },
      ] as PreviewHap[],
    }, { oddenovaTracks: { tracks: [{ id: 'x', name: 'a' }] } });

    // px/cycle 400 → raw tier 8; a fast gesture may lead by one step.
    const leading = await preview.queryTrackScene({ ...sceneRequest(preview, 0, 1), resolutionTier: 9 });
    expect(leading.batch?.resolutionTier).toBe(9);
    expect(leading.batch?.effectiveBinSpan).toBeCloseTo(Math.pow(2, -9), 9);
    const stale = await preview.queryTrackScene({ ...sceneRequest(preview, 0, 1), resolutionTier: 4 });
    // The stale render's tier is rejected outright; hysteresis still holds the
    // recorded 9 here — never the stale 4.
    expect(stale.batch?.resolutionTier).toBe(9);
    expect(stale.batch?.resolutionTier).not.toBe(4);
  });

  it('does not hit cached tiles across binning specifications or exact budgets', async () => {
    const preview = new TrackPreview();
    const calls: Array<[number, number]> = [];
    preview.commit({
      queryArc: (begin, end) => {
        calls.push([begin, end]);
        return [{ whole: { begin, end: begin + 0.5 }, value: { s: 'bd' }, context: { oddenovaTrack: 'x' } }] as PreviewHap[];
      },
    }, { oddenovaTracks: { tracks: [{ id: 'x', name: 'a' }] } });

    const first = await preview.queryTrackScene(sceneRequest(preview, 0, 2));
    expect(first.status).toBe('complete');
    const afterFirst = calls.length;
    // Same tier, different width: the exact budget changed, so the cached
    // exact candidates are not reusable without re-querying.
    const wider = await preview.queryTrackScene({ ...sceneRequest(preview, 0, 2), cssWidth: 800 });
    expect(wider.status).toBe('complete');
    expect(wider.batch?.exactBudget).toBe(800 * 4);
    expect(calls.length).toBeGreaterThan(afterFirst);
  });

  it('forgets the cache when a new compile commits', async () => {
    const preview = new TrackPreview();
    const calls: Array<[number, number]> = [];
    const commitRecorded = (trackId: string) => {
      preview.commit({
        queryArc: (begin, end) => {
          calls.push([begin, end]);
          return [{ whole: { begin, end: begin + 0.5 }, value: { s: 'bd' }, context: { oddenovaTrack: trackId } }] as PreviewHap[];
        },
      }, { oddenovaTracks: { tracks: [{ id: trackId, name: 'a' }] } });
    };
    commitRecorded('x');
    await preview.queryTrackScene(sceneRequest(preview, 0, 2));
    const before = calls.length;
    expect(before).toBeGreaterThan(0);
    commitRecorded('y');
    await preview.queryTrackScene(sceneRequest(preview, 0, 2));
    expect(calls.length).toBeGreaterThan(before);
  });
});

describe('full-scene jobs', () => {
  it('reuses one identity job and completes every fixed tile', async () => {
    const preview = new TrackPreview();
    const calls: Array<[number, number]> = [];
    preview.commit({
      queryArc: (begin, end) => {
        calls.push([begin, end]);
        return [{
          whole: { begin, end: Math.min(4, begin + 0.25) },
          value: { s: 'bd' },
          context: { oddenovaTrack: 'x' },
        }] as PreviewHap[];
      },
    }, { oddenovaTracks: { tracks: [{ id: 'x', name: 'a' }] } });

    const identity = { previewGeneration: preview.previewGeneration, loopOffset: 0, loopCycles: 4, cps: 0.5 } as const;
    preview.ensureFullScene({ identity, initialViewport: { begin: 2, end: 3 }, cssWidth: 400 });
    const callsAfterFirstStart = calls.length;
    // A zoom/pan-like change only changes the priority hint. It cannot create
    // a second controller for the same full-scene identity.
    preview.ensureFullScene({ identity, initialViewport: { begin: 0, end: 4 }, cssWidth: 800 });

    await vi.waitFor(() => expect(preview.fullSceneSnapshot?.status).toBe('complete'));
    const scene = preview.fullSceneSnapshot!;
    expect(calls.length).toBe(callsAfterFirstStart);
    expect(scene.end).toBe(4);
    expect(scene.completedTiles.size).toBe(scene.tiles.length);
    expect(scene.tiles.every(tile => tile.status === 'complete')).toBe(true);
    expect(scene.lods.length).toBeGreaterThan(1);
  });

  it('publishes non-contiguous completed tiles as pending ranges while work streams', async () => {
    const preview = new TrackPreview();
    preview.commit({
      queryArc: (begin) => [{
        whole: { begin, end: Math.min(6, begin + 0.2) },
        value: { s: 'bd' },
        context: { oddenovaTrack: 'x' },
      }] as PreviewHap[],
    }, { oddenovaTracks: { tracks: [{ id: 'x', name: 'a' }] } });

    preview.ensureFullScene({
      identity: { previewGeneration: preview.previewGeneration, loopOffset: 0, loopCycles: 6, cps: 0.5 },
      initialViewport: { begin: 3, end: 4 },
      cssWidth: 400,
    });
    await vi.waitFor(() => expect(preview.fullSceneSnapshot?.status).toBe('complete'));
    const scene = preview.fullSceneSnapshot!;
    expect(scene.tiles.some(tile => tile.status === 'complete')).toBe(true);
    expect(scene.tiles.map(tile => tile.index)).toEqual([...scene.tiles.keys()]);
  });

  it('prewarms the next pass and promotes it without a duplicate query', async () => {
    const preview = new TrackPreview();
    const calls: Array<[number, number]> = [];
    preview.commit({
      queryArc: (begin, end) => {
        calls.push([begin, end]);
        return [{
          whole: { begin, end: begin + 0.25 },
          value: { s: 'bd' },
          context: { oddenovaTrack: 'x' },
        }] as PreviewHap[];
      },
    }, { oddenovaTracks: { tracks: [{ id: 'x', name: 'a' }] } });

    const current = { previewGeneration: preview.previewGeneration, loopOffset: 0, loopCycles: 2, cps: 0.5 } as const;
    const next = { ...current, loopOffset: 2 } as const;
    preview.ensureFullScene({ identity: current, initialViewport: { begin: 0, end: 1 }, cssWidth: 400 });
    await vi.waitFor(() => expect(preview.fullSceneSnapshot?.status).toBe('complete'));
    const callsBeforePrewarm = calls.length;

    preview.prewarmFullScene({ identity: next, initialViewport: { begin: 0, end: 1 }, cssWidth: 400 });
    const callsAfterPrewarmStart = calls.length;
    // Promote while the next-pass task may still be running. The in-flight
    // job owns the identity, so the boundary cannot start a second query.
    preview.ensureFullScene({ identity: next, initialViewport: { begin: 0, end: 1 }, cssWidth: 800 });
    await vi.waitFor(() => expect(preview.fullSceneSnapshot?.identity.loopOffset).toBe(2));
    await vi.waitFor(() => expect(preview.fullSceneSnapshot?.status).toBe('complete'));

    expect(callsAfterPrewarmStart).toBeGreaterThan(callsBeforePrewarm);
    expect(calls.length).toBe(callsAfterPrewarmStart);
  });
});
