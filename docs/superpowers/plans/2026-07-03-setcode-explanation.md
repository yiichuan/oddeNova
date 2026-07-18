# setCode Explanation 进度说明 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 每次 `setCode` 在进度区先显示一条 persona 口吻的 assistant 叙述消息（说明这步在做什么），再跟原样的 `⚙ setCode({...})` 齿轮行。

**Architecture:** 沿用 `commit.explanation` 范式，给 `setCode` 加一个**必填** `explanation` 参数由模型填写；客户端在收到 setCode 的 `tool_call` 进度事件时，先把 `explanation` 作为 `role: 'assistant'` 消息插入，再照常插入齿轮行。齿轮行本身不变。

**Tech Stack:** TypeScript, React, Vitest。工具 schema 在 `src/agent/tools.ts`，进度渲染在 `src/App.tsx`，系统提示词在 `src/prompts/versions/v21.ts`。

## Global Constraints

- 所有面向 agent 的 schema/prompt 文案遵循 `docs/ai/agent-instruction-design.md`（Goal→Principles→Knowledge→Guidance→Constraints→Review），优先目标/原则/示例，少用硬规则。
- 工具 schema 必须**中英双语同步**（`TOOL_SCHEMAS_ZH` / `TOOL_SCHEMAS_EN`），prompt 的中文段（`AGENT_SYSTEM_PROMPT_OPENAI`）与英文段（`AGENT_SYSTEM_PROMPT_EN`）同步。
- 系统提示词**原地改 v21**（它是 `active.ts` 指向的在编版本），不新建版本；改动需同步更新 v21 头部 `@description` 注释。
- 代码注释用英文；commit message 用英文，并以 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` 结尾。
- 预提交钩子会跑 `tsc --noEmit` + ESLint(`--max-warnings=0`) + 全量测试；任何一项失败提交即无效，禁止 `--no-verify`。

---

### Task 1: 给 setCode 增加必填 `explanation` 参数

**Files:**
- Modify: `src/agent/tools.ts`（setCode 的 `parameters` 约 105-115 行；`TOOL_SCHEMAS_ZH.setCode.params` 约 175-177 行；`TOOL_SCHEMAS_EN.setCode.params` 约 200-202 行）
- Test: `src/agent/__tests__/tools.test.ts`（`describe('setCode')` 块，约 84-142 行；顶部 import 约 10 行）

**Interfaces:**
- Produces: `getOpenAIToolSchemas(isZh)` 返回的 setCode schema，其 `function.parameters.required` 含 `'explanation'`，`properties` 含 `explanation: { type: 'string', description }`。Task 2 依赖运行时 `tool_call` 事件的 `args.explanation` 字段。
- Consumes: 无（首个任务）。
- 注意：`setCode` handler **不读取** `explanation`，其返回值仍是 `{ ok, data: { layers, bpm } }` 不变。

- [ ] **Step 1: 写失败测试**

在 `src/agent/__tests__/tools.test.ts` 顶部 import 补上 `getOpenAIToolSchemas`：

```ts
import { CommitSignal, TOOLS, getOpenAIToolSchemas, type AgentState, type ToolContext } from '../tools';
```

在 `describe('setCode', () => { ... })` 块内追加一个测试：

```ts
  it('requires explanation in the schema (both languages)', () => {
    for (const isZh of [true, false]) {
      const schema = getOpenAIToolSchemas(isZh).find((s) => s.function.name === 'setCode');
      expect(schema, `setCode schema missing (isZh=${isZh})`).toBeDefined();
      const params = schema!.function.parameters as {
        properties: Record<string, { description?: string }>;
        required: string[];
      };
      expect(params.properties).toHaveProperty('explanation');
      expect(params.required).toContain('explanation');
      // param description must be localized, not the raw ZH fallback in the EN schema
      expect(params.properties.explanation.description).toBeTruthy();
    }
  });
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/agent/__tests__/tools.test.ts`
Expected: FAIL —— `expected {...} to have property "explanation"`（当前 setCode 只有 `code`）。

- [ ] **Step 3: 给 setCode 参数加 explanation（必填）**

把 `src/agent/tools.ts` 中 setCode 的 `parameters` 块：

```ts
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description:
            '完整的 Strudel 代码：第一行写顶部注释 `// STYLE | BPM: N`，第二行 setcps(N)，后接 stack(...) 包含所有音层（每层 `/* @layer NAME */` 后另起一行写 `// 简短中文说明`）',
        },
      },
      required: ['code'],
    },
```

改为：

```ts
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description:
            '完整的 Strudel 代码：第一行写顶部注释 `// STYLE | BPM: N`，第二行 setcps(N)，后接 stack(...) 包含所有音层（每层 `/* @layer NAME */` 后另起一行写 `// 简短中文说明`）',
        },
        explanation: {
          type: 'string',
          description:
            '【必填】用你的人格口吻、一句话现在进行时说明这一步 setCode 在做什么，会作为进度消息展示给用户。如 "加上完整 mask 编排，intro→drop 结构" / "给 bass 加一层低通滤波"。',
        },
      },
      required: ['code', 'explanation'],
    },
