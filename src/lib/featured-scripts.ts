/**
 * The scripts the Featured page plays.
 *
 * Kept apart from `featured-pieces.ts` because a piece's metadata is a dozen
 * lines and its script is hundreds: with both in one module, the list of what
 * the collection actually holds was buried. That file is the collection; this
 * one is the code it carries.
 *
 * Every script here is someone else's work, kept as close to verbatim as it can
 * be and still run in this app. Where a line had to change, the comment above
 * the script says which and why. Two edits recur:
 *
 *  - **Tempo.** `setcps` is global to a scheduler and outlives whatever set it,
 *    so a piece that leaves its tempo to the engine plays at whatever ran
 *    before it. `setcpm(N/4)` is no defence: `cpm` is a factor *relative* to
 *    the current cps, so it lands on the right tempo only when the cps already
 *    happened to be right. Every script pins its own tempo with a literal
 *    `setcps`, and a test in `featured-pieces.test.ts` holds that.
 *
 *  - **Display calls.** The underscored visualizers an author reaches for —
 *    `._pianoroll()`, `._scope()` — stay in, along with the `.color()` that
 *    tints them: each draws into a canvas of its own, keyed by a widget id the
 *    transpiler hands it, so they are the author's picture of the piece and are
 *    ours to place. Nothing places them on the Featured page itself: it runs a
 *    bare `repl()`, which has no `Drawer`, so those canvases are built
 *    detached and never painted there — the calls read in the code window and
 *    do nothing else on that page.
 *
 *    `.punchcard()` and the other un-underscored visualizers, plus `.theme()`,
 *    are painters too — `.punchcard()` etc. draw onto a canvas, and `.theme()`
 *    recolours syntax — both driven by a `Drawer`. The Studio's own code panel
 *    now carries one (`codepanel-canvas.ts`, `codepanel-theme.ts`), so a piece
 *    that keeps these calls gets them painted for real once opened there; on
 *    the Featured page's bare `repl()` they still just register and do
 *    nothing, same as the underscored ones. Kept only where the original
 *    script shipped with them — see the 360 cover below. `.fontFamily()` is
 *    not a Pattern method in any package this app ships at all, and throws
 *    before a note sounds — that one is never a thing to write into a script.
 *
 * Past those, the only thing touched is whitespace: trailing spaces come off and
 * runs of blank lines collapse to one, so a script reads the same in the page's
 * code window as it does here.
 */

/**
 * KAIXI's 360 cover, verbatim from the Strudel permalink apart from
 * `.fontFamily(…)`, dropped from the original's closing display chain —
 * `.theme(…).color(…).fontFamily(…).punchcard({…})` — because it is not a
 * Pattern method here and throws before a note sounds. The rest of that
 * chain stays: dead weight on the Featured page's own bare `repl()`, but
 * painted for real once opened in the Studio, whose code panel now carries
 * its own Drawer (see the file-level comment above).
 *
 * The samples are loaded from the artist's repository on first play, the way
 * the original does it.
 *
 * The one musical edit: the original sets its tempo with `.cpm(120/4)` on three
 * separate patterns — the instrumental, the vocals, and the arrangement that
 * carries both — and those factors are 1.0 only when cps already happens to be
 * 0.5. Arriving here from a studio piece at `setcps(0.3)` made each factor
 * 0.5/0.3 and the nested pair 2.78, so the cover played back half again too
 * fast. One `setcps(0.5)` at the top says the same tempo and cannot be knocked
 * off it.
 */
export const CHARLI_XCX_360 = `/*
  @title Charli xcx - 360 (cover / remix)
  @by KAIXI
  @details Brat  and it's  the same  but 
           we're live coding so it's not
*/

// 120 BPM in 4/4 — one cycle is one bar, two seconds long.
setcps(0.5);

samples({
  camera_flash: '360_camera_flash.wav',
  vox: '360_vocals.wav'
}, 'https://raw.githubusercontent.com/kai-xi/360/main/samples/');

// section 1: intro
let lead_synth = arrange(
  [3, "<[[e3,b3] - c4 -] [e3 - f3 c4] [- c4 a4 -] [- - - -]>*4"],
  [1, "<[- - [g3,b3] -] [g3 - a3 c4] [- c4 c5 -] [c4 - g4 -]>*4"]
)
  .note().sound("sawtooth")
  .attack(0).decay(.25).sustain(0).release(.3)
  .lpf(300).lpq(0).lpenv(3).lpa(0).lpd(.15).lps(0)
  .delay(.2).delaytime(.25).delayfeedback(.1);

let section_1 = lead_synth;

// section 2: i went my own way and i made it
let bass = arrange(
  [2, "<[e2 -] [- - e2 f2] [- f1] [-]>*4"],
  [1, "<[- e2] [e2 - e2 f2] [- f1] [-]>*4"],
  [1, "<[g2 -] [g2 - g2 a2] [-] [-]>*4"],
)
  .note().sound("gm_synth_bass_2:0")
  .attack(0).decay(.5).release(.3)
  .lpf(1800);

let sub_bass = bass.transpose(-12);

let bass_drum = arrange(
  [2, "<[bd -] [- - bd bd] [- bd] [-]>*4"],
  [1, "<[- bd] [bd - bd bd] [- bd] [-]>*4"],
  [1, "<[bd -] [bd - bd bd] [-] [-]>*4"],
)
  .sound().bank("RolandTR808").gain(1.5);

let clap = arrange(
  [4, "<[-] [cp] [-] [cp]>*4"]
)
  .sound().bank("RolandTR808").gain(1.15);

let drums = stack(bass_drum, clap);
 
let section_2 = stack(lead_synth, bass, sub_bass, drums);

// section 3: drop down, yeah
let lead_saw = arrange(
  [4, "<[g4 - g4 g4] [g4 g4@2 g4] [g4 g4 g4@2] [g4@2 g4 g4]>*4"]
)
  .note().sound("gm_lead_2_sawtooth:0")
  .attack(0).decay(.3).sustain(0).release(.15)
  .lpf(3000).lpenv(10).lpa(0).lpd(.25).lps(0).lpr(0)
  .gain(.25);

let camera_flash = s("<[- [- camera_flash] - -] [-]>/4");
let section_3 = stack(
  lead_synth, 
  bass,
  sub_bass,
  drums.mask("<[1 [1 0] 1 1] [1 1 1 [1 0]]>/4"),
  lead_saw.mask("<1 [1 1 1 [1 0]]>/4"),
  camera_flash
);

// section 4: yeah, 360
let section_4 = stack(
  lead_synth, 
  bass.lpf("<20000 [20000 20000 20000 500]>/4"), 
  sub_bass.lpf("<20000 [20000 20000 20000 500]>/4"), 
  drums.mask("<1 [1 1 1 [1 0]]>/4")
);

// section 5: bumpin' that
let bass_modified = arrange(
  [1, "<[e2 -] [- - e2 f2] [- f1] [-]>*4"],
  [1, "<[e2 -] [- - e2 f2] [- f1] [e2 e2 e2 -]>*4"],
  [1, "<[e2 e2] [- - e2 f2] [- f1] [-]>*4"],
  [1, "<[g2 -] [g2 - g2 a2] [-] [-]>*4"],
)
  .note().sound("gm_synth_bass_2:0")
  .attack(0).decay(.5).release(.3)
  .lpf(1800);

let sub_bass_modified = bass_modified.transpose(-12);

let bass_drum_modified = arrange(
  [1, "<[bd -] [- - bd bd] [- bd] [-]>*4"],
  [1, "<[bd -] [- - bd bd] [- bd] [bd bd bd -]>*4"],
  [1, "<[bd bd] [- - bd bd] [- bd] [-]>*4"],
  [1, "<[bd -] [bd - bd bd] [-] [-]>*4"],
)
  .sound().bank("RolandTR808").gain(1.5);

let section_5 = stack(
  lead_synth, 
  bass_modified,
  sub_bass_modified,
  bass_drum_modified,
  clap.mask("<1 [1 1 1 [1 0]]>/4"),
  lead_saw.mask("<[1 1 1 [1 0]]>/4")
);

// instrumental arrangement
let instrumental = arrange(
  [4, section_1],
  [8, section_2],
  [8, section_3],
  [8, section_4],
  [4, section_5]
);

// slicing the vocals so it stops playing after each cycle
let vocals = s("vox")
  .slice(32, 
         "<0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31>");

// cover (1st half of the song)
let cover = stack(instrumental, vocals);

// WORKING IT OUT ON THE REMIX !!!
// extending section 5
let section_5_ext = stack(
  lead_synth, 
  bass,
  sub_bass,
  bass_drum,
  clap.mask("<1 [1 1 1 [1 0]]>/4"),
  lead_saw.mask("<1 [1 1 1 [1 0]]>/4")
);

// bumpin' that
let vox_chop_1 = s("vox").slice(32, "<30 30 30 30>");
// ah-ah ah-ah-ah
let vox_chop_2 = 
    s("<- - - vox>").begin((27*4 + 1)/(32 *4)).end("0.89").late(1/4).gain(.8);

let remix_vox = arrange(
  [4, stack(vox_chop_1.mask("<1 1 1 1 1 1 1 0>"), vox_chop_2.mask("<0 1>/4"))]
);

// section 6
let hihats = arrange(
  [4, "<[hh - hh hh] [hh hh@2 hh] [hh hh hh@2] [hh@2 hh hh]>*4"]
)
  .sound().bank("RolandTR808").gain(.85);

let section_6 = stack(
  bass_modified, 
  sub_bass_modified, 
  bass_drum_modified,
  clap.mask("<1 [1 1 1 [1 0]]>/4"),
  hihats.mask("<1 [1 1 1 [1 0]]>/4")
);

// section 7
let bass_modified_2 = arrange(
  [1, "<[e2 -] [- - e2 f2] [- - f1 -] [-]>*4"],
  [1, "<[e2 -] [- - e2 f2] [- - f1 -] [e2 e2 e2 -]>*4"],
  [1, "<[e2 e2] [- - e2 f2] [- - f1 - ] [-]>*4"],
  [1, "<[g2 -] [g2 - g2 a2] [-] [-]>*4"],
).transpose(24).gain(1.1)
  .note().sound("gm_fx_brightness:4")
  .attack(0).decay(.5).release(.3)
  .lpf(8000).lpa(0).lpd(.08).lpq(10);

let section_7 = stack(
  bass_modified_2,
  sub_bass_modified,
  clap.mask("<1 [1 1 1 [1 0]]>/4")
);

// section 8
let bass_modified_3 = arrange(
  [1, "<[e2 -] [- - e2 f2] [- f1] [-]>*4"],
  [1, "<[e2 -] [- - e2 f2] [- f1] [e2 e2 e2 -]>*4"],
  [1, "<[e2 e2] [- - e2 f2] [- f1] [-]>*4"],
  [1, "<[g2 -] [g2 - g2 a2] [-] [-]>*4"],
).transpose(24)
  .note().sound("gm_lead_2_sawtooth:0")
  .attack(0).decay(.4).release(.3)
  .lpf(500).lpa(0).lpd(.03).lpq(0);

// 360
let vox_chop_3 = s("<vox - - ->*4").begin(79 / (32 * 4)).end((0.630)).gain(.5);

let section_8 = stack(
  bass_modified_3.lpf("<500 600 700 [[800 [1000 1200]] 1200]>"),
  sub_bass_modified,
  clap.mask("<1 [1 1 1 [1 0]]>/4")
);

// section 9
let section_9 = stack(section_5, hihats.gain(.8).mask("<1 [1 1 1 [1 0]]>/4"));

// down
let vox_chop_4 = s("vox").slice(32 * 4, "<- 50 - 50 - 50 - 50>*4");
// bumping that beat
let vox_chop_5 = s("<- - - - vox@2 vox@2>*4").begin(99 / (32 * 4)).end(0.7852)
  .delay(.2).delaytime(.25).delayfeedback(.1);
// i'm everwhere, i'm so julia
let vox_chop_6 = s("vox").slice(32 * 4, "<- - - - 89 90 91 92>*4").gain(.8);

arrange(
  [32, cover],
  [8, stack(section_5_ext, remix_vox.lpf("<1500 1500 1500 1500 1500 1500 1500 2000>"))],
  [8, stack(section_6)],
  [4, stack(section_7)],
  [4, stack(section_8, vox_chop_3.lpf("<600 1000 1350 0>").mask("<1 1 1 0>"))],
  [8, stack(
    section_9, 
    vox_chop_4.mask("<[1 0] [1 0] [1 0] [1 0]>/2"), 
    vox_chop_5.mask("<[0 1] [0 1] [0 1] [0 0]>/2"), 
    vox_chop_6.lpf(1500).lpa(.25).lpd(.25).pan(sine).mask("<[0 0] [0 0] [0 0] [0 1]>/2"), 
    vox_chop_2.mask("<0 1>/4")
  )],
  [8, stack(section_5, remix_vox.mask("<1 1 1 0 1 1 1 1>"))],
  [4, vox_chop_1.delay(.25).delayt(.5).dfb(.2).mask("<1 0 0 0>")]
)
  .theme("<[greenText whitescreen] [blackscreen whitescreen]>/2")
  .color("[#99CC3E #FFFFFF]")
  .punchcard({
    vertical: 1, flipTime: 1, fold: 0, stroke: 1,
    playheadColor: 'rgba(0, 0, 0, 0)'
  });

// @version 1.2`;

