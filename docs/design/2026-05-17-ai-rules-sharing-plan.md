# AI 规则跨工具共享 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Claude Code CLI 和 Codex CLI 能读取与 Copilot 相同的项目开发规则。

**Architecture:** 在项目根目录新建 `CLAUDE.md` 和 `AGENTS.md`，每个文件只含一行 `@import`，指向已有的 `.github/copilot-instructions.md`。Claude Code 和 Codex 运行时自动展开该引用，无需维护多份内容。

**Tech Stack:** 无代码依赖，纯文本文件配置。

---

### Task 1: 创建 CLAUDE.md

**Files:**
- Create: `CLAUDE.md`

- [ ] **Step 1: 创建文件**

文件内容（整个文件只有这一行）：

```
@.github/copilot-instructions.md
```

- [ ] **Step 2: 验证文件内容正确**

```bash
cat CLAUDE.md
```

期望输出：
```
@.github/copilot-instructions.md
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "chore: add CLAUDE.md to share AI coding rules with Claude Code CLI"
```

---

### Task 2: 创建 AGENTS.md

**Files:**
- Create: `AGENTS.md`

- [ ] **Step 1: 创建文件**

文件内容（整个文件只有这一行）：

```
@.github/copilot-instructions.md
```

- [ ] **Step 2: 验证文件内容正确**

```bash
cat AGENTS.md
```

期望输出：
```
@.github/copilot-instructions.md
```

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "chore: add AGENTS.md to share AI coding rules with Codex CLI"
```

---

### Task 3: 验证（手动）

- [ ] **Step 1: 验证 Claude Code 读取规则**

在项目根目录启动 Claude Code：
```bash
claude
```
询问："你知道这个项目对 superdough 的导入有什么规定吗？"
期望：Claude Code 能复述 `.github/copilot-instructions.md` 中关于"只从包根导入"的规则。

- [ ] **Step 2: 记录 Codex 验证结果**

首次使用 Codex CLI 时，验证其是否正确读取规则。  
若 Codex 不支持 `@import` 语法，将 `AGENTS.md` 内容替换为 `.github/copilot-instructions.md` 的完整内容，并更新 `docs/design/2026-05-17-ai-rules-sharing-design.md` 的"未解决事项"章节。
