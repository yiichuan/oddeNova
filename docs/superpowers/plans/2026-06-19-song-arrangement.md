# 曲子编排（Song Arrangement）实现计划

> **For agentic workers:** 按 Task 顺序逐条实现。每个 Step 用 checkbox（`- [ ]`）跟踪。Task 1 与 Task 2 相互独立，但建议先 Task 1（可单测、风险低）。

**Goal:** 让 agent 在判断到"完整曲子"意图时，生成带时间编排（错开入场/出场拉出长弧线 + 混合周期/连续信号/随机制造微观变化）的代码，而不是一堆永远同步循环叠加的层；同时让 parser 把每层的编排包络抬到系统消息摘要里，使多轮编辑不抹平编排。设计见 [spec](../specs/2026-06-19-song-arrangement-design.md)。

**Architecture:** Phase 1 = 方案 A（新 prompt `v17`，纯 prompt 教编排原则）+ 方案 C 摘要部分（parser 新增 `envelope` 字段 + `summariseScore` 输出 + `loop.ts` 渲染）。保持单 `stack` 结构，不动播放/导出逻辑。真·多段落 `arrange()` 留给 Phase 2。

**Tech Stack:** TypeScript（strict）、Vitest、现有 prompt 版本管理（`versions/v{N}.ts` + `active.ts`）。

---

