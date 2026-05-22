# 如何在 Strudel 中写出好听的音乐
## 数据驱动的最佳实践研究报告

**报告日期：** 2026-05-22  
**研究模式：** Standard（标准，6 阶段）  
**主要数据源：** 1018 个真实 Strudel 片段 + Strudel 官方文档 + 社区实践

---

## 执行摘要

Strudel 是基于 Tidal Cycles 算法模式语言的网页端 live coding 环境，专为在浏览器中实时创作音乐而设计。本报告综合了对 **1018 个真实 Strudel 代码片段**的统计分析与官方文档调研，提炼出写出好听 Strudel 音乐的核心路径。

**核心发现：**

1. **`stack + s + slow` 是黄金三角**：在所有 intermediate+ 级别片段中，这三个函数共现率达到 49.5%，是从「能跑」到「好听」最关键的一跃。

2. **分层结构是专业质量的基础**：好听的 Strudel 音乐几乎总是包含鼓组、低音、和声、旋律四个层次，用 `stack()` 组织多轨。

3. **音色链决定音乐质感**：`gain → lpf → delay → room` 这一效果器顺序，能将干燥的合成音色转化为有空间感的音乐。

4. **和声系统是进阶核武器**：`chord().voicing()` 配合 `scale()` 可以让任何人在调内写出专业级和声与旋律，无需深厚乐理基础。

5. **随机与确定性的平衡**：专业 Strudel 音乐通过 `sometimes`、`perlin`、`degradeBy` 等函数在可控范围内引入随机性，使音乐在循环中保持新鲜感。

---

## 一、引言

### 研究背景

Strudel 由 Alex McLean（TidalCycles 创始人）和 Felix Roos 于 2022 年发起，是 TidalCycles 的 JavaScript 实现版本。它无需安装任何软件，直接在浏览器中运行，是目前最易上手的 live coding 音乐环境之一。

Strudel 被广泛用于：
- **Algorave** 现场演出：以算法代码驱动舞池音乐
- **实验电子音乐**创作
- **音乐教育**：互动式编程音乐教学
- **创意探索**：算法作曲与声音设计

### 研究方法

本报告采用多来源三角验证方法：

| 来源 | 数量/类型 | 权重 |
|------|-----------|------|
| 本地片段数据库 | 1018 个真实代码片段 | 主要量化依据 |
| Strudel 官方文档 | strudel.cc 全文档 | 权威功能参考 |
| Strudel 示例集 | 官方示例与 Recipes | 实践模式验证 |
| TOPLAP 社区展示 | Showcase 视频系列 | 真实演出参考 |

### 假设与边界

- 目标读者：有基础编程背景，希望快速写出好听音乐
- 「好听」定义：具有节奏感、层次感、音乐结构性，优于单一重复的合成器音调
- 不涉及：MIDI 输出、外部硬件集成、Csound/SuperCollider 连接

---

## 二、发现一：Mini-Notation 是一切的基础语言

### 核心语法速查

Strudel 的 Mini-Notation 是专为音乐节奏模式设计的微型语言，掌握它是写出好音乐的前提。

| 语法 | 含义 | 音乐用途 |
|------|------|---------|
| `a b c` | 顺序播放，平分一个 cycle | 旋律、节奏型 |
| `[a b]` | 子序列（嵌套节奏） | 复杂节奏细分 |
| `a,b` | 同时播放（polyphony） | 和弦、多轨叠加 |
| `<a b c>` | 每个 cycle 轮换一个 | 和弦进行、变奏 |
| `a*n` / `a/n` | 加速 / 减速 | 密度变化 |
| `a!n` | 复制 n 次（等时长） | 强调重复 |
| `a@n` | 时间权重（延长） | 切分音、长音 |
| `~` | 休止符 | 留白、律动空间 |
| `[a\|b\|c]` | 随机选一个 | 即兴感 |
| `a?` | 50% 概率出现 | 节奏随机 |
| `(n,k)` | Euclidean 节奏 | 非西方律动 |

### 关键洞察：`<>` 与 `[]` 的区别

```javascript
// [] 在一个 cycle 内快速播放所有元素
note("[c e g]")  // → c, e, g 在一个 cycle 内轮流播放

// <> 每个 cycle 只播放一个元素（适合和弦进行）
note("<c e g>")  // → 第1个cycle:c, 第2个cycle:e, 第3个cycle:g
chord("<Am C D F>")  // → 每拍换一个和弦
```

