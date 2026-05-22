---
name: strudel-best-practices
description: Best practices for writing beautiful, musical Strudel patterns. Use when generating or reviewing Strudel code, composing music with Strudel, or optimizing audio patterns for musicality.
---

# Writing Beautiful Strudel Patterns / 写出好听的 Strudel 音乐

基于对 1018 条真实 Strudel 代码片段的分析，归纳出让音乐听起来丰富、有层次感的最佳实践。

---

## 一、Mini-Notation 核心语法速查

Mini-notation 是 Strudel 最强大的工具，掌握它是写出好听音乐的基础。

| 语法         | 含义                               | 示例                          |
|--------------|------------------------------------|-------------------------------|
| `a b c`      | 顺序播放，平分一个 cycle           | `"c d e f"`                   |
| `[a b]`      | 子序列，作为一个单元               | `"[c d] e f"`                 |
| `a,b`        | 同时播放（polyrhythm）             | `"bd,hh"`                     |
| `<a b c>`    | 每个 cycle 轮换一个               | `"<c e g>"`                   |
| `a*n`        | 重复 n 次                          | `"hh*4"`                      |
| `a/n`        | 每 n 个 cycle 播一次               | `"bd/2"`                      |
| `a!n`        | 复制 n 次（等时长）                | `"c!3 e"`                     |
| `a@n`        | 持续时间权重                       | `"c@3 e"`                     |
| `~`          | 休止符                             | `"c ~ e ~"`                   |
| `[a\|b\|c]` | 随机选一个                         | `"[c\|e\|g]"`                 |
| `a?`         | 随机出现（50%概率）                | `"hh? bd"`                    |
| `(n,k)`      | Euclidean 节奏，n拍分布在k步中     | `"bd(3,8)"`                   |
| `{a b c}%n`  | 多音符填入 n 步（polyrhythm）      | `"{c e g}%8"`                 |

---

## 二、声音来源 / Sound Sources

### 2.1 采样音效（Samples）

```js
// 基础鼓机
s("bd hh sd hh")
s("bd sd [~ bd] sd, hh*8")  // 逗号叠加多轨

// 指定采样序号用冒号
s("bd:0 bd:1 bd:2")

// 使用 bank 指定鼓机品牌
s("bd sd").bank("RolandTR909")
s("bd sd").bank("crate")
```

### 2.2 音符与旋律（Notes）

```js
// 直接指定音符名（c=C4，数字指定八度）
note("c3 e3 g3 b3")
note("c4 a4 f4 e4")

// 逗号同时弹奏和弦
note("c3,e3,g3")

// 音阶模式：n() 配合 scale()
n("0 1 2 3 4").scale("C:minor")    // 小调音阶
n("0 2 4 6").scale("D:pentatonic") // 五声音阶
n(run(8)).scale("C:major")         // 连续上行

// 和弦 + voicing（自动排列音域）
chord("<Am C D F>").voicing().s("piano")
chord("<Cm7 Fm7 G7>").dict("lefthand").voicing()
```

### 2.3 合成器波形（Synthesizers）

```js
// 基础波形
s("sawtooth")   // 锯齿波 - 饱满、适合 lead/bass
s("square")     // 方波 - 有力，适合 bass
s("sine")       // 正弦波 - 干净，适合 pad/bass
s("triangle")   // 三角波 - 柔和

// 预设合成器
s("supersaw")   // 叠加锯齿波，宽广感
s("piano")      // 钢琴音色
s("gm_epiano1") // 电钢琴
```

---

## 三、核心音乐构建原则

### 3.1 多层叠加 — `stack()` 是核心

**好听的 Strudel 音乐几乎都用 `stack()` 叠加多轨**，包含鼓、低音、旋律、和声四个层次：

