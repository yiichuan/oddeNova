import { beforeAll, describe, expect, it } from 'vitest';
import { resolveReceiptTracks } from '../receipt-tracks';
import { resolveLayerRanges } from '../receipt-layers';

// A hand-arranged piece: instruments are functions, sections are stacks of them,
// and the piece returns the arrangement with a few whole-song tracks.
const SECTIONED = `setcps(0.5)
const keys = p => note(p).s("piano")
const kit = p => s(p).bank("RolandTR707")
let intro = keys("c3")
let verse = stack(
  keys("e3 g3"),
  kit("[bd,hh] hh [bd,hh,sd] hh"),
  // keys("a3"),
)
let chorus = stack(
  kit("bd*4"),
  /* @layer lead */ note("c5").s("sawtooth"),
  s("cp").gain(.5)
)
let bed = s("brown").gain(.1)
let song = arrange(
  [4, intro],
  [4, verse],
  [4, chorus],
  [4, silence]
)
stack(song, bed)`;

describe('resolveReceiptTracks', () => {
  it('lists one track per instrument across sections, plus whole-song tracks', () => {
    // The kit's bd/sd/hh are one instrument call, so one track; a call outside any
    // instrument function takes its section's name.
    expect(resolveReceiptTracks(SECTIONED)?.names).toEqual(['keys', 'kit', 'lead', 'chorus', 'bed']);
  });
  it('wraps each track expression, leaving the rest of the code as written', () => {
    const { instrumented } = resolveReceiptTracks(SECTIONED)!;
    expect(instrumented).toContain(`let intro = __track('keys', keys("c3"))`);
    expect(instrumented).toContain(`__track('kit', kit("bd*4"))`);
    expect(instrumented).toContain(`/* @layer lead */ __track('lead', note("c5").s("sawtooth"))`);
    expect(instrumented).toContain(`stack(song, __track('bed', bed))`);
    expect(instrumented).toContain('// keys("a3"),');
    expect(instrumented.replace(/__track\('[^']*', /g, '').length).toBe(SECTIONED.length + instrumented.match(/__track/g)!.length);
  });
  it('leaves an agent-style single stack to the parser layers', () => {
    expect(resolveReceiptTracks('setcps(0.5)\nstack(\n  /* @layer pad */\n  note("c3").s("pad"),\n  s("bd*4")\n)')).toBeNull();
    expect(resolveReceiptTracks('const chords = "<C^7 A-7>"\nstack(chord(chords).voicing(), s("hh*8"))')).toBeNull();
    expect(resolveReceiptTracks('s("bd*4")')).toBeNull();
    expect(resolveReceiptTracks('')).toBeNull();
  });
  it('reads the returned stack, not an earlier one', () => {
    const code = 'let drums = stack(s("bd"), s("hh"))\nstack(\n  drums,\n  note("c3")\n)';
    expect(resolveReceiptTracks(code)?.names).toEqual(['drums', 'layer_1']);
  });
});

describe('resolveLayerRanges for a sectioned score, with the real Strudel engine', () => {
  beforeAll(async () => {
    const { evalScope } = await import('@strudel/core');
    await evalScope(import('@strudel/core'), import('@strudel/mini'), import('@strudel/tonal'));
  });
  it('times each track over the whole arrangement', async () => {
    // 16 cycles at 0.5 cps: a 00:32 piece, sections 8 s each.
    expect(await resolveLayerRanges(SECTIONED)).toEqual({
      keys: ['00:00 – 00:16'],
      kit: ['00:08 – 00:24'],
      lead: ['00:16 – 00:24'],
      chorus: ['00:16 – 00:24'],
      bed: ['00:00 – 00:32'],
    });
  });
});
