# 曲子编排（Song Arrangement）设计

**日期**: 2026-06-19
**状态**: 已批准设计，待实现计划

## 背景与问题

当用户的输入导向"让 agent 一次性写一首完整的曲子"时，当前 agent 容易产出**某些层一直循环不变**的结果：整首曲子的鼓节奏一成不变，没有错开/入场/出场的编排，听感上是乐器一直在叠加，而没有延伸出一首完整的曲子。这种做法适合 live coding，但不适合更广阔的其它类型风格的曲子。

**根因**：agent 始终输出 `setcps(N)` + `stack(layerA, layerB, ...)`，每一层从 cycle 0 开始永远同步循环，没有任何时间编排原语。[parser.ts](../../../src/agent/parser.ts) 也假设这种单一 `stack` 结构；当前 prompt v16 的"音层代码生成"节只讲频率分区和密度，从不涉及层如何随时间演进。"乐器叠上去就永不离场"被同时固化在 prompt 和工具里。

## 已确定的决策（来自 brainstorm）

1. **触发方式：按意图智能判断。** 默认行为不变；只在判断到"完整曲子"意图时升级为带编排的生成。
2. **编排深度：两者结合，分阶段。** Phase 1 用层级包络解决 80% 问题（保持单 stack）；真·多段落 `arrange()` 留给 Phase 2。
3. **时间形态：长弧形循环。** 依然无限循环，但在较长窗口（16/32 cycle）内走出 intro→build→main→breakdown→return 的弧线，然后重复。**不改 strudel 播放/导出逻辑。**
4. **Phase 1 范围：A（新 prompt v17）+ C 的摘要部分（parser 在摘要中显示每层编排包络）。** 不做编排 lint（B）。

## 核心机制

### 概念：层级编排包络

"编排包络"指**一整个乐器层在整首曲子的若干 cycle 内如何随时间变化的轮廓**（区别于单音符内部的 ADSR 音量包络）。两类手段：

- **门控（硬切进出）**：`.mask("<1 0 1 1>/N")`
- **渐变（平滑淡入淡出 / 扫频）**：`.gain("<0 0 .3 .5>/N")`、`.lpf("<400 800 2000 4000>/N")`

例如主奏层 `.gain("<0 0 .3 .5>/16")`：把 16 cycle 切成 4 段（每段 4 cycle），音量依次 `0→0→0.3→0.5`，即前 8 cycle 静默、后半段才缓缓淡入。

### 段落级内容变化（关键）

一层不必是静态 pattern。它的 `s(...)`、`.bank(...)`、`.note(...)`、`.gain(...)` 都可以各自携带 `<v1 v2 v3 v4>/N` 段落交替，让**同一层**在不同段落呈现不同节奏/音色/力度——而这**仍然是单层、单 stack**，完全在 Phase 1 范围内。

四段落、鼓内容全变的范例（窗口 16 cycle，4 段每段 4 cycle）：

```js
/* @layer drums */
// 四段鼓：808骨架→808加密→909 drop→707收尾
s("<bd*4  [bd*4,~ sd]  [bd*2 bd*2 sd*2]  bd ~>/16")
  .bank("<RolandTR808 RolandTR808 RolandTR909 RolandTR707>/16")
  .gain("<.6 .75 1 .45>/16")
```

| 段落 | cycle | 节奏 | 音色 | 音量 |
|---|---|---|---|---|
| 1 intro | 0–4 | `bd*4` 简单四踩 | 808 | .6 |
| 2 build | 4–8 | 加 snare 变密 | 808 | .75 |
| 3 drop | 8–12 | 双倍踢鼓+snare | 909 | 1.0 |
| 4 outro | 12–16 | 稀疏收尾 | 707 | .45 |

节奏、音色、音量三者都随段落变，却依然是 `stack(...)` 里的一层，parser 照样能定位它，"把第三段鼓调小"这类增量编辑仍然可行。

### 统一段落网格（Phase 1 唯一需要 agent 自律之处）

所有层的 `<...>/N` 必须用**相同的 N 和相同的段数**，段落边界才会对齐，否则各层段落错位听感会乱。

## 方案 A：Prompt v17

遵循 [.github/prompts/edit-system-prompt.prompt.md](../../../.github/prompts/edit-system-prompt.prompt.md) 规范：新建 `src/prompts/versions/v17.ts`（**不改任何旧版本**），更新其头部注释，把 `src/prompts/active.ts` 指向 v17，**不动** `system-prompt.ts`。中英双语同步修改（`AGENT_SYSTEM_PROMPT_OPENAI` 与 `AGENT_SYSTEM_PROMPT_EN`）。

新增内容（在现有"音层代码生成 / Layer code generation"节之后追加一节「曲子编排 / Song arrangement」）：

1. **意图判断规则**
   - **触发完整编排**：从零创作 **且** 用户信号偏"作品"——出现风格名（house/lo-fi/ambient…）、"一首""完整""song""track"、或描述了情绪旅程/段落。
   - **保持现有循环叠加行为**：用户偏 jam/live coding（"来点鼓""加个 bass""随便玩玩"），或在**编辑现有代码**（增量编辑永不强加编排）。
   - 不确定时倾向轻量编排（主要层加缓入而非满编排），宁可保守。

2. **编排时间窗概念**：默认窗口 16 cycle（丰富可 32），承载 intro→build→main→breakdown→return 弧线。

3. **错开原则**：不是所有层从 cycle 0 全开；鼓骨架先入，贝斯/和声/主奏依次进入，某些层在 breakdown 段退出。

