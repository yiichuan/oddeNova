// LO-FI BEAT | BPM: 108
setcps(0.45)

stack(
  /* @layer KICK */
  // Kick: a steady four-beat skeleton, its level drifting gently on perlin noise; enters at cycle 4, leaves at cycle 12, and steps out of the breakdown (8–9)
  s("bd ~ ~ bd ~ ~ bd ~")
    .gain(perlin.range(0.85, 1))
    .lpf(2500)
    .mask("<0!4 1!4 0!2 1!2 0!2>"),

  /* @layer SNARE */
  // Snare lands on beats two and four, slightly behind the grid; enters at cycle 5, leaves at cycle 12, and drops out with the kick during the breakdown
  s("~ ~ sd ~ ~ ~ sd ~")
    .gain("<0.9 1 0.85 1>")
    .late(0.008)
    .room(0.2)
    .mask("<0!5 1!3 0!2 1!2 0!2>"),

  /* @layer HAT */
  // Eighth-note hats whose level breathes cycle by cycle, with an occasional double hit; enters at cycle 2, leaves at cycle 12, and leaves the tail bare
  s("hh*8")
    .gain("<0.35 0.5 0.42 0.6>")
    .pan(sine.range(0.55, 0.7).slow(4))
    .sometimes(x => x.ply(2))
    .mask("<0!2 1!6 0!2 1!2 0!2>"),

  /* @layer FILL */
  // Transition flourish: a snare triplet on the last beat of cycle 7 only, pushing the main section into the breakdown
  s("~ ~ ~ ~ ~ ~ ~ sd*3")
    .gain(0.42)
    .room(0.3)
    .mask("<0!7 1 0!6>"),

  /* @layer PIANO */
  // Piano lead: an A-minor eighth-note figure stepping around its motif and closing on the root and fifth; level drifts on perlin, the whole line a touch behind the grid
  n("[<0 2 4> <4 5> 7 <5 4> <2 4> <0 2> 4 ~]*<1!3 2>")
    .scale("A3:minor")
    .s("gm_piano")
    .gain(perlin.range(0.3, 0.45))
    .lpf(3800)
    .room(0.35)
    .delay(0.18)
    .pan(0.46)
    .late(0.01),

  /* @layer PAD */
  // Warm synth pad under the harmony Am–F–C–G, drifting through the mids; re-touched on each beat for a pulse, its filter taking one long, wide open-and-close arc across the whole piece
  note("<[a3,c4,e4,g4] [f3,a3,c4,e4] [c3,e3,g3,c4] [g3,b3,d4,e4]>")
    .s("gm_pad_warm")
    .struct("x ~ x ~")
    .attack(0.28)
    .release(1.6)
    .gain(0.25)
    .lpf(sine.range(900, 2200).slow(14))
    .room(0.55)
    .pan(0.62),

  /* @layer TEXTURE */
  // Vinyl crackle: a high, hissy bed behind everything, its level wandering naturally; it fades slowly over the last two cycles to leave a quiet ending
  s("noise")
    .hpf(1400)
    .lpf(7000)
    .gain(perlin.range(0.02, 0.06).mul("<1!12 0.5 0.2>"))
    .room(0.3)
    .pan(0.5)
)