/**
 * eefano's Stranger Things, verbatim from `strangerthings.js` in their
 * collection. Eleven lines — an arpeggio and a bass note — and everything that
 * makes it the title sequence is what perlin noise does to the filter over the
 * top. Only the comment above `setcps` is ours; the tempo it states was
 * already there.
 */
export const STRANGER_THINGS = `// 168 BPM in 4/4 — one cycle is one bar.
setcps(0.7);

p1: n("0 2 4 6 7 6 4 2")
  .scale("<c3:major>/2")
  .s("supersaw")
  .distort(0.7)
  .superimpose((x) => x.detune("<0.5>"))
  .lpenv(perlin.slow(3).range(1, 4))
  .lpf(perlin.slow(2).range(100, 2000))
  .gain(0.3);
p2: "<a1 e2>/8".clip(0.8).struct("x*8").s("supersaw").note();`;

/**
 * Pyramid Song, verbatim — including the `(wip)` eefano marks it with, and
 * their own `setcps(104/60/4)`.
 *
 * It registers a `split` function of its own, names its seven chords X…W, and
 * then spells the song out as a sequence of those letters, which is how a
 * piece this long fits in forty lines.
 */
export const PYRAMID_SONG = `// "Pyramid Song (wip)"
// song @by Radiohead
// script @by eefano
setcps(104/60/4)
const split = register('split', (deflt, callback, pat) => callback(deflt.map((d,i)=> pat.withValue((v)=>{
  const isobj = v.value !== undefined; const value = isobj ? v.value : v;
  const result = Array.isArray(value)?(i<value.length?value[i]:d):(i==0?value:d);
  return (i==0 && isobj) ? {...v,value:result} : result; }))));

let chr = {X:"f#2,c#3,a#3,c#4,f#4", Y:"g2,d3,b3,d4,f#4", Z:"a2,e3,a3,c#4,f#4", J:"g2,d3,b3,d4,g4", K:"f#2,c#3,a#3,c#4,g4",
           V:"f#2,c#3,a3,c#4,f#4", W:"e2,b2,g#3,b3,f#4"}

piano: "<[i1 i2 i3 i4] ooooh [v1 v2]!4 ooooh@2 [v1 v2]!3 [v1 v3] [v3 v2] [i1 i2 i3 i2] [i3 i2 i3 i2] end>/8".pickRestart(
 {i1:\`<[[X:.6 X:.8]@3 Y:.5@2 [Z:.5 Z:.5]@3]>/2\`, i2: \`<[[Z:.4 Y:.4]@3 Y:.3@2 [J:.6 J:.9]@3]>/2\`,
  i3:\`<[[K:.8 X:.6]@3 Y:.5@2 [Z:.5 Z:.5]@3]>/2\`, i4: \`<[[Z:.4 Y:.4]@3 Y:.4@2 [Y:.4 Y:.7]@3]>/2\`,
  ooooh:\`<[[X X]@3 Y@2 [Z Z]@3] [[Z Y]@3 Y@2 [X X]@3] [[X X]@3 Y@2 [Z Z]@3] [[Z Y]@3 Y@2 [Y Y]@3]>/2\`,
  v1:\`<[[X X]@3 Y@2 [Z Z]@3] [[Z Y]@3 Y@2 [X X]@3]>/2\`,
  v2:\`<[[V V]@3 W@2 [W W]@3] [[Y Y]@3 Y@2 [Y Y]@3]>/2\`,
  v3:\`<[[V V]@3 W@2 [W W]@3] [[Y Y]@3 X@2 [X X]@3]>/2\`,
  end:\`<X:1>/8\`,
 }).split([0,.5],(x)=>x[0].pickOut(chr).velocity(x[1])).note().piano().gain(0.8).room(.6)

ooooh: "<~ 0 ~@4 0@2 ~@8>/8".pickRestart([
  "<f#5@11 e5:-2 g#5:4 e5:-4 [f#5:2 ~] [~ g#5 e5] f#5@4 g#5 f#5 e5 d5 c#5@5 ~@3>*4"
  ]).split([0,0],(x)=>x[0].penv(x[1])).patt(0.04).s("triangle").attack(.08).release(.08).note().vmod(.1).vib(5).gain(0.3).lpf(2000).room(1.5)

drums: "<~@6 [~@15 0@15 1@2] [2,3]@8 3>/8".pick([
  "<[bd,rd] ~ [~ sf*3] [bd,rd] ~ [~ sf*3] [bd,rd] ~ ~ [~ sf*3] [bd,rd] ~ [~ sf*3] [bd,rd] ~ [~ sf*3]>*8",
  "<[sd sf bd] [sf sd sd]>*4",
  "<[rd*4],[<~ ~ ~ bd ~ bd ~ ~ bd ~ bd ~ ~ bd ~ bd> <~!14 sf!2> <~ sd bd ~ sd ~ sd bd ~ sd ~ ~ sd ~ sd sd>]*4>",
  "<cr,bd>/8",
]).pickOut({
  bd: s('bd').bank('Linn9000').lpf(1000),
  sd: s('sd').bank('RolandMT32').velocity(.5),
  sf: s('sd').bank('RolandMT32').velocity(.2),
  rd: s('rd').bank('Linn9000').velocity(0.3).hpf(8000),
  mt: s('mt').bank('RolandMT32'),
  lt: s('lt').bank('RolandMT32'),
  cr: s('cr').bank('Linn9000').speed(0.4).velocity(0.3).hpf(4000),
}).room(.2).gain(0.5)`;

/**
 * Claffystic's Determination, from the permalink the collection links to.
 *
 * One edit: `setcpm(115 / 4)` became `setcps(115/60/4)` — the same tempo, said
 * in the way that cannot be knocked off it. The header comment is the author's
 * and stays as written: it says this is unofficial fan-made work, and who the
 * song belongs to.
 */