### Euclidean 节奏：最强的节奏生成器

Euclidean 节奏算法可以用两个数字生成世界各地音乐文化中的经典节奏型：

```javascript
s("bd(3,8)")    // 古巴 tresillo，也是流行乐中常见节奏
s("bd(5,8)")    // 桑巴节奏
s("bd(7,8)")    // 高密度切分
s("hh(5,8)")    // hi-hat 律动

// 组合 Euclidean 节奏构成完整鼓组
stack(
  s("bd(3,8)"),
  s("sd(2,8,2)"),  // 第三个参数是偏移
  s("hh(5,8)")
)
```

---

## 三、发现二：鼓组构建 — 从单声道到多轨

### 3.1 基础鼓机 vs 多轨 stack

**数据发现：** `stack` 在 intermediate 级别代码中覆盖率高达 82.9%，是最显著的复杂度跃升信号。

```javascript
// ❌ Basic 级别（单调）
s("bd sd hh sd")

// ✓ Intermediate 级别（多轨叠加）
stack(
  "[bd ~ bd ~] [~ ~ bd ~] [~ ~ bd ~] [~ ~ ~ ~]",
  "[~ ~ ~ ~] [sd ~ ~ sd] [~ sd ~ ~] [sd ~ ~ ~]",
  "[hh ~ hh hh] [~ hh hh ~] [hh hh ~ hh] [hh ~ hh hh]"
).s().slow(2)
```

### 3.2 专业鼓机节奏型（真实社区数据）

```javascript
// 数据来源：ID 311987e0，出现在 Strudel 社区高质量片段中
s("bd").struct("<[x*<1 2> [~@3 x]] x>")   // 动态变化的踢鼓
s("~ [rim, sd:<2 3>]").room("<0 .2>")     // 军鼓+混响变化
s("hh").struct("x(3,8)")                  // Euclidean hi-hat

// 使用 bank 切换真实鼓机音色
s("bd sd hh").bank("RolandTR909")         // Roland TR-909（电子舞曲经典）
s("bd sd hh").bank("RolandTR808")         // Roland TR-808（嘻哈经典）
s("bd sd hh").bank("crate")              // 采样箱风格
```

### 3.3 律动质感：swing 与微时移

```javascript
// 加入 swing（爵士/嘻哈律动）
s("hh*8").swing(4)          // 1/4 拍分辨率的 swing
s("hh*8").swingBy(1/3, 4)   // 等效，可自定义摆幅

// 微时移增加人性化感觉
"bd ~".stack("hh ~".late(.01)).s()   // hh 微微延后 1/100 cycle
```

### 3.4 随机性让鼓机活起来

```javascript
s("hh*8").sometimes(x => x.speed(2))        // 有时快两倍
s("hh*8").rarely(x => x.delay(.5))          // 偶尔加延迟
s("hh*8").degradeBy(0.2)                    // 20% 概率删除事件
s("bd*4").sometimes(ply("2"))               // 有时快速连打两下
```

---

## 四、发现三：旋律与和声 — 音乐感的核心

### 4.1 三种旋律写法对比

**数据发现：** `note` 函数在 advanced 级别代码中使用率从 8.6% 跳升至 42.3%，是最显著的进阶信号。

```javascript
// 方法 A：直接写音符名（需要乐理知识）
note("c3 e3 g3 b3")
note("a3 ~ c4 ~ e4 ~ d4 c4 ~ a3 ~ ~ e4 ~ c4 ~")

// 方法 B：音阶数字（更易写调内旋律 ✓ 推荐）
n("0 2 4 6 4 2 0").scale("C:minor")
n("0 2 4 7").scale("C:minor")   // 琶音

// 方法 C：随机音阶（生成式旋律）
n(irand(8)).scale("D:pentatonic").s("piano").clip(1)
n(rand.range(0,12).segment(8)).scale("C:ritusen")
```

### 4.2 推荐音阶（按音乐类型）

| 音乐风格 | 推荐音阶 | Strudel 写法 |
|---------|---------|-------------|
| 流行/摇滚 | 大调 / 小调 | `"C:major"` / `"C:minor"` |
| 爵士 | Dorian / Bebop | `"D:dorian"` / `"C:bebop:major"` |
| 电子舞曲 | 小调五声 | `"A:minor:pentatonic"` |
| 世界音乐 | Phrygian / Ritusen | `"E:phrygian"` / `"C:ritusen"` |
| 氛围 / Ambient | 全音阶 | `"C:whole:tone"` |

