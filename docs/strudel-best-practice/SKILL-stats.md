---
name: strudel-best-practices
description: Data-driven best practices for writing beautiful Strudel patterns, derived from analysis of 1018 real-world snippets.
---

# 写出好听的 Strudel：数据驱动最佳实践

> 本 skill 基于对 **1018 个真实 Strudel 片段**（924 个来自 Codeberg，94 个来自 GitHub）的统计分析，提炼出最高频、最有效的编写技巧。

---

## 一、数据洞察摘要

| 维度 | 数据 |
|---|---|
| 总片段数 | 1018 |
| 来源分布 | Codeberg 924 / GitHub 94 |
| 复杂度分布 | basic 30 / intermediate 591 / advanced 397 |
| 最高频 tag | `s`（761次，74.8%） |
| 最强黄金三角 | `s` + `stack` + `slow`（49.5% 的 intermediate+ 片段同时具备这三个）|

**从 basic 跨入 intermediate 的关键信号：**
- `s` 的使用率：basic 23.3% → intermediate **89.5%**（跳升 4 倍）
- `stack` 的使用率：basic 36.7% → intermediate **82.9%**
- `slow` 的使用率：basic 6.7% → intermediate **82.6%**

**从 intermediate 跨入 advanced 的关键信号：**
- `note` 的使用率：intermediate 8.6% → advanced **42.3%**（跳升 5 倍）
- `fast` 的使用率：intermediate 0% → advanced **16.1%**
- `gain / lpf / delay / room` 等音效链标签在 advanced 中全面提升

---

## 二、核心构建块（按使用频率排序）

### 1. `s()` — 声音选择器（出现 761 次，74.8%）

所有中高级片段几乎必用。`s()` 指定声音样本库中的乐器名。

```javascript
// 最简单的用法：鼓声
s("bd sd hh sd")

// 配合方括号语法定义节奏
s("[bd ~ ~ ~] [~ sd ~ ~]")
```

**注意：** `stack(...).s()` 是惯用写法——把旋律/节奏模式传给 `stack` 后，链式调用 `.s()` 统一指定音色。

### 2. `stack()` — 多轨叠加（出现 564 次，55.4%；intermediate+ 中 56.0%）

**最重要的结构函数**。把多个 pattern 叠放在一起同步播放，是构建鼓组、和弦叠层的核心。

```javascript
// 三轨鼓组
stack(
  "[bd ~ bd ~] [~ ~ bd ~] [~ ~ bd ~] [~ ~ ~ ~]",
  "[~ ~ ~ ~] [sd ~ ~ sd] [~ sd ~ ~] [sd ~ ~ ~]",
  "[hh ~ hh hh] [~ hh hh ~] [hh hh ~ hh] [hh ~ hh hh]"
).s().slow(2)
```

### 3. `slow()` — 时间拉伸（出现 564 次，55.4%；intermediate+ 中 56.9%）

与 `stack` 几乎等频出现。`slow(n)` 把整个 pattern 放慢 n 倍（循环周期变长），常用于精细的长节奏型。

```javascript
// slow(2) 把模式扩展到 2 个循环周期
stack(
  "[bd ~ ~ ~] [~ ~ ~ ~] [bd ~ ~ ~] [~ ~ ~ ~] ",
  "[hh ~ hh hh] [hh ~ hh ~] [hh ~ hh ~] [hh ~ hh ~] ",
  "[~ ~ ~ ~] [~ ~ rim ~] [~ ~ ~ ~] [~ ~ ~ ~] ",
).s().slow(2)
```

**数据依据：** `(s, slow)` 共现 531 次，是所有 tag pair 中**最高频**的组合，占全部片段的 52.2%。

### 4. `note()` — 音高控制（出现 223 次，21.9%）

advanced 代码的核心标志。可接受音符名（`c4`、`a3`）、MIDI 数字、音阶度数等。

```javascript
// 音符名 + 时间分布
note("c3 e3 g3 e3")

// 角括号 <> 表示"每个循环选一个"
note("<C2 Bb1 Ab1 G1>")
```