```js
// 完整四层结构模板
setcps(.75)  // 设置速度（cycles per second）

stack(
  // 层 1: 鼓组 (Drums)
  stack(
    s("bd").struct("<[x*<1 2> [~@3 x]] x>"),
    s("~ [rim, sd:<2 3>]").room("<0 .2>"),
    s("hh*<2 4>").gain(0.6)
  ).bank("RolandTR909"),

  // 层 2: 和弦 (Chords)
  chord("<Bbm9 Fm9>/4").dict("ireal")
    .offset(-1).voicing()
    .s("gm_epiano1:1")
    .phaser(4).room(.5),

  // 层 3: 低音 (Bass)
  note("<g1 f1>(3,8)").s("sawtooth")
    .lpf(400).gain(.8),

  // 层 4: 旋律 (Melody)
  n("<0!3 1*2>").scale("Bb:minor")
    .note().s("sine")
    .delay(.25).room(.5)
)
```

**来自数据的真实示例（ID: a93ca21a）：**
```js
samples('github:eddyflux/crate')
setcps(.75)
let chords = chord("<Bbm9 Fm9>/4").dict('ireal')
stack(
  stack( // DRUMS
    s("bd").struct("<[x*<1 2> [~@3 x]] x>"),
    s("~ [rim, sd:<2 3>]").room("<0 .2>"),
    n("[0 <1 3>]*<2!3 4>").s("hh"),
    s("rd:<1!3 2>*2").mask("<0 0 1 1>/16").gain(.5)
  ).bank('crate')
  .mask("<[0 1] 1 1 1>/16".early(.5)),
  // CHORDS
  chords.offset(-1).voicing().s("gm_epiano1:1")
    .phaser(4).room(.5),
  // BASS
  n("<0!3 1*2>").set(chords).mode("root:g2")
    .voicing().s("gm_acoustic_bass"),
  // MELODY with LFO-driven filter
  chords.n("[0 <4 3 <2 5>>*2](<3 5>,8)")
    .anchor("D5").voicing()
    .segment(4).clip(rand.range(.4,.8))
    .room(.75).shape(.3).delay(.25)
    .fm(sine.range(3,8).slow(8))
    .lpf(sine.range(500,1000).slow(8)).lpq(5)
    .gain(perlin.range(.6, .9))
)
```

---

## 四、节奏构建技巧 / Rhythm Techniques

### 4.1 标准鼓机节奏型

```js
// 4/4 基础节奏
s("bd ~ sd ~")                    // 标准 kick-snare
s("bd sd [~ bd] sd")              // 带附点的 kick

// 组合多轨（逗号并行）
s("bd sd [~ bd] sd, hh*8")        // kick+snare+hihat
s("bd sd [~ bd] sd, hh*6, oh/2")  // 加 open hihat

// Euclidean 节奏（更有律动）
s("bd(3,8)").stack(s("hh(5,8)")).stack(s("sd(2,8,2)"))
```

### 4.2 Struct 结构化节奏

```js
// 复杂节奏型用 struct
s("bd").struct("<[x*<1 2> [~@3 x]] x>")  // 动态变化的踢鼓
s("hh").struct("x(3,8)")                  // Euclidean hi-hat

// 加入随机性
s("hh*4").sometimes(fast(2))              // 偶尔快两倍
s("hh*4").rarely(x => x.speed(".5").delay(.5))  // 偶尔半速+延迟
```

### 4.3 律动与 swing

```js
s("hh*8").swing(4)                        // 加入 swing
s("hh*8").late("[0 .01]*4")              // 微小错位增加律动感
```

### 4.4 真实鼓机示例（ID: 311987e0）

```js
s("hh:1*4").sometimes(fast("2"))
  .rarely(x => x.speed(".5").delay(.5))
  .end(perlin.range(0.02, .05).slow(8))
  .bank('RolandTR909').room(.5)
  .gain("0.4,0.4(5,8,-1)")
```

---

## 五、旋律与和声 / Melody & Harmony

### 5.1 音阶旋律写法