export const DETERMINATION = `/*@Determination · Toby Fox(cover)
  @by Claffystic
  @details: This is an unofficial fanmade content. I made this to learn about Strudel and that's it.
            Reference: https://soundcloud.com/radixan/undertale-determination-midi-in-description
            Pulled from YouTube description below. (https://www.youtube.com/watch?v=sRLQnlglfrI)

  Determination · Toby Fox
  UNDERTALE Soundtrack
  ℗ Toby Fox under license to Materia Collective
  Released on: 2015-09-15
  Producer: Toby Fox
  Music  Publisher: Materia Collective Music Publishing
  Composer: Toby Fox
*/

// 115 BPM in 4/4 — one cycle is one bar.
setcps(115/60/4)

$lead: note(\`<
[F#5 F5 D#5 C#5 D#5 A#4 C5 ~]
[G#4 ~ D#5 F5 F#5 ~ G#5 ~]
[C#6 ~ A#5@5 ~]
[F#5 F5 D#5 C#5 D#5 A#4 C5 ~]
[G#4 ~ D#4 F4 F#4 ~ F4 ~]
[C#4 ~ D#4@5 ~]

[F#5 F5 D#5 C#5 D#5 A#4 C5 ~]
[G#4 ~ D#5 F5 F#5 ~ G#5 ~]
[C#6 ~ A#5@5 ~]
[F#5 F5 D#5 C#5 D#5 A#4 C5 ~]
[G#4 ~ D#4 F4 F#4 ~ F4 ~]
[C#4 ~ D#4@5 ~]

[[G#5,F5] [F#5,D#5] [E5,C#5] [D#5,B4] [C#5,A#4] [E5,C#5] [D#5,A#4] ~]
[[A#4,F#4] ~ [A#4,F#4] [D#5,A#4] [G#5,E5] [F#5,D#5] [E5,C#5] [D#5,B4]]
[[C#5,A#4] [E5,C#5] [D#5,A#4]@3 ~ [D#4,A#3] [G#4,D#4]]
[[C#5,A#4] [C5,G#4] [A#4,F#4] [G#4,F4] [A#4,F#4] [C5,G#4] [A#4,F#4] ~]
[[D#4,A#3] ~ [D#4,A#3] [F4,C#4] [F#4,D#4] ~ [B4,F#4] ~]
[[D#5,B4]@2 [D5,A#4]@4 ~@2]

[[G#5,F5] [F#5,D#5] [E5,C#5] [D#5,B4] [C#5,A#4] [E5,C#5] [D#5,A#4] ~]
[[A#4,F#4] ~ [A#4,F#4] [D#5,A#4] [G#5,E5] [F#5,D#5] [E5,C#5] [D#5,B4]]
[[C#5,A#4] [E5,C#5] [D#5,A#4]@3 ~ [D#4,A#3] [G#4,D#4]]
[[C#5,A#4] [C5,G#4] [A#4,F#4] [G#4,F4] [A#4,F#4] [C5,G#4] [A#4,F#4] ~]
[[D#4,A#3] ~ [D#4,A#3] [F4,C#4] [F#4,D#4] ~ [F4,C#4] ~]
[[C#4,G#3]@2 [D#4,A#3]@4 ~@2]

[~@8]
>\`).sound("square").room(.5).roomsize(6).gain(.25).detune("[-5, 5]")

$harmony: note(\`<
[~ D#4 F#4 G#4 A#4 F#4 ~ G#4]
[C5 D#5 C5 G#4 ~ D#4 F4 D#4]
[G#4 F4 F#4 F4 D#4 C#4 D#4 A#3]
[~ D#4 F#4 G#4 A#4 F#4 ~ D#4]
[F#4 G#4 A#4 F#4 ~ D#4 F4 A#4]
[F4 C#4 F#4 F4 D#4 C#4 D#4 F4]

[~ D#4 F#4 G#4 A#4 F#4 ~ G#4]
[C5 D#5 C5 G#4 ~ D#4 F4 D#4]
[G#4 F4 F#4 F4 D#4 C#4 D#4 A#3]
[~ D#4 F#4 G#4 A#4 F#4 ~ D#4]
[F#4 G#4 A#4 F#4 ~ D#4 F4 A#4]
[F4 C#4 F#4 F4 D#4 C#4 D#4 A#3]

[G#3 D#4 G#4 F#4 A#4 G#4 F#4 G#4]
[D#4 F#4 C#4 D#4 G#3 D#4 G#4 F#4]
[A#4 G#4 F#4@3 ~@3]
[~ D#3 C#4 A#3 G#4 F4 D#4 F4]
[F#4 F4 d#4 F4 F#4 ~@3]
[B4 ~ G#4 F#4 F4 D#4 D4 F4]

[G#3 D#4 G#4 F#4 A#4 G#4 F#4 G#4]
[D#4 F#4 C#4 D#4 G#3 D#4 G#4 F#4]
[A#4 G#4 F#4@3 ~@3]
[~@8]
[~@2 D#4 F4 F#4 ~ F4 ~]
[C#4@2 D#4@4 ~@2]

[~@8]
>\`).sound("triangle").gain(.35).shape(.2)

$bass: note(\`<
[D#2@4 F#2@2 G#2@2]
[G#2@2 G#1@2 B1@2 C#2@2]
[F#2@2 D#2@4 C#2@2]
[D#2@4 F#2@2 G#2@2]
[G#2@2 D#2@2 F#2@2 F2@2]
[C#2@2 D#2@4 C#2@2]

[D#2@4 F#2@2 G#2@2]
[G#2@2 G#1@2 B1@2 C#2@2]
[F#2@2 D#2@4 C#2@2]
[D#2@4 F#2@2 G#2@2]
[G#2@2 D#2@2 F#2@2 F2@2]
[C#2@2 D#2@4 ~@2]

[F2@4 C#2@2 D#2@2]
[D#2 ~ D#2@2 E2@4]
[C#2@2 D#2@3 ~@3]
[A#1@4 C#2@2 D#2@2]
[D#2@2 C#2@2 B1@2 ~@2]
[D#3 ~ D3@2 B2@2 A#2@2]

[E2@4 C#2@2 D#2@2]
[D#2 ~ D#2@2 E2@4]
[C#2@2 D#2@3 ~@3]
[G#2@4 ~@2 D#2@2]
[D#2@2 ~@2 F#2 ~ F2 ~]
[C#2@2 D#2@6]

[~@8]
>\`).sound("square").gain(.3)`;

/**
 * tzwaan's Home, the full transcription rather than the four-bar sketch that
 * stood here before it.
 *
 * Two edits. `setCpm(110/4)` became `setcps(110/240)` — the same tempo, said in
 * the way the parser can read and the engine cannot be knocked off. And the
 * four voices, written as four anonymous `$:`, are named `$chords`, `$tempo`,
 * `$bass` and `$melody`: every voice here is the same nylon guitar, so the
 * piece's page has nothing but the name to tell them apart by, and four rows
 * reading `$` tell a reader nothing. `$name:` is what `$:` compiles to anyway —
 * a pattern registered under a name instead of a number — so this changes
 * which word is on the row, and nothing about what sounds.
 *
 * The silent hi-hat is not a mistake. `s("hh*16").gain(0)` sounds nothing; it
 * exists to carry `.cps()`, which is how this transcription breathes — the
 * tempo drifts around 110 with a sawtooth whose ends are two perlin noises, and
 * steps to 124 and 115 for the later sections. Muting that voice would stop the
 * piece rubato-ing, not quiet it, so its `gain(0)` and `o(3)` (an orbit of its
 * own, away from the guitar) stay as written.
 *
 * `all(…)` at the end is what makes every voice a nylon guitar: two soundfont
 * layers, a 3-second release and a half room, applied to all four patterns at
 * once.
 */
export const HOME = `// @title Home
// @by Toby Fox
// transcribed @by tzwaan

setcps(110/240)

$chords: note("<0!2 1 0!3 1 - 0!4 2 3 4 5 0!5 6 0 7 0 1!2 8 0!2 9 -[0!2 10!2 11!2 0 12 0 0[10 0 _]0!3[0 13]0]*2@32 -@48>*2".pick([
"0,5,7","0,5,12","2,5,12","2,5,7","17,16,12","5,7,5","12,7,5",
"12,0,5","10,9,5","5,7,12","4,7,12","2,5,10","-5,0,4","2,5,9"
]).add("e3"))
.seg(8).arp("<0!16[[1[- 1!3]!2 0[1 2 _][2 1 _]]@6<[0 3][[2 -][2[- 0]]3 3]>@2]*2@16 -@24>".pick([
"[- - 0 1 - 2]*2",
"- - 0 1 - 2 - - 1 0 - -",
"0 1 2 0",
"- - 0 1 - 2 2 - 1 0 - -"
])).gain(.6).clip(3)

$tempo: s("hh*16").gain(0).o(3)
.cps("<110!32 124!16 115!8>".div(240).mul(saw.range(perlin.range(1.1, .9).seg(2), perlin.range(.6, .7).fast(4).seg(2)).fast(8))).early(3/32)

$bass: note(\`<
[5<9!6[9@11 9][9@2 9]><8 10 8 8[8@3[8 _ 7]][8[7@5 5]][8@11 7][10[7@5 5]]><- -[<8 7>@5<7[7,17]>@7]*2@2[- -[0 7@3]]-[- -[0 12@3]]->]*8@32
[[10 17]!3<[10 17@3][10 17]>[9 17]!2[8 15][8 15@3]<[[7 14]!2[12 17][12 17@3][13@2 17@3]@2 14 12][7 12 13[[14,- 17@30][12,- 16@30]]]>@8]*2@16
[[10,- 17@30]@3[12,- 19@20]]*2@4[<10 9 8 7>,-<14 14 15 14>@30,- 17@20]*4@4>\`.add("e2"))

$melody: note(\`<
-@16[[0 12 _]7<[5 12 _][5[12 _ 0]]><0 ->[0 5][12 14 _][12[7 _ 5]]-]*2@16
[0[12 9][7 5]<[4 5@3][4 5]>7[16 15 14]12 - 2[12 9][7 5]<[7 9@3][7 9]>4 7[7 5][4 5]]*2@16
[0@3[-2 0]]@2[-3@3[-5 -3]]@2 -7!3[-7[-7 -8]]>\`.add("e4")).swingBy("<.3@32 0@24>",2).clip(2)

all(x => x.s("gm_acoustic_guitar_nylon:[0,8]").rel(3).room(.5))`;

/**
 * MariaAreadne's Megalovania, from the file in their repository. It stands in
 * for the two-line sketch that was here before it, which was credited to
 * tzwaan; this is a different person's transcription and is credited to them.
 *
 * Two edits. `setcpm(60)` became `setcps(120/60/2)` — the same tempo, said in
 * the way the parser can read. The arithmetic is the piece's own meter: every
 * voice ends in `.slow(2)`, so a written bar spans two cycles, which puts two
 * beats in a cycle rather than the four the collection is otherwise written
 * in. `beatsPerCycle: 2` on the piece is what tells the page the same thing.
 *
 * And the four voices, written as four anonymous `$:` beside a named
 * `$drums:`, are named `$lead`, `$chords`, `$guitar` and `$bass`, so the
 * piece's page has something to call them other than `$` four times over.
 *
 * The `._pianoroll()` on every voice is the author's, and so is the `.color()`
 * that tints two of them, and the `.lpf(450)` commented out mid-chain.
 */
export const MEGALOVANIA = `// "Megalovania" @by MariaAreadne

setcps(120/60/2)

$lead: "<0!8 1!8>".pick([
  note("<d3*2 c3*2 b2*2 bb2*2>@2 d4@2 a3@3 ab3@2 g3@2 f3@2 d3 f3 g3"),
  note("<d5*2 c5*2 b4*2 bb4*2>@2 d6@2 a5@3 ab5@2 g5@2 f5@2 d5 f5 g5")
]).s("saw")
.lpq(10).room(0.25).delay(0.2).clip(.7).delaytime(0.125).pan("0.7 0.7".fast(2))
  .slow(2)
.delayfeedback(0.35).shape(0.4).gain(0.7).orbit(0.9).attack(0.02)._pianoroll()

$chords: chord("<Dm C Bm [Bb C]>")
  .struct("x@2 x x x@2 x x ").clip(0.9).delay(0.5)
   .dict("ireal")
   .voicing()
   .s("gm_synth_bass_1").slow(2)
   .lpf(sine.slow(16).range(700, 2200))
   .room(0.5)._pianoroll()

$guitar: note("<d2 c2 b1 [bb1 c2]>")
   .struct("x ~ x ~ x x ~ x ~ x ~ x ~ x x x")
   .s("gm_electric_guitar_clean")
  // .lpf(450)
   .shape(0.7).slow(2)
   .room(0.1).color("blue")._pianoroll().add(note(12))

$bass: note("<d2 c2 b1 [bb1 c2]>")
   .struct("x ~ x ~ x x ~ x ~ x ~ x ~ x x x")
   .s("sawtooth")
   .lpf(450)
   .shape(0.3).slow(2)
   .room(0.1).color("blue")._pianoroll()

$drums:
stack(
  s("[bd,cr] - - - bd - - - bd - - bd - bd oh -").bank("AkaiLinn").gain(1.0),
  s("- sd sd - sd - sd - - sd sd sd - sd sd sd").s("akailinn_sd").room(0.7),
  s("hh hh - hh hh hh - hh hh hh hh hh hh - hh -").s("9000_hh").gain(0.75).late(0.005).lpf(4500)
).slow(2)._pianoroll()`;