### 5. `fast()` — 时间压缩（出现 64 次，6.3%；仅 advanced 中显著：16.1%）

`fast(n)` 是 `slow(1/n)` 的语义等价，但语义更清晰。它是区分 intermediate 与 advanced 的重要特征（intermediate 中出现率接近 0%）。

```javascript
// 让节奏型密度翻倍
"0 1 2 3 4 3 2 1".inside(4, rev).scale('C major').note()
```

---

## 三、黄金函数组合（Tag 共现分析）

以下组合是经数据验证的**最强组合**，排序按共现频率：

| 排名 | 组合 | 共现次数 | 占比 |
|---|---|---|---|
| 🥇 | `s` + `slow` | 531 | 52.2% |
| 🥈 | `s` + `stack` | 507 | 49.8% |
| 🥉 | `slow` + `stack` | 496 | 48.7% |
| 4 | `note` + `s` | 112 | 11.0% |
| 5 | `gain` + `s` | 58 | 5.7% |
| 6 | `note` + `slow` | 56 | 5.5% |
| 7 | `lpf` + `s` | 52 | 5.1% |
| 8 | `lpf` + `note` | 48 | 4.7% |
| 9 | `delay` + `s` | 45 | 4.4% |
| 10 | `room` + `s` | 43 | 4.2% |

**实用结论：**
- 写节奏/鼓组时，优先组合 `stack` + `s` + `slow`
- 写旋律时，优先组合 `note` + `s` + `lpf`
- 添加空间感时，优先组合 `delay` + `room`

---

## 四、节奏构建：鼓组写法

### 基础模式：`stack + s + slow`

这是 **intermediate 最核心的惯用法**（出现在 49.5% 的 intermediate+ 片段）。用方括号 `[]` 定义每个循环内的节奏，`~` 表示休止符。

```javascript
// 示例 1：简洁二轨鼓组
stack(
  "[bd ~ bd ~] [~ ~ bd ~] [~ ~ bd ~] [~ ~ ~ ~]",
  "[~ ~ ~ ~] [sd ~ ~ sd] [~ sd ~ ~] [sd ~ ~ ~]",
).s().slow(2)
```

```javascript
// 示例 2：五轨完整鼓组（bd/hh/sd/ht/lt/rim）
stack(
  "[bd ~ ~ ~] [~ ~ ~ ~] [bd ~ ~ ~] [~ ~ ~ ~] ",
  "[hh ~ hh hh] [hh ~ hh ~] [hh ~ hh ~] [hh ~ hh ~] ",
  "[~ ~ ~ ~] [~ ~ ~ ~] [~ ~ ht ~] [~ ~ ~ ~] ",
  "[~ ~ ~ ~] [~ ~ ~ ~] [~ ~ ~ ~] [~ ~ lt ~] ",
  "[~ ~ ~ ~] [~ ~ rim ~] [~ ~ ~ ~] [~ ~ ~ ~] ",
).s().slow(2)
```

### 鼓声音色参考

| 缩写 | 含义 |
|---|---|
| `bd` | bass drum（底鼓） |
| `sd` / `sn` | snare drum（军鼓） |
| `hh` | hi-hat（踩镲） |
| `ht` / `mt` / `lt` | high/mid/low tom（通鼓） |
| `rim` | rimshot（边击） |
| `ac` | accent |

### 进阶：多个 `stack` 组合 + `.fast()`

```javascript
// drums 和 synths 分开写，最后合并
const drums = stack(
  "[bd ~ ~ ~] [~ ~ ~ ~]",
  "[~ ~ sd ~] [~ ~ sd ~]"
).s()

stack(
  drums.fast(2),
  synths
).slow(2)
```

---

## 五、旋律与和声

### 基础旋律：音符名序列

```javascript
// note() 接受 MIDI 音符名
note("c3 e3 g3 e3")

// 用 ~ 加入停顿
note("a3 ~ c4 ~ e4 ~ d4 c4 ~ a3 ~ ~ e4 ~ c4 ~")
  .s('triangle')
```