```

- [ ] **Step 4: 补中文 schema param 描述**

`TOOL_SCHEMAS_ZH.setCode.params` 从：

```ts
    params: {
      code: '完整的 Strudel 代码：第一行写顶部注释 `// STYLE | BPM: N`，第二行 setcps(N)，后接 stack(...) 包含所有音层（每层 `/* @layer NAME */` 后另起一行写 `// 简短中文说明`）',
    },
```

改为（追加 `explanation`）：

```ts
    params: {
      code: '完整的 Strudel 代码：第一行写顶部注释 `// STYLE | BPM: N`，第二行 setcps(N)，后接 stack(...) 包含所有音层（每层 `/* @layer NAME */` 后另起一行写 `// 简短中文说明`）',
      explanation: '【必填】用你的人格口吻、一句话现在进行时说明这一步 setCode 在做什么，会作为进度消息展示给用户。如 "加上完整 mask 编排，intro→drop 结构" / "给 bass 加一层低通滤波"。',
    },
```

- [ ] **Step 5: 补英文 schema param 描述**

`TOOL_SCHEMAS_EN.setCode.params` 从：

```ts
    params: {
      code: 'Full Strudel code: first line is a top comment `// STYLE | BPM: N`, second line setcps(N), followed by stack(...) containing all layers (each `/* @layer NAME */` followed by a short English comment on the next line)',
    },
```

改为（追加 `explanation`）：

```ts
    params: {
      code: 'Full Strudel code: first line is a top comment `// STYLE | BPM: N`, second line setcps(N), followed by stack(...) containing all layers (each `/* @layer NAME */` followed by a short English comment on the next line)',
      explanation: '[Required] In your persona voice, one present-tense sentence describing what this setCode step is doing; shown to the user as a progress message. E.g. "Adding the full mask arrangement, intro→drop structure" / "Adding a low-pass filter to the bass".',
    },
```

- [ ] **Step 6: 运行测试确认通过**

Run: `npx vitest run src/agent/__tests__/tools.test.ts`
Expected: PASS（含新测试，及原 setCode handler 测试——handler 忽略 explanation，返回值不变）。

- [ ] **Step 7: Commit**

```bash
git add src/agent/tools.ts src/agent/__tests__/tools.test.ts
git commit -m "$(printf 'Add required explanation param to setCode tool\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 2: 进度渲染——setCode 的 explanation 作为 assistant 消息前置

**Files:**
- Modify: `src/App.tsx`（`makeAgentProgressHandler` 的 `tool_call` 分支，约 170-175 行）

**Interfaces:**
- Consumes: Task 1 产出的运行时 `e.args.explanation`（string）；`sessions.addAssistantMessage(content, code?, sessionId?)`（已存在于 `useSessions`）；`formatToolCall(name, args)`、`sessions.addProgress(...)`（均已存在）。
- Produces: 无（末端渲染行为）。

- [ ] **Step 1: 修改 tool_call 分支，先插 explanation 消息再插齿轮行**

把 `src/App.tsx` 中：

```ts
      if (e.kind === 'tool_call') {
        if (e.name !== 'validate' && e.name !== 'commit') {
          sessions.addProgress('tool_call', formatToolCall(e.name, e.args), { toolName: e.name, sessionId });
        }
        return;
      }
```

改为：

```ts
      if (e.kind === 'tool_call') {
        if (e.name !== 'validate' && e.name !== 'commit') {
          // For setCode, surface the model's persona-voice explanation as a normal
          // assistant message above the raw tool-call line, so the user sees what
          // each edit step does — not just the truncated JSON preview.
          if (e.name === 'setCode' && typeof e.args.explanation === 'string' && e.args.explanation.trim()) {
            sessions.addAssistantMessage(e.args.explanation.trim(), undefined, sessionId);
          }
          sessions.addProgress('tool_call', formatToolCall(e.name, e.args), { toolName: e.name, sessionId });
        }
        return;
      }
```

- [ ] **Step 2: 类型检查 + lint**

Run: `npx tsc --noEmit -p tsconfig.app.json && npm run lint`
Expected: 无错误、无警告。

- [ ] **Step 3: 全量测试（确认无回归）**

Run: `npm test`
Expected: 全部 PASS（现有 334 项测试基线）。

- [ ] **Step 4: 手动验证（无法单测，App 内联 handler）**

Run: `npm run dev`，用真实 provider（或 `?demo=true`）触发一次作曲。
Expected: 每次 setCode 前出现一条带 persona 头像的叙述消息，紧跟 `⚙ setCode({"code":...})` 齿轮行；无重复的裸 JSON 行、无空叙述。

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx
git commit -m "$(printf 'Render setCode explanation as assistant message in progress\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

### Task 3: V21 系统提示词——引导模型填写 setCode.explanation

**Files:**
- Modify: `src/prompts/versions/v21.ts`（中文段步骤 2 约 157 行、约束句约 159 行；英文段步骤 2 约 425 行、约束句约 427 行；头部 `@description` 注释约 3-8 行）