/**
 * Flowhacker's Super Mario Bros. theme, from the permalink the collection links
 * to. The whole song is written out section by section for three NES voices —
 * two squares and a triangle — with noise for percussion, and `arrange` plays
 * the sections in order. The `muteSquare1`…`muteNoise` switches at the top are
 * the author's own soloing controls, left in.
 *
 * Two edits. `setcpm(200/4)` became `setcps(200/60/4)`. And the three voice
 * helpers, which the author wrote below the arrangement that calls them, are
 * lifted above it: @strudel/transpiler throws "unexpected ast format without
 * body expression" unless the last top-level statement is an expression, and a
 * function declaration is not one. Hoisting means this changes nothing about
 * what runs — it only lets the script be evaluated at all.
 *
 * The `._scope()` on each of the seventeen sections is the author's — an
 * oscilloscope is how you watch a chiptune voice being a square wave — and
 * stays.
 */
export const SUPER_MARIO_BROS = `/*
    @title Mario theme
    @by Flowhacker
    Original song composed by Koji Kondo
*/

// 200 BPM in 4/4 — one cycle is one bar.
setcps(200/60/4)

const muteSquare1 = false;
const muteSquare2 = false;
const muteTriangle = false;
const muteNoise = false;

let whitenoise =
  stack(
    sound("pink").decay(.03).velocity(3.2),
    sound("white").struct("- x").fast(2).decay(.02),
    sound("white").struct("- - - x").lpf(2000).fast(2).decay(.01),
    sound("white").struct("- - x -").hpf(400).decay(.12)
    )

let whitenoise_bridge =
  stack(
    sound("white").struct("- <- x> <<x -> <- x>> <- <- x>>").fast(2).decay(.04),
    sound("white").struct("x [- x] - <x ->").hpf(400).decay(.14)
    )

if (muteNoise) {
  whitenoise = whitenoise.postgain(0)
  whitenoise_bridge = whitenoise_bridge.postgain(0)
}

// === === === === === === === === === === === === === === === === === === ===
// Intro
// === === === === === === === === === === === === === === === === === === ===
const square1_intro = \`<
[[E E] [- E] [- C] [E -]]
  [[G -] [- -] [G2 -] [- -]]
>\`.add("24")

const square2_intro = \`<
  [[Gb2 Gb2] [- Gb2] [- Gb2] [Gb2 -]]
  [[B2 -] [- -] [- -] [- -]]
>\`.add("24")

const triangle_intro = \`<
  [[D D] [- D] [- D] [D -]]
  [[G4 -] [- -] [G -] [- -]]
>\`

// === === === === === === === === === === === === === === === === === === ===
// PART A
// === === === === === === === === === === === === === === === === === === ===
const square1_A = \`<
  [[C4 -] [- G] - [E -]]
  [[- A] [- B] [- Bb] [A -]]
  [[G E4 G4] [[A4@3 -] [F4 G4]]]
  [[- E4] [- C4] [D4 B] -]
>\`.add("12")

const square2_A = \`<
  [[E -] [- C] - [G2 -]]
  [[- C] [- D] [- Db] [C -]]
  [[C G B] [[C4@3 -] [A B]]]
  [[- A] [- E] [F D] -]
>\`.add("12")

const triangle_A = \`<
  [[G -] [- E] - [C -]]
  [[- F] [- G] [- Gb] [F -]]
  [[E C4 E4] [[F4@3 -] [D4 E4]]]
  [[- C4] [- A] [B G] -]
>\`

// === === === === === === === === === === === === === === === === === === ===
// PART B-1
// === === === === === === === === === === === === === === === === === === ===
const square1_B = \`<
  [- [G F#] [F D#] [- E]]
  [[- Ab2] [A2 C] [- A2] [C D]]
  [- [G F#] [F D#] [- E]]
  [[- C4] [- C4] [C4 -] -]
>\`.add("24")

const square2_B = \`<
  [- [E Eb] [D B2] [- C]]
  [[- E2] [F2 G2] [- C2] [E2 F2]]
  [- [E Eb] [D B2] [- C]]
  [[- F] [- F] [F -] -]
>\`.add("24")

const triangle_B = \`<
  [[C -] [- G] [- -] [C4 -]]
  [[F -] [- C4] [C4 -] [F -]]
  [[C -] [- G] [- B] [C4 -]]
  [[- G5] [- G5] [G5 -] [G -]]
>\`

// === === === === === === === === === === === === === === === === === === ===
// PART B-2
// === === === === === === === === === === === === === === === === === === ===
const square1_B2 = \`<
  [- [G F#] [F D#] [- E]]
  [[- Ab2] [A2 C] [- A2] [C D]]
  [[- -] [D# -] [- D] -]
  [C - - -]
>\`.add("24")

const square2_B2 = \`<
  [- [E Eb] [D B2] [- C]]
  [[- E2] [F2 G2] [- C2] [E2 F2]]
  [[- -] [G#2 -] [- F2] -]
  [E2 - - - ]
>\`.add("24")

const triangle_B2 = \`<
  [[C -] [- G] [- -] [C4 -]]
  [[F -] [- C4] [C4 -] [F -]]
  [[C -] [Ab -] [- Bb] -]
  [[C4 -] [- G] [G -] [C -]]
>\`

// === === === === === === === === === === === === === === === === === === ===
// PART C (bridge)
// === === === === === === === === === === === === === === === === === === ===
const square1_C = \`<
  [[C C] [- C] [- C] [D -]]
  [[E C] [- A2] [G2 -] [- -]]
  [[C C] [- C] [- C] [D E]]
  [-]
>\`.add("24")

const square2_C = \`<
  [[Ab2 Ab2] [- Ab2] [- Ab2] [Bb2 -]]
  [[G2 E2] [- E2] [C2 -] [- -]]
  [[Ab2 Ab2] [- Ab2] [- Ab2] [Bb2 G2]]
  [-]
>\`.add("24")

const triangle_C = \`<
  [[Ab2 -] [- Eb] [- -] [Ab -]]
  [[G -] [- C] [- -] [G2 -]]
  [[Ab2 -] [- Eb] [- -] [Ab -]]
  [[G -] [- C] [- -] [G2 -]]
>\`

// === === === === === === === === === === === === === === === === === === ===
// PART C-2 (bridge)
// === === === === === === === === === === === === === === === === === === ===
const square1_C2 = \`<
  [[C C] [- C] [- C] [D -]]
  [[E C] [- A2] [G2 -] [- -]]
  [[E E] [- E] [- C] [E -]]
  [[G -] [- -] [G2 -] [- -]]
>\`.add("24")

const square2_C2 = \`<
  [[Ab2 Ab2] [- Ab2] [- Ab2] [Bb2 -]]
  [[G2 E2] [- E2] [C2 -] [- -]]
  [[Gb2 Gb2] [- Gb2] [- Gb2] [Gb2 -]]
  [[B2 -] [- -] [- -] [- -]]
>\`.add("24")

const triangle_C2 = \`<
  [[Ab2 -] [- Eb] [- -] [Ab -]]
  [[G -] [- C] [- -] [G2 -]]
  [[D D] [- D] [- D] [D -]]
  [[G4 -] [- -] [G -] [- -]]
>\`

// === === === === === === === === === === === === === === === === === === ===
// PART D => Same as Part A
// === === === === === === === === === === === === === === === === === === ===

// === === === === === === === === === === === === === === === === === === ===
// PART E
// === === === === === === === === === === === === === === === === === === ===

const square1_E = \`<
  [[E C] [- G2] [- -] [G#2 -]]
  [[A2 F] [- F] [A2 -] [- -]]
  [[B2 A] [- A@2 -] [A@4 G@2] [- F]]
  [[E C] [- A2] [G2 -] [- -]]
>\`.add("24")

const square2_E = \`<
  [[C G2] [- E2] [- -] [E2 -]]
  [[F2 C] [- C] [F2 -] [- -]]
  [[G2 F] [- F@2 -] [F@4 E@2] [- D]]
  [[C A2] [- F2] [E2 -] [- -]]
>\`.add("24")

const triangle_E = \`<
  [[C -] [- F#] [G -] [C4 -]]
  [[F -] [F -] [C4 C4] [F -]]
  [[D -] [- F] [G -] [B -]]
  [[G -] [G -] [C4 C4] [G -]]
>\`

// === === === === === === === === === === === === === === === === === === ===
// PART E2
// === === === === === === === === === === === === === === === === === === ===

const square1_E2 = \`<
  [[E C] [- G2] [- -] [G#2 -]]
  [[A2 F] [- F] [A2 -] [- -]]
  [[B2 F] [- F] [F@4 E@2] [- D]]
  [[C -] [- -] [- -] [- -]]
>\`.add("24")

const square2_E2 = \`<
  [[C G2] [- E2] [- -] [E2 -]]
  [[F2 C] [- C] [F2 -] [- -]]
  [[G2 D] [- D] [D@4 C@2] [- B2]]
  [[G2 E2] [- E2] [C2 -] [- -]]
>\`.add("24")

const triangle_E2 = \`<
  [[C -] [- F#] [G -] [C4 -]]
  [[F -] [F -] [C4 C4] [F -]]
  [[G -] [- G] [G - A] [- B@2]]
  [[C4 -] [G -] [C -] [- -]]
>\`

function sqr1Sound(x){
  if (muteSquare1) return note(x).gain(0);
  return note(x).s("square").clip("0.7").release(0).crush(4).gain(0.3);
}

function sqr2Sound(x){
  if (muteSquare2) return note(x).gain(0);
  return note(x).s("square").clip("0.7").release(0).crush(4).gain(0.3);
}

function triangleSound(x){
  if (muteTriangle) return note(x).gain(0);
  return note(x).s("triangle").clip("0.7").decay(0.9).crush(8).gain(0.8);
}

// === === === === === === === === === === === === === === === === === === ===
// STRUCTURE
// === === === === === === === === === === === === === === === === === === ===
$: arrange(
  // === Intro ===
   [2, stack(
      sqr1Sound(square1_intro),
      sqr2Sound(square2_intro),
      triangleSound(triangle_intro),
      whitenoise_bridge)._scope()],
  // === Part A ===
   [8, stack(
      sqr1Sound(square1_A),
      sqr2Sound(square2_A),
      triangleSound(triangle_A),
      whitenoise)._scope()],
  // === Part B-1 ===
   [4, stack(
      sqr1Sound(square1_B),
      sqr2Sound(square2_B),
      triangleSound(triangle_B),
      whitenoise)._scope()],
  // === Part B-2 ===
   [4, stack(
      sqr1Sound(square1_B2),
      sqr2Sound(square2_B2),
      triangleSound(triangle_B2),
      whitenoise
   )._scope()],
  // === Part B-3 (same as B) ===
   [4, stack(
      sqr1Sound(square1_B),
      sqr2Sound(square2_B),
      triangleSound(triangle_B),
      whitenoise)._scope()],
  // === Part B-4 (same as B-2) ===
   [4, stack(
      sqr1Sound(square1_B2),
      sqr2Sound(square2_B2),
      triangleSound(triangle_B2),
      whitenoise
   )._scope()],
  // === Part C (bridge) ===
   [4, stack(
      sqr2Sound(square1_C),
      sqr2Sound(square2_C),
      triangleSound(triangle_C),
      whitenoise_bridge)._scope()],
  // === Part C-2 (bridge) ===
   [4, stack(
      sqr1Sound(square1_C2),
      sqr2Sound(square2_C2),
      triangleSound(triangle_C2),
      whitenoise_bridge)._scope()],
  // === Part D (same as A) ===
   [8, stack(
      sqr1Sound(square1_A),
      sqr2Sound(square2_A),
      triangleSound(triangle_A),
      whitenoise)._scope()],
  // === Part E ===
   [4, stack(
      sqr1Sound(square1_E),
      sqr2Sound(square2_E),
      triangleSound(triangle_E),
      whitenoise)._scope()],
  // === Part E-2 ===
   [4, stack(
      sqr1Sound(square1_E2),
      sqr2Sound(square2_E2),
      triangleSound(triangle_E2),
      whitenoise)._scope()],
  // === Part E-3 (same as E) ===
   [4, stack(
      sqr1Sound(square1_E),
      sqr2Sound(square2_E),
      triangleSound(triangle_E),
      whitenoise)._scope()],
  // === Part E-4 (same as E-2) ===
   [4, stack(
      sqr1Sound(square1_E2),
      sqr2Sound(square2_E2),
      triangleSound(triangle_E2),
      whitenoise)._scope()],
  // === Part F (brige, same as C) ===
   [4, stack(
      sqr1Sound(square1_C),
      sqr2Sound(square2_C),
      triangleSound(triangle_C),
      whitenoise_bridge)._scope()],
  // === Part F-2 (brige, same as C-2) ===
   [4, stack(
      sqr1Sound(square1_C2),
      sqr2Sound(square2_C2),
      triangleSound(triangle_C2),
      whitenoise_bridge)._scope()],
  // === Part G (same as E) ===
   [4, stack(
      sqr1Sound(square1_E),
      sqr2Sound(square2_E),
      triangleSound(triangle_E),
      whitenoise)._scope()],
  // === Part G-2 (same as E-2) ===
   [4, stack(
      sqr1Sound(square1_E2),
      sqr2Sound(square2_E2),
      triangleSound(triangle_E2),
      whitenoise)._scope()],
)`;