### 旋律 + 音色 + 音量

`note` 在 advanced 中的高覆盖率（42.3%）表明，**旋律必须配合音色（`s`）和音量（`gain`）才能形成完整音乐**。

```javascript
// 旋律 + triangle 音色 + 增益控制
note('a3 ~ c4 ~ e4 ~ d4 c4 ~ a3 ~ ~ e4 ~ c4 ~')
  .s('triangle')
  .gain(0.09)
```

### 使用角括号实现和弦变换

```javascript
// 每个循环换一个和弦
note("<C2 Bb1 Ab1 [G1 [G2 G1]]>/2")
  .s('sawtooth')
```

### 使用 `scale()` 简化旋律

```javascript
// 用音阶度数代替音符名
"0 1 2 3 4 3 2 1".inside(4, rev).scale('C major').note()
```

### 使用 `struct()` 为旋律赋予节奏骨架

```javascript
// struct 定义触发时间点，note 定义音高
note("<C2 Bb1 Ab1 [G1 [G2 G1]]>/2")
  .struct("[x [~ x] <[~ [~ x]]!3 [x x]>@2]/2".fast(2))
  .s('sawtooth').attack(0.001).decay(0.2).sustain(1)
```

---

## 六、音效链：从干声到丰富空间感

### 关键音效函数（按 advanced 片段覆盖率排序）

| 函数 | 作用 | advanced 覆盖率 |
|---|---|---|
| `gain()` | 整体音量（0-1） | 10.3% |
| `lpf()` | 低通滤波，削减高频使声音温暖 | 8.8% |
| `delay()` | 延迟效果（0-1） | 9.3% |
| `room()` | 混响大小（0-1） | 7.8% |
| `release()` | 音符释放时间（秒） | ~7% |
| `sustain()` | 持续电平（0-1） | ~6% |
| `cutoff()` | 滤波截止频率（Hz） | ~5.5% |

### 空间感音效链：`delay` + `room`

`delay` + `room` 共现 27 次，是制造**环境感**的黄金组合（advanced 中 tag pair 第 12 位）。

```javascript
// 带完整空间感的旋律线
note('~ a4 ~ ~ e4 ~ ~ ~ ~ d5 ~ ~ ~ c5 ~ ~')
  .s('triangle')
  .gain(0.05)
  .decay(0.4)
  .sustain(0.05)
  .release(1.2)
  .delay(0.5)
  .delaytime(0.6)
  .delayfeedback(0.55)
  .room(0.7)
  .lpf(2000)
  .slow(2)
```

### 极简空间感（high room + slow + sine）

```javascript
// 极长混响的空灵音效
note('~ ~ ~ ~ e6 ~ ~ ~ ~ ~ ~ ~')
  .s('sine')
  .gain(0.015)
  .slow(3)
  .delay(0.6)
  .delaytime(0.9)
  .delayfeedback(0.5)
  .room(0.95)
  .roomsize(10)
  .lpf(3500)
```

### 旋律 + 完整包络 + 中等空间

```javascript
note('a3 ~ c4 ~ e4 ~ d4 c4 ~ a3 ~ ~ e4 ~ c4 ~')
  .s('triangle')
  .gain(0.09)
  .lpf(1800)
  .decay(0.25)
  .sustain(0.15)
  .release(0.6)
  .room(0.4)
  .delay(0.15)
  .delaytime(0.375)
  .delayfeedback(0.3)
```

### LFO 调制滤波器

```javascript
// lpdepth 让低通截止频率随时间摆动
note("<c c c# c c c4>*16").s("sawtooth").lpf(600).lpdepth("<1 .5 1.8 0>")
```

---

## 七、高级技巧

### 1. `struct()` — 节奏骨架与音高分离

**advanced 专属技巧**（advanced 覆盖率 7.1%，intermediate 仅 1.5%）。把"触发什么时候"和"触发什么音"完全解耦。

