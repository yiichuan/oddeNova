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
    .sometimes(x => x.ply(2))
)