```js
// 推荐：用音阶指数 + scale，更容易写出调内旋律
n("0 2 4 6 ~ 4 ~ 2").scale("C:minor").note()
n(irand(8)).scale("D:pentatonic").s("piano").clip(1)  // 随机五声音阶

// 叠加和声
"<0 2 4 6 ~ 4 ~ 2 0!3 ~!5>*8"
  .layer(x => x.add("0,2"))  // 叠加三度
  .scale("C minor").note()
```

### 5.2 和弦行进

```js
// 推荐调式：minor, major, dorian, phrygian
chord("<Am C D F Am E>").voicing().s("piano").room(.5)

// 指定声部范围 (anchor)
chord("<Am7 C^7> C7 F^7")
  .dict("lefthand").voicing()
  .anchor("c4")
  .s("piano")
```

### 5.3 低音线设计

```js
// 根音低音
"<C2 Bb1 Ab1 [G1 [G2 G1]]>/2"
  .struct("[x [~ x] <[~ [~ x]]!3 [x x]>@2]/2".fast(2))
  .s("sawtooth").attack(0.001).decay(0.2).sustain(1).cutoff(500)

// Euclidean bass line
note("[<g1 f1>/8](3,8)").s("sawtooth").lpf(400).gain(.8)
```

### 5.4 旋律变奏技巧

```js
// superimpose：在原有旋律上叠加变形
note("c e g b").s("piano")
  .superimpose(x => x.add(note(12)))        // 叠加高八度
  .superimpose(x => x.delay(.5).bpf(1000)) // 叠加延迟版本

// 偶然性变体
note("c e g b").s("piano")
  .sometimes(rev)                           // 有时候倒放
  .rarely(add(note(12)))                    // 偶尔升高八度
```

---

## 六、效果器链最佳实践 / Effects Chain

### 6.1 标准效果器顺序

```
sound source → envelope → filter → spatial → dynamics
声源          → 包络     → 滤波器 → 空间     → 动态
```

### 6.2 空气感 / Atmosphere

```js
// 混响：room(0-1) + roomsize(房间大小)
.room(0.5).roomsize(4)     // 中等大厅
.room(0.9).roomsize(8)     // 大型空间/教堂感

// 延迟：delay(wet) + delaytime(时间) + delayfeedback(反馈)
.delay(0.5).delaytime(0.375).delayfeedback(0.4)   // 四分音符延迟
.delay(0.6).delaytime(0.8).delayfeedback(0.55)    // 长延迟
```

**示例：营造大气氛围的鬼魅旋律（ID: 350ea34f）：**
```js
note("~ a4 ~ ~ e4 ~ ~ ~ ~ d5 ~ ~ ~ c5 ~ ~")
  .s("triangle")
  .gain(0.05)
  .decay(0.4).sustain(0.05).release(1.2)  // 短促衰减+长尾
  .delay(0.5).delaytime(0.6).delayfeedback(0.55)
  .room(0.7)
  .lpf(2000)
  .slow(2)
```

### 6.3 滤波器塑形 / Filter Shaping

```js
// 低通滤波（lpf）：过滤高频，让声音变暗
.lpf(800)          // 暗色调
.lpf(2000)         // 中性
.lpf(8000)         // 亮色调

// 加入谐振（lpq）增加特色
.lpf(800).lpq(5)   // 带共鸣的滤波

// 滤波器包络 — 让音色动态变化
.lpf(300).lpenv(4).lpa(.25).lpd(.3)  // 滤波器开合

// LFO 驱动滤波器 — 有机的音色变化
.lpf(sine.range(400, 800).slow(16))
.lpq(cosine.range(6, 14).slow(3))
```

### 6.4 包络控制 / Envelope

```js
// ADSR 连写
.adsr(".1:.1:.5:.2")  // attack:decay:sustain:release

// 细粒度控制
.attack(0.01).decay(0.2).sustain(0.5).release(0.8)

// 打击感（短 decay，sustain=0）
.decay(0.1).sustain(0)   // 纯打击音

// Pad 感（长 attack 和 release）
.attack(1.5).release(2.5)
```