/**
 * MariaAreadne's cover of Daft Punk's Veridis Quo — Dm–G–Am–F under an A minor
 * flute line. The script's own header spells it "Vardis Quo"; that is the
 * author's line and stays as they wrote it, while the collection lists the piece
 * under the song's real title.
 *
 * Edits: `setcpm(29)` became `setcps(29/60)`, and the three voices the author
 * left as bare `$:` are labelled `$flute:`, `$chords:` and `$bass:` — the
 * script's own idiom, already used for `$drums:` — so the voices the page lists
 * can be found in the code next to it. All four keep their pink pianoroll.
 */
export const VERIDIS_QUO = `// "Vardis Quo" @by MariaAreadne

// 116 BPM in 4/4 — one cycle is one bar of sixteenths.
setcps(29/60)

$flute: cat(
 note("~ f5 e5 f5 d5@3 f5 c5 f5 b4@6"),n("b4@16"),
    note("b4 e5 d5 e5 c5@3 e5 b4 e5 a4@6"),n("a4@16"),
    note("a4 f5 e5 f5 d5@3 f5 c5 f5 b4@6"),n("b4@16"),
    note("b4 e5 d5 e5 c5 e5 b4 e5 a4@8"),n("a4@16"),
    note("a4 a5 g5 a5 f5@3 a5 e5 a5 d5@6"),n("d5@16"),
    note("d5 g5 f5 g5 e5@3 g5 d5 g5 c5@6"),n("c5@16"),
    note("c5 f5 e5 f5 d5@3 f5 c5 f5 b4@6"), n("b4@16"),
    note("~ e5 d5 e5 c5 e5 b4 e5 b4 e5 a4@6"),n("a4@16")
)
.scale("A4:minor").s("gm_flute")
    .lpq(6).room(0.35).delay(0.4).delaytime(0.375)
  .delayfeedback(0.3).gain(0.65).slow(1).color("pink")._pianoroll()

$chords: chord("<Dm G Am [F Am]>")
     .dict("ireal")
     .voicing()
     .s("supersaw")
     .lpf(sine.slow(32).range(800, 2400))
     .room(0.6)
     .gain(0.3).color("pink")._pianoroll()//.slow(2)

$bass: note("<d2 g2 a2 [f2 e2]>")
     .s("gm_electric_guitar_jazz")
     .lpf(7000)
     .gain(1.1)
     .room(0.15).delay(0.4).color("pink")._pianoroll()

$drums:
stack(
  s("bd ~ bd ~").s("dr550_bd").gain(0.9).fast(2).lpf(5000).orbit(0.5),
  s("~ lt ~ lt").s("dr550_lt").gain(0.75).room(0.2).lpf(6000),
  s("hh*8").s("rm50_hh").gain(0.5).fast(2).late(0.01).lpf((3000))
).color("pink")._pianoroll()`;

/**
 * Three of these pieces were published as strudel.cc links that carry the whole
 * script in the URL fragment rather than as a short saved-pattern id, so the
 * permalink runs as long as the piece does. They sit here, beside the code they
 * encode, rather than in the collection's metadata.
 */
export const DETERMINATION_PERMALINK =
  'https://strudel.cc/#LypARGV0ZXJtaW5hdGlvbiDCtyBUb2J5IEZveChjb3ZlcikKICBAYnkgQ2xhZmZ5c3RpYwogIEBkZXRhaWxzOiBUaGlzIGlzIGFuIHVub2ZmaWNpYWwgZmFubWFkZSBjb250ZW50LiBJIG1hZGUgdGhpcyB0byBsZWFybiBhYm91dCBTdHJ1ZGVsIGFuZCB0aGF0J3MgaXQuCiAgICAgICAgICAgIFJlZmVyZW5jZTogaHR0cHM6Ly9zb3VuZGNsb3VkLmNvbS9yYWRpeGFuL3VuZGVydGFsZS1kZXRlcm1pbmF0aW9uLW1pZGktaW4tZGVzY3JpcHRpb24KICAgICAgICAgICAgUHVsbGVkIGZyb20gWW91VHViZSBkZXNjcmlwdGlvbiBiZWxvdy4gKGh0dHBzOi8vd3d3LnlvdXR1YmUuY29tL3dhdGNoP3Y9c1JMUW5sZ2xmckkpCiAgICAgICAgICAgIAogIERldGVybWluYXRpb24gwrcgVG9ieSBGb3gKICBVTkRFUlRBTEUgU291bmR0cmFjawogIOKElyBUb2J5IEZveCB1bmRlciBsaWNlbnNlIHRvIE1hdGVyaWEgQ29sbGVjdGl2ZQogIFJlbGVhc2VkIG9uOiAyMDE1LTA5LTE1CiAgUHJvZHVjZXI6IFRvYnkgRm94CiAgTXVzaWMgIFB1Ymxpc2hlcjogTWF0ZXJpYSBDb2xsZWN0aXZlIE11c2ljIFB1Ymxpc2hpbmcKICBDb21wb3NlcjogVG9ieSBGb3gKKi8KCnNldGNwbSgxMTUgLyA0KQoKJGxlYWQ6IG5vdGUoYDwKW0YjNSBGNSBEIzUgQyM1IEQjNSBBIzQgQzUgfl0KW0cjNCB%2BIEQjNSBGNSBGIzUgfiBHIzUgfl0KW0MjNiB%2BIEEjNUA1IH5dCltGIzUgRjUgRCM1IEMjNSBEIzUgQSM0IEM1IH5dCltHIzQgfiBEIzQgRjQgRiM0IH4gRjQgfl0KW0MjNCB%2BIEQjNEA1IH5dCgpbRiM1IEY1IEQjNSBDIzUgRCM1IEEjNCBDNSB%2BXQpbRyM0IH4gRCM1IEY1IEYjNSB%2BIEcjNSB%2BXQpbQyM2IH4gQSM1QDUgfl0KW0YjNSBGNSBEIzUgQyM1IEQjNSBBIzQgQzUgfl0KW0cjNCB%2BIEQjNCBGNCBGIzQgfiBGNCB%2BXQpbQyM0IH4gRCM0QDUgfl0gCgpbW0cjNSxGNV0gW0YjNSxEIzVdIFtFNSxDIzVdIFtEIzUsQjRdIFtDIzUsQSM0XSBbRTUsQyM1XSBbRCM1LEEjNF0gfl0KW1tBIzQsRiM0XSB%2BIFtBIzQsRiM0XSBbRCM1LEEjNF0gW0cjNSxFNV0gW0YjNSxEIzVdIFtFNSxDIzVdIFtEIzUsQjRdXQpbW0MjNSxBIzRdIFtFNSxDIzVdIFtEIzUsQSM0XUAzIH4gW0QjNCxBIzNdIFtHIzQsRCM0XV0KW1tDIzUsQSM0XSBbQzUsRyM0XSBbQSM0LEYjNF0gW0cjNCxGNF0gW0EjNCxGIzRdIFtDNSxHIzRdIFtBIzQsRiM0XSB%2BXQpbW0QjNCxBIzNdIH4gW0QjNCxBIzNdIFtGNCxDIzRdIFtGIzQsRCM0XSB%2BIFtCNCxGIzRdIH5dCltbRCM1LEI0XUAyIFtENSxBIzRdQDQgfkAyXQoKW1tHIzUsRjVdIFtGIzUsRCM1XSBbRTUsQyM1XSBbRCM1LEI0XSBbQyM1LEEjNF0gW0U1LEMjNV0gW0QjNSxBIzRdIH5dCltbQSM0LEYjNF0gfiBbQSM0LEYjNF0gW0QjNSxBIzRdIFtHIzUsRTVdIFtGIzUsRCM1XSBbRTUsQyM1XSBbRCM1LEI0XV0KW1tDIzUsQSM0XSBbRTUsQyM1XSBbRCM1LEEjNF1AMyB%2BIFtEIzQsQSMzXSBbRyM0LEQjNF1dCltbQyM1LEEjNF0gW0M1LEcjNF0gW0EjNCxGIzRdIFtHIzQsRjRdIFtBIzQsRiM0XSBbQzUsRyM0XSBbQSM0LEYjNF0gfl0KW1tEIzQsQSMzXSB%2BIFtEIzQsQSMzXSBbRjQsQyM0XSBbRiM0LEQjNF0gfiBbRjQsQyM0XSB%2BXQpbW0MjNCxHIzNdQDIgW0QjNCxBIzNdQDQgfkAyXQoKW35AOF0KPmApLnNvdW5kKCJzcXVhcmUiKS5yb29tKC41KS5yb29tc2l6ZSg2KS5nYWluKC4yNSkuZGV0dW5lKCJbLTUsIDVdIikKCiRoYXJtb255OiBub3RlKGA8Clt%2BIEQjNCBGIzQgRyM0IEEjNCBGIzQgfiBHIzRdCltDNSBEIzUgQzUgRyM0IH4gRCM0IEY0IEQjNF0KW0cjNCBGNCBGIzQgRjQgRCM0IEMjNCBEIzQgQSMzXQpbfiBEIzQgRiM0IEcjNCBBIzQgRiM0IH4gRCM0XSAKW0YjNCBHIzQgQSM0IEYjNCB%2BIEQjNCBGNCBBIzRdCltGNCBDIzQgRiM0IEY0IEQjNCBDIzQgRCM0IEY0XQoKW34gRCM0IEYjNCBHIzQgQSM0IEYjNCB%2BIEcjNF0KW0M1IEQjNSBDNSBHIzQgfiBEIzQgRjQgRCM0XQpbRyM0IEY0IEYjNCBGNCBEIzQgQyM0IEQjNCBBIzNdClt%2BIEQjNCBGIzQgRyM0IEEjNCBGIzQgfiBEIzRdIApbRiM0IEcjNCBBIzQgRiM0IH4gRCM0IEY0IEEjNF0KW0Y0IEMjNCBGIzQgRjQgRCM0IEMjNCBEIzQgQSMzXQoKW0cjMyBEIzQgRyM0IEYjNCBBIzQgRyM0IEYjNCBHIzRdCltEIzQgRiM0IEMjNCBEIzQgRyMzIEQjNCBHIzQgRiM0XQpbQSM0IEcjNCBGIzRAMyB%2BQDNdClt%2BIEQjMyBDIzQgQSMzIEcjNCBGNCBEIzQgRjRdCltGIzQgRjQgZCM0IEY0IEYjNCB%2BQDNdCltCNCB%2BIEcjNCBGIzQgRjQgRCM0IEQ0IEY0XQoKW0cjMyBEIzQgRyM0IEYjNCBBIzQgRyM0IEYjNCBHIzRdCltEIzQgRiM0IEMjNCBEIzQgRyMzIEQjNCBHIzQgRiM0XQpbQSM0IEcjNCBGIzRAMyB%2BQDNdClt%2BQDhdClt%2BQDIgRCM0IEY0IEYjNCB%2BIEY0IH5dCltDIzRAMiBEIzRANCB%2BQDJdCgpbfkA4XQo%2BYCkuc291bmQoInRyaWFuZ2xlIikuZ2FpbiguMzUpLnNoYXBlKC4yKQoKJGJhc3M6IG5vdGUoYDwKW0QjMkA0IEYjMkAyIEcjMkAyXQpbRyMyQDIgRyMxQDIgQjFAMiBDIzJAMl0KW0YjMkAyIEQjMkA0IEMjMkAyXQpbRCMyQDQgRiMyQDIgRyMyQDJdCltHIzJAMiBEIzJAMiBGIzJAMiBGMkAyXQpbQyMyQDIgRCMyQDQgQyMyQDJdCgpbRCMyQDQgRiMyQDIgRyMyQDJdCltHIzJAMiBHIzFAMiBCMUAyIEMjMkAyXQpbRiMyQDIgRCMyQDQgQyMyQDJdCltEIzJANCBGIzJAMiBHIzJAMl0KW0cjMkAyIEQjMkAyIEYjMkAyIEYyQDJdCltDIzJAMiBEIzJANCB%2BQDJdCgpbRjJANCBDIzJAMiBEIzJAMl0KW0QjMiB%2BIEQjMkAyIEUyQDRdCltDIzJAMiBEIzJAMyB%2BQDNdCltBIzFANCBDIzJAMiBEIzJAMl0KW0QjMkAyIEMjMkAyIEIxQDIgfkAyXQpbRCMzIH4gRDNAMiBCMkAyIEEjMkAyXQoKW0UyQDQgQyMyQDIgRCMyQDJdCltEIzIgfiBEIzJAMiBFMkA0XQpbQyMyQDIgRCMyQDMgfkAzXQpbRyMyQDQgfkAyIEQjMkAyXQpbRCMyQDIgfkAyIEYjMiB%2BIEYyIH5dCltDIzJAMiBEIzJANl0KClt%2BQDhdCj5gKS5zb3VuZCgic3F1YXJlIikuZ2FpbiguMyk%3D';

