// oddeNova beta 1.0 default impression
// Reverie of oddeNova | BPM: 96
// An angel's prelude sounds, quietly. Before the waking, all the world lies barren.
// Onward. Across the open country, down into the long night, back from the storm and the far hills.

setcps(0.4)

stack(
  /* @layer horizon */
  // The world exists before the story does.
  // Before the first step is taken, the wide sky already lies across the eye.
  // The harmony of that sky, present throughout. Dm9 → G(add9) → Cmaj9 → Am11, turning slowly.
  note("<[d3,a3,c4,e4] [g3,b3,d4,e4] [c3,g3,b3,d4] [a2,e3,g3,d4]>/2")
    .s("gm_pad_warm")
    .adsr([0.35, 0.45, 0.42, 0.7])
    .lpf(sine.range(750, 1900).slow(16))
    .gain("<0.2@12 0.15@8 0.18@12>")
    .room(0.48)
    .pan(sine.range(0.34, 0.66).slow(11)),

  /* @layer wind */
  // A long wind comes from where no one is watching, and goes toward a shore no one knows.
  // Pink noise at slow(4) breathes once every four bars, right through the piece.
  s("pink").slow(4)
    .adsr([2, 1, 0.4, 2])
    .hpf("<650@12 420@8 700@12>")
    .lpf(sine.range(900, 2600).slow(13))
    .gain("<0.11@8 0.15@12 0.09@12>")
    .room(0.82)
    .pan(sine.range(0.18, 0.82).slow(21)),

  /* @layer footsteps */
  // Cycles 5–12: walking.
  // Not until the fifth daybreak does the wanderer finally set out.
  // She goes on into the dusk, her step light, still undecided where she is going.
  note("d1!4")
    .s("sine")
    .penv(18)
    .pdecay(0.045)
    .adsr([0.002, 0.16, 0])
    .gain("1.3 0.96 1.1 0.9")
    .mask("<0@4 1@8 0@20>"),

  /* @layer earth */
  // The low ground, rising under the sole of the foot, the root note asking upward.
  // Once the losing-the-way section begins, it gradually loses its trace.
  note("<d2 g1 c2 a1>/2")
    .struct("~ x ~ [x ~] ~ x [~ x] ~")
    .s("triangle")
    .adsr([0.012, 0.25, 0.15, 0.18])
    .lpf(380)
    .gain("<0.72@8 0.45@4 0@20>")
    .mask("<0@4 1@8 0@20>"),

  /* @layer grasses */
  // Cycles 6–12: grass in the dusk.
  // Green twining in the silence, speaking only with the wasteland.
  s("~ white ~ white ~ white [~ white] white")
    .adsr([0.001, 0.035, 0])
    .hpf(6500)
    .lpf(11000)
    .gain("0.14 0.21 0.12 0.17")
    .pan("0.3 0.7 0.4 0.6")
    .mask("<0@5 1@7 0@20>"),

  /* @layer wandering_light */
  // Cycles 5–12 and 21–28: five points of light coming and going, far off.
  // Those who never got the chance to leave a sound behind, lost into time.
  "0 7 12 19 12"
    .add("<62 55 60 57>/4").note()
    .s("triangle")
    .adsr([0.008, 0.15, 0])
    .lpf(sine.range(1200, 3800).slow(8))
    .gain("<0.29@12 0.17@8 0.22@12>")
    .delay(0.42)
    .room(0.5)
    .pan(sine.range(0.15, 0.85).slow(5))
    .mask("<0@4 1@8 0@8 1@8 0@4>"),

  /* @layer nova_theme */
  // The theme, the first time it appears whole.
  // Precisely because no one is listening, it can be sung freely.
  // fast(2) folds the eight-step phrase into four cycles, exactly the width the mask opens;
  // early(1) lines the phase up so the phrase starts at its head, not six steps in on the cadence.
  note("<~ [d5@2 ~ a4] [e5@2 f5 e5] [d5@3 ~] ~ [a4 c5 d5@2] [e5@2 b4 a4] [d5@3 ~]>")
    .fast(2)
    .early(1)
    .s("gm_epiano1")
    .adsr([0.025, 0.35, 0.25, 0.9])
    .gain(0.57)
    .lpf(2400)
    .delay(0.32)
    .room(0.75)
    .pan(0.56)
    .mask("<0@7 1@4 0@21>"),

  /* @layer lost_path */
  // Cycles 9–13: the road begins to fork.
  // Toward countless futures.
  // Eight steps, a length that divides the entry cycle, so every fork sets out from the same d5–a4 head.
  note("<[d5 ~ a4] ~ [e5 f5 ~] [~ d5] [c5 ~ d5] ~ [a4 ~ e5] [~ f5]>")
    .s("gm_epiano1")
    .adsr([0.018, 0.18, 0.12, 0.4])
    .lpf(1800)
    .delay(0.38)
    .room(0.65)
    .pan(sine.range(0.26, 0.74).slow(3))
    .gain("0.39 0.24 0.33 0.21")
    .mask("<0@8 1@5 0@19>"),

  /* @layer wrong_turn */
  // Unsteady landings in the bass. Rests used to throw it slightly out of place.
  // To either side, wasteland with no road through it.
  "<[~ 0 ~ ~ 7 ~ ~ 0] [~ ~ 0 ~ ~ 12 ~ 7]>"
    .add("<38 31 36 33>/2").note()
    .s("gm_electric_bass_finger")
    .adsr([0.01, 0.18, 0.1, 0.12])
    .lpf(700)
    .gain(0.42)
    .mask("<0@8 1@5 0@19>"),

  /* @layer night_steps */
  // Cycles 11–17: walking by night.
  // The dark closes in, the way the sea rises along both sides of a hull.
  // The steps crowd together, unwilling to let go of a useless rein.
  s("<[bd ~ ~ ~ bd ~ ~ [~ bd]] [bd ~ ~ [~ bd] ~ ~ bd ~]>")
    .bank("AkaiMPC60")
    .lpf(1800)
    .gain("0.6 0.36 0.48 0.3")
    .mask("<0@10 1@7 0@15>"),

  /* @layer distant_stars */
  // Arriving after nightfall, gone entirely at the height of the storm.
  // Born, burning, ageing, extinguished. Across a long reverberation, they light one another.
  note("<d6 ~ a5 ~ e6 ~ b5 ~>")
    .s("sine")
    .adsr([0.02, 0.5, 0.12, 1.8])
    .gain(0.24)
    .room(0.9)
    .orbit(2)
    .delay(0.5)
    .delaysync(0.5)
    .delayfeedback(0.35)
    .pan(sine.range(0.18, 0.46).slow(9))
    .mask("<0@9 1@5 0@7 1@11>"),

  /* @layer first_rain */
  // Cycles 13–16: the first few drops, scattered high white noise falling.
  // The gods are not yet angry; this is only a warning, under the breath.
  s("~ white ~ ~ [~ white] ~ white ~")
    .adsr([0.001, 0.055, 0])
    .hpf(5200)
    .lpf(10500)
    .gain("0.11 0.15 0.075 0.18")
    .pan("0.25 0.72 0.42 0.63")
    .mask("<0@12 1@4 0@16>"),

  /* @layer storm_swell */
  // Cycle 16: a whole cycle of tide rising before the downpour cuts in.
  // The wind rolls back, and the distance draws tight into a narrow line.
  // Then the gates of heaven open.
  s("white")
    .adsr([2.35, 0.08, 0])
    .hpf(260)
    .lpf(500)
    .lpenv(5)
    .lpattack(2.35)
    .lpdecay(0.08)
    .gain(0.39)
    .room(0.65)
    .mask("<0@15 1 0@16>"),

  /* @layer downpour */
  // Cycles 17–21: the body of the storm.
  // Rain pressing in from every side, high white noise crossing the field at different weights.
  // The edges dissolve, and the water covers the path and the footprints going who knows where.
  s("white!8")
    .adsr([0.002, 0.08, 0])
    .hpf(2800)
    .lpf(9000)
    .gain("<0@16 [0.24 0.36 0.21 0.45]!3 [0.17 0.24 0.14 0.2]!2 0@11>")
    .pan("0.2 0.7 0.35 0.82")
    .room(0.72)
    .mask("<0@16 1@5 0@11>"),

  /* @layer storm_drums */
  // Cycles 17–21: the climax.
  // The thunder-rain strikes; something vast, high overhead, moving behind the clouds.
  s("<[bd ~ [~ bd] ~ ~ ~ bd ~] [bd ~ ~ bd ~ ~ [bd bd] ~] [bd [~ bd] ~ ~ ~ ~ bd ~] [bd ~ [bd ~] ~ ~ [~ bd] ~ ~]>")
    .bank("AkaiMPC60")
    .lpf(2600)
    .gain("<0@16 [1.3 0.84 1 0.69]!2 [1.5 0.96 1.2 0.78]!2 [0.78 0.48 0.6 0.36] 0@11>")
    .mask("<0@16 1@5 0@11>"),

  /* @layer storm_sub */
  // The sustained low weight under the roaring rain.
  // The root turns D → G → C in step with the sky's harmony — the same root line earth walks.
  // The last cycle takes a long release, so the low end leaves trailing a tail.
  note("<d2 g1 c2 a1>/2")
    .struct("x ~ ~ ~ x ~ ~ ~")
    .s("sine")
    .adsr([0.035, 0.3, 0.5, 0.5])
    .release("<0.5@20 1.8 0.5@11>")
    .gain(0.6)
    .mask("<0@16 1@5 0@11>"),

  /* @layer thunder */
  // Two low rolls of thunder.
  s("pink")
    .adsr([0.005, 1.4, 0])
    .hpf(55)
    .lpf(520)
    .gain(0.57)
    .room(0.9)
    .mask("<0@17 1 0@1 1 0@12>"),

  /* @layer storm_theme */
  // The theme lifts an octave inside the storm, the whole melody scattered.
  // The tune as memory holds it can no longer be made out entire.
  // A few notes of it come through the wind and rain, in memory of a whole that cannot be reached.
  note("<d5 [~ e5] a5 ~ [f5 e5] ~ d6 ~ a5 ~ e6 ~ d5 ~>")
    .s("gm_epiano1")
    .adsr([0.012, 0.2, 0.12, 0.3])
    .lpf(3200)
    .delay(0.22)
    .room(0.55)
    .gain("0.63 0.39 0.54 0.3")
    .mask("<0@16 1@5 0@11>"),

  /* @layer rain_tail */
  // Cycles 21–24: the storm withdraws, leaving only scattered last drops.
  // Water runs downhill along the grass, the stones, and the nameless road.
  s("~ white ~ ~ ~ [white ~] ~ white")
    .adsr([0.001, 0.11, 0])
    .hpf(3600)
    .lpf(7200)
    .gain("<0@20 0.18@2 0.11@2 0@8>")
    .pan("0.7 0.3 0.62 0.4"),

  /* @layer after_rain */
  // The rain sinks once, very low, and then leaves the stage.
  // The world slowly gives itself back its own outline.
  note("d2")
    .s("sine")
    .adsr([0.05, 0.4, 0.55, 2.4])
    .gain(0.39)
    .mask("<0@20 1 0@11>"),

  /* @layer night_walk */
  // Cycles 22–25: onward again.
  // This time the step is sparse, measuring out a washed earth anew.
  s("bd ~ ~ ~ ~ bd ~ ~")
    .bank("AkaiMPC60")
    .lpf(1300)
    .gain(0.36)
    .mask("<0@21 1@4 0@7>"),

  /* @layer birds */
  // Cycles 25–29: the first flock.
  // Rising, threading the empty mist.
  note("<d6 e6 a6 ~ e6 a6 d7 ~ a5 d6 e6 ~>")
    .s("triangle")
    .adsr([0.005, 0.09, 0])
    .lpf(5200)
    .delay(0.18)
    .room(0.72)
    .gain("0.17 0.22 0.14 0.21")
    .pan("0.18 0.72 0.34 0.84")
    .mask("<0@24 1@5 0@3>"),

  /* @layer flock */
  // A second flock, further off, its calls thinning.
  // Looking up a long while, until the ranges are covered in morning light.
  note("<a6 ~ d7 ~ e7 ~ a6 ~>")
    .s("sine")
    .adsr([0.01, 0.14, 0.05, 0.7])
    .gain(0.14)
    .room(0.9)
    .delay(0.36)
    .pan(sine.range(0.25, 0.8).slow(3))
    .mask("<0@25 1@4 0@3>"),

  /* @layer open_sky */
  // After cycle 25, the filter opens.
  // The dark cloud falls away and the sky is wide again.
  // The distance the storm rubbed out had never really gone.
  note("<[d4,a4,c5,e5] [g4,b4,d5,e5] [c4,g4,b4,d5] [a3,e4,g4,d5]>/2")
    .s("gm_pad_warm")
    .adsr([0.5, 0.8, 0.35, 1.4])
    .lpf(3200)
    .gain(0.14)
    .room(0.92)
    .pan(sine.range(0.3, 0.7).slow(8))
    .mask("<0@24 1@8>"),

  /* @layer returning_theme */
  // The last four cycles: the same theme turning back from higher up.
  // The old song that was left over sounds again.
  // The one who returns is no longer the one who set out.
  note("<~ [d6@2 ~ a5] [e6@2 f6 e6] [d6@3 ~] ~ [a5 c6 d6@2] [e6@2 b5 a5] [d6@3 ~]>")
    .fast(2)
    .s("gm_epiano1")
    .adsr([0.03, 0.42, 0.3, 1.2])
    .gain(0.42)
    .lpf(2800)
    .delay(0.38)
    .room(0.85)
    .pan(0.54)
    .mask("<0@28 1@4>")
)
