import { beforeAll, describe, expect, it, vi } from 'vitest';
import * as core from '@strudel/core';
import * as mini from '@strudel/mini';
import * as tonal from '@strudel/tonal';
import { transpiler } from '@strudel/transpiler';
import { TrackPreview, type PreviewHap } from '../track-preview';

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
    expect(preview.frame(0.25, .5).events).toEqual(expect.arrayContaining([
      expect.objectContaining({ trackId: preview.snapshot.tracks[0].id, sound: 'bd', begin: 0, end: .5 }),
      expect.objectContaining({ trackId: preview.snapshot.tracks[1].id, pitch: 36 }),
    ]));
    preview.toggleSolo(preview.snapshot.tracks[0].id);
    expect(all.filter(h => preview.isAudible(h))).toHaveLength(6);
    preview.toggleSolo(preview.snapshot.tracks[0].id);
    expect(all.filter(h => preview.isAudible(h))).toHaveLength(8);
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
    expect(preview.frame(0, .5).events.length).toBeGreaterThan(0);
  });

  it('collapses duplicate visual events created by late plus room transforms', async () => {
    const preview = new TrackPreview();
    await compile(preview, melodyScore);

    const events = preview.frame(4, .5).events;
    const visualKeys = events.map(event => JSON.stringify([
      event.trackId,
      event.begin,
      event.end,
      event.sound,
      event.pitch,
    ]));

    expect(events).toHaveLength(13);
    expect(new Set(visualKeys).size).toBe(events.length);
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
