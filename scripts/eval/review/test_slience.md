# Strudel 评测结果 — test_slience

> 生成时间: 2026-05-19T16:59:26.820Z | Prompt 版本: v1 | 模型: deepseek-v4-flash
> 规则分: 90.0/100 | Judge 分: 9.0/10 | 语法通过率: 100%

---

## TC-001 — 自然表达-Lofi House

**用户**: 来一段 90 BPM 的 lofi house 完整作品。和弦循环用 Bbm9 → Fm9，共享给电钢琴、原声贝斯和一条飘的旋律层。鼓走 909，加一点 swing（late 0.01）。旋律层要用 chunk 切段、perlin 调音量、sine 扫 lpf、偶尔 ply，带 reverb/delay/fm/distortion。

**最终生成代码**:

```strudel
setcps(0.375)
stack(
  /* @layer drums */ s("bd bd bd bd").bank("RolandTR909").gain(0.85).late(sine.range(0,0.02).slow(4)).add(s("~ sd ~ sd").bank("RolandTR909").gain(0.75).late(sine.range(0,0.02).slow(4))).add(s("hh*8").bank("RolandTR909").gain(0.4).late(sine.range(0,0.02).slow(4))),
  /* @layer bass */ note("<bb2 f2>/2").s("sawtooth").lpf(300).gain(0.7).attack(0.02).decay(0.3).sustain(0.8).release(0.1),
  /* @layer ep */ chord("<Bbm9 Fm9>/2").dict("ireal").voicing().s("ep").gain(0.4).room(1.5).delay(0.15).lpf(4000),
  /* @layer lead */ n("0 2 4 5 7 9 11 12").scale("Bb4:minor").chunk(4, fast(2)).gain(perlin.range(0.3,0.6).slow(8)).lpf(sine.range(500,3000).slow(16)).sometimes(ply(3)).s("sawtooth").delay(0.3).room(2).fm(0.2).gain(0.45)
)
```

**规则分**: 90/100
**Judge 分**: 9/10

| 维度 | 分数 | 说明 |
|------|------|------|
| style_match | 2/2 | 低音、电钢琴和弦与飘渺的旋律层贴合 lofi house 风格，BPM 及 swing 微调符合需求 |
| layer_completeness | 2/2 | 鼓（909）、贝斯、电钢琴和旋律层齐全，骨架完整，无堆砌 |
| musical_diversity | 2/2 | 各层在密度、节奏（鼓的16分、贝斯/和弦半速）、频率区间（低音、中频、高频）上形成对比 |
| parameter_accuracy | 1/2 | BPM 90、和弦 Bbm9/Fm9、鼓 909、perlin/sine/ply 及效果链正确，但贝斯使用 sawtooth 而非原声贝斯，与 prompt 不符 |
| creative_expression | 2/2 | perlin 调音量、sine 扫 lpf、chunk 切段、ply 等调制使音乐鲜活，效果链丰富 |

**人工评分**: （待填写，1-10）  
**人工备注**:   

---