### 4.3 和弦进行：chord + voicing

`chord().voicing()` 是 Strudel 最强大的和声工具，自动处理声部排列：

```javascript
// 基础：四和弦进行
chord("<Am C D F>").voicing().s("piano").room(.5)

// 爵士风格：七和弦进行
chord("<C^7 A7b13 Dm7 G7>*2")
  .dict('ireal').voicing().s("gm_epiano1")

// 自动生成 bassline + 和弦
chord("<Cm7 Fm7 Bb7>*2").layer(
  x => x.struct("[~ x]*2").voicing(),          // 和弦（offbeat 落拍）
  x => x.rootNotes(2).note().s("sawtooth")      // 低音（根音）
)
```

### 4.4 爵士蓝调完整示例（官方文档高级示例）

```javascript
// F 调蓝调进行：使用 voicing 在旋律、和弦、低音间共享和声信息
let chords = chord(`<
  F7 Bb7 F7 [Cm7 F7]
  Bb7 Bo F7 [Am7 D7]
  Gm7 C7 [F7 D7] [Gm7 C7]
>`)

$: n("7 8 [10 9] 8").set(chords).voicing().dec(.2)     // 旋律
$: chords.struct("- x - x").voicing().room(.5)          // 和弦
$: n("0 - 1 -").set(chords).mode("root:g2").voicing()  // 低音
```

### 4.5 旋律变奏与对位技巧

```javascript
// off()：错位叠加，制造卡农/和声对位感
s("bd sd, hh*4").off(1/8, x => x.speed(2))    // 鼓组错位版本
note("c e g").off(1/4, add(note(7)))            // 旋律+五度和声

// superimpose()：叠加变形版本
note("c e g b").s("piano")
  .superimpose(x => x.add(note(12)))            // 叠加高八度
  .superimpose(x => x.delay(.3).bpf(2000))     // 叠加延迟+滤波版本

// 偶然变奏
note("c e g b").s("piano")
  .sometimes(rev)                               // 有时候倒放
  .rarely(add(note(12)))                        // 偶尔高八度
  .every(3, x => x.fast(2))                    // 每3个cycle快速播放
```

---

## 五、发现四：效果器链 — 音色塑造的关键

### 5.1 效果器链标准顺序

```
声源(s/note) → 包络(attack/decay/sustain/release) → 滤波(lpf/hpf) → 空间(delay/room) → 动态(gain/compress)
```

### 5.2 包络塑形（ADSR）

```javascript
// 短促打击感（鼓/打击乐）
.attack(0.001).decay(0.1).sustain(0).release(0.1)

// 长音弦乐感
.attack(0.1).sustain(0.8).release(0.5)

// 钢琴弹奏感
.attack(0.001).decay(0.3).sustain(0.6).release(0.3)
```

### 5.3 滤波器（lpf/hpf/bpf）

**数据发现：** `lpf` 在 advanced 片段中覆盖率 8.8%，是最常用的音色塑造工具。

```javascript
// 低通滤波（lpf）— 最常用，过滤刺耳高频
.lpf(400)    // 暗沉（bass 常用）
.lpf(1200)   // 中性温暖（pad 常用）
.lpf(3000)   // 明亮但柔和（lead 常用）

// LFO 调制滤波器（动态音色）
.lpf(sine.range(200, 2000).slow(4))    // 缓慢摆动
.lpf(perlin.range(400, 1800).slow(8)) // 有机随机摆动

// 滤波器包络（lpenv）
note("g1 bb1 c2").s("sawtooth")
  .lpf(400).lpenv(4).lpa(.2).lpd(.5)  // 滤波器 attack+decay
```

### 5.4 空间感（delay + room）

**数据发现：** `(delay, room)` 共现 27 次，是 advanced 中制造环境感的黄金组合。

```javascript
// 标准延迟（四分音符延迟）
.delay(0.5).delaytime(0.375).delayfeedback(0.4)

// 长延迟（鬼魅感）
.delay(0.6).delaytime(0.8).delayfeedback(0.55)

// 大厅混响
.room(0.7).roomsize(4)    // 中型大厅
.room(0.9).roomsize(10)   // 教堂/大型空间

// 完整空间感示例（高频指南旋律）
note("~ a4 ~ ~ e4 ~ ~ ~ ~ d5 ~ ~ ~ c5 ~ ~")
  .s("triangle")
  .gain(0.05)
  .decay(0.4).sustain(0.05).release(1.2)
  .delay(0.5).delaytime(0.6).delayfeedback(0.55)
  .room(0.7).lpf(2000).slow(2)
```

