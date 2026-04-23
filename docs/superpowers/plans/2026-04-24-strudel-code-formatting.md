# Strudel 代码格式化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修改 agent system prompt，让 LLM 生成的每个 strudel layer 代码按方法链换行缩进，提升代码面板可读性。

**Architecture:** 仅修改 `src/prompts/system-prompt.ts` 中的两处指令文本——主 agent prompt（AGENT_SYSTEM_PROMPT）和 improvise 子模型 prompt（IMPROVISE_SYSTEM_PROMPT），无需改动任何运行时逻辑。

**Tech Stack:** TypeScript，无新依赖。

---

### Task 1: 修改 AGENT_SYSTEM_PROMPT 格式化规则

**Files:**
- Modify: `src/prompts/system-prompt.ts`（Rules 末行）

- [ ] **Step 1: 定位当前规则行**

打开 `src/prompts/system-prompt.ts`，在 `AGENT_SYSTEM_PROMPT` 数组末尾找到这一行：

```ts
'- Keep each layer\'s expression a single chained call, no semicolons, no `var/let/const`.',
```

- [ ] **Step 2: 替换为包含格式化指令的版本**

将上述行替换为：

```ts
'- Keep each layer\'s expression a single chained call, no semicolons, no `var/let/const`. Format method chains across multiple lines: put the base expression on the first line, then each `.method(...)` on its own line indented by 2 extra spaces relative to the base. Example:\n  note("c3 e3 g3 b3")\n    .s("piano")\n    .gain(0.5)\n    ._pianoroll({ fold: 1 })',
```

- [ ] **Step 3: 验证文件可编译**

```bash
cd /Users/chaycao/workspace/Vibe-Live-Music
npx tsc --noEmit
```

预期：无错误输出。

- [ ] **Step 4: Commit**

```bash
git add src/prompts/system-prompt.ts
git commit -m "feat: ask agent to format layer code with method chains on separate lines"
```

---

### Task 2: 修改 IMPROVISE_SYSTEM_PROMPT 格式化规则

**Files:**
- Modify: `src/prompts/system-prompt.ts`（IMPROVISE_SYSTEM_PROMPT Rules 首行）

- [ ] **Step 1: 定位当前规则行**

在同文件 `IMPROVISE_SYSTEM_PROMPT` 数组中找到 Rules 首行：

```ts
'- code must be ONE chained expression, no var declarations, no $: prefix, no setcps, no stack wrapping, no semicolons.',
```

- [ ] **Step 2: 替换为包含格式化指令的版本**

将上述行替换为：

```ts
'- code must be ONE chained expression, no var declarations, no $: prefix, no setcps, no stack wrapping, no semicolons. Format method chains across multiple lines: base expression first, then each `.method(...)` on its own line indented by 2 spaces. Example:\n  s("bd ~ sd ~")\n    .bank("RolandTR808")\n    .gain(0.8)',
```

- [ ] **Step 3: 验证文件可编译**

```bash
cd /Users/chaycao/workspace/Vibe-Live-Music
npx tsc --noEmit
```

预期：无错误输出。

- [ ] **Step 4: Commit**

```bash
git add src/prompts/system-prompt.ts
git commit -m "feat: ask improvise sub-model to format code with method chains on separate lines"
```

---

### Task 3: 手动验证

- [ ] **Step 1: 启动应用**

```bash
cd /Users/chaycao/workspace/Vibe-Live-Music
npm run dev
```

- [ ] **Step 2: 发起一次音乐生成请求**

在聊天框输入例如 "来一段 lofi 风格的音乐"，观察代码面板中生成的代码。

- [ ] **Step 3: 验证格式**

期望代码面板中看到如下格式（每个方法独占一行，缩进 2 空格）：

```js
setcps(0.35)
stack(
  /* @layer drums */
  s("bd ~ sd ~")
    .bank("RolandTR808")
    .gain(0.8),
  /* @layer bass */
  note("c2 eb2 g2 bb2")
    .s("sawtooth")
    .lpf(400)
    .gain(0.7)
    .room(1)
)
```

若格式仍为单行，说明 LLM 未遵从指令，可考虑加强措辞（如 "YOU MUST format..."）或改用程序化格式化方案。