export const SUPER_MARIO_BROS_PERMALINK =
  'https://strudel.cc/#LyoKICAgIEB0aXRsZSBNYXJpbyB0aGVtZSAKICAgIEBieSBGbG93aGFja2VyCiAgICBPcmlnaW5hbCBzb25nIGNvbXBvc2VkIGJ5IEtvamkgS29uZG8KKi8KCnNldGNwbSgyMDAvNCkKCmNvbnN0IG11dGVTcXVhcmUxID0gZmFsc2U7CmNvbnN0IG11dGVTcXVhcmUyID0gZmFsc2U7CmNvbnN0IG11dGVUcmlhbmdsZSA9IGZhbHNlOwpjb25zdCBtdXRlTm9pc2UgPSBmYWxzZTsKCmxldCB3aGl0ZW5vaXNlID0gCiAgc3RhY2soCiAgICBzb3VuZCgicGluayIpLmRlY2F5KC4wMykudmVsb2NpdHkoMy4yKSwKICAgIHNvdW5kKCJ3aGl0ZSIpLnN0cnVjdCgiLSB4IikuZmFzdCgyKS5kZWNheSguMDIpLAogICAgc291bmQoIndoaXRlIikuc3RydWN0KCItIC0gLSB4IikubHBmKDIwMDApLmZhc3QoMikuZGVjYXkoLjAxKSwKICAgIHNvdW5kKCJ3aGl0ZSIpLnN0cnVjdCgiLSAtIHggLSIpLmhwZig0MDApLmRlY2F5KC4xMikKICAgICkKCmxldCB3aGl0ZW5vaXNlX2JyaWRnZSA9IAogIHN0YWNrKAogICAgc291bmQoIndoaXRlIikuc3RydWN0KCItIDwtIHg%2BIDw8eCAtPiA8LSB4Pj4gPC0gPC0geD4%2BIikuZmFzdCgyKS5kZWNheSguMDQpLAogICAgc291bmQoIndoaXRlIikuc3RydWN0KCJ4IFstIHhdIC0gPHggLT4iKS5ocGYoNDAwKS5kZWNheSguMTQpCiAgICApCgppZiAobXV0ZU5vaXNlKSB7CiAgd2hpdGVub2lzZSA9IHdoaXRlbm9pc2UucG9zdGdhaW4oMCkKICB3aGl0ZW5vaXNlX2JyaWRnZSA9IHdoaXRlbm9pc2VfYnJpZGdlLnBvc3RnYWluKDApCn0KCi8vID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PQovLyBJbnRybwovLyA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0KY29uc3Qgc3F1YXJlMV9pbnRybyA9IGA8CltbRSBFXSBbLSBFXSBbLSBDXSBbRSAtXV0KICBbW0cgLV0gWy0gLV0gW0cyIC1dIFstIC1dXSAKPmAuYWRkKCIyNCIpCgpjb25zdCBzcXVhcmUyX2ludHJvID0gYDwKICBbW0diMiBHYjJdIFstIEdiMl0gWy0gR2IyXSBbR2IyIC1dXQogIFtbQjIgLV0gWy0gLV0gWy0gLV0gWy0gLV1dIAo%2BYC5hZGQoIjI0IikKCmNvbnN0IHRyaWFuZ2xlX2ludHJvID0gYDwKICBbW0QgRF0gWy0gRF0gWy0gRF0gW0QgLV1dCiAgW1tHNCAtXSBbLSAtXSBbRyAtXSBbLSAtXV0gCj5gCgovLyA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0KLy8gUEFSVCBBCi8vID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PQpjb25zdCBzcXVhcmUxX0EgPSBgPAogIFtbQzQgLV0gWy0gR10gLSBbRSAtXV0KICBbWy0gQV0gWy0gQl0gWy0gQmJdIFtBIC1dXSAKICBbW0cgRTQgRzRdIFtbQTRAMyAtXSBbRjQgRzRdXV0KICBbWy0gRTRdIFstIEM0XSBbRDQgQl0gLV0KPmAuYWRkKCIxMiIpCgoKY29uc3Qgc3F1YXJlMl9BID0gYDwKICBbW0UgLV0gWy0gQ10gLSBbRzIgLV1dCiAgW1stIENdIFstIERdIFstIERiXSBbQyAtXV0KICBbW0MgRyBCXSBbW0M0QDMgLV0gW0EgQl1dXQogIFtbLSBBXSBbLSBFXSBbRiBEXSAtXQo%2BYC5hZGQoIjEyIikKCmNvbnN0IHRyaWFuZ2xlX0EgPSBgPAogIFtbRyAtXSBbLSBFXSAtIFtDIC1dXQogIFtbLSBGXSBbLSBHXSBbLSBHYl0gW0YgLV1dIAogIFtbRSBDNCBFNF0gW1tGNEAzIC1dIFtENCBFNF1dXQogIFtbLSBDNF0gWy0gQV0gW0IgR10gLV0KPmAKCi8vID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PQovLyBQQVJUIEItMQovLyA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0KY29uc3Qgc3F1YXJlMV9CID0gYDwKICBbLSBbRyBGI10gW0YgRCNdIFstIEVdXQogIFtbLSBBYjJdIFtBMiBDXSBbLSBBMl0gW0MgRF1dIAogIFstIFtHIEYjXSBbRiBEI10gWy0gRV1dCiAgW1stIEM0XSBbLSBDNF0gW0M0IC1dIC1dCj5gLmFkZCgiMjQiKQoKY29uc3Qgc3F1YXJlMl9CID0gYDwKICBbLSBbRSBFYl0gW0QgQjJdIFstIENdXQogIFtbLSBFMl0gW0YyIEcyXSBbLSBDMl0gW0UyIEYyXV0gCiAgWy0gW0UgRWJdIFtEIEIyXSBbLSBDXV0KICBbWy0gRl0gWy0gRl0gW0YgLV0gLV0KPmAuYWRkKCIyNCIpCgpjb25zdCB0cmlhbmdsZV9CID0gYDwKICBbW0MgLV0gWy0gR10gWy0gLV0gW0M0IC1dXQogIFtbRiAtXSBbLSBDNF0gW0M0IC1dIFtGIC1dXSAKICBbW0MgLV0gWy0gR10gWy0gQl0gW0M0IC1dXQogIFtbLSBHNV0gWy0gRzVdIFtHNSAtXSBbRyAtXV0KPmAKCi8vID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PQovLyBQQVJUIEItMgovLyA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0KY29uc3Qgc3F1YXJlMV9CMiA9IGA8CiAgWy0gW0cgRiNdIFtGIEQjXSBbLSBFXV0KICBbWy0gQWIyXSBbQTIgQ10gWy0gQTJdIFtDIERdXSAKICBbWy0gLV0gW0QjIC1dIFstIERdIC1dCiAgW0MgLSAtIC1dCj5gLmFkZCgiMjQiKQoKY29uc3Qgc3F1YXJlMl9CMiA9IGA8CiAgWy0gW0UgRWJdIFtEIEIyXSBbLSBDXV0KICBbWy0gRTJdIFtGMiBHMl0gWy0gQzJdIFtFMiBGMl1dIAogIFtbLSAtXSBbRyMyIC1dIFstIEYyXSAtXQogIFtFMiAtIC0gLSBdCj5gLmFkZCgiMjQiKQoKY29uc3QgdHJpYW5nbGVfQjIgPSBgPAogIFtbQyAtXSBbLSBHXSBbLSAtXSBbQzQgLV1dCiAgW1tGIC1dIFstIEM0XSBbQzQgLV0gW0YgLV1dIAogIFtbQyAtXSBbQWIgLV0gWy0gQmJdIC1dCiAgW1tDNCAtXSBbLSBHXSBbRyAtXSBbQyAtXV0KPmAKCi8vID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PQovLyBQQVJUIEMgKGJyaWRnZSkKLy8gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09CmNvbnN0IHNxdWFyZTFfQyA9IGA8CiAgW1tDIENdIFstIENdIFstIENdIFtEIC1dXQogIFtbRSBDXSBbLSBBMl0gW0cyIC1dIFstIC1dXSAKICBbW0MgQ10gWy0gQ10gWy0gQ10gW0QgRV1dCiAgWy1dCj5gLmFkZCgiMjQiKQoKY29uc3Qgc3F1YXJlMl9DID0gYDwKICBbW0FiMiBBYjJdIFstIEFiMl0gWy0gQWIyXSBbQmIyIC1dXQogIFtbRzIgRTJdIFstIEUyXSBbQzIgLV0gWy0gLV1dIAogIFtbQWIyIEFiMl0gWy0gQWIyXSBbLSBBYjJdIFtCYjIgRzJdXQogIFstXQo%2BYC5hZGQoIjI0IikKCmNvbnN0IHRyaWFuZ2xlX0MgPSBgPAogIFtbQWIyIC1dIFstIEViXSBbLSAtXSBbQWIgLV1dCiAgW1tHIC1dIFstIENdIFstIC1dIFtHMiAtXV0gCiAgW1tBYjIgLV0gWy0gRWJdIFstIC1dIFtBYiAtXV0KICBbW0cgLV0gWy0gQ10gWy0gLV0gW0cyIC1dXSAKPmAKCgovLyA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0KLy8gUEFSVCBDLTIgKGJyaWRnZSkKLy8gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09CmNvbnN0IHNxdWFyZTFfQzIgPSBgPAogIFtbQyBDXSBbLSBDXSBbLSBDXSBbRCAtXV0KICBbW0UgQ10gWy0gQTJdIFtHMiAtXSBbLSAtXV0gCiAgW1tFIEVdIFstIEVdIFstIENdIFtFIC1dXQogIFtbRyAtXSBbLSAtXSBbRzIgLV0gWy0gLV1dIAo%2BYC5hZGQoIjI0IikKCmNvbnN0IHNxdWFyZTJfQzIgPSBgPAogIFtbQWIyIEFiMl0gWy0gQWIyXSBbLSBBYjJdIFtCYjIgLV1dCiAgW1tHMiBFMl0gWy0gRTJdIFtDMiAtXSBbLSAtXV0gCiAgW1tHYjIgR2IyXSBbLSBHYjJdIFstIEdiMl0gW0diMiAtXV0KICBbW0IyIC1dIFstIC1dIFstIC1dIFstIC1dXSAKPmAuYWRkKCIyNCIpCgpjb25zdCB0cmlhbmdsZV9DMiA9IGA8CiAgW1tBYjIgLV0gWy0gRWJdIFstIC1dIFtBYiAtXV0KICBbW0cgLV0gWy0gQ10gWy0gLV0gW0cyIC1dXSAKICBbW0QgRF0gWy0gRF0gWy0gRF0gW0QgLV1dCiAgW1tHNCAtXSBbLSAtXSBbRyAtXSBbLSAtXV0gCj5gCgovLyA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0KLy8gUEFSVCBEID0%2BIFNhbWUgYXMgUGFydCBBCi8vID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PQoKLy8gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09Ci8vIFBBUlQgRQovLyA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0KCmNvbnN0IHNxdWFyZTFfRSA9IGA8CiAgW1tFIENdIFstIEcyXSBbLSAtXSBbRyMyIC1dXQogIFtbQTIgRl0gWy0gRl0gW0EyIC1dIFstIC1dXSAKICBbW0IyIEFdIFstIEFAMiAtXSBbQUA0IEdAMl0gWy0gRl1dCiAgW1tFIENdIFstIEEyXSBbRzIgLV0gWy0gLV1dIAo%2BYC5hZGQoIjI0IikKCmNvbnN0IHNxdWFyZTJfRSA9IGA8CiAgW1tDIEcyXSBbLSBFMl0gWy0gLV0gW0UyIC1dXQogIFtbRjIgQ10gWy0gQ10gW0YyIC1dIFstIC1dXSAKICBbW0cyIEZdIFstIEZAMiAtXSBbRkA0IEVAMl0gWy0gRF1dCiAgW1tDIEEyXSBbLSBGMl0gW0UyIC1dIFstIC1dXSAKPmAuYWRkKCIyNCIpCgpjb25zdCB0cmlhbmdsZV9FID0gYDwKICBbW0MgLV0gWy0gRiNdIFtHIC1dIFtDNCAtXV0KICBbW0YgLV0gW0YgLV0gW0M0IEM0XSBbRiAtXV0gCiAgW1tEIC1dIFstIEZdIFtHIC1dIFtCIC1dXQogIFtbRyAtXSBbRyAtXSBbQzQgQzRdIFtHIC1dXSAKPmAKCi8vID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PQovLyBQQVJUIEUyCi8vID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PQoKY29uc3Qgc3F1YXJlMV9FMiA9IGA8CiAgW1tFIENdIFstIEcyXSBbLSAtXSBbRyMyIC1dXQogIFtbQTIgRl0gWy0gRl0gW0EyIC1dIFstIC1dXSAKICBbW0IyIEZdIFstIEZdIFtGQDQgRUAyXSBbLSBEXV0KICBbW0MgLV0gWy0gLV0gWy0gLV0gWy0gLV1dIAo%2BYC5hZGQoIjI0IikKCmNvbnN0IHNxdWFyZTJfRTIgPSBgPAogIFtbQyBHMl0gWy0gRTJdIFstIC1dIFtFMiAtXV0KICBbW0YyIENdIFstIENdIFtGMiAtXSBbLSAtXV0gCiAgW1tHMiBEXSBbLSBEXSBbREA0IENAMl0gWy0gQjJdXQogIFtbRzIgRTJdIFstIEUyXSBbQzIgLV0gWy0gLV1dIAo%2BYC5hZGQoIjI0IikKCmNvbnN0IHRyaWFuZ2xlX0UyID0gYDwKICBbW0MgLV0gWy0gRiNdIFtHIC1dIFtDNCAtXV0KICBbW0YgLV0gW0YgLV0gW0M0IEM0XSBbRiAtXV0gCiAgW1tHIC1dIFstIEddIFtHIC0gQV0gWy0gQkAyXV0KICBbW0M0IC1dIFtHIC1dIFtDIC1dIFstIC1dXSAKPmAKCi8vID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PQovLyBTVFJVQ1RVUkUKLy8gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09ID09PSA9PT0gPT09CiQ6IGFycmFuZ2UoCiAgLy8gPT09IEludHJvID09PQogICBbMiwgc3RhY2soCiAgICAgIHNxcjFTb3VuZChzcXVhcmUxX2ludHJvKSwKICAgICAgc3FyMlNvdW5kKHNxdWFyZTJfaW50cm8pLAogICAgICB0cmlhbmdsZVNvdW5kKHRyaWFuZ2xlX2ludHJvKSwKICAgICAgd2hpdGVub2lzZV9icmlkZ2UpLl9zY29wZSgpXSwKICAvLyA9PT0gUGFydCBBID09PQogICBbOCwgc3RhY2soCiAgICAgIHNxcjFTb3VuZChzcXVhcmUxX0EpLAogICAgICBzcXIyU291bmQoc3F1YXJlMl9BKSwKICAgICAgdHJpYW5nbGVTb3VuZCh0cmlhbmdsZV9BKSwKICAgICAgd2hpdGVub2lzZSkuX3Njb3BlKCldLAogIC8vID09PSBQYXJ0IEItMSA9PT0KICAgWzQsIHN0YWNrKAogICAgICBzcXIxU291bmQoc3F1YXJlMV9CKSwKICAgICAgc3FyMlNvdW5kKHNxdWFyZTJfQiksCiAgICAgIHRyaWFuZ2xlU291bmQodHJpYW5nbGVfQiksCiAgICAgIHdoaXRlbm9pc2UpLl9zY29wZSgpXSwKICAvLyA9PT0gUGFydCBCLTIgPT09CiAgIFs0LCBzdGFjaygKICAgICAgc3FyMVNvdW5kKHNxdWFyZTFfQjIpLAogICAgICBzcXIyU291bmQoc3F1YXJlMl9CMiksCiAgICAgIHRyaWFuZ2xlU291bmQodHJpYW5nbGVfQjIpLAogICAgICB3aGl0ZW5vaXNlCiAgICkuX3Njb3BlKCldLAogIC8vID09PSBQYXJ0IEItMyAoc2FtZSBhcyBCKSA9PT0KICAgWzQsIHN0YWNrKAogICAgICBzcXIxU291bmQoc3F1YXJlMV9CKSwKICAgICAgc3FyMlNvdW5kKHNxdWFyZTJfQiksCiAgICAgIHRyaWFuZ2xlU291bmQodHJpYW5nbGVfQiksCiAgICAgIHdoaXRlbm9pc2UpLl9zY29wZSgpXSwKICAvLyA9PT0gUGFydCBCLTQgKHNhbWUgYXMgQi0yKSA9PT0KICAgWzQsIHN0YWNrKAogICAgICBzcXIxU291bmQoc3F1YXJlMV9CMiksCiAgICAgIHNxcjJTb3VuZChzcXVhcmUyX0IyKSwKICAgICAgdHJpYW5nbGVTb3VuZCh0cmlhbmdsZV9CMiksCiAgICAgIHdoaXRlbm9pc2UKICAgKS5fc2NvcGUoKV0sCiAgLy8gPT09IFBhcnQgQyAoYnJpZGdlKSA9PT0KICAgWzQsIHN0YWNrKAogICAgICBzcXIyU291bmQoc3F1YXJlMV9DKSwKICAgICAgc3FyMlNvdW5kKHNxdWFyZTJfQyksCiAgICAgIHRyaWFuZ2xlU291bmQodHJpYW5nbGVfQyksCiAgICAgIHdoaXRlbm9pc2VfYnJpZGdlKS5fc2NvcGUoKV0sCiAgLy8gPT09IFBhcnQgQy0yIChicmlkZ2UpID09PQogICBbNCwgc3RhY2soCiAgICAgIHNxcjFTb3VuZChzcXVhcmUxX0MyKSwKICAgICAgc3FyMlNvdW5kKHNxdWFyZTJfQzIpLAogICAgICB0cmlhbmdsZVNvdW5kKHRyaWFuZ2xlX0MyKSwKICAgICAgd2hpdGVub2lzZV9icmlkZ2UpLl9zY29wZSgpXSwKICAvLyA9PT0gUGFydCBEIChzYW1lIGFzIEEpID09PQogICBbOCwgc3RhY2soCiAgICAgIHNxcjFTb3VuZChzcXVhcmUxX0EpLAogICAgICBzcXIyU291bmQoc3F1YXJlMl9BKSwKICAgICAgdHJpYW5nbGVTb3VuZCh0cmlhbmdsZV9BKSwKICAgICAgd2hpdGVub2lzZSkuX3Njb3BlKCldLAogIC8vID09PSBQYXJ0IEUgPT09CiAgIFs0LCBzdGFjaygKICAgICAgc3FyMVNvdW5kKHNxdWFyZTFfRSksCiAgICAgIHNxcjJTb3VuZChzcXVhcmUyX0UpLAogICAgICB0cmlhbmdsZVNvdW5kKHRyaWFuZ2xlX0UpLAogICAgICB3aGl0ZW5vaXNlKS5fc2NvcGUoKV0sCiAgLy8gPT09IFBhcnQgRS0yID09PQogICBbNCwgc3RhY2soCiAgICAgIHNxcjFTb3VuZChzcXVhcmUxX0UyKSwKICAgICAgc3FyMlNvdW5kKHNxdWFyZTJfRTIpLAogICAgICB0cmlhbmdsZVNvdW5kKHRyaWFuZ2xlX0UyKSwKICAgICAgd2hpdGVub2lzZSkuX3Njb3BlKCldLAogIC8vID09PSBQYXJ0IEUtMyAoc2FtZSBhcyBFKSA9PT0KICAgWzQsIHN0YWNrKAogICAgICBzcXIxU291bmQoc3F1YXJlMV9FKSwKICAgICAgc3FyMlNvdW5kKHNxdWFyZTJfRSksCiAgICAgIHRyaWFuZ2xlU291bmQodHJpYW5nbGVfRSksCiAgICAgIHdoaXRlbm9pc2UpLl9zY29wZSgpXSwKICAvLyA9PT0gUGFydCBFLTQgKHNhbWUgYXMgRS0yKSA9PT0KICAgWzQsIHN0YWNrKAogICAgICBzcXIxU291bmQoc3F1YXJlMV9FMiksCiAgICAgIHNxcjJTb3VuZChzcXVhcmUyX0UyKSwKICAgICAgdHJpYW5nbGVTb3VuZCh0cmlhbmdsZV9FMiksCiAgICAgIHdoaXRlbm9pc2UpLl9zY29wZSgpXSwKICAvLyA9PT0gUGFydCBGIChicmlnZSwgc2FtZSBhcyBDKSA9PT0KICAgWzQsIHN0YWNrKAogICAgICBzcXIxU291bmQoc3F1YXJlMV9DKSwKICAgICAgc3FyMlNvdW5kKHNxdWFyZTJfQyksCiAgICAgIHRyaWFuZ2xlU291bmQodHJpYW5nbGVfQyksCiAgICAgIHdoaXRlbm9pc2VfYnJpZGdlKS5fc2NvcGUoKV0sCiAgLy8gPT09IFBhcnQgRi0yIChicmlnZSwgc2FtZSBhcyBDLTIpID09PQogICBbNCwgc3RhY2soCiAgICAgIHNxcjFTb3VuZChzcXVhcmUxX0MyKSwKICAgICAgc3FyMlNvdW5kKHNxdWFyZTJfQzIpLAogICAgICB0cmlhbmdsZVNvdW5kKHRyaWFuZ2xlX0MyKSwKICAgICAgd2hpdGVub2lzZV9icmlkZ2UpLl9zY29wZSgpXSwKICAvLyA9PT0gUGFydCBHIChzYW1lIGFzIEUpID09PQogICBbNCwgc3RhY2soCiAgICAgIHNxcjFTb3VuZChzcXVhcmUxX0UpLAogICAgICBzcXIyU291bmQoc3F1YXJlMl9FKSwKICAgICAgdHJpYW5nbGVTb3VuZCh0cmlhbmdsZV9FKSwKICAgICAgd2hpdGVub2lzZSkuX3Njb3BlKCldLAogIC8vID09PSBQYXJ0IEctMiAoc2FtZSBhcyBFLTIpID09PQogICBbNCwgc3RhY2soCiAgICAgIHNxcjFTb3VuZChzcXVhcmUxX0UyKSwKICAgICAgc3FyMlNvdW5kKHNxdWFyZTJfRTIpLAogICAgICB0cmlhbmdsZVNvdW5kKHRyaWFuZ2xlX0UyKSwKICAgICAgd2hpdGVub2lzZSkuX3Njb3BlKCldLAopCgpmdW5jdGlvbiBzcXIxU291bmQoeCl7CiAgaWYgKG11dGVTcXVhcmUxKSByZXR1cm4gbm90ZSh4KS5nYWluKDApOwogIHJldHVybiBub3RlKHgpLnMoInNxdWFyZSIpLmNsaXAoIjAuNyIpLnJlbGVhc2UoMCkuY3J1c2goNCkuZ2FpbigwLjMpOwp9CgpmdW5jdGlvbiBzcXIyU291bmQoeCl7CiAgaWYgKG11dGVTcXVhcmUyKSByZXR1cm4gbm90ZSh4KS5nYWluKDApOwogIHJldHVybiBub3RlKHgpLnMoInNxdWFyZSIpLmNsaXAoIjAuNyIpLnJlbGVhc2UoMCkuY3J1c2goNCkuZ2FpbigwLjMpOwp9CgpmdW5jdGlvbiB0cmlhbmdsZVNvdW5kKHgpewogIGlmIChtdXRlVHJpYW5nbGUpIHJldHVybiBub3RlKHgpLmdhaW4oMCk7CiAgcmV0dXJuIG5vdGUoeCkucygidHJpYW5nbGUiKS5jbGlwKCIwLjciKS5kZWNheSgwLjkpLmNydXNoKDgpLmdhaW4oMC44KTsKfQo%3D';