4. **段落级内容变化**：明确教 agent 把 `<v1 v2 v3 v4>/N` 写进 `s(...)`/`.bank(...)`/`.note(...)`/`.gain(...)`，让同一层在不同段落呈现不同节奏/音色/力度（含上面的四段鼓范例）。

5. **统一段落网格规则**：所有 `<...>/N` 用相同 N 和相同段数。

6. **可直接复制的包络模板**（3–4 个）：
   - 缓入主奏：`.gain("<0 0 .3 .5>/16")`
   - 入场后保持：`.mask("<0 1 1 1>/16")`
   - build→drop：`.gain("<.2 .4 .7 1>/16")` 配 `.lpf("<400 800 2000 4000>/16")`
   - breakdown 退出：`.mask("<1 1 0 1>/16")`

7. **提交前自检追加一条**（在"以音乐家的耳朵聆听"节）：「这是完整曲子吗？若是，各层是否随时间错开入场/出场、段落是否对齐，而不是从头叠到尾？」

**约束**：所有 `<...>/N` 模式与采样/bank 名称必须仍通过现有 `validate`（语法 + 沙箱 dry-run + mini-notation 校验）。模板里的采样/bank 名称必须取自 `sample-allowlist.ts`。prompt 不强制要求编排（避免误伤 jam 场景）——编排只在意图判断为"完整曲子"时启用。

## 方案 C（摘要部分）：parser 感知编排包络

让结构解析器看懂每层的编排包络，并写进给 agent 的"当前代码摘要"，使多轮编辑不丢失编排。

### 数据结构

[parser.ts](../../../src/agent/parser.ts) 的 `ParsedLayer` 新增可选字段：

```ts
export interface ParsedLayer {
  name: string;
  source: string;
  rawStart: number;
  rawEnd: number;
  envelope?: string;   // 人类可读的编排描述，无包络时 undefined
}
```

### 提取逻辑

在 `parseScore` 构造每个 layer 时，从 `source` 用正则提取带 `<...>/N` 的循环窗口（出现在 `.mask(...)`、`.gain("<...>/N")`、`.lpf("<...>/N")`、`s("<...>/N")`、`.bank("<...>/N")` 等处），归纳出窗口长度 N 与段数，生成一句描述，例如 `"段落网格/16，4段"` 或 `"gain 包络/16"`。无任何此类标志时 `envelope` 留 `undefined`。

实现要点：复用已有的 string/comment-aware 扫描思路（`step`/`ScanState`），避免把字符串字面量里的内容误判为代码；正则只需在已切出的 `source` 文本上匹配 `<[^>]*>\s*\/\s*(\d+)` 与所在的方法名。提取保持**保守且无副作用**——失败时返回 `undefined`，绝不抛错或改变现有解析行为。

### 摘要输出

`summariseScore` 在每层 `preview` 后追加 envelope（仅当存在）：

```ts
layers: score.layers.map((l) => ({
  name: l.name,
  preview: l.source.length > 80 ? l.source.slice(0, 77) + '...' : l.source,
  envelope: l.envelope,   // 新增，供系统消息摘要展示
})),
```

消费方是 [loop.ts:143-147](../../../src/agent/loop.ts#L143)：构造"当前正在播放的代码"系统消息时，目前 `layers` 只渲染了 `l.name`（`layers.map((l) => l.name).join(' / ')`），完整代码本身也已注入到消息的代码块里。在该 `layers.map` 处把 envelope 拼进每层标签（仅当存在），例如 `drums[段落网格/16，4段] / bass / pad`，作为给 agent 的注意力提示——让其编辑时主动保留/呼应既有编排。中英两个分支（`isZh`）都要改。

> 说明：因完整代码已在系统消息中注入，agent 本就能读到 envelope；此处摘要展示是把编排显式抬到层标签上，强化"编辑时别抹平编排"的注意力，改动小、收益确定。

## 测试

按 CLAUDE.md 要求，与 parser 改动同一 commit 更新 [parser.test.ts](../../../src/agent/__tests__/parser.test.ts)：

- 含 `.mask("<1 0 1 1>/16")` 的层 → `envelope` 非空且包含窗口 `16`。
- 含 `s("<bd*4 ...>/16")` 段落网格的层 → `envelope` 反映段落网格/段数。
- 无任何 `<...>/N` 的普通静态层 → `envelope` 为 `undefined`。
- `summariseScore` 输出在有包络时包含 envelope 文本、无包络时不含。
- 回归：现有 parser 测试全部保持通过（新字段为可选，不破坏既有断言）。

prompt 无单测（与现状一致）。可选：跑一次 `npm run eval` 人工核对编排效果。

## 明确不做（留给 Phase 2）

- `arrange()` 真·多段落（verse/chorus 不同**结构/乐器集**）、parser 多-stack 支持。
- 编排 lint（方案 B：在 commit 前检查 agent 是否真的做了编排）——因其需要猜测意图、阈值脆弱。
- 有限、会自动结束的曲子（需改播放/导出逻辑）。
- UI 模式开关（完整曲子模式 vs live coding 模式）。

## 验收标准

- 输入"写一首完整的 lo-fi house"这类完整曲子意图 → 生成的代码中至少主要层带 `<...>/N` 编排，鼓在不同段落有节奏/音色/音量变化，所有层段落网格 N 一致，且通过 `validate`。
- 输入"加个 bass""来点鼓"等 jam 意图，或编辑现有代码 → 行为与 v16 一致，不强加编排。
- 对一首已带编排的曲子做增量编辑（如"把鼓调小"）→ 系统消息摘要里能看到既有 envelope，编辑后其它层的编排不被抹平。
- parser 新增 envelope 提取无副作用，现有测试全绿，新测试覆盖上述场景。
