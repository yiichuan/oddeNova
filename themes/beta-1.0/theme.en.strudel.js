// oddeNova beta 1.0 theme song
// The Late Messenger  | BPM: 96
// Skyline → Wander → Chase → Sky
setcps(0.4)

stack(
  /* @layer horizon */
  // The harmonic ground, present throughout. Open ninths on a warm pad —
  // Dm9 → G(add9) → Cmaj9 → Am11 — a skyline drifting past.
  note("<[d3,a3,c4,e4] [g3,b3,d4,e4] [c3,g3,b3,d4] [a2,e3,g3,d4]>/2")
    .s("gm_pad_warm")
    .adsr([0.35, 0.45, 0.42, 0.65])
    .lpf(sine.range(900, 1800).slow(16))
    .gain(0.065)
    .room(0.42)
    .pan(sine.range(0.35, 0.65).slow(11)),

  /* @layer footsteps */
  // Walking. A rounded synth kick on all four.
  // In at cycle 5 | out at cycle 13.
  note("d1!4")
    .s("sine")
    .penv(18)
    .pdecay(0.045)
    .adsr([0.002, 0.16, 0])
    .gain("0.42 0.32 0.38 0.3")
    .mask("<0@4 1@8 0@20>"),

  /* @layer earth */
  // The ground under the walk. The root follows the chords every two cycles;
  // a sparse struct keeps the forward motion loose.
  // In at cycle 5 | out at cycle 14.
  note("<d2 g1 c2 a1>/2")
    .struct("~ x ~ [x ~] ~ x [~ x] ~")
    .s("triangle")
    .adsr([0.012, 0.25, 0.15, 0.18])
    .lpf(380)
    .gain("<0.26@12 0.12@20>")
    .mask("<0@4 1@9 0@19>"),

  /* @layer grasses */
  // Grass blades stirring in the wind. High white-noise flecks.
  // In at cycle 7 | out at cycle 13.
  s("~ white ~ white ~ white [~ white] white")
    .adsr([0.001, 0.035, 0])
    .hpf(6500)
    .lpf(11000)
    .gain("0.045 0.07 0.04 0.055")
    .pan("0.3 0.7 0.4 0.6")
    .mask("<0@6 1@6 0@20>"),

  /* @layer backbeat */
  // The walk's backbeat. Distant grit driving the last four bars before the chase.
  // In at cycle 9 | out at cycle 13.
  s("~ pink ~ pink")
    .adsr([0.004, 0.12, 0])
    .hpf(1100)
    .lpf(4200)
    .gain(0.09)
    .mask("<0@8 1@4 0@20>"),

  /* @layer walk_fill */
  // The fill into the chase. Four rising MPC rim shots show the chase's
  // drum colour before it arrives.
  // Once only, on the last beat of cycle 12.
  s("~ ~ ~ [rim rim rim rim]")
    .bank("AkaiMPC60")
    .adsr([0.003, 0.07, 0])
    .lpf(4000)
    .gain("0 0 0 [0.07 0.1 0.14 0.19]")
    .pan("0.5 0.5 0.5 [0.42 0.5 0.58 0.66]")
    .mask("<0@11 1 0@20>"),

  /* @layer running_steps */
  // The chase's main drum. A dark MPC kick in four-cycle variations for a
  // two-step run, easing off over the last two slots as it leaves.
  // In at cycle 13 | out at cycle 25.
  s("<[bd ~ ~ [~ bd] ~ bd ~ ~] [bd ~ ~ bd ~ ~ [bd ~] ~] [bd ~ ~ [~ bd] ~ bd ~ [~ bd]] [bd ~ ~ bd ~ [~ bd] ~ ~]>")
    .bank("AkaiMPC60")
    .lpf(2400)
    .gain("<[0.44 0.31 0.38 0.3]!23 [0.3 0.21 0.26 0.2]!9>")
    .mask("<0@12 1@12 0@8>"),

  /* @layer running_bass */
  // Fingered bass, short on the string, answering itself at +7/+12; the root
  // walks D–G–C–A with the chords.
  // In at cycle 13 | out at cycle 25.
  "<[[~ 0] ~ 0 ~ ~ [0 ~] 7 ~] [[~ 0] ~ ~ 0 ~ [~ 12] ~ 7]>"
    .add("<38 31 36 33>/2").note()
    .s("gm_electric_bass_finger")
    .adsr([0.008, 0.16, 0.15, 0.09])
    .lpf(850)
    .gain(0.24)
    .mask("<0@12 1@12 0@8>"),

  /* @layer chase_sub */
  // The chase's low-end weight. A pure sine root pedal lands every half cycle,
  // filling the 50–75Hz the fingered bass cannot reach.
  // In the last slot it strikes only the downbeat on d2, release stretched to
  // 2.2 seconds — the ground sinking away.
  // In at cycle 13 | out at cycle 26.
  note("<d2 g1 c2 a1>/2")
    .struct("<[x ~ ~ ~ x ~ ~ ~]!24 [x ~ ~ ~ ~ ~ ~ ~]!8>")
    .s("sine")
    .adsr([0.04, 0.3, 0.55, 0.4])
    .release("<0.4@24 2.2 0.4@7>")
    .gain("<0.18@24 0.12@8>")
    .mask("<0@12 1@13 0@7>"),

  /* @layer rushing_grasses */
  // Unevenly weighted MPC closed hats — the grasses, sped up for the chase.
  // Opened to 9500 to keep air in the climax; easing off over the last two slots.
  // In at cycle 13 | out at cycle 25.
  s("<[hh ~ hh [~ hh] hh ~ hh [hh hh]] [hh [~ hh] hh ~ hh [hh hh] ~ hh]>")
    .bank("AkaiMPC60")
    .adsr([0.003, 0.035, 0])
    .lpf(9500)
    .gain("<[0.095 0.05 0.072 0.042]!22 [0.062 0.033 0.047 0.027] [0.035 0.019 0.026 0.015]!9>")
    .pan("0.38 0.6 0.44 0.64")
    .mask("<0@12 1@12 0@8>"),

  /* @layer chase_backbeat */
  // A grainy snare trading off with a low rim, four-bar syncopation variants
  // turning the stride; easing off over the last two slots.
  // In at cycle 13 | out at cycle 25.
  s("<[~ ~ sd ~ ~ rim sd ~] [~ rim sd ~ ~ ~ sd [~ rim]] [~ ~ sd [~ rim] ~ ~ sd ~] [~ ~ sd ~ [rim ~] ~ sd [~ rim]]>")
    .bank("AkaiMPC60")
    .adsr([0.003, 0.09, 0])
    .lpf(4300)
    .gain("<[0.15 0.08 0.13 0.07]!23 [0.09 0.048 0.078 0.042]!9>")
    .mask("<0@12 1@12 0@8>"),

  /* @layer swell */
  // The rising tide. A cycle of white noise sweeping amplitude and filter
  // upward together (400 → 6400), peaking at the cut and dropping to nothing
  // so the chase can come through.
  // A swell points at where it lands, so it is used only here, walk → chase.
  // Once only, on cycle 12.
  s("white")
    .adsr([2.45, 0.06, 0])
    .hpf(400)
    .lpf(400)
    .lpenv(4)
    .lpattack(2.45)
    .lpdecay(0.06)
    .gain(0.1)
    .room(0.5)
    .mask("<0@11 1 0@20>"),

  /* @layer chase_landing */
  // The soft impact of the chase landing. A low-passed white-noise tail
  // instead of a cymbal, held at 0.09 so it never covers the drums; no delay,
  // reverb only.
  // Once only, on cycle 13.
  s("white")
    .adsr([0.004, 1.6, 0])
    .hpf(300)
    .lpf(2600)
    .room(0.85)
    .gain(0.09)
    .mask("<0@12 1 0@19>"),

  /* @layer wandering_light */
  // Five notes across four beats, a long delay letting the echoes chase each
  // other across the stereo field. The root still moves at /4; a colour voice.
  // On for cycles 5–13 and 25–29.
  "0 7 12 19 12".add("<62 55 60 57>/4").note()
    .s("triangle")
    .adsr([0.008, 0.15, 0])
    .lpf(sine.range(1200, 3800).slow(8))
    .gain("<0.095@12 0.06@12 0.08@8>")
    .delay(0.42)
    .room(0.5)
    .pan(sine.range(0.15, 0.85).slow(5))
    .mask("<0@4 1@8 0@12 1@4 0@4>"),

  /* @layer nova_theme */
  // The electric piano sings the whole eight-slot theme across four cycles;
  // the answering half is A—C—D / E—B—A / D.
  note("<~ [d5@2 ~ a4] [e5@2 f5 e5] [d5@3 ~] ~ [a4 c5 d5@2] [e5@2 b4 a4] [d5@3 ~]>")
    .fast(2)
    .s("gm_epiano1")
    .adsr([0.025, 0.35, 0.25, 0.9])
    .gain(0.19)
    .lpf(2400)
    .delay(0.32)
    .room(0.75)
    .pan(0.56)
    .mask("<0@8 1@4 0@20>"),

  /* @layer chasing_the_messenger */
  // A warm electric piano running D—E—A in offbeat phrases, set left to leave
  // the right side for the guitar.
  // In at cycle 13 | out at cycle 26.
  note("<[~ d4 ~ [e4 ~] ~ a4 ~ [~ e4]] [d4 ~ ~ [~ e4] ~ ~ a4 ~] [~ d4 ~ [a4 ~] ~ e4 [~ d4] ~] [~ ~ [e4 a4] ~ d4@2 ~ ~]>")
    .s("gm_epiano1")
    .adsr([0.018, 0.22, 0.18, 0.3])
    .lpf(2200)
    .delay(0.26)
    .room(0.38)
    .pan(0.43)
    .gain("<[0.25 0.19 0.22 0.17]!24 [0.1 0.08 0.09 0.07]!8>")
    .mask("<0@12 1@13 0@7>"),

  /* @layer messenger_reply */
  // A muted electric guitar answers from the right, landing in the gaps the
  // electric piano leaves.
  // In at cycle 19 | out at cycle 25.
  note("<[a3 ~ ~ ~ e4 ~ g4 ~] [~ ~ b3 ~ d4 ~ ~ [e4 ~]] [a3 ~ e4 ~ ~ ~ ~ g4] [d4 ~ ~ a3 ~ ~ ~ ~]>")
    .s("gm_electric_guitar_muted")
    .adsr([0.012, 0.12, 0])
    .lpf(2600)
    .delay(0.24)
    .room(0.3)
    .pan(0.65)
    .gain("0.16 0.12 0.14 0.1")
    .mask("<0@18 1@6 0@8>"),

  /* @layer distant_stars */
  // d6 → a5 → e6 → b5, one star every two slots; a little sustain is kept so
  // the 1.8-second release becomes a tail you can actually hear.
  // It has orbit 2 and its half-cycle delay to itself, so it never fights the
  // electric piano for the same echo. Out for the chase (cycles 13–24), the
  // image drifting slowly left.
  note("<d6 ~ a5 ~ e6 ~ b5 ~>")
    .s("sine")
    .adsr([0.02, 0.5, 0.12, 1.8])
    .gain(0.085)
    .room(0.9)
    .orbit(2)
    .delay(0.5)
    .delaysync(0.5)
    .delayfeedback(0.35)
    .pan(sine.range(0.18, 0.46).slow(9))
    .mask("<1@12 0@12 1@8>"),

  /* @layer wind */
  // Pink noise at slow(4), one breath every four bars, present throughout.
  s("pink").slow(4)
    .adsr([2, 1, 0.4, 2])
    .hpf(650)
    .lpf(sine.range(900, 2400).slow(13))
    .gain(0.035)
    .room(0.8)
    .pan(sine.range(0.2, 0.8).slow(21))
)