```javascript
// struct 定义节奏，note 定义音高，完全独立控制
note("<C2 Bb1 Ab1 [G1 [G2 G1]]>/2")
  .struct("[x [~ x] <[~ [~ x]]!3 [x x]>@2]/2".fast(2))
  .s('sawtooth')
  .attack(0.001).decay(0.2).sustain(1).cutoff(500)
```

### 2. `inside()` / `outside()` — 局部时间变换

在一个时间范围"内部"做操作，然后还原——产生高密度局部变化。

```javascript
// 在 4 倍放大的时间轴里做 rev，再压回来
"0 1 2 3 4 3 2 1".inside(4, rev).scale('C major').note()
```

### 3. `every()` — 周期性变奏

每 N 个循环触发一次变换，制造非重复感。

```javascript
chord("<Cm7 Bb7 Fm7 G7b13>/2")
  .struct("~ [x@0.2 ~]".fast(2))
  .dict('lefthand').voicing()
  .every(2, early(1/8))  // 每 2 个循环提前 1/8 个 cycle
```

### 4. `mask()` — 节奏遮罩

只在特定时刻允许声音通过，是制造长周期动态的利器。

```javascript
// 用 mask 制造 8 cycle 的大开关
.mask("<x@7 ~>/8".early(1/4))
```

### 5. `chop()` + `rev()` — 粒子合成

`chop(n)` 把样本切成 n 份，配合 `rev()` 反转，实现粒子合成效果。

```javascript
s("rhodes")
  .chop(4)
  .rev()
```

---

## 八、从 Basic 到 Advanced 的进化路径

```
Basic（≈30 片段）
└── 单一 pattern：s("bd sd hh sd")

    ↓ 加入 stack + slow（basic → intermediate 的关键跃升）

Intermediate（≈591 片段）
└── stack([bd, sd, hh]).s().slow(2)
    核心：多轨鼓组，方括号节奏型，slow 控制周期

    ↓ 加入 note + 音效链 + struct（intermediate → advanced 的关键跃升）

Advanced（≈397 片段）
└── note().s().lpf().gain().delay().room()
    核心：旋律 + 完整包络 + 空间音效 + 节奏与音高解耦
```

**summary 关键数据：**
- `stack` 在 intermediate 中覆盖率 **82.9%**，到 advanced 降至 15.9%（鼓组框架已内化）
- `note` 在 advanced 中覆盖率 **42.3%**，在 intermediate 仅 8.6%（旋律是 advanced 的核心）
- `fast` 在 advanced 中出现率 **16.1%**，在 intermediate 几乎为 0（时间变换是高级技巧）

---

## 九、快速写作模板

### 模板 A：纯节奏鼓组（intermediate）

```javascript
stack(
  "[bd ~ bd ~] [~ ~ ~ ~]",      // kick
  "[~ ~ ~ ~] [sd ~ ~ sd]",      // snare
  "[hh ~ hh hh] [hh ~ hh ~]",  // hi-hat
).s().slow(2)
```

### 模板 B：节奏 + 旋律叠层（intermediate→advanced）

```javascript
stack(
  // 鼓组
  stack(
    "[bd ~ ~ ~] [~ ~ ~ ~]",
    "[~ ~ sd ~] [~ ~ ~ ~]",
  ).s(),
  // 旋律
  note("c3 e3 g3 e3 ~ ~ ~ ~")
    .s('triangle')
    .gain(0.3)
    .lpf(2000)
).slow(2)
```

### 模板 C：空间感旋律（advanced）

```javascript
note("<Am F C G>/2")
  .s('sawtooth')
  .gain(0.1)
  .attack(0.01)
  .decay(0.3)
  .sustain(0.6)
  .release(1.0)
  .lpf(1800)
  .delay(0.3)
  .delaytime(0.4)
  .delayfeedback(0.4)
  .room(0.6)
  .slow(2)
```

### 模板 D：粒子/实验（advanced）

```javascript
note("0 1 2 3 4 3 2 1".inside(4, rev))
  .scale('C minor')
  .s('piano')
  .struct("[x ~ x x] [~ x ~ x]".fast(2))
  .gain(0.4)
  .room(0.5)
```
