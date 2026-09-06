// oddeNova beta 1.0 主题曲
// 迟来的信使  | BPM: 96
// 天际线 → 漫步 → 追逐 → 天空
setcps(0.4)

stack(
  /* @layer horizon */
  // 底色和声，全程常驻。温暖 Pad 的开放九和弦 Dm9 → G(add9) → Cmaj9 → Am11，缓慢移动的天际线
  note("<[d3,a3,c4,e4] [g3,b3,d4,e4] [c3,g3,b3,d4] [a2,e3,g3,d4]>/2")
    .s("gm_pad_warm")
    .adsr([0.35, 0.45, 0.42, 0.65])
    .lpf(sine.range(900, 1800).slow(16))
    .gain(0.065)
    .room(0.42)
    .pan(sine.range(0.35, 0.65).slow(11)),

  /* @layer footsteps */
  // 漫步。圆润合成底鼓四拍。
  // cycle 5 进 ｜ cycle 13 出。
  note("d1!4")
    .s("sine")
    .penv(18)
    .pdecay(0.045)
    .adsr([0.002, 0.16, 0])
    .gain("0.42 0.32 0.38 0.3")
    .mask("<0@4 1@8 0@20>"),

  /* @layer earth */
  // 漫步段的低音地面。根音随和弦每两个 cycle 换一次，稀疏 struct 保持松弛的前进感。
  // cycle 5 进 ｜ cycle 14 出。
  note("<d2 g1 c2 a1>/2")
    .struct("~ x ~ [x ~] ~ x [~ x] ~")
    .s("triangle")
    .adsr([0.012, 0.25, 0.15, 0.18])
    .lpf(380)
    .gain("<0.26@12 0.12@20>")
    .mask("<0@4 1@9 0@19>"),

  /* @layer grasses */
  // 草叶随风摆动的细碎声。高频白噪点缀。
  // cycle 7 进 ｜ cycle 13 出。
  s("~ white ~ white ~ white [~ white] white")
    .adsr([0.001, 0.035, 0])
    .hpf(6500)
    .lpf(11000)
    .gain("0.045 0.07 0.04 0.055")
    .pan("0.3 0.7 0.4 0.6")
    .mask("<0@6 1@6 0@20>"),

  /* @layer backbeat */
  // 漫步段的后拍。远处砂响推动追逐前的最后四小节。
  // cycle 9 进 ｜ cycle 13 出。
  s("~ pink ~ pink")
    .adsr([0.004, 0.12, 0])
    .hpf(1100)
    .lpf(4200)
    .gain(0.09)
    .mask("<0@8 1@4 0@20>"),

  /* @layer walk_fill */
  // 追逐前的过门。四个渐强的 MPC 鼓边先亮出追逐段的鼓色。
  // 只在 cycle 12 的末拍出现一次。
  s("~ ~ ~ [rim rim rim rim]")
    .bank("AkaiMPC60")
    .adsr([0.003, 0.07, 0])
    .lpf(4000)
    .gain("0 0 0 [0.07 0.1 0.14 0.19]")
    .pan("0.5 0.5 0.5 [0.42 0.5 0.58 0.66]")
    .mask("<0@11 1 0@20>"),

  /* @layer running_steps */
  // 追逐段的主鼓。低沉 MPC 底鼓以 four-cycle 变体制造 two-step 奔跑感，最后两格收力退场。
  // cycle 13 进 ｜ cycle 25 出。
  s("<[bd ~ ~ [~ bd] ~ bd ~ ~] [bd ~ ~ bd ~ ~ [bd ~] ~] [bd ~ ~ [~ bd] ~ bd ~ [~ bd]] [bd ~ ~ bd ~ [~ bd] ~ ~]>")
    .bank("AkaiMPC60")
    .lpf(2400)
    .gain("<[0.44 0.31 0.38 0.3]!23 [0.3 0.21 0.26 0.2]!9>")
    .mask("<0@12 1@12 0@8>"),

  /* @layer running_bass */
  // 指弹贝斯短促触弦，尾部用 +7/+12 回应，根音与和弦同步走 D–G–C–A。
  // cycle 13 进 ｜ cycle 25 出。
  "<[[~ 0] ~ 0 ~ ~ [0 ~] 7 ~] [[~ 0] ~ ~ 0 ~ [~ 12] ~ 7]>"
    .add("<38 31 36 33>/2").note()
    .s("gm_electric_bass_finger")
    .adsr([0.008, 0.16, 0.15, 0.09])
    .lpf(850)
    .gain(0.24)
    .mask("<0@12 1@12 0@8>"),

  /* @layer chase_sub */
  // 追逐段的低频重量。纯正弦根音踏板每半个 cycle 落一次，补上指弹贝斯够不到的 50–75Hz。
  // 末格只在正拍打一下主音 d2，release 拉到 2.2 秒，地面下沉的感觉。
  // cycle 13 进 ｜ cycle 26 出。
  note("<d2 g1 c2 a1>/2")
    .struct("<[x ~ ~ ~ x ~ ~ ~]!24 [x ~ ~ ~ ~ ~ ~ ~]!8>")
    .s("sine")
    .adsr([0.04, 0.3, 0.55, 0.4])
    .release("<0.4@24 2.2 0.4@7>")
    .gain("<0.18@24 0.12@8>")
    .mask("<0@12 1@13 0@7>"),

  /* @layer rushing_grasses */
  // 轻重错落的 MPC 闭镲，是 grasses 在追逐段的加速。开亮到 9500 留住高潮段的空气感，最后两格收力。
  // cycle 13 进 ｜ cycle 25 出。
  s("<[hh ~ hh [~ hh] hh ~ hh [hh hh]] [hh [~ hh] hh ~ hh [hh hh] ~ hh]>")
    .bank("AkaiMPC60")
    .adsr([0.003, 0.035, 0])
    .lpf(9500)
    .gain("<[0.095 0.05 0.072 0.042]!22 [0.062 0.033 0.047 0.027] [0.035 0.019 0.026 0.015]!9>")
    .pan("0.38 0.6 0.44 0.64")
    .mask("<0@12 1@12 0@8>"),

  /* @layer chase_backbeat */
  // 砂质军鼓和低声鼓边交替，用四小节切分变体给步伐换方向，最后两格收力。
  // cycle 13 进 ｜ cycle 25 出。
  s("<[~ ~ sd ~ ~ rim sd ~] [~ rim sd ~ ~ ~ sd [~ rim]] [~ ~ sd [~ rim] ~ ~ sd ~] [~ ~ sd ~ [rim ~] ~ sd [~ rim]]>")
    .bank("AkaiMPC60")
    .adsr([0.003, 0.09, 0])
    .lpf(4300)
    .gain("<[0.15 0.08 0.13 0.07]!23 [0.09 0.048 0.078 0.042]!9>")
    .mask("<0@12 1@12 0@8>"),

  /* @layer swell */
  // 反向涨潮。整个 cycle 的白噪同时做振幅与滤波上行（400 → 6400），峰值落在切点后归零，让追逐段露出来。
  // 涨潮指向落点，所以只用在漫步→追逐这一处。
  // 只在 cycle 12 出现一次。
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
  // 追逐落地的软冲击。低通白噪的长尾代替镲片，压到 0.09 不挡鼓，不进延迟只吃混响。
  // 只在 cycle 13 出现一次。
  s("white")
    .adsr([0.004, 1.6, 0])
    .hpf(300)
    .lpf(2600)
    .room(0.85)
    .gain(0.09)
    .mask("<0@12 1 0@19>"),

  /* @layer wandering_light */
  // 五颗音符跨越四拍，长延迟让回声左右追逐。根音仍走 /4，色彩层。
  // cycle 5–13 与 cycle 25–29 出场。
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
  // 电钢琴在四个 cycle 内唱完整个八格主题；下半句 A—C—D / E—B—A / D。
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
  // 温润电钢琴以 D—E—A 反拍短句奔跑，偏左给右侧吉他留位置。
  // cycle 13 进 ｜ cycle 26 出。
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
  // 闷音电吉他从右侧接话，落在电钢琴空隙。
  // cycle 19 进 ｜ cycle 25 出。
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
  // d6 → a5 → e6 → b5，每两格出现一颗；保留少量 sustain，让 1.8 秒 release 成为真正可听见的长尾。
  // 独占 orbit 2 的半 cycle 长延迟，不与电钢抢同一条回声。追逐段（cycle 13–24）退场，声像缓慢左移。
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
  // slow(4) 的粉噪四小节呼吸一次，全程常驻。
  s("pink").slow(4)
    .adsr([2, 1, 0.4, 2])
    .hpf(650)
    .lpf(sine.range(900, 2400).slow(13))
    .gain(0.035)
    .room(0.8)
    .pan(sine.range(0.2, 0.8).slow(21))
)
