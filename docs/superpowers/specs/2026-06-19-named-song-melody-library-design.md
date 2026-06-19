# 具名歌曲旋律库 — 设计文档

**日期**: 2026-06-19
**状态**: 已批准，待实现

## 问题

oddeNova 的 agent 目前擅长把情绪/风格描述（"我想回家"、"做点 lo-fi"）转化为原创音乐，但无法可靠地**还原一首具名的著名歌曲**（如生日快乐歌、小星星）。复现具名歌曲需要*精确*的音符序列，而 LLM 对著名旋律的逐音记忆并不可靠——经常出现错音、错节奏。

## 目标

用户点一首具名歌曲时，agent 能输出正确的旋律，并按用户措辞决定是裸旋律还是完整编曲。

## 方案选择

采用**混合方案：精选库优先 + LLM 兜底**。

- 维护一份精选的**公共版权**旋律库，命中库的歌曲精确还原。
- 库里没有的歌曲，由 LLM 凭自身音乐知识尽力转写。

交付机制选定**方案 A：新增 `lookupMelody` 工具**（而非循环前预注入或 prompt 内嵌）。理由：最贴合 oddeNova 既有的工具循环架构（复用 executor 重试与校验流程），库作为可独立测试的数据模块单独维护，"库优先 + LLM 兜底"在工具的命中/未命中分支里表达得最自然，且对中英文/各种措辞鲁棒（由理解请求的 LLM 决定何时查）。代价是多花一个 LLM 轮次，预算（~14 轮）充足。

## 架构

```
用户点歌 ("弹个生日歌")
  → agent 判断这是具名歌曲请求
    → 调用 lookupMelody({ query: "生日歌" })
        → 读取 melody-library.ts，确定性模糊匹配
        → 命中: 返回标准 mini-notation + key + bpm
        → 未命中: 返回 found:false，引导 LLM 兜底转写
    → setCode(...) 按措辞编曲（裸旋律 or 完整多音层）
    → validate → commit
```

`lookupMelody` 是唯一读取旋律库的地方。executor / loop / parser **均不改动**——新工具通过既有的 `findTool` 通用分发。

## 组件

### 1. 旋律库数据模块 — `src/lib/melody-library.ts`

与 `sample-allowlist.ts` 并列，是旋律库的唯一权威来源。

```ts
interface MelodyEntry {
  id: string;        // 唯一标识，如 'happy-birthday'
  names: string[];   // 多语言别名: ['生日快乐','生日歌','happy birthday','happy bday']
  melody: string;    // 预先校验过的裸 Strudel mini-notation，节奏内嵌
                     // 例: 'c4 c4 d4 c4 f4 e4 ~ c4 c4 d4 c4 g4 f4 ...'
  key: string;       // 'C:major'，供 agent 编曲定调
  bpm: number;       // 建议速度
  meter?: string;    // 可选拍号，如 '3/4'
}
```

设计要点：

- **只存裸 `note(...)` 的 mini-notation 字符串**，不带 `.s(...)` 或效果。乐器与编曲交给 agent，保持可组合。
- **节奏内嵌**在 mini-notation 中（`@N` 延长、`~` 休止），库内旋律本身节奏正确。
- **每条 melody 字符串入库前必须经过校验**（通过 transpiler 并试听），确保命中库的歌一定能正确播放——否则"库优先"反而不如 LLM。
- **仅公共版权曲目。**

### 2. `lookupMelody` 工具 — `src/agent/tools.ts`

在 `TOOLS` 数组新增第 4 个工具（非终止型，与 validate/setCode 同类），并在 `TOOL_SCHEMAS_ZH` / `TOOL_SCHEMAS_EN` 加双语 schema。

**Schema**:
```ts
{ name: 'lookupMelody', parameters: { query: string } }
// query: 用户点的歌名，如 "生日快乐" / "twinkle twinkle"
```

**Handler 逻辑**（纯函数、可单测）:
1. 归一化 `query`：转小写、去标点/空格。
2. 对每条记录的 `names` 别名做归一化后的包含/分词匹配（覆盖中英文）。
3. **命中** → `{ ok: true, data: { found: true, name, melody, key, bpm, hint } }`
   - `hint`: "把这段作为旋律层，按用户请求编曲；调性/速度照此"。
4. **未命中** → `{ ok: true, data: { found: false, message: '库中无此曲，请用你自己的音乐知识尽力转写这首广为人知的旋律' } }`

关键决策：

