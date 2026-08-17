import { describe, expect, it } from 'vitest';
import {
  formatPlaybackTime,
  getStrudelLoopCycles,
  getStrudelLoopDurationSeconds,
} from '../strudel-timing';

describe('Strudel playback timing', () => {
  it('reports zero duration when there is no playable code', () => {
    expect(getStrudelLoopDurationSeconds('')).toBe(0);
    expect(getStrudelLoopDurationSeconds('   ')).toBe(0);
  });

  it('uses one cycle and Strudel default 0.5 cps when no long structure is present', () => {
    expect(getStrudelLoopCycles('s("bd sd")')).toBe(1);
    expect(getStrudelLoopDurationSeconds('s("bd sd")')).toBe(2);
  });

  it('spans /N over every slot of an alternation, not the alternation as a whole', () => {
    // `<1 0>/16` holds each slot for 16 cycles, so the gate runs 32 cycles.
    expect(getStrudelLoopCycles('s("bd").mask("<1 0>/16")')).toBe(32);
    expect(getStrudelLoopCycles('chord("<C^7 Am7 Dm7 G7>/24")')).toBe(96);
    expect(getStrudelLoopCycles('n("<0 1 2 3>*2")')).toBe(2);
  });

  it('supports weighted and bare alternations while ignoring examples in comments', () => {
    const code = `
// s("<a b c d e>/64")
note("<c3 e3 g3>").mask("<0@2 1@4 0@2>")
`;

    expect(getStrudelLoopCycles(code)).toBe(24);
  });

  it('multiplies @ weights by a trailing /N rather than letting either one win', () => {
    // The weights on their own already decide the span: 6+2+6+2 = 16 cycles.
    expect(getStrudelLoopCycles('s("noise").gain("<0@6 0.22@2 0@6 0.32@2>")')).toBe(16);
    // A `/16` on top stretches every weighted slot 16× again. This is the shape
    // that dragged one 174 BPM piece's loop out to 5:53 off a single sweep layer,
    // opening with 96 cycles of silence — the prompt used to describe `/N` as the
    // total span, which reads as if the weights and the slash were the same knob.
    expect(getStrudelLoopCycles('s("noise").gain("<0@6 0.22@2 0@6 0.32@2>/16")')).toBe(256);
    expect(
      formatPlaybackTime(
        getStrudelLoopDurationSeconds('setcps(0.725)\ns("noise").gain("<0@6 0.22@2 0@6 0.32@2>/16")'),
      ),
    ).toBe('05:53');
  });

  it('counts ! replication and multiplies nested alternations', () => {
    expect(getStrudelLoopCycles('note("<a!4 b!4 c!8>")')).toBe(16);
    expect(getStrudelLoopCycles('note("<[a b]!2 c ! d>")')).toBe(5);
    expect(getStrudelLoopCycles('note("<a <b c>>")')).toBe(4);
  });

  it('scales a layer by chained slow/fast and fits every/iter into the loop', () => {
    expect(getStrudelLoopCycles('note("<a b c>").slow(4)')).toBe(12);
    expect(getStrudelLoopCycles('note("<a b c d>").fast(2)')).toBe(2);
    expect(getStrudelLoopCycles('s("bd*4").every(6, fast(2))')).toBe(6);
  });

  it('leaves LFO periods out of the loop but keeps a slow that reshapes the pattern', () => {
    // A filter sweep is texture: its period is picked for feel and would
    // otherwise multiply the loop out to something nobody hears repeating.
    expect(getStrudelLoopCycles('note("<a b>").lpf(sine.range(200, 800).slow(6))')).toBe(2);
    expect(getStrudelLoopCycles('s("bd*4").gain(perlin.range(0.2, 0.4).slow(20))')).toBe(1);
    // `slow` on the pattern itself is structure, nested in `sometimes` or not.
    expect(getStrudelLoopCycles('s("hh*16").sometimes(slow(2))')).toBe(2);
  });

  it('lines up every stack layer of an arranged 52-cycle piece', () => {
    const code = `// FINGERSTYLE GUITAR | BPM: 72
setcps(0.3)

stack(
  /* @layer MELODY */
  note("<[d4 ~ f#4 a4] [d4 e4 f#4 ~] [a4 f#4 e4 d4] [f#4 ~ a4 d5]>")
    .s("gm_acoustic_guitar_steel")
    .gain("<0.45!4 0.5!12 0.55!8 0.65!4 0.55!8 0.5!8 0.45!8>"),

  /* @layer BASS */
  note("<d2!4 b1!4 g1!4 a1!4 e1!4 f#1!4 g1!4 a1!4 d2!4 b1!4 g1!4 a1!4 d2!4>")
    .s("gm_acoustic_bass"),

  /* @layer PAD */
  note("<[d2,f#2,a2]!4 [b1,d2,f#2]!4 [g1,b1,d2]!4 [a1,c#2,e2]!4 [e1,g1,b1]!4 [f#1,a1,c#2]!4 [g1,b1,d2]!4 [a1,c#2,e2]!4 [d2,f#2,a2]!4 [b1,d2,f#2]!4 [g1,b1,d2]!4 [a1,c#2,e2]!4 [d2,f#2,a2]!4>")
    .s("gm_pad_warm")
    .mask("<0!16 1!32 0!4>")
)`;

    expect(getStrudelLoopCycles(code)).toBe(52);
    expect(formatPlaybackTime(getStrudelLoopDurationSeconds(code))).toBe('02:53');
  });

  it('takes the loop from every() and the arrangement, not from the fm modulator', () => {
    const code = `// DRUM AND BASS | BPM: 174
setcps(0.725)

stack(
  /* @layer DRUMS */
  s("[bd:2 ~ ~ ~ ~ bd:2 ~ ~], [~ ~ sn:1 ~ ~ ~ sn:1 ~], hh*8")
    .every(8, fast(2)),

  /* @layer BASS */
  note("c2 ~ c2 ~ eb2 ~ g2 ~")
    .s("sawtooth")
    .fm(sine.range(3, 7).slow(6)),

  /* @layer PAD */
  note("<[c4,eb4,g4] [bb3,d4,f4] [ab3,c4,eb4] [g3,bb3,d4]>/2")
    .s("triangle"),

  /* @layer MELODY */
  note("c5 ~ eb5 ~ g5 ~ bb5 ~")
    .s("sine")
    .slow(2)
)`;

    expect(getStrudelLoopCycles(code)).toBe(8);
    expect(formatPlaybackTime(getStrudelLoopDurationSeconds(code))).toBe('00:11');
  });

  it('is not stretched by the LFOs sprinkled across an ambient arrangement', () => {
    // Three modulators at 4, 6 and 20 cycles. Folding those into the loop takes
    // this from its longest real envelope (the sweep's 16 weighted cycles held
    // 16 cycles each = 256) to 3840, i.e. from 5:53 to 88:16.
    const code = `setcps(0.725)

stack(
  /* @layer drums */
  s("breaks165").lpf(perlin.range(2000, 14000).slow(4)).sometimes(rev).every(16, ply(2)),

  /* @layer hats */
  s("hh*16").every(4, fast(2)).sometimes(slow(2)),

  /* @layer pad */
  note("<[f3,ab3,c4,eb4] [c3,eb3,g3,bb3] [bb2,d3,f3,ab3] [eb3,g3,bb3,d4]>/16")
    .gain(perlin.range(0.2, 0.4).slow(6))
    .lpf(sine.range(350, 3500).slow(20)),

  /* @layer sweep */
  s("noise").gain("<0@6 0.22@2 0@6 0.32@2>/16").lpf("<200 8000 200 10000>/16")
)`;

    expect(getStrudelLoopCycles(code)).toBe(256);
    expect(formatPlaybackTime(getStrudelLoopDurationSeconds(code))).toBe('05:53');
  });

  it('formats playback time as zero-padded minutes and seconds', () => {
    expect(formatPlaybackTime(0)).toBe('00:00');
    expect(formatPlaybackTime(96.9)).toBe('01:36');
  });
});