### 5.5 合成器选择指南

| 音色类型 | 推荐波形/合成器 | 典型用途 |
|---------|----------------|---------|
| 有机温暖 | `triangle`, `sine` | pad, 旋律 |
| 饱满强劲 | `sawtooth`, `supersaw` | lead, bass |
| 有力清晰 | `square` | bass, arpeggio |
| 噪音打击 | `white`, `pink` | hi-hat, snare |
| FM 金属感 | `.fm(4).fmh(1.5)` | 钟声, 金属 |
| 哇音效果 | `.lpf(800).lpq(8)` + LFO | 电子舞曲 |

---

## 六、发现五：结构与编排 — 从片段到完整音乐

### 6.1 四层音乐结构模板

以下是从真实社区高质量代码中提炼的完整四层结构：

```javascript
setcps(.75)  // 设置速度（cycles per second，.75 ≈ 90 BPM）

let chords = chord("<Bbm9 Fm9>/4").dict("ireal")

stack(
  // 层 1: 鼓组
  stack(
    s("bd").struct("<[x*<1 2> [~@3 x]] x>"),
    s("~ [rim, sd:<2 3>]").room("<0 .2>"),
    n("[0 <1 3>]*<2!3 4>").s("hh"),
  ).bank("RolandTR909")
   .mask("<[0 1] 1 1 1>/16".early(.5)),  // 前16个cycle逐渐入场

  // 层 2: 和弦
  chords.offset(-1).voicing()
    .s("gm_epiano1:1").phaser(4).room(.5),

  // 层 3: 低音
  n("<0!3 1*2>").set(chords)
    .mode("root:g2").voicing()
    .s("gm_acoustic_bass"),

  // 层 4: 旋律（带 LFO 调制）
  chords.n("[0 <4 3 <2 5>>*2](<3 5>,8)")
    .anchor("D5").voicing()
    .segment(4).clip(rand.range(.4,.8))
    .room(.75).delay(.25)
    .fm(sine.range(3,8).slow(8))           // LFO 调制 FM 参数
    .lpf(sine.range(500,1000).slow(8)).lpq(5)
    .gain(perlin.range(.6, .9))            // 动态音量变化
)
```

### 6.2 动态编排：mask + every

```javascript
// mask：控制哪些 cycle 出现声音（适合制造段落感）
s("bd*4").mask("<1 1 1 0>/4")                    // 每4个cycle静音一次
s("melody").mask("<x@7 ~>/8".early(1/4))         // 8个cycle周期的大开关

// every：周期性变奏（避免单调）
chord("<Am C>").voicing()
  .every(2, early(1/8))                          // 每2个cycle提前1/8入
  .every(4, x => x.room(.9))                    // 每4个cycle加大混响
```

### 6.3 polyrhythm 与 polymeter

```javascript
// Polyrhythm：同时播放不同拍速
s("bd*2, hh*3")                  // 2对3 polyrhythm

// Polymeter：不同长度循环
s("<bd rim, hh hh oh>*4")        // 两段不同长度，同步播放

// Phasing：相位差效果
note("<C D G A Bb D C A G D Bb A>*[6,6.1]").piano()  // Steve Reich 风格
```

### 6.4 从采样构建（Breaks / 切断）

```javascript
// 加载并切割采样
samples("github:yaxu/clean-breaks")
s("amen/4").fit().chop(16).cut(1)
  .sometimesBy(.5, ply("2"))          // 偶尔快速连打
  .sometimes(x => x.speed("-1"))     // 偶尔倒放

// 用 slice 精控顺序
s("amen/4").fit()
  .slice(8, "<0 1 2 3 4*2 5 6 [6 7]>*2")
  .cut(1).rarely(ply("2"))
```

---

## 七、发现六：高级技巧 — 让音乐更有层次

### 7.1 信号调制（LFO 与 Perlin 噪声）

```javascript
// sine 信号：均匀摆动
.lpf(sine.range(200, 2000).slow(8))    // 慢速滤波摆动
.gain(sine.range(0.3, 0.9).slow(16))   // 慢速音量呼吸感
.pan(sine.range(0, 1).slow(4))         // 缓慢左右摇摆

// perlin 噪声：有机随机感
.add(perlin.range(0, .5))              // 音高微微漂移（模拟磁带抖动）
.gain(perlin.range(.6, .9))            // 有机动态音量
.lpf(perlin.range(400, 1800).slow(8)) // 有机滤波摆动
```

