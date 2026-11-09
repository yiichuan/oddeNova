// LO-FI BEAT | BPM: 108
setcps(0.45)

stack(
  /* @layer KICK */
  // Kick: a steady four-beat skeleton, its level drifting gently on perlin noise
  s("bd ~ ~ bd ~ ~ bd ~")
    .gain(perlin.range(0.85, 1))
    .lpf(2500),

  /* @layer SNARE */
  // Snare lands on beats two and four, a hair late so it never sits on the grid mechanically
  s("~ ~ sd ~ ~ ~ sd ~")
    .gain("<0.9 1 0.85 1>")
    .late(0.008)
    .room(0.2),

  /* @layer HAT */
  // Eighth-note hats whose level breathes cycle by cycle, with an occasional double hit for feel
  s("hh*8")
    .gain("<0.35 0.5 0.42 0.6>")
    .pan(sine.range(0.55, 0.7).slow(4))
    .sometimes(x => x.ply(2)),

  /* @layer PIANO */
  // Piano lead: an A-minor eighth-note figure stepping around its motif and closing on the root and fifth; level drifts on perlin, the whole line a touch behind the grid
  n("[<0 2 4> <4 5> 7 <5 4> <2 4> <0 2> 4 ~]*<1!3 2>")
    .scale("A3:minor")
    .s("gm_piano")
    .gain(perlin.range(0.3, 0.45))
    .lpf(3800)
    .room(0.35)
    .pan(0.46)
    .late(0.01)
)