### 6.5 音量与动态 / Gain & Dynamics

```js
// 控制音量层次（不同轨道不同 gain）
.gain(0.8)        // 主轨
.gain(0.4)        // 背景
.gain(0.05)       // 远处/环境

// 动态变化
.gain("<.5 .8>*16")              // 交替音量
.gain(perlin.range(.6, .9))      // 有机随机音量
.gain(sine.slow(4).range(.4,1))  // LFO 调制音量

// Sidechain 效果（鼓机压低其他轨道）
.gain("[.2 1@3]*2")  // 仿 sidechain：kick 时音量低
```

### 6.6 声像 / Pan

```js
.pan(sine.slow(2))           // 缓慢左右摇摆
.pan("<.5 1 .5 0>")          // 固定位置循环
.pan(rand.range(.3, .7))     // 随机居中区域
```

---

## 七、高级技巧 / Advanced Techniques

### 7.1 LFO 与信号调制

```js
// 内置连续信号（LFO源）
sine     // 正弦波 LFO
cosine   // 余弦波
saw      // 锯齿波
rand     // 白噪声随机
perlin   // Perlin噪声（平滑随机）
irand(n) // 整数随机

// 用 .range() 映射范围，用 .slow() 控制速度
sine.range(200, 800).slow(8)     // 慢速 LFO 控制滤波器
perlin.range(.5, 1).slow(4)      // 平滑随机控制音量
saw.mul(saw.fast(2))             // 自调制 LFO
```

### 7.2 FM 合成

```js
// 基础 FM
note("c e g b").fm(4).fmh(2.01)   // fm=调制指数，fmh=谐波比

// 完整 FM 音色
note("c e g b g e")
  .fm("<0 1 2 8 32>")     // 动态调制深度
  .fmh("<1 2 1.5 1.61>")  // 动态谐波比
  .fmdecay(0.2)
  .fmsustain(0)
  ._scope()               // 可视化波形

// 多运算符 FM
s("sine").note("F1").seg(8)
  .fm(4).fm2(rand.mul(4)).fm3(saw.mul(8).slow(8))
  .fmh(1.06).fmh2(10).fmh3(0.1)
```

### 7.3 Mask 与结构控制

```js
// mask：按模式开关某轨（0=静音，1=播放）
s("hh*8").mask("<0 1 1 1>/16")           // 第一循环静音
s("bd*4").mask("<[0 1] 1 1 1>/16".early(.5))  // 错开半拍

// every/sometimes/rarely：条件变形
.every(4, fast(2))       // 每4拍有一次快两倍
.sometimes(rev)          // 有时候倒放
.rarely(ply(2))          // 偶尔每音符重复两次
```

### 7.4 多轨效果总线 / Orbit

```js
// 不同 orbit 有独立的混响/延迟设置
stack(
  s("hh*6").delay(.5).delaytime(.25).orbit(1),
  s("~ sd ~ sd").delay(.5).delaytime(.125).orbit(2)
)
```

### 7.5 完整复杂示例（ID: 77b7e6bb）

```js
setcps(1)
stack(
  // 主旋律：锯齿波 + LFO 驱动滤波器
  note("[<g1 f1>/8](<3 5>,8)")
    .clip(perlin.range(.15, 1.5))
    .release(.1)
    .s("sawtooth")
    .lpf(sine.range(400, 800).slow(16))    // 慢速 LFO 滤波
    .lpq(cosine.range(6, 14).slow(3))
    .lpenv(sine.mul(4).slow(4))
    .lpd(.2).lpa(.02)
    .ftype("24db")                         // 更强的滤波斜率
    .rarely(add(note(12)))                 // 偶尔跳高八度
    .room(.2).shape(.3).postgain(.5)
    .superimpose(x => x.add(note(12)).delay(.5).bpf(1000))  // 叠加高八度
    .gain("[.2 1@3]*2"),                   // 仿 sidechain 音量
  // 鼓机
  stack(
    s("bd*2").mask("<0@4 1@16>"),          // 先静后鼓
    s("hh*8").gain(saw.mul(saw.fast(2))).clip(sine)
      .mask("<0@8 1@16>")
  ).bank("RolandTR909")
)
```