### 7.2 FM 合成

```javascript
// 基础 FM（金属感/铃声）
note("c e g b g e").fm(4).fmh("<1 2 1.5 1.61>")

// FM + 包络塑形
note("c e g b g e").fm(4)
  .fmdecay("<.01 .05 .1 .2>").fmsustain(.4)

// 动态 FM（调制指数随时间变化）
note("c3").fm(sine.range(2, 8).slow(4))
```

### 7.3 层叠与声部拆分

```javascript
// layer()：从同一 pattern 派生多个声部
"<C^7 A7b13 Dm7 G7>*2".layer(
  x => x.voicings("lefthand").struct("[~ x]*2").note(),  // 和弦
  x => x.rootNotes(2).note().s("sawtooth").cutoff(800)  // 低音
)

// $: 并行启动多个独立 pattern
$: s("bd sd [~ bd] sd, hh*8").slow(2)
$: chord("<Am G F>").voicing().s("piano").room(.5)
$: n("0 2 4").scale("A:minor").note().s("sine").slow(4)
```

### 7.4 粒子合成与实验技法

```javascript
// chop + rev = 颗粒合成效果
samples({ rhodes: "https://cdn.freesound.org/..." })
s("rhodes").chop(4).rev().loopAt(2)

// 用 loop + loopEnd 做采样波形合成
note("<c eb g f>").s("bd").loop(1).loopEnd(.05).gain(.2)

// 随机游走于采样库
samples("bubo:fox")
n(run(8)).s("ftabla").early(2/8)
  .sometimes(mul(speed("1.5")))
```

---

## 八、综合见解

### 音乐层次论

分析 1018 个代码片段后，可以将 Strudel 音乐质量分为三个层次：

```
Level 1 (Basic, 30个片段)：
单一循环 → s("bd sd hh sd")
问题：单调、无层次、无空间感

Level 2 (Intermediate, 591个片段)：
stack + s + slow 三件套
特征：多轨鼓组、方括号节奏型
进步：节奏感强，但音色单薄

Level 3 (Advanced, 397个片段)：
note + chord.voicing + 完整效果器链
特征：旋律 + 和声 + 动态空间感
质量：接近专业电子音乐制作水准
```

### 五个「立刻好听」的技巧

1. **加 `.room(.5)`**：任何声音加混响立刻有空间感
2. **加 `.slow(2)`**：将复杂节奏型拉伸，增加律动重量感
3. **把 `note()` 接上 `.s("piano").clip(1)`**：钢琴音色配合时值截断，立刻专业
4. **用 `<>`代替固定和弦**：`chord("<Am C F G>").voicing()` 让和声自然流动
5. **加 `.perlin.range(0, .5)` 到音高**：模拟自然音高抖动，消除机器感

### 音乐理论捷径

无需深厚乐理，以下几个「安全选择」让任何音符组合都好听：

- **小调五声音阶**：`scale("A:minor:pentatonic")` — 几乎不会有不和谐
- **Dorian 调式**：`scale("D:dorian")` — 介于大小调之间，适合 funk/jazz
- **iReal 和弦字典**：`.dict("ireal")` — 包含 100+ 种专业和弦排列
- **根音低音**：`rootNotes(2)` 自动生成和弦根音作为低音线

---

## 九、局限性与注意事项

1. **片段样本偏差**：1018 个片段主要来自 Codeberg（924 个），可能代表特定社区风格，不一定覆盖所有 Strudel 音乐风格。

2. **「好听」的主观性**：本报告以电子舞曲/实验电子的审美为主要参照，其他音乐类型（如学术实验音乐、噪音音乐）可能有截然不同的评价标准。

3. **版本差异**：Strudel 仍处于快速迭代阶段，部分 API 可能在未来版本中变更。

4. **浏览器依赖**：Strudel 的音频质量受到 WebAudio API 的限制，与专业 DAW 或 SuperCollider 相比有音质差距。

5. **延迟问题**：当代码复杂度过高时，浏览器可能引入音频延迟，影响演出体验。

---

## 十、推荐行动方案

### 初学者路线（Basic → Intermediate，1-2 周）

```javascript
// 第1天：掌握 stack + s + slow
stack(
  "[bd ~ bd ~] [~ ~ ~ ~]",
  "[~ ~ sd ~] [~ ~ ~ ~]",
  "[hh ~ hh hh] [~ hh hh ~]"
).s().slow(2)

// 第3天：加入旋律
n("0 2 4 2 0 ~ 4 ~").scale("C:minor").note().s("piano")

// 第7天：效果器
.room(.5).delay(.25).lpf(2000)
```

