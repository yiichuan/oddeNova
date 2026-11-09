// LO-FI BEAT | BPM: 108
setcps(0.45)

stack(
  /* @layer KICK */
  // 底鼓，稳定四拍骨架，力度随 perlin 轻轻起伏
  s("bd ~ ~ bd ~ ~ bd ~")
    .gain(perlin.range(0.85, 1))
    .lpf(2500),

  /* @layer SNARE */
  // 军鼓落在二、四拍，略微晚一点点，避免完全机械对齐
  s("~ ~ sd ~ ~ ~ sd ~")
    .gain("<0.9 1 0.85 1>")
    .late(0.008)
    .room(0.2),

  /* @layer HAT */
  // 八分踩镲，力度与密度逐 cycle 呼吸，偶尔双击加一点人味
  s("hh*8")
    .gain("<0.35 0.5 0.42 0.6>")
    .pan(sine.range(0.55, 0.7).slow(4))
    .sometimes(x => x.ply(2))
)
