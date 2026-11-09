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
    .sometimes(x => x.ply(2)),

  /* @layer PIANO */
  // 钢琴主旋律，A 小调八分音型围绕动机级进，落到根音与五度上收句；力度随 perlin 起伏、整体稍晚于网格
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
  // 暖色合成器垫底和声 Am–F–C–G，中频缓缓流转；每拍重新轻触一次形成脉动，滤波慢速开合
  note("<[a3,c4,e4,g4] [f3,a3,c4,e4] [c3,e3,g3,c4] [g3,b3,d4,e4]>")
    .s("gm_pad_warm")
    .struct("x ~ x ~")
    .attack(0.28)
    .release(1.6)
    .gain(0.25)
    .lpf(sine.range(900, 1800).slow(8))
    .room(0.55)
    .pan(0.62),

  /* @layer TEXTURE */
  // 黑胶底噪：高频沙沙声铺在背景，增益自然游走，负责整体质感与年代感
  s("noise")
    .hpf(1400)
    .lpf(7000)
    .gain(perlin.range(0.02, 0.06))
    .room(0.3)
    .pan(0.5)
)