### 中级路线（Intermediate → Advanced，1 个月）

1. 学习 `chord().voicing()` 体系
2. 掌握 `perlin`、`sine` 等信号作为调制源
3. 尝试 `layer()` 和 `$:` 多轨并行
4. 使用 `mask()` 制造段落感和动态变化

### 进阶路线（Advanced → Professional）

1. 研究官方 Showcase 视频，逆向解析演出代码
2. 参与 TOPLAP 社区论坛，学习高级 live coding 技巧
3. 尝试 FM 合成、wavetable 合成等高级音色技术
4. 结合 Hydra 视觉编程，创作 AV 实时演出

---

## 参考文献

1. Strudel 官方文档 — Getting Started. https://strudel.cc/learn/getting-started/
2. Strudel 官方文档 — Notes. https://strudel.cc/learn/notes/
3. Strudel 官方文档 — Samples. https://strudel.cc/learn/samples/
4. Strudel 官方文档 — Synths. https://strudel.cc/learn/synths/
5. Strudel 官方文档 — Tonal Functions. https://strudel.cc/learn/tonal/
6. Strudel 官方文档 — Time Modifiers. https://strudel.cc/learn/time-modifiers/
7. Strudel 官方文档 — Random Modifiers. https://strudel.cc/learn/random-modifiers/
8. Strudel 官方文档 — Mini-Notation. https://strudel.cc/learn/mini-notation/
9. Strudel 官方文档 — Understanding Chords and Voicings. https://strudel.cc/understand/voicings/
10. Strudel 官方文档 — Recipes. https://strudel.cc/recipes/recipes/
11. Strudel 社区 Showcase. https://strudel.cc/intro/showcase/
12. SKILL-stats.md — 1018 个真实 Strudel 片段统计分析（本项目内部数据）
13. SKILL-direct.md — Strudel 最佳实践速查手册（本项目内部数据）
14. McLean, A. & Roos, F. (2022). Strudel: Live Coding Patterns on the Web. NIME 2022.

---

## 附录 A：方法论说明

本研究采用以下工作流程：

1. **Phase 1 (SCOPE)**：分解「好听音乐」为节奏、旋律、和声、音色、结构五个子维度
2. **Phase 2 (PLAN)**：制定多来源并行检索策略（本地数据库 + 官方文档 + 社区）
3. **Phase 3 (RETRIEVE)**：同步检索 Strudel 官方文档 6 个核心页面 + 本地 1018 片段统计数据
4. **Phase 4 (TRIANGULATE)**：将官方文档记录的 API 与社区实际使用频率交叉验证，确认哪些技法真正普遍使用
5. **Phase 4.5 (OUTLINE REFINEMENT)**：基于数据发现，确认重点放在「黄金三角」、「和声系统」、「效果器链」三个维度
6. **Phase 5 (SYNTHESIZE)**：提炼为可直接使用的代码示例和最佳实践指南
7. **Phase 8 (PACKAGE)**：输出报告，包含量化数据支撑和可运行代码示例

---

## 附录 B：快速参考卡片

### 三级代码模板

**Template A（鼓组入门）：**
```javascript
stack(
  "[bd ~ bd ~] [~ ~ ~ ~]",
  "[~ ~ sd ~] [~ ~ ~ ~]",
  "[hh ~ hh hh] [hh ~ hh ~]"
).s().slow(2)
```

**Template B（鼓组 + 旋律）：**
```javascript
stack(
  stack("[bd ~ ~ ~]","[~ sd ~ ~]","[hh hh hh hh]").s(),
  n("0 2 4 2 0 ~ 4 ~").scale("C:minor").note()
    .s("triangle").gain(0.4).lpf(2000).room(.4)
).slow(2)
```

**Template C（完整四层）：**
```javascript
setcps(.75)
let ch = chord("<Am C F G>")
stack(
  stack(s("bd(3,8)"), s("sd(2,8,2)"), s("hh(5,8)")).bank("RolandTR909"),
  ch.voicing().s("piano").gain(0.3).room(.5),
  ch.rootNotes(2).note().s("sawtooth").lpf(400).gain(.6),
  ch.n("0 2 4 2").anchor("c5").voicing().s("sine").delay(.25).room(.6)
)
```