export const VERIDIS_QUO_PERMALINK =
  'https://strudel.cc/#Ly8gIlZhcmRpcyBRdW8iIEBieSBNYXJpYUFyZWFkbmUKCgpzZXRjcG0oMjkpCgokOiBjYXQoCiBub3RlKCJ%2BIGY1IGU1IGY1IGQ1QDMgZjUgYzUgZjUgYjRANiIpLG4oImI0QDE2IiksCiAgICBub3RlKCJiNCBlNSBkNSBlNSBjNUAzIGU1IGI0IGU1IGE0QDYiKSxuKCJhNEAxNiIpLAogICAgbm90ZSgiYTQgZjUgZTUgZjUgZDVAMyBmNSBjNSBmNSBiNEA2IiksbigiYjRAMTYiKSwKICAgIG5vdGUoImI0IGU1IGQ1IGU1IGM1IGU1IGI0IGU1IGE0QDgiKSxuKCJhNEAxNiIpLAogICAgbm90ZSgiYTQgYTUgZzUgYTUgZjVAMyBhNSBlNSBhNSBkNUA2IiksbigiZDVAMTYiKSwKICAgIG5vdGUoImQ1IGc1IGY1IGc1IGU1QDMgZzUgZDUgZzUgYzVANiIpLG4oImM1QDE2IiksCiAgICBub3RlKCJjNSBmNSBlNSBmNSBkNUAzIGY1IGM1IGY1IGI0QDYiKSwgbigiYjRAMTYiKSwKICAgIG5vdGUoIn4gZTUgZDUgZTUgYzUgZTUgYjQgZTUgYjQgZTUgYTRANiIpLG4oImE0QDE2IikKKQouc2NhbGUoIkE0Om1pbm9yIikucygiZ21fZmx1dGUiKQogICAgLmxwcSg2KS5yb29tKDAuMzUpLmRlbGF5KDAuNCkuZGVsYXl0aW1lKDAuMzc1KQogIC5kZWxheWZlZWRiYWNrKDAuMykuZ2FpbigwLjY1KS5zbG93KDEpLmNvbG9yKCJwaW5rIikuX3BpYW5vcm9sbCgpCgoKCgokOiBjaG9yZCgiPERtIEcgQW0gW0YgQW1dPiIpCiAgICAgLmRpY3QoImlyZWFsIikKICAgICAudm9pY2luZygpCiAgICAgLnMoInN1cGVyc2F3IikKICAgICAubHBmKHNpbmUuc2xvdygzMikucmFuZ2UoODAwLCAyNDAwKSkKICAgICAucm9vbSgwLjYpCiAgICAgLmdhaW4oMC4zKS5jb2xvcigicGluayIpLl9waWFub3JvbGwoKS8vLnNsb3coMikKCgokOm5vdGUoIjxkMiBnMiBhMiBbZjIgZTJdPiIpCiAgICAgLnMoImdtX2VsZWN0cmljX2d1aXRhcl9qYXp6IikKICAgICAubHBmKDcwMDApCiAgICAgLmdhaW4oMS4xKQogICAgIC5yb29tKDAuMTUpLmRlbGF5KDAuNCkuY29sb3IoInBpbmsiKS5fcGlhbm9yb2xsKCkKCgoKJGRydW1zOgpzdGFjaygKICBzKCJiZCB%2BIGJkIH4iKS5zKCJkcjU1MF9iZCIpLmdhaW4oMC45KS5mYXN0KDIpLmxwZig1MDAwKS5vcmJpdCgwLjUpLAogIHMoIn4gbHQgfiBsdCIpLnMoImRyNTUwX2x0IikuZ2FpbigwLjc1KS5yb29tKDAuMikubHBmKDYwMDApLAogIHMoImhoKjgiKS5zKCJybTUwX2hoIikuZ2FpbigwLjUpLmZhc3QoMikubGF0ZSgwLjAxKS5scGYoKDMwMDApKQopLmNvbG9yKCJwaW5rIikuX3BpYW5vcm9sbCgpCg%3D%3D';