---

## 八、旋律宝典 — 常用和弦走向与音阶

### 8.1 推荐和弦走向

```js
// 小调（常用 Am/Dm/Em 系列）
chord("<Am C D F>").voicing()           // Am → C → D → F
chord("<Cm7 Fm7 G7 Fm7>").voicing()    // 爵士 II-V-I
chord("<Bbm9 Fm9>/4").voicing()        // Soul/R&B 感

// 大调流行
chord("<C G Am F>").voicing()           // 最流行的四和弦
chord("<Fmaj7 G Em Am>").voicing()     // 日系风格
```

### 8.2 常用音阶

```js
// 情绪特点
"C:minor"           // 悲伤、戏剧性
"C:major"           // 明亮、积极
"C:dorian"          // 神秘、略带忧郁（D小调中的C）
"C:pentatonic"      // 五声音阶，安全好用
"C:minor:pentatonic" // 小调五声，爵士/蓝调
"D:phrygian"        // 西班牙感、黑暗
"C:mixolydian"      // 蓝调摇滚感
"F:lydian"          // 空灵、上扬感
```

---

## 九、完整示例精选

### 示例 1：大气渐进（Cinematic Atmosphere）

```js
// 层叠多个和弦音符，大混响营造空间感
stack(
  // 慢速和弦 pad
  note("<d3,f3,a3> <a2,c3,e3> <e3,g3,b3> <b2,d3,f3>")
    .s("sine")
    .attack(1.5).release(2.5)
    .gain(0.08)
    .room(0.9).roomsize(8)
    .lpf(1200)
    .slow(2),

  // 旋律线（有间隔的稀疏音符）
  note("~ a4 ~ ~ e4 ~ ~ ~ ~ d5 ~ ~ ~ c5 ~ ~")
    .s("triangle")
    .gain(0.05)
    .decay(0.4).sustain(0.05).release(1.2)
    .delay(0.5).delaytime(0.6).delayfeedback(0.55)
    .room(0.7).lpf(2000)
    .slow(2),

  // 低音 drone
  note("a1").s("sine")
    .gain(0.05)
    .attack(2.0).release(4.0)
    .lpf(120).room(0.3)
)
```

### 示例 2：爵士钢琴即兴（Jazz Piano）

```js
// 来自真实数据（ID: e01ef149）
n("[0,3] 2 [1,3] 2".fast(3).lastOf(4, fast(2))).clip(2)
  .offset("<<1 2> 2 1 1>")
  .chord("<<Am7 C^7> C7 F^7 [Fm7 E7b9]>")
  .dict("lefthand").voicing()
  .cutoff(perlin.range(500, 4000)).resonance(12)
  .gain("<.5 .8>*16")
  .decay(.16).sustain(0.5)
  .delay(.2)
  .room(.5).pan(sine.range(.3,.6))
  .s("piano")
  .stack(
    "<C2 Bb1 Ab1 [G1 [G2 G1]]>/2"
      .add("0,.02").note()
      .s("sawtooth").cutoff(180)
      .lpa(.1).lpenv(2)
  )
  .slow(4)
```

### 示例 3：电子舞曲（Electronic Dance）

```js
setcps(.75)
stack(
  // 鼓机
  stack(
    s("bd*4"),
    s("~ sd ~ sd"),
    s("hh*8").gain(".4!2 1 .4!2 1 .4 1")
  ).bank("RolandTR909"),

  // 锯齿波 bass + 滤波
  note("[<c1 f1>](3,8)").s("sawtooth")
    .lpf(sine.range(200, 800).slow(4))
    .lpq(5).gain(.7),

  // 和弦 pad
  chord("<Cm7 Fm7 Ab Bb>").voicing()
    .s("supersaw")
    .room(.5).gain(.4)
    .cutoff(1200)
)
```

