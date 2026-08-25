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

  it('reads two steps written without a space between them as two', () => {
    // `[a b][c d]` is two steps and so is `-@16[a b]*2@16`. Run together they
    // keep only the last weight in the run, which read Home's 56-cycle melody
    // as 37 and left its four voices disagreeing about the length of the piece.
    expect(getStrudelLoopCycles('note("<[a b]@2[c d]@3>")')).toBe(5);
    expect(getStrudelLoopCycles('note("<-@16[a b]*2@16 -@24>")')).toBe(56);
    // An operator still waiting for its argument keeps the step it is on.
    expect(getStrudelLoopCycles('s("<bd*[2 3] sd>")')).toBe(2);
    expect(getStrudelLoopCycles('s("<bd(3,8) sd>")')).toBe(2);
  });

  it('keeps an alternation inside a long slot as detail rather than as form', () => {
    // A slot spanning 16 cycles has room to run its own alternation inside it:
    // that is detail within the section, the same way an alternation inside an
    // `arrange` section is. Multiplying the form by it is what reported Home —
    // two minutes of music — as twenty days.
    expect(getStrudelLoopCycles('note("<a@16 [b <c d>]*2@16 e@24>")')).toBe(56);
    // A single-cycle slot has nowhere to put one but the next pass of its
    // parent, so there it still multiplies.
    expect(getStrudelLoopCycles('note("<a@2 [b <c d>]>")')).toBe(6);
  });

  it('gives every cat slot a cycle of its own', () => {
    // `cat` is slowcat: one argument to a cycle, then back to the top. Veridis
    // Quo's flute is sixteen of them written one phrase to a line, which reads
    // as a list and was counted as a single cycle — a 33-second tune reported
    // as an 8-second one.
    expect(getStrudelLoopCycles('cat(note("a"), note("b"), note("c"))')).toBe(3);
    expect(getStrudelLoopCycles('slowcat(s("bd"), s("sd"))')).toBe(2);
    // What is inside a slot belongs to that slot, and still has to line up.
    expect(getStrudelLoopCycles('cat(n("<0 1>"), n("2"), n("3"))')).toBe(6);
    expect(getStrudelLoopCycles('cat(stack(s("bd"), s("hh*4")), s("sd"))')).toBe(2);
    // `fastcat`/`seq` fit their arguments into one cycle and change nothing.
    expect(getStrudelLoopCycles('fastcat(s("bd"), s("sd"), s("hh"))')).toBe(1);
    expect(getStrudelLoopCycles('cat(s("bd"))')).toBe(1);
  });

  it('scales a layer by chained slow/fast and fits every/iter into the loop', () => {
    expect(getStrudelLoopCycles('note("<a b c>").slow(4)')).toBe(12);
    expect(getStrudelLoopCycles('note("<a b c d>").fast(2)')).toBe(2);
    expect(getStrudelLoopCycles('s("bd*4").every(6, fast(2))')).toBe(6);
  });

  it('scales each $voice on its own rather than compounding them', () => {
    // The `$name:` idiom declares one pattern per statement, and a `.slow(2)`
    // at the end of one stretches that voice and no other. Read as a single
    // expression the scalings multiply instead: Megalovania's four voices, each
    // ending in `.slow(2)`, made 16 out of every cycle and reported half a
    // minute of music as eight and a half.
    const voices = `setcps(1)
$lead: note("<a b c d>").slow(2)
$chords: note("<e f g a>").slow(2)
$bass: note("<c g>").slow(2)`;

    expect(getStrudelLoopCycles(voices)).toBe(8);
    // One voice alone has nothing to be kept apart from, and still scales the
    // script it is the whole of.
    expect(getStrudelLoopCycles('$: note("<a b c>").slow(2)')).toBe(6);
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

  it('takes an arrangement as the whole form, not as one of its sections', () => {
    // What the 360 cover is built on: sections played in order, and a
    // sub-arrangement inside one voice. Read as alternations it came out 32
    // cycles — its opening section — which both halved the read-out and
    // squeezed a seek into the first two minutes of a two-and-a-half.
    const code = `let lead = arrange(
  [3, "<[e3 c4] [e3 f3]>*4"],
  [1, "<[g3 b3] [g3 a3]>*4"],
).note();

arrange(
  [32, lead],
  [8, lead],
  [8, lead],
  [4, lead],
  [4, lead],
  [8, lead],
  [8, lead],
  [4, lead],
).cpm(30)`;

    expect(getStrudelLoopCycles(code)).toBe(76);
    expect(formatPlaybackTime(getStrudelLoopDurationSeconds(code))).toBe('02:32');
  });

  it('leaves code without an arrangement to the layer scan', () => {
    expect(getStrudelLoopCycles('s("bd*4")')).toBe(1);
    // `arrange` named in a comment is not an arrangement.
    expect(getStrudelLoopCycles('// arrange([8, x])\ns("bd*4")')).toBe(1);
  });

  it('formats playback time as zero-padded minutes and seconds', () => {
    expect(formatPlaybackTime(0)).toBe('00:00');
    expect(formatPlaybackTime(96.9)).toBe('01:36');
  });
});