## 文件一览

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/agent/parser.ts` | 修改 | `ParsedLayer.envelope` 字段 + `extractEnvelope` 提取 + `summariseScore` 输出 |
| `src/agent/loop.ts` | 修改 | 系统消息层标签拼上 envelope（中英两分支）|
| `src/agent/__tests__/parser.test.ts` | 修改 | envelope 提取 + summariseScore 输出的单测 |
| `src/prompts/versions/v17.ts` | **新建** | 由 v16 复制，新增「曲子编排」节（中英双语）|
| `src/prompts/active.ts` | 修改 | 指针指向 v17 |

---

## Task 1：parser 感知编排包络 + 摘要渲染

**Files:**
- Modify: `src/agent/parser.ts`
- Modify: `src/agent/loop.ts`
- Modify: `src/agent/__tests__/parser.test.ts`

- [ ] **Step 1.1：`ParsedLayer` 新增 `envelope` 字段**

在 `src/agent/parser.ts` 的 `ParsedLayer` 接口末尾加可选字段：

```ts
export interface ParsedLayer {
  name: string;
  source: string;       // layer expression text without the @layer marker, trimmed
  rawStart: number;     // absolute index in code where this layer's slot begins
  rawEnd: number;       // absolute index (exclusive) where this layer's slot ends
  envelope?: string;    // 编排包络摘要（如 "mask/16 gain/16"），无则 undefined
}
```

- [ ] **Step 1.2：新增 `extractEnvelope` 辅助函数**

在 `parser.ts` 的 helper 区域（`dedentSource` 附近）新增。只识别**带显式慢化窗口** `<...>/N` 的交替（这才是 arrangement 尺度；不带 `/N` 的 `<a b>` 是每 cycle 的微观交替，刻意排除）。归纳出"角色/窗口"对，按角色方法名分类：

```ts
// 提取一层里 arrangement 尺度的编排包络：匹配 `.方法("...<...>/N...")` 形式，
// 归纳成 "role/N" 列表（如 "mask/16 s/8"）。无任何此类标志返回 undefined。
// 保守、无副作用：解析失败一律返回 undefined，绝不抛错。
const ENVELOPE_RE =
  /\.?(mask|gain|lpf|hpf|bank|note|struct|n|s)\s*\(\s*["'`][^"'`]*?<[^>]*?>\s*\/\s*(\d+(?:\.\d+)?)/g;

function extractEnvelope(source: string): string | undefined {
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  ENVELOPE_RE.lastIndex = 0;
  while ((m = ENVELOPE_RE.exec(source)) !== null) {
    seen.add(`${m[1]}/${m[2]}`);
  }
  return seen.size > 0 ? [...seen].join(' ') : undefined;
}
```

> 说明：envelope 是**语言中立**的紧凑标记（`mask/16`），不分中英——因为 parser 不知道 `isZh`，渲染语言交给 loop.ts。`role` 用方法名本身，足以让 agent 一眼看出"这层靠 mask 在 16 cycle 窗口进出"。

- [ ] **Step 1.3：在 `parseScore` 推入 layer 时填充 `envelope`**

在 `result.layers.push({ ... })` 处补一行（`source` 已是 dedent 后文本，直接喂给 `extractEnvelope`）：

```ts
          const dedented = dedentSource(sourceText);
          result.layers.push({
            name,
            source: dedented,
            rawStart: result.stackArgsStart + span.start,
            rawEnd: result.stackArgsStart + span.end,
            envelope: extractEnvelope(dedented),
          });
```

（即把原来的 `source: dedentSource(sourceText)` 拆成先存 `dedented` 再复用，避免调用两次。）

- [ ] **Step 1.4：`summariseScore` 输出 `envelope`**

```ts
export function summariseScore(score: ParsedScore): {
  bpm: number | null;
  layers: { name: string; preview: string; envelope?: string }[];
} {
  return {
    bpm: score.bpm,
    layers: score.layers.map((l) => ({
      name: l.name,
      preview: l.source.length > 80 ? l.source.slice(0, 77) + '...' : l.source,
      envelope: l.envelope,
    })),
  };
}
```

- [ ] **Step 1.5：`loop.ts` 在层标签拼上 envelope（中英两分支）**

在 `src/agent/loop.ts` 的 `summariseScore` 消费处（约 [loop.ts:143-147](../../../src/agent/loop.ts#L143)），把 `layers.map((l) => l.name)` 改为带 envelope 的标签。在 `const { bpm, layers } = summariseScore(score);` 之后加一个本地辅助，并替换两处 `.map`：

```ts
    const { bpm, layers } = summariseScore(score);
    const layerLabel = (l: { name: string; envelope?: string }) =>
      l.envelope ? `${l.name}[${l.envelope}]` : l.name;
    const bpmStr = bpm != null ? `BPM: ${bpm}` : '';
    const layersStr = isZh
      ? layers.length > 0 ? `音层: ${layers.map(layerLabel).join(' / ')}` : '（无音层）'
      : layers.length > 0 ? `Layers: ${layers.map(layerLabel).join(' / ')}` : '(no layers)';
```

效果：摘要变成 `音层: drums[mask/16] / bass / lead[gain/16]`，让 agent 编辑时看到既有编排并主动保留/呼应。

- [ ] **Step 1.6：补 parser 单测**

在 `src/agent/__tests__/parser.test.ts` 新增一个 `describe('envelope extraction', ...)`：

```ts
import { parseScore, summariseScore } from '../parser';

describe('envelope extraction', () => {
  it('captures the window from a .mask("<...>/N") layer', () => {
    const code = 'setcps(0.5)\nstack(\n  /* @layer drums */\n  s("bd*4").mask("<1 0 1 1>/16")\n)';
    const { layers } = parseScore(code);
    expect(layers[0].envelope).toBeDefined();
    expect(layers[0].envelope).toContain('16');
    expect(layers[0].envelope).toContain('mask');
  });

  it('captures the window from an in-pattern <...>/N alternation', () => {
    const code = 'setcps(0.5)\nstack(\n  /* @layer drums */\n  s("<bd*4 [bd*2 sd]>/8")\n)';
    const { layers } = parseScore(code);
    expect(layers[0].envelope).toContain('8');
  });

  it('leaves envelope undefined for a static layer', () => {
    const code = 'setcps(0.5)\nstack(\n  /* @layer drums */\n  s("bd*4 sd")\n)';
    const { layers } = parseScore(code);
    expect(layers[0].envelope).toBeUndefined();
  });

  it('ignores a 1-cycle <a b> alternation without /N', () => {
    const code = 'setcps(0.5)\nstack(\n  /* @layer drums */\n  s("bd <sd cp>")\n)';
    const { layers } = parseScore(code);
    expect(layers[0].envelope).toBeUndefined();
  });

  it('summariseScore surfaces envelope when present, omits when absent', () => {
    const code =
      'setcps(0.5)\nstack(\n  /* @layer drums */\n  s("bd*4").mask("<1 1 0 1>/16"),\n  /* @layer bass */\n  note("c2*2")\n)';
    const { layers } = summariseScore(parseScore(code));
    expect(layers[0].envelope).toContain('16');
    expect(layers[1].envelope).toBeUndefined();
  });
});
```

- [ ] **Step 1.7：跑测试**

```bash
npx vitest run src/agent/__tests__/parser.test.ts
```

全绿后继续。回归：现有 parser 测试不应受影响（新字段可选）。

---

## Task 2：Prompt v17 — 教编排原则（按 edit-system-prompt 规程）

**Files:**
- Create: `src/prompts/versions/v17.ts`（由 v16 复制）
- Modify: `src/prompts/active.ts`

> 严格遵守 [.github/prompts/edit-system-prompt.prompt.md](../../../.github/prompts/edit-system-prompt.prompt.md)：**不改任何 `versions/v*.ts` 旧版本，不改 `system-prompt.ts`**。当前导出名以 `active.ts` 为准：`AGENT_SYSTEM_PROMPT_OPENAI`、`AGENT_SYSTEM_PROMPT_EN`（规程文档里的 `AGENT_SYSTEM_PROMPT`/`IMPROVISE_*` 已过时，忽略）。

- [ ] **Step 2.1：复制 v16 → v17**

```bash
cp src/prompts/versions/v16.ts src/prompts/versions/v17.ts
```

- [ ] **Step 2.2：更新 v17 头部注释**

```ts
/**
 * @version v17
 * @date 2026-06-19
 * @description 新增「曲子编排」节：在判断到"完整曲子"意图时，教 agent 用
 * 错开的入场/出场包络拉出长弧线，并用混合周期/连续信号/随机制造微观变化；
 * 编排作为可自由组合的原则呈现，不放可照抄的模板骨架。
 */
```

- [ ] **Step 2.3：在 `AGENT_SYSTEM_PROMPT_OPENAI`（中文）的「音层代码生成」块之后，追加「曲子编排」节**

在该数组里，紧跟那段以 `'## 音层代码生成'` 开头的 `[ ... ].join('\n')` 元素之后，新增一个数组元素：

```ts
  [
    '## 曲子编排（仅在"完整曲子"意图时启用）',
    '- **何时启用**：仅当**从零创作且用户偏"作品"**——出现风格名（house/lo-fi/ambient…）、"一首""完整""song""track"、或描述了情绪旅程/段落。用户偏 jam（"加个 bass""来点鼓""随便玩玩"）或在**编辑现有代码**时，保持原有循环叠加行为，**不强加编排**。不确定时只做轻量缓入，宁可保守。',
    '- **长弧线（入场/出场）**：用 `.mask("<...>/N")` 或大尺度 `.gain("<...>/N")` 决定**每层何时进入/退出**，让整首走出 intro→build→main→breakdown→return。不要所有层从 cycle 0 全开——鼓骨架先入，贝斯/和声/主奏依次进入，某些层在 breakdown 退出。承载进出的包络**共用同一窗口 N、边界对齐**；窗口长度与段数按风格/情绪自选。',
    '- **微观变化（避免机械循环）**：层内部混用**不同长度**的 `<...>` 交替（如 2/4/8 cycle）、**连续信号**（`sine/perlin/rand` 配 `.range(a,b).slow(N)` 调制 gain/lpf/pan/fm）、**随机/条件变换**（`.sometimes(...)`、`.rarely(ply("2"))`、`.chunk(N, fast(2))`、`.degradeBy(...)`），使曲子长时间不齐刷刷重复。',
    '- **原则而非模板**：以上是可自由组合的原则——窗口长度、段数、入场顺序、用门控还是渐变、用哪几种微观变化，都按当下风格情绪决定，不要套同一个固定骨架。',
  ].join('\n'),
```

- [ ] **Step 2.4：在中文「## 提交前——以音乐家的耳朵聆听」节追加一条自检**

在该节现有 `'- **旋律可以哼唱吗？**...'` 等条目后，追加：

```ts
  '- **这是完整曲子吗？** 若是，各层是否随时间错开入场/出场拉出弧线、内部是否有混合周期/连续信号/随机带来的微观变化，而不是从头叠到尾？若否，补上编排再提交。',
```

- [ ] **Step 2.5：在 `AGENT_SYSTEM_PROMPT_EN`（英文）做对应的两处修改**

英文「Song arrangement」节（接在 `'## Layer code generation'` 块之后）：

```ts
  [
    '## Song arrangement (only when the intent is a *complete song*)',
    '- **When to enable**: only when **composing from scratch AND the user leans "a finished piece"** — a style name (house/lo-fi/ambient…), words like "a song/full/track", or a described emotional journey/sections. When the user leans jam ("add a bass", "give me drums", "just mess around") or is **editing existing code**, keep the existing stacked-loop behavior and **do not impose arrangement**. When unsure, only do a light fade-in; stay conservative.',
    '- **Long arc (entrances/exits)**: use `.mask("<...>/N")` or large-scale `.gain("<...>/N")` to decide **when each layer enters/leaves**, tracing intro→build→main→breakdown→return. Do not start every layer at cycle 0 — the drum backbone enters first, then bass/harmony/lead in turn, and some layers drop out in the breakdown. Entrance/exit envelopes **share the same window N and align their boundaries**; pick window length and segment count to suit the style/mood.',
    '- **Micro-variation (avoid mechanical looping)**: inside a layer, mix `<...>` alternations of **different lengths** (e.g. 2/4/8 cycles), **continuous signals** (`sine/perlin/rand` with `.range(a,b).slow(N)` modulating gain/lpf/pan/fm), and **random/conditional transforms** (`.sometimes(...)`, `.rarely(ply("2"))`, `.chunk(N, fast(2))`, `.degradeBy(...)`), so the piece does not repeat in lockstep for a long time.',
    '- **Principles, not a template**: the above are freely combinable principles — window length, segment count, entrance order, gate vs. fade, and which micro-variations to use are all chosen for the current style/mood; do not reuse one fixed skeleton.',
  ].join('\n'),
```

英文「## Before committing — listen with a musician's ear」节追加：

```ts
  '- **Is this a complete song?** If so, do the layers stagger their entrances/exits into an arc, and is there micro-variation (mixed periods / continuous signals / randomness), rather than piling up from start to finish? If not, add arrangement before committing.',
```

- [ ] **Step 2.6：把 `active.ts` 指向 v17**

```ts
export { AGENT_SYSTEM_PROMPT_OPENAI, AGENT_SYSTEM_PROMPT_EN } from './versions/v17';
```

（导出名不变，无需改 `{}` 列表。）

---

## Task 3：整体验证

- [ ] **Step 3.1：类型 + lint + 全量测试**

```bash
npx tsc --noEmit -p tsconfig.app.json
npm run lint
npm test
```

三者全过（CLAUDE.md / pre-commit 同款门槛）。

- [ ] **Step 3.2：（可选）人工冒烟**

`npm run dev`，分别试：
- 完整曲子意图（如"写一首完整的 lo-fi house"）→ 代码各层有错开的 `<...>/N` 进出包络 + 内部微观变化，且能播放。
- jam 意图（"加个 bass"）或对现有曲子增量编辑 → 行为同 v16，不强加编排；摘要里能看到既有 envelope。

- [ ] **Step 3.3：（可选）eval**

```bash
npm run eval && npm run eval:report
```

人工核对编排效果（需 `scripts/eval/.env` 的 key）。

---

## 验收标准（对应 spec）

- 完整曲子意图 → 各层错开进出包络（共用窗口、对齐）拉出弧线 + 微观变化，通过 `validate`。
- jam 意图 / 编辑现有代码 → 行为与 v16 一致，不强加编排。
- 已带编排的曲子做增量编辑 → 摘要里可见 envelope，其它层编排不被抹平。
- parser envelope 提取无副作用，现有测试全绿，新测试覆盖 mask 窗口 / 段落交替窗口 / 静态层 / 1-cycle 排除 / summariseScore 输出。

## 不做（Phase 2）

`arrange()` 真·多段落与 parser 多-stack、编排 lint（方案 B）、有限会结束的曲子、UI 模式开关。