### 示例 4：生成旋律（Generative Melody）

```js
// 用 perlin 噪声和音阶生成不重复的旋律
n(irand(16).seg(8)).scale("d:phrygian")
  .s("supersaw")
  .djf("<.5 .3 .2 .75>")  // DJ 滤波器
  .room(.4)

// 叠加版本
"<0 2 4 6 ~ 4 ~ 2 0!3 ~!5>*8"
  .layer(x => x.add("0,2"))   // 三度叠加
  .scale("C minor").note()
  .s("sine").room(.5)
```

### 示例 5：FM 音色质感

```js
// 金属感 FM 合成
note("c e g b g e")
  .s("sine")
  .fm(4).fmh("<1 2 1.5 1.61>")
  .fmdecay(.2).fmsustain(.4)
  .room(.3)

// 有机 FM + 随机
n("0 1 2 3".fast(4)).scale("d:minor")
  .s("sine")
  .fmwave("<sine square sawtooth crackle>")
  .fm(4).fmh(2.01)
  .room(.5)
```

### 示例 6：多运算符复杂音色（ID: e9ff834f）

```js
let pat = note("c,eb,g,<bb c4 d4 eb4>")
  .s("sine")
  .press()
  .add(note(24))        // 高两个八度
  .fmi(3).fmh(5.01)
  .dec(0.4)
  .delay(".6:<.12 .22>:.8")
  .jux(press)
  .rarely(add(note("12")))
  .lpf(400).lpq(0.2)
  .lpd(0.4).lpenv(3)
  .postgain(0.6)
  // 叠加噪声层
  .stack(
    s("<pink white>*8").dec(0.07)
      .rarely(ply("2")).delay(0.5)
      .hpf(sine.range(200, 2000).slow(4))
  )
  // 叠加低音
  .stack(
    note("<c2 - [- f1] ->*2").s("square")
      .lpf(sine.range(100, 300).slow(4))
      .lpe(1).segment(8)
      .dec(0.2).speed("<1 2>")
      .ply("<1 2>").postgain(1)
  )
  // 叠加和弦 pad
  .stack(
    chord("<Cm Cm7 Cm9 Fm>").voicing()
      .s("sine").clip(1).rel(0.4)
      .vib("4:.2").gain(0.7)
  )
```

---

## 十、快速查错 / Common Pitfalls

| 问题                     | 解决方案                                         |
|--------------------------|--------------------------------------------------|
| 音乐太单调               | 用 `<a b c>` 让参数每 cycle 变化                |
| 缺少律动感               | 加 `.swing(4)` 或用 `(3,8)` Euclidean 节奏      |
| 声音太干                 | 加 `.room(0.3).delay(.2)`                        |
| 旋律不在调内             | 改用 `n("...").scale("C:minor").note()`         |
| 音量不平衡               | 各轨单独设 `.gain()`，主轨0.8，背景0.3-0.5       |
| 听起来空洞               | 添加 pad 层（`chord().voicing().s("supersaw")`）|
| 节奏太机械               | 加入 `.late("[0 .01]*4")` 微错位                |

---

## 十一、速度设置参考

```js
setcps(0.5)   // 30 BPM — 极慢，环境音乐
setcps(0.67)  // 40 BPM — 慢板
setcps(0.75)  // 45 BPM — 适合 Hip-hop/R&B  
setcps(1.0)   // 60 BPM — 标准
setcps(1.33)  // 80 BPM — 中快
setcps(2.0)   // 120 BPM — 标准舞曲速度
setcps(2.5)   // 150 BPM — 快速
```

---

> **核心原则**：Strudel 的美在于**层次**（stack多轨）+ **变化**（`<>`轮换，`sine.slow()`调制）+ **空间**（room + delay）。从简单的两层开始，逐步叠加，保持每个声部都有自己的角色。
