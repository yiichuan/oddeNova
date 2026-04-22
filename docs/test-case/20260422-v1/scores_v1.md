# Vibe 测试用例乐谱 — 2026-04-22

> 由 Vibe 系统内置 Agent（claude-sonnet-4-6 + Strudel 工具链）自动生成
> 生成时间: 2026-04-22 | 模型: claude-sonnet-4-6 | 代理: https://timesniper.club

## 目录

- [Vibe 测试用例乐谱 — 2026-04-22](#vibe-测试用例乐谱--2026-04-22)
  - [目录](#目录)
  - [TC-001 — 自然表达-Lofi House](#tc-001--自然表达-lofi-house)
  - [TC-002 — 极简触发-Coastline](#tc-002--极简触发-coastline)
  - [TC-003 — 定制变体-Downtempo](#tc-003--定制变体-downtempo)
  - [TC-004 — 风格-深夜开车 Ambient Techno](#tc-004--风格-深夜开车-ambient-techno)
  - [TC-005 — 风格-日式咖啡厅 Jazz](#tc-005--风格-日式咖啡厅-jazz)
  - [TC-006 — 风格-赛博朋克 Dark Synth](#tc-006--风格-赛博朋克-dark-synth)
  - [TC-007 — 风格-森林冥想 Ambient](#tc-007--风格-森林冥想-ambient)
  - [TC-008 — 风格-80s 迪斯科 Disco](#tc-008--风格-80s-迪斯科-disco)
  - [TC-009 — 场景-千与千寻开场](#tc-009--场景-千与千寻开场)
  - [TC-010 — 场景-游戏 Boss 配乐](#tc-010--场景-游戏-boss-配乐)
  - [TC-011 — 场景-早晨咖啡时刻](#tc-011--场景-早晨咖啡时刻)
  - [TC-012 — 场景-Burial 风格 UK Garage](#tc-012--场景-burial-风格-uk-garage)
  - [TC-013 — 技术-Minimal Techno](#tc-013--技术-minimal-techno)
  - [TC-014 — 技术-Trip-hop](#tc-014--技术-trip-hop)
  - [TC-015 — 技术-Nu-jazz 四拍循环](#tc-015--技术-nu-jazz-四拍循环)
  - [TC-016 — 极简-开放式请求 v1](#tc-016--极简-开放式请求-v1)
  - [TC-017 — 极简-开放式请求 v2](#tc-017--极简-开放式请求-v2)
  - [TC-018 — 极简-风格标签](#tc-018--极简-风格标签)

---

## TC-001 — 自然表达-Lofi House

**提示词**: 来一段 90 BPM 的 lofi house 完整作品。和弦循环用 Bbm9 → Fm9，共享给电钢琴、原声贝斯和一条飘的旋律层。鼓走 909，加一点 swing（late 0.01）。旋律层要用 chunk 切段、perlin 调音量、sine 扫 lpf、偶尔 ply，带 reverb/delay/fm/distortion。

**Agent 说明**: 校验通过，提交！

```strudel
setcps(0.375)
stack(
  /* @layer drums */ s("bd ~ ~ ~ bd ~ ~ ~, ~ ~ sd ~ ~ ~ sd ~, [~ oh]*4").bank("RolandTR909").swing(0.52).late(0.01).gain("0.9 _ _ _ 0.9 _ _ _, 0.75 _ 0.75 _, 0.35 _ 0.35 _"),
  /* @layer epiano */ chord("<Bbm9 Fm9>/2").dict("ireal").voicing().s("piano").gain(perlin.range(0.45, 0.65)).lpf(sine.range(600, 1400).slow(16)).room(0.6).delay(0.15).slow(2),
  /* @layer bass */ note("<[bb1 ~ bb1 ~] [f1 ~ f1 ~]>/1").s("bass").gain(0.75).lpf(320).attack(0.02).release(0.4).room(0.2),
  /* @layer lead */ n("0 2 4 [3 5] 7 [4 6] 2 ~").scale("<Bb4:minor pentatonic Bb4:minor pentatonic>/2").s("arpy").chunk(4, x => x.ply(2)).gain(perlin.range(0.3, 0.7)).lpf(sine.range(400, 2200).slow(12)).room(0.85).delay(0.4).delay(0.4).fm(2.5).distort(0.3).pan(sine.range(0.3, 0.7).slow(7)).sometimes(x => x.ply(2)).jux(rev)
)
```

---

## TC-002 — 极简触发-Coastline

**提示词**: 按 coastline 风格做一段：Bbm9/Fm9、共享和弦进行、鼓+电钢+贝斯+旋律四层，旋律层要丰富点。

**Agent 说明**: 校验通过，提交！

```strudel
setcps(0.375)
stack(
  /* @layer drums */ s("808bd ~ ~ ~, ~ ~ sd ~").gain("0.9 _ _ _, _ _ 0.7 _").bank("RolandTR808"),
  /* @layer hh */ s("hh*8").gain("0.4 0.25 0.55 0.25 0.4 0.25 0.7 0.25").pan(sine.range(0.3,0.7).slow(4)).bank("RolandTR808"),
  /* @layer pad */ chord("<Bbm9 Fm9>/2").dict("ireal").voicing().s("piano").gain(perlin.range(0.45,0.62)).room(0.8).lpf(2000).attack(0.12).release(2.2).pan(0.45),
  /* @layer bass */ note("<[bb1 ~ bb1 ~] [f1 ~ f1 ~]>/1").s("bass").lpf(300).gain(0.78).attack(0.02).release(0.6),
  /* @layer lead */ note("bb4 db5 ~ f5 ab4 ~ eb5 db5 | f4 ~ ab4 c5 eb5 ~ db5 ~").s("rhodey").lpf(sine.range(1800,2800).slow(4)).room(0.7).delay(0.35).delayfeedback(0.4).delaytime(0.375).attack(0.06).release(1.4).gain(0.72).pan(sine.range(0.35,0.65).slow(7))
)
```

---

## TC-003 — 定制变体-Downtempo

**提示词**: 参考 coastline 的结构做一段 downtempo：和弦改成 <Am11 Dm9 Fmaj7 G7>，BPM 85，电钢琴换成 gm_electric_piano_1，贝斯保持 gm_acoustic_bass，旋律层保留 chunk(4, fast(2)) 和 perlin/sine 的调制，但把 mask 改成 <1 0 1 1>/16

**Agent 说明**: 校验通过，提交播放。

```strudel
setcps(0.3541666666666667)
stack(
  /* @layer pad */ chord("<Am11 Dm9 Fmaj7 G7>/4").dict("ireal").voicing().s("sine").gain(perlin.range(0.35, 0.55)).attack(0.8).release(1.2).room(0.6).lpf(sine.range(900, 1800).slow(16)).pan(sine.range(0.3, 0.7).slow(11)),
  /* @layer epiano */ n("<0 2 4 7 9 4 2 0>/2").scale("A3:minor").s("gm_electric_piano_1").mask("<1 0 1 1>/16").gain(perlin.range(0.5, 0.75)).attack(0.05).release(0.6).room(0.4).delay(0.25).chunk(4, fast(2)).pan(cosine.range(0.35, 0.65).slow(9)),
  /* @layer bass */ note("<a1 d2 f2 g2>/4").s("gm_acoustic_bass").gain(0.72).attack(0.01).release(0.5).lpf(300).sometimes(x => x.ply(2)),
  /* @layer drums */ s("bd ~ ~ bd ~ ~ bd ~, ~ ~ sd ~ ~ ~ sd ~, hh*4").bank("RolandTR808").gain("<0.7 0.68 0.72 0.7>").room(0.25).lpf(8000)
)
```

---

## TC-004 — 风格-深夜开车 Ambient Techno

**提示词**: 来一段深夜开车的 ambient techno，节奏稀疏但 bassline 厚重

**Agent 说明**: 校验通过，提交播放！

```strudel
setcps(0.5208333333333334)
stack(
  /* @layer drums */ s("bd ~ ~ ~ ~ ~ ~ ~, ~ ~ ~ ~ sd ~ ~ ~, hh ~ hh ~ hh ~ hh ~").bank("RolandTR808").gain("0.9 _ _ _ _ _ _ _, 0.75 _ _ _ _ _ _ _, 0.45 _ _ _ _ _ _ _").delay(0.25).delaytime(0.375).delayfeedback(0.3).room(0.4).size(0.6),
  /* @layer bass */ note("g1 ~ ~ g1 ~ ~ bb1 ~ ~ f1 ~ ~ g1 ~ ~ d1 ~ ~").s("sawtooth").lpf(180).lpq(2).gain(0.85).attack(0.08).release(1.8).room(0.3).orbit(2),
  /* @layer pad */ n("0 3 7 10 0 5 3 7").scale("G3:minor").s("superpad").slow(8).attack(2.5).release(4).room(0.9).size(0.95).cutoff(900).resonance(0.3).gain(0.38).pan(sine.slow(19)),
  /* @layer fx */ s("~ ~ ~ metal*2").bank("RolandTR808").speed("<0.5 0.7 0.3 0.6>").gain("<0.3 0.4 0.2 0.35>").delay(0.6).delaytime("<0.375 0.5>").delayfeedback(0.5).room(0.8).size(0.9).lpf("<3000 4000 2500 5000>").pan("<0.3 0.7 0.4 0.6>")
)
```

---

## TC-005 — 风格-日式咖啡厅 Jazz

**提示词**: 做一段日式咖啡厅的背景音乐，jazz 风格，带钢琴和贝斯

**Agent 说明**: 代码结构已就绪，直接提交播放。

```strudel
setcps(0.36666666666666664)
stack(
  /* @layer lead */ note("c4 eb4 g4 bb4 c5 bb4 g4 eb4").s("piano").slow(2).swing(0.6).attack(0.08).release(1.8).gain(0.55).lpf(3200).room(0.4).pan(sine.range(0.3,0.7).slow(8)),
  /* @layer bass */ note("c2 eb2 g2 bb2 ab2 g2 f2 eb2").s("bass").slow(2).swing(0.6).lpf(400).attack(0.05).release(1.2).gain(0.55).room(0.3),
  /* @layer drums */ s("~ bd ~ bd").bank("RolandTR909").gain(0.45).slow(2),
  /* @layer hh */ s("hh*4").gain(perlin.range(0.18,0.28)).pan(sine.range(0.35,0.65).slow(6)).room(0.5),
  /* @layer pad */ chord("<Cm9 Fm9 Bb7 Ebmaj7>/4").dict("ireal").voicing().s("piano").gain(0.28).attack(0.6).release(3.0).room(0.6).lpf(1800).pan(0.4)
)
```

---

## TC-006 — 风格-赛博朋克 Dark Synth

**提示词**: 来一段赛博朋克城市感的 dark synth，节奏感强，带失真

**Agent 说明**: 校验通过，提交播放！

```strudel
setcps(0.5833333333333334)
stack(
  /* @layer drums */ s("bd bd:2 bd bd:2, ~ sd ~ sd, hh*8").bank("RolandTR808").gain("1 0.9 1 0.9, 0.85 0.85 0.85 0.85, 0.55").speed("1 1.05 1 1.02, 1 1 1 1, 1.1").distort(0.35).crush(10).room(0.15),
  /* @layer bass */ note("c2 c2 eb2 c2 g1 g1 bb1 c2").s("sawtooth").lpf(800).lpq(8).gain(0.85).distort(0.7).room(0.1).attack(0.01).release(0.18),
  /* @layer pad */ note("<[c3,eb3,g3] [f3,ab3,c4] [ab2,eb3,gb3] [bb2,d3,f3]>").s("sawtooth").lpf("<800 600 900 700>").attack(1.2).release(3.5).delay(0.4).delayfeedback(0.5).delaytime(0.375).room(0.7).gain(0.38).pan(sine.range(0.3,0.7).slow(11)),
  /* @layer lead */ note("c4 eb4 f4 g4 bb4 g4 f4 eb4").s("sawtooth").gain(0.7).lpf(2800).lpq(8).distort(0.7).room(0.15).delay(0.18).delayfeedback(0.35).delaytime(0.18).attack(0.01).release(0.18).pan(sine.range(0.3,0.7).slow(7))
)
```

---

## TC-007 — 风格-森林冥想 Ambient

**提示词**: 做一段像在森林里冥想的 ambient 音乐，不需要鼓

**Agent 说明**: 校验通过，直接提交。

```strudel
setcps(0.3)
stack(
  /* @layer pad */ n("0 3 5 7 10 7 5 3").scale("C3:dorian").s("supersaw").attack(2.5).release(4.5).decay(1.5).sustain(0.6).gain(0.28).lpf(900).lpq(0.5).room(0.95).roomsize(0.98).slow(4),
  /* @layer lead */ note("e5 ~ ~ g5 ~ ~ a5 ~ ~ ~ b5 ~ ~ ~ ~ ~").s("flute").attack(0.8).decay(0.3).sustain(0.7).release(3.5).delay(0.6).delaytime(0.75).delayfeedback(0.45).room(0.9).size(0.95).gain(0.38).pan(sine.range(0.35,0.65).slow(16)),
  /* @layer fx */ s("birds").gain(0.18).room(0.95).roomsize(0.98).slow(3).pan(sine.range(0.2,0.8).slow(7)).lpf(sine.range(3000,9000).slow(11)).delay(0.4).delaytime(0.75).delayfeedback(0.45),
  /* @layer bass */ note("<c2 f2 g2 a2>/8").s("sine").attack(3).release(6).sustain(0.8).gain(0.22).room(0.7).lpf(200)
)
```

---

## TC-008 — 风格-80s 迪斯科 Disco

**提示词**: 来一段 80s 复古迪斯科风格的舞曲

**Agent 说明**: 校验通过，提交播放！

```strudel
setcps(0.5)
stack(
  /* @layer drums */ s("bd bd bd bd").stack(s("~ sd ~ sd")).stack(s("hh*16").gain(0.55)).bank("RolandTR909").gain(0.85),
  /* @layer bass */ note("a2 a2 d3 e3 g3 e3 a2 a3").s("sawtooth").lpf("800 1200 900 1100 1000 950 800 1400").lpq(3).attack(0.01).decay(0.15).sustain(0.6).release(0.1).gain(0.85).shape(0.3),
  /* @layer pad */ note("<[a3,c4,e4,g4] [d3,f3,a3,c4]>").s("sawtooth").cutoff(1800).resonance(0.3).attack(0.6).decay(0.2).sustain(0.8).release(1.8).gain(0.55).room(0.4).pan(sine.range(0.3,0.7).slow(8)),
  /* @layer lead */ note("a4 c5 e5 a4 g4 e4 c5 e5").s("sawtooth").lpf(2800).lpq(3).attack(0.01).decay(0.12).sustain(0.2).release(0.08).gain(0.55).delay(0.15).delayfeedback(0.25).delaytime(0.125)
)
```

---

## TC-009 — 场景-千与千寻开场

**提示词**: 帮我做一段像《千与千寻》开场那种略带忧伤的轻音乐

**Agent 说明**: 代码验证通过，可以提交了！

```strudel
setcps(0.3)
stack(
  /* @layer lead */ note("<c4 ~ e4 ~ g4 ~ [a4 ~] ~ ~ eb4 ~ d4 ~ ~ ~ c4 ~ ~ ~>").s("piano").gain(0.55).attack(0.08).release(3.5).delay(0.25).delaytime(0.75).delayfeedback(0.3).room(0.7).size(0.9).lpf(3200),
  /* @layer pad */ n("0 5 7 12").scale("A4:minor").s("strings").slow(8).attack(1.8).release(3.5).room(0.9).size(0.8).gain(0.38).lpf(2200).pan(sine.range(0.35,0.65).slow(16)),
  /* @layer bass */ note("<a2 ~ ~ ~ f2 ~ ~ ~ c2 ~ ~ ~ g2 ~ ~ ~>/2").s("piano").gain(0.45).attack(0.05).release(2.5).room(0.6).lpf(600).hpf(60),
  /* @layer fx */ note("<e5 ~ ~ ~ ~ ~ ~ ~ a5 ~ ~ ~ ~ ~ ~ ~ g5 ~ ~ ~ ~ ~ ~ ~>/4").s("piano").gain(0.22).attack(0.3).release(4).room(0.95).size(1).delay(0.6).delaytime(1.2).delayfeedback(0.45).lpf(2000).pan(cosine.range(0.2,0.8).slow(20))
)
```

---

## TC-010 — 场景-游戏 Boss 配乐

**提示词**: 做一段适合打 boss 的游戏配乐，紧张、层次丰富

**Agent 说明**: 校验通过，提交！

```strudel
setcps(0.5833333333333334)
stack(
  /* @layer drums */ s("bd bd sd bd bd bd sd bd").fast(2).stack(s("hh*16").gain(0.5)).stack(s("~ ~ ~ oh ~ ~ ~ oh").gain(0.7)).stack(s("cp ~ cp ~").gain(0.6)).gain(0.9).distort(0.3),
  /* @layer bass */ note("e1 e1 g1 e1 b0 e1 d1 e1").s("sawtooth").lpf(400).lpq(3).gain(0.85).distort(0.4).attack(0.01).release(0.18).room(0.1),
  /* @layer pad */ note("e3 f3 e3 d#3 b2 c3 b2 a#2").s("strings").slow(8).attack(2).release(4).gain(0.45).lpf(sine.range(600,1800).slow(16)).room(0.8).size(0.9).pan(sine.range(0.3,0.7).slow(20)),
  /* @layer lead */ note("e4 g4 b4 e5 d5 b3 g4 e4").s("sawtooth").lpf(2200).lpq(8).gain(0.72).attack(0.01).release(0.18).distort(0.55).delay(0.18).delaytime(0.125).delayfeedback(0.35).room(0.2).fast(2).every(4, jux(rev)),
  /* @layer fx */ s("metal*2 ~ [metal:2 ~] ~, ~ ~ [rim ~] ~, bd*<1 2 4 8>").speed("<0.5 1 2 0.25>/8").room(0.9).size(0.95).gain("<0.6 0.7 0.8 0.5>/3").hpf("<200 400 800>/5").distort(0.7).pan(rand).delay(0.4).delaytime("<0.125 0.25 0.0625>/4").delayfeedback(0.6).every(3,rev).every(5,jux(rev))
)
```

---

## TC-011 — 场景-早晨咖啡时刻

**提示词**: 来一段早晨醒来窗边喝咖啡的感觉，轻盈、温暖

**Agent 说明**: 旋律和鼓点都有了，再加上温暖的低音线和一段轻盈的钢琴旋律，让整首曲子更有层次感。

```strudel
setcps(0.36666666666666664)
stack(
  /* @layer drums */ s("[~ bd] ~ [~ bd] ~, ~ ~ [~ sd:2] ~, [hh ~ hh ~] [hh ~ ~ ~] [hh ~ hh ~] [~ hh ~ hh]").gain("0.55 _ _ _, 0.45 _ _ _, 0.3 _ _ _").room(0.4).shape(0.15),
  /* @layer pad */ note("g4 b4 d5 g5").s("piano").slow(4).attack(0.8).release(3.5).gain(0.38).room(0.7).size(0.6).pan(sine.range(0.35,0.65).slow(11)),
  /* @layer bass */ note("g2 ~ d3 ~ b2 ~ e3 ~").s("bass").slow(2).attack(0.1).release(1.8).gain(0.45).room(0.3).lpf(400),
  /* @layer lead */ note("g5 ~ b5 ~ d6 ~ ~ b5, ~ ~ ~ g5 ~ ~ a5 ~").s("piano").slow(2).attack(0.15).release(2.2).gain(0.42).room(0.65).size(0.5).pan(0.55)
)
```

---

## TC-012 — 场景-Burial 风格 UK Garage

**提示词**: 做一段像 Burial 风格的 UK garage，有颗粒感的人声采样，沉重的鼓

**Agent 说明**: 校验通过，提交播放！

```strudel
setcps(0.5416666666666666)
stack(
  /* @layer drums */ s("808bd*2 ~ 808bd ~, ~ ~ ~ [808bd ~], hh*4, ~ sd ~ sd, ~ [~ 808bd] ~ ~").bank("RolandTR808").swing(0.55).gain(irand(2).segment(8).range(0.7,1.0).slow(4)).room(0.15).shape(0.3),
  /* @layer bass */ note("g1 ~ ~ ~ f1 ~ ~ ~ bb1 ~ ~ ~ d2 ~ ~ ~").s("sawtooth").lpf(180).lpq(8).gain(0.85).attack(0.05).release(1.8).room(0.3).orbit(2),
  /* @layer vocal */ s("arpy").n("<3 5 7 2>/2").speed("<0.5 0.48 0.52 0.45>").gain(perlin.range(0.3, 0.65).slow(6)).lpf(sine.range(800, 2200).slow(12)).room(0.9).delay(0.6).delaytime(0.375).delayfeedback(0.4).pan(rand.range(0.2, 0.8)).crush(6).orbit(3),
  /* @layer pad */ chord("<Gm9 Fm9 Bbmaj7 Dm7>/8").dict("ireal").voicing().s("sine").gain(0.28).attack(2).release(3).room(1.2).lpf(sine.range(400, 900).slow(16)).pan(cosine.range(0.3, 0.7).slow(10)).orbit(4)
)
```

---

## TC-013 — 技术-Minimal Techno

**提示词**: 来一段 120 BPM 的 minimal techno，只用 kick、hihat、一条 acid bassline，bassline 用 sawtooth + lpf 调制

**Agent 说明**: 验证通过，提交播放！

```strudel
setcps(0.5)
stack(
  /* @layer drums */ s("bd bd bd bd").bank("RolandTR808").gain(0.95).shape(0.3).lpf(200),
  /* @layer hh */ s("hh*16").gain("0.9 0.5 0.7 0.3 0.8 0.4 0.6 0.2 0.9 0.5 0.7 ~ 0.8 0.4 0.6 0.3").pan(perlin.range(0.3,0.7)).nudge("0 0 0.02 0 0 0.015 0 0 0 0.01 0 0 0.02 0 0.01 0"),
  /* @layer bass */ note("<[a1 ~ a1 c2] [a1 g1 ~ f1] [a1 ~ e2 ~] [g1 ~ a1 c2]>").s("sawtooth").lpf(sine.range(300, 1800).slow(4)).lpq(18).gain(0.75).attack(0.005).decay(0.18).sustain(0.3).release(0.08).shape(0.2)
)
```

---

## TC-014 — 技术-Trip-hop

**提示词**: 做一段 70 BPM 的 trip-hop，鼓要带 swing，钢琴用 gm_acoustic_grand_piano，加 reverb 和 delay

**Agent 说明**: 代码结构完整，直接提交。

```strudel
setcps(0.2916666666666667)
stack(
  /* @layer drums */ s("bd ~ ~ ~ ~ ~ sd ~ bd ~ bd ~ ~ ~ sd ~").bank("RolandTR808").speed("1 1 1 1 1 1 1 1 1 1 0.98 1 1 1 1 1").gain("0.95 1 1 1 1 1 0.9 1 0.92 1 0.88 1 1 1 0.88 1").shape(0.3).room(0.18).sometimes(x=>x.speed(0.97)).layer(x=>x.s("hh ~ hh:2 ~ ~ hh ~ ~ hh:1 ~ ~ ~ hh ~ ~ ~").gain("0.38 1 0.28 1 1 0.42 1 1 0.32 1 1 1 0.45 1 1 1").delay(0.08).delaytime(0.22).delayfeedback(0.2).shape(0.18)),
  /* @layer piano */ note("<[c3,eb3,g3,bb3] [f3,ab3,c4,eb4] [bb2,d3,f3,ab3] [eb3,g3,bb3,db4]>/2").s("gm_acoustic_grand_piano").gain(perlin.range(0.5,0.75)).room(0.7).size(0.85).delay(0.35).delaytime(0.375).delayfeedback(0.4).attack(0.02).release(2.5).pan(sine.range(0.35,0.65).slow(12)),
  /* @layer pad */ n("<0 5 3 7> <2 0 5 3>").scale("C3:minor").s("supersaw").attack(2).decay(1).sustain(0.7).release(3).lpf("<600 800 500 700>").lpq(2).room(0.8).size(0.9).gain(0.35).pan(sine.range(0.3,0.7).slow(16)),
  /* @layer bass */ note("<c2 ~ eb2 ~ f2 ~ bb1 ~>/2").s("gm_acoustic_bass").gain(0.82).lpf(320).attack(0.05).release(1.8).room(0.3)
)
```

---

## TC-015 — 技术-Nu-jazz 四拍循环

**提示词**: 来一段 110 BPM 的 nu-jazz，和弦用 Cm9 → Abmaj7 → Ebmaj7 → Bb7，走四拍循环

**Agent 说明**: 一切就绪，直接提交！

```strudel
setcps(0.4583333333333333)
stack(
  /* @layer drums */ s("bd:2 ~ bd:2 ~, ~ hh ~ hh, ~ ~ sd:1 ~").gain("0.6 _ 0.5 _, _ 0.3 _ 0.3, _ _ 0.55 _").swing(0.55).delay(0.08).room(0.3),
  /* @layer pad */ chord("<Cm9 Abmaj7 Ebmaj7 Bb7>").dict("ireal").voicing().s("juno").gain(perlin.range(0.45, 0.62)).attack(0.12).release(2.2).room(0.55).size(0.7).lpf(sine.range(900, 1600).slow(16)).pan(0.45),
  /* @layer bass */ note("<c2 ab1 eb2 bb1>").s("sawtooth").gain(0.55).lpf(320).attack(0.02).release(1.0).struct("x ~ [~ x] ~").room(0.15),
  /* @layer lead */ note("c4 ~ eb4 g4 ~ bb4 ~ ~ ab3 ~ c4 eb4 ~ g4 ~ ~ eb4 ~ g4 bb4 ~ ~ ~ eb4 bb3 ~ d4 ~ f4 ~ ~ ~").s("piano").gain(0.62).attack(0.02).release(1.4).room(0.5).size(0.6).lpf(3200).delay(0.25).delaytime(0.375).delayfeedback(0.35)
)
```

---

## TC-016 — 极简-开放式请求 v1

**提示词**: 来一段好听的

**Agent 说明**: 四层都就位了，最后验证一下代码再提交。

```strudel
setcps(0.3541666666666667)
stack(
  /* @layer drums */ s("bd*2 ~ sd ~, ~ hh ~ hh, bd ~ ~ bd:2").bank("RolandTR808").gain("0.9 0.7 0.8").shape(0.3).room(0.1).pan("0 0.3 -0.2"),
  /* @layer bass */ note("c2 ~ c2 eb2 ~ g2 ~ bb2").s("sawtooth").lpf(400).lpq(2).gain(0.75).attack(0.05).release(1.2).delay(0.1).delaytime(0.3).delayfeedback(0.2),
  /* @layer pad */ n("<0 2 4 7 11> <5 7 9 0 4>").scale("C4:minor").s("piano").attack(0.4).decay(0.3).sustain(0.7).release(2.5).lpf(900).lpq(2).room(0.6).gain(0.38).pan(sine.range(0.35,0.65).slow(8)),
  /* @layer lead */ note("c4 eb4 g4 bb4 c5 bb4 g4 eb4").s("piano").slow(2).lpf(1200).room(0.6).gain(0.55).pan(sine.range(0.4,0.6).slow(8))
)
```

---

## TC-017 — 极简-开放式请求 v2

**提示词**: 做点什么让我放松

**Agent 说明**: 旋律和低音都很美，再加一个轻柔的旋律线和自然的氛围音效，让整体更有层次感。

```strudel
setcps(0.3)
stack(
  /* @layer pad */ n("0 2 4 7 9").scale("C4:major").s("sine").attack(1.2).release(3.5).decay(1.0).sustain(0.6).gain(0.35).room(0.9).size(0.8).lpf(900).pan(sine.range(0.3,0.7).slow(8)),
  /* @layer bass */ note("c2 ~ ~ g2 ~ ~ e2 ~").s("sine").lpf(300).gain(0.55).attack(0.4).release(2.5).room(0.3),
  /* @layer lead */ n("<0 ~ 4 ~ 2 ~ 7 ~>/2").scale("C5:major").s("triangle").attack(0.5).release(2.0).gain(0.28).room(0.85).delay(0.4).pan(0.6),
  /* @layer fx */ s("wind").gain(perlin.range(0.05,0.15)).room(1).slow(4)
)
```

---

## TC-018 — 极简-风格标签

**提示词**: lo-fi 一段

**Agent 说明**: 四层都就位了，最后验证一下再提交～

```strudel
setcps(0.3541666666666667)
stack(
  /* @layer drums */ s("bd:2 ~ sd:1 ~, ~ hh ~ hh:2, [bd:3 ~] ~ ~ ~").bank("RolandTR808").swing(0.62).gain("0.9 0.7 0.85 0.6").shape(0.3).room(0.15).pan(sine.range(0.4,0.6).slow(8)),
  /* @layer bass */ note("c2 ~ eb2 ~ g2 ~ f2 ~").s("sawtooth").lpf(400).lpq(2).attack(0.05).release(0.8).gain(0.65).room(0.2).pan(0.45),
  /* @layer pad */ note("<[c3,eb3,g3,bb3,d4] [f3,ab3,c4,eb4,g4] [g3,bb3,d4,f4] [f3,ab3,c4,eb4,g4]>").s("piano").gain(0.38).lpf(900).lpq(1.2).delay(0.15).delaytime(0.37).delayfeedback(0.3).room(0.6).size(0.7).pan("<0.4 0.6 0.45 0.55>").attack(0.06).release(2.4),
  /* @layer lead */ note("c4 eb4 g4 bb4 c5 bb4 g4 eb4").s("piano").slow(2).lpf(1200).gain(0.55).attack(0.08).release(1.8).room(0.6).pan(sine.range(0.35,0.65).slow(8))
)
```

---