**Interfaces:**
- Consumes: Task 1 的 `setCode({ code, explanation })` 签名。
- Produces: 无。

- [ ] **Step 1: 中文段——步骤 2 加 explanation（约 157 行）**

把：

```ts
  '2. 调用 `setCode({ code })` 写出完整代码（全量，包含所有保留层和改动层）。',
```

改为：

```ts
  '2. 调用 `setCode({ code, explanation })` 写出完整代码（全量，包含所有保留层和改动层）；`explanation` 必填，用你的人格口吻、一句话现在进行时说明**这一步**在做什么（如"先铺好 lo-fi 鼓组和贝斯"、"给 pad 加一层滤波扫频"），会作为进度消息展示给用户。',
```

- [ ] **Step 2: 中文段——约束句区分两处 explanation（约 159 行）**

把：

```ts
  '决定作曲时直接调用工具，不要输出寒暄式前言。要对用户说的话放进 `commit.explanation`。工具调用之间**不要**写长篇解释或总结。',
```

改为：

```ts
  '决定作曲时直接调用工具，不要输出寒暄式前言。每一步的说明放进该次 `setCode` 的 `explanation`（逐步进度，简短、现在进行时），最终面向用户的整体总结放进 `commit.explanation`；两者都用你的人格口吻。工具调用之间**不要**再另写自由正文叙述或长篇总结，否则会与 `explanation` 重复展示。',
```

- [ ] **Step 3: 英文段——步骤 2 加 explanation（约 425 行）**

把：

```ts
  '2. Call `setCode({ code })` with the complete code (all preserved layers plus any changes).',
```

改为：

```ts
  '2. Call `setCode({ code, explanation })` with the complete code (all preserved layers plus any changes); `explanation` is required — in your persona voice, one present-tense sentence describing what **this step** does (e.g. "Laying down the lo-fi drums and bass first", "Adding a filter sweep to the pad"), shown to the user as a progress message.',
```

- [ ] **Step 4: 英文段——约束句区分两处 explanation（约 427 行）**

把：

```ts
  'When you decide to compose, call tools directly without a greeting-like preface. Put user-facing commentary in `commit.explanation`. Do **not** write long explanations or summaries between tool calls.',
```

改为：

```ts
  'When you decide to compose, call tools directly without a greeting-like preface. Put each step\'s caption in that `setCode`\'s `explanation` (per-step progress, short, present-tense) and the final user-facing summary in `commit.explanation`; both in your persona voice. Do **not** write additional free-text narration or long summaries between tool calls, or it will duplicate the `explanation`.',
```

- [ ] **Step 5: 更新 v21 头部 `@description` 注释**

在 v21 头部注释块（`@description` 段）末尾、`其余音乐内容沿用 v20。` 这句之前或之后，追加一句说明本次改动：

```
 * v21 追加（原地）：setCode 新增必填 `explanation`（人格口吻、一句话现在进行时说明本步改动），
 * 由客户端渲染为 setCode 齿轮行上方的 assistant 叙述消息；相应把"用户可见文字"从只放 commit.explanation
 * 扩展为「逐步说明放 setCode.explanation、最终总结放 commit.explanation」，并禁止在工具调用间另写自由正文以免重复。中英双语同步。
```

- [ ] **Step 6: 类型检查 + lint + 测试**

Run: `npx tsc --noEmit -p tsconfig.app.json && npm run lint && npm test`
Expected: 全绿（prompt 是纯字符串常量，改动不应影响任何测试）。

- [ ] **Step 7: 手动验证 prompt 生效**

Run: `npm run dev`，触发多步作曲。
Expected: 模型每次 setCode 都填了 `explanation`；不再在工具调用间输出与 explanation 重复的自由正文；commit 的最终总结仍正常。

- [ ] **Step 8: Commit**

```bash
git add src/prompts/versions/v21.ts
git commit -m "$(printf 'Guide model to fill setCode.explanation per step in v21 prompt\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Self-Review

**Spec coverage：**
- setCode 加必填 explanation（spec §落地 1）→ Task 1 ✅
- App.tsx 渲染 explanation 为 assistant 消息、齿轮行不变（spec §落地 2、3）→ Task 2 ✅（formatToolCall 未改，齿轮行保留）
- V21 原地加引导、区分两处粒度、防重复（spec §落地 4）→ Task 3 ✅
- tools.test.ts 补 required/properties 断言（spec §落地 5）→ Task 1 Step 1 ✅
- 变量名统一 `explanation`（spec §变量命名）→ Task 1/2/3 全用 `explanation` ✅
- 已知取舍（防重复靠 prompt）→ Task 3 Step 2/4 的约束句覆盖 ✅

**Placeholder 扫描：** 无 TBD/TODO；所有代码步骤含完整前后文本。

**类型一致性：** 三个任务统一字段名 `explanation`；`e.args.explanation`（Task 2）与 schema `properties.explanation`（Task 1）一致；`addAssistantMessage(content, code?, sessionId?)` 签名与 useSessions 实际一致（`undefined` 占位 code）。