- **未命中也返回 `ok: true`**（只是 `found: false`）。"没找到"是正常业务分支而非工具错误，不应触发 executor 重试；它引导 agent 走 LLM 兜底。
- 匹配在工具内、用**确定性字符串匹配**即可——LLM 已理解请求并传入干净歌名，无需再上 LLM 匹配。
- 工具只给原料，不返回 `.s()` 或编曲。

### 3. 系统 prompt v17 — `src/prompts/versions/v17.ts`

按 CLAUDE.md 流程：从 v16 复制新建 `v17.ts`，更新头部注释，改 `active.ts` 指向 v17。`system-prompt.ts` 转发 shim 不动。中英两版各加内容：

**新增《具名歌曲》章节**:
1. 用户点一首**具体的、有名字的歌**时，**先调用 `lookupMelody({ query })`** 拿标准旋律，再 `setCode`。
2. `found: true` → 把返回的 `melody` mini-notation **逐音照用**作为旋律层（不改音符），按返回的 `key`/`bpm` 定调定速。
3. `found: false` → 用自身音乐知识尽力忠实转写这首广为人知的旋律。
4. **只对具名歌曲调用** `lookupMelody`；情绪/抽象请求**不要**调用，照常直接创作。

**编曲程度推断**（写进同一节，对应"让 agent 判断"的决策）:
- 偏"还原/简单弹一下"（"弹个生日歌"、"play happy birthday"）→ 输出**裸旋律层**（可选加一个克制的和弦垫），忠实优先。
- 偏"改编/做一首"（"生日歌 remix"、"给生日歌配个 house 鼓"）→ 旋律当主奏，按 oddeNova 既有多音层方式编曲（鼓/贝斯/和弦），沿用现有频率分区与增益规则。

**迭代预算**：`lookupMelody` 多花 1 轮，把 v17 "典型流程"更新为 `lookupMelody + setCode + validate + commit ≈ 4 轮`。

## 数据流

| 步骤 | 模块 | 动作 |
|------|------|------|
| 1 | agent (LLM) | 判断请求是否为具名歌曲 |
| 2 | tools.ts `lookupMelody` | 对 melody-library 模糊匹配，返回旋律或 found:false |
| 3 | agent (LLM) | 命中→照用旋律；未命中→自行转写 |
| 4 | tools.ts `setCode` | 按措辞编曲（裸旋律 / 完整多音层） |
| 5 | tools.ts `validate` → `commit` | 校验后提交播放 |

## 错误处理

- `lookupMelody` 入参 `query` 缺失/空 → `{ ok: false, error: 'query 不能为空' }`（双语），走 executor 既有重试。
- 库内 melody 字符串错误 → 由**入库前校验**兜住，运行时不额外处理。
- LLM 兜底转写的旋律仍走正常 `validate`，语法/幻觉 API 错误照样被现有校验流程捕获。

## 测试

`src/agent/__tests__/tools.test.ts`（复用 `getHandler` / `makeCtx`）:
- `lookupMelody` 命中：中文别名（"生日快乐"）、英文别名（"twinkle twinkle"）、大小写/标点变体均能命中。
- 未命中：返回 `found: false` 且 `ok: true`（确认不触发重试）。
- 空 `query` → `ok: false`。

新增 `src/lib/__tests__/melody-library.test.ts`（库自洽）:
- 遍历每条 entry，断言 `id`/`names`/`melody`/`key`/`bpm` 齐全、`names` 无空串、`id` 唯一。

**melody 播放正确性**不进 Vitest：CLAUDE.md 指出 `validate` 依赖浏览器 AudioContext。库内 melody 的正确性靠**一次性入库校验脚本**（dev server / 浏览器里跑 transpiler + 试听）保证；单测只覆盖结构完整性。

## 种子曲库（约 9 首，全公共版权）

生日快乐 · 小星星（Twinkle / Mozart 主题）· 欢乐颂（Ode to Joy）· 两只老虎（Frère Jacques）· 铃儿响叮当（Jingle Bells）· 致爱丽丝（Für Elise 主题）· 卡农（Pachelbel 片段）· 圣诞快乐（We Wish You a Merry Christmas）· 玛丽有只小羊羔（Mary Had a Little Lamb）

每首入库前必须先在 Strudel 中验证旋律正确。

## 不做（YAGNI）

- 不收录版权流行歌（法律风险 + 数据难校对）。
- 不在循环前预注入或 prompt 内嵌曲库（方案 B / C 已否决）。
- 不为兜底转写做单独的准确性校验——沿用现有 `validate` 即可。
- lookupMelody 不上 LLM 做匹配——确定性字符串匹配足够。
