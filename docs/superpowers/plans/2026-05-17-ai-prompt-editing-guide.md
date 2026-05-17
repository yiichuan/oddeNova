# AI 提示词修改指南 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 通过双层文档结构，让 AI 编码助手在修改提示词时有明确规程可循，防止破坏版本管理不变量。

**Architecture:** 在 `copilot-instructions.md` 末尾追加 3 条禁令 + 操作入口；新建 `.github/prompts/edit-system-prompt.prompt.md` 存放完整 SOP。两文件职责不重叠，几乎无需同步维护。

**Tech Stack:** Markdown，VS Code `.prompt.md` 格式（YAML frontmatter + `description` 字段）

---

## 文件清单

| 文件 | 操作 |
|---|---|
| `.github/copilot-instructions.md` | 末尾追加"提示词版本管理规范"节 |
| `.github/prompts/edit-system-prompt.prompt.md` | 新建，完整操作 SOP |

---

### Task 1：追加 copilot-instructions.md 摘要节

**Files:**
- Modify: `.github/copilot-instructions.md`（末尾追加，当前 105 行）

- [ ] **Step 1: 在文件末尾追加内容**

打开 `.github/copilot-instructions.md`，在最后一行之后追加以下内容（注意与上方内容之间留一个空行）：

```markdown

## 提示词版本管理规范

- **禁止**直接编辑 `src/prompts/system-prompt.ts`（这是转发 shim，不含实际内容）
- **禁止**修改已有版本文件 `src/prompts/versions/v*.ts`（版本只增不改）
- 修改提示词时，请使用 `@edit-system-prompt` 获取完整操作规程
```

- [ ] **Step 2: 验证文件末尾正确**

```bash
tail -8 .github/copilot-instructions.md
```

预期输出（末尾应有这 4 行，且无多余空行）：

```
## 提示词版本管理规范

- **禁止**直接编辑 `src/prompts/system-prompt.ts`（这是转发 shim，不含实际内容）
- **禁止**修改已有版本文件 `src/prompts/versions/v*.ts`（版本只增不改）
- 修改提示词时，请使用 `@edit-system-prompt` 获取完整操作规程
```

- [ ] **Step 3: 提交**

```bash
git add .github/copilot-instructions.md
git commit -m "docs: add prompt version management rules to copilot instructions"
```

---

### Task 2：新建 edit-system-prompt.prompt.md

**Files:**
- Create: `.github/prompts/edit-system-prompt.prompt.md`

- [ ] **Step 1: 确认目录存在**

```bash
ls .github/prompts/ 2>/dev/null || mkdir -p .github/prompts
```

- [ ] **Step 2: 创建文件，内容如下**

创建 `.github/prompts/edit-system-prompt.prompt.md`，写入以下完整内容：

```markdown
---
description: 修改 oddeNova 系统提示词的完整操作规程
---

# 修改系统提示词

## 背景

提示词通过版本文件管理，三个核心文件各司其职：

| 文件 | 职责 |
|---|---|
| `src/prompts/versions/v{N}.ts` | 存放实际提示词内容（历史版本，只读） |
| `src/prompts/active.ts` | 版本指针，修改此文件切换版本 |
| `src/prompts/system-prompt.ts` | 转发 shim，消费方 import 路径，**禁止直接编辑** |

## 禁止事项

- **不得**修改 `src/prompts/system-prompt.ts`
- **不得**修改任何已有的 `versions/v*.ts`（历史版本只读）

## 操作步骤

### 1. 确认当前版本

```bash
cat src/prompts/active.ts
```

输出示例（`v1` 即当前版本号）：

```ts
export { AGENT_SYSTEM_PROMPT, AGENT_SYSTEM_PROMPT_OPENAI, IMPROVISE_SYSTEM_PROMPT } from './versions/v1';
```

### 2. 创建新版本文件

将当前版本号 +1（例如 v1 → v2）：

```bash
cp src/prompts/versions/v1.ts src/prompts/versions/v2.ts
```

### 3. 更新新版本文件元数据

编辑 `src/prompts/versions/v2.ts` 顶部注释，更新三个字段：

```ts
/**
 * @version v2
 * @date YYYY-MM-DD
 * @description 简要描述本次改动
 */
```

### 4. 修改提示词内容

只编辑 `src/prompts/versions/v2.ts`，修改对应的导出常量：

- `AGENT_SYSTEM_PROMPT` — Anthropic 系模型的系统提示词
- `AGENT_SYSTEM_PROMPT_OPENAI` — OpenAI 系模型的系统提示词
- `IMPROVISE_SYSTEM_PROMPT` — 即兴演奏（improvise）模式的系统提示词

### 5. 切换 active.ts 指向新版本

编辑 `src/prompts/active.ts`，将路径从旧版本改为新版本：

```ts
// 改前
export { AGENT_SYSTEM_PROMPT, AGENT_SYSTEM_PROMPT_OPENAI, IMPROVISE_SYSTEM_PROMPT } from './versions/v1';

// 改后
export { AGENT_SYSTEM_PROMPT, AGENT_SYSTEM_PROMPT_OPENAI, IMPROVISE_SYSTEM_PROMPT } from './versions/v2';
```

> **注意**：若新版本新增或删除了导出名，需同步更新 `{}` 列表。

### 6. 验证

```bash
npx tsc --noEmit -p tsconfig.app.json   # 必须零错误
npm test -- --run                        # 必须所有测试通过
```

### 7. 提交

```bash
git add src/prompts/versions/v2.ts src/prompts/active.ts
git commit -m "prompts: <简述本次改动，例如：strengthen music style guidance>"
```

## 回滚

如果新版本效果变差，将 `active.ts` 改回旧版本路径即可（旧文件仍在）：

```ts
// 改回
export { AGENT_SYSTEM_PROMPT, AGENT_SYSTEM_PROMPT_OPENAI, IMPROVISE_SYSTEM_PROMPT } from './versions/v1';
```

然后重新验证并提交：

```bash
npx tsc --noEmit -p tsconfig.app.json && npm test -- --run
git add src/prompts/active.ts
git commit -m "prompts: revert to v1"
```
```

- [ ] **Step 3: 验证文件存在且 frontmatter 正确**

```bash
head -5 .github/prompts/edit-system-prompt.prompt.md
```

预期输出：

```
---
description: 修改 oddeNova 系统提示词的完整操作规程
---

# 修改系统提示词
```

- [ ] **Step 4: 提交**

```bash
git add .github/prompts/edit-system-prompt.prompt.md
git commit -m "docs: add edit-system-prompt prompt file with full SOP"
```

---

## 最终验收

- [ ] `tail -6 .github/copilot-instructions.md` 包含"提示词版本管理规范"节
- [ ] `.github/prompts/edit-system-prompt.prompt.md` 存在，VS Code 中 `@edit-system-prompt` 可召唤
- [ ] `npm test -- --run` 通过（不涉及代码变更，测试应保持 54 passed）
