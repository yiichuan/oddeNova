/**
 * 精选 — the pieces the Featured page shows.
 *
 * Hand-picked work by other people, carried in the bundle rather than fetched:
 * the list is short, it changes when we say so, and a piece has to be playable
 * the moment the page opens. Swapping this module for an API later is a change
 * to this file alone — everything downstream reads `FEATURED_PIECES`.
 *
 * A piece is someone's work. `artist`, `sourceUrl` and `patternUrl` are not
 * decoration: the page shows them, and nothing goes in here without them.
 */

export interface FeaturedPiece {
  /** Stable slug. Identifies the piece in the grid, and in the preview state. */
  id: string;
  /** The piece's own name. */
  title: string;
  /**
   * Whoever wrote the music being covered. Two credits rather than one,
   * because a live-coded cover has two authors and collapsing them into
   * "artist" would take the song from one and the code from the other.
   */
  originalArtist: string;
  /** Whoever wrote the Strudel. */
  coder: string;
  /**
   * Square artwork, served from `public/featured/` (so `/featured/<file>`).
   * Left out until a piece has any: the grid falls back to a face generated
   * from the id, which keeps an unillustrated collection looking deliberate
   * rather than broken.
   */
  coverUrl?: string;
  /** Genre-ish label, kept alongside the tempo. */
  style: string;
  bpm: number;
  /** One line about the piece, [中文, English] — same shape as i18n.ts. */
  blurb: readonly [string, string];
  /** Where it was published. */
  sourceUrl: string;
  /** The Strudel permalink the code came from. */
  patternUrl: string;
  /** The full, runnable script. */
  code: string;
  /** The voices the script builds, in the order it declares them. */
  layers: readonly FeaturedLayer[];
}

/**
 * One voice in the piece, named after the binding it has in the code so a
 * reader can find it in the code window next to the notes.
 */
export interface FeaturedLayer {
  /** The identifier as written in the script. */
  name: string;
  /** What makes the sound, [中文, English]. */
  detail: readonly [string, string];
}

/** Tiles per row in the grid; a short collection is padded out to fill one. */
export const FEATURED_ROW_SIZE = 4;

/**
 * Where the collection itself comes from — the curated list these pieces were
 * found in. It credits the collecting, which is its own work: without it none
 * of this would have been in front of us to pick from. Collection-level rather
 * than per-piece, so it stays one link however long the list grows.
 */
export const FEATURED_COLLECTION_URL = 'https://github.com/terryds/awesome-strudel';

/**
 * KAIXI's 360 cover, verbatim from the Strudel permalink apart from the
 * display chain the original ends with:
 *
 *   .theme(…).color(…).fontFamily(…).punchcard({…})
 *
 * `theme` and `fontFamily` are not Pattern methods in the @strudel/draw we
 * ship — the call would throw before a note sounded — and `punchcard` paints
 * into the draw context, which in this app is the visualizer's own canvas.
 * They style the strudel.cc REPL, so none of it is part of the music.
 *
 * The samples are loaded from the artist's repository on first play, the way
 * the original does it.
 *
 * The one musical edit: the original sets its tempo with `.cpm(120/4)` on three
 * separate patterns — the instrumental, the vocals, and the arrangement that
 * carries both. `cpm` is relative to the engine's current cps, so those factors
 * are 1.0 (and the doubling invisible) only when cps already happens to be 0.5.
 * `setcps` is global and survives whatever was played before, so arriving here
 * from a studio piece at `setcps(0.3)` made each factor 0.5/0.3 and the nested
 * pair 2.78 — the cover played back half again too fast. One `setcps(0.5)` at
 * the top says the same tempo and cannot be knocked off it. Every piece in the
 * collection has to pin its own tempo this way; a test holds that.
 */
const CHARLI_XCX_360 = `/*
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
);

// @version 1.2`;

export const FEATURED_PIECES: readonly FeaturedPiece[] = [
  {
    id: 'kaixi-charli-xcx-360',
    title: '360 (cover / remix)',
    originalArtist: 'Charli XCX',
    coder: 'KAIXI',
    coverUrl: '/featured/brat.jpg',
    style: 'Hyperpop',
    bpm: 120,
    blurb: [
      'Brat 还是那张 Brat，这个 360 是 KAIXI 用代码写的 360。',
      "Brat and it's the same Brat — this 360 is KAIXI's 360, written in code.",
    ],
    sourceUrl: 'https://x.com/xxkaixi/status/1926482951174234429',
    patternUrl: 'https://strudel.cc/?2ErYTSUotoaQ',
    code: CHARLI_XCX_360,
    // Read off the script's own bindings rather than described from listening,
    // so the notes and the code window never drift apart.
    layers: [
      { name: 'lead_synth', detail: ['锯齿波主音，低通 300Hz 加包络扫频，带 1/4 拍延迟', 'Sawtooth lead, 300Hz filter with an envelope sweep, quarter-note delay'] },
      { name: 'bass', detail: ['GM synth bass 2，低通 1800Hz', 'GM synth bass 2 under an 1800Hz filter'] },
      { name: 'sub_bass', detail: ['贝斯下移一个八度，垫住低频', 'The bass transposed an octave down, holding the bottom'] },
      { name: 'bass_drum', detail: ['TR-808 底鼓', 'TR-808 kick'] },
      { name: 'clap', detail: ['TR-808 拍手', 'TR-808 clap'] },
      { name: 'hihats', detail: ['TR-808 踩镲，第六段进入', 'TR-808 hats, entering in section six'] },
      { name: 'lead_saw', detail: ['GM lead 2 锯齿波，副歌的方波式点缀', 'GM lead 2 sawtooth, the stabs over the chorus'] },
      { name: 'vox', detail: ['人声采样，按 32 片切开逐拍取用', 'The vocal sample, sliced 32 ways and taken a slice at a time'] },
      { name: 'camera_flash', detail: ['相机快门采样，每四个 cycle 闪一次', 'A camera-shutter sample, once every four cycles'] },
    ],
  },
];

/** The piece with this id, or undefined once it has been retired from the list. */
export function findFeaturedPiece(id: string | null): FeaturedPiece | undefined {
  if (!id) return undefined;
  return FEATURED_PIECES.find((piece) => piece.id === id);
}
