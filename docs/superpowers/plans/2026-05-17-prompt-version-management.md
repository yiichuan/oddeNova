# Prompt 版本管理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `src/prompts/system-prompt.ts` 中的 prompt 常量迁移到带版本号的独立文件，通过单行 `active.ts` 指针实现版本切换，所有消费方代码无需任何改动。

**Architecture:** 新建 `src/prompts/versions/v1.ts` 存放基线版本内容（从现有 `system-prompt.ts` 迁移），新建 `src/prompts/active.ts` 作为单行指针文件，将 `system-prompt.ts` 改为纯 re-export shim 从 `active.ts` 转发导出。

**Tech Stack:** TypeScript、Vite（无新依赖）

---

## 文件变更清单

| 操作 | 文件 | 说明 |
|---|---|---|
| Create | `src/prompts/versions/v1.ts` | 基线版本，内容从 `system-prompt.ts` 迁移 |
| Create | `src/prompts/active.ts` | 单行指针，`export * from './versions/v1'` |
| Modify | `src/prompts/system-prompt.ts` | 替换为纯 re-export shim |

---

### Task 1: 创建基线版本文件 `versions/v1.ts`

**Files:**
- Create: `src/prompts/versions/v1.ts`

- [ ] **Step 1: 读取现有 system-prompt.ts 的完整内容**

```bash
cat src/prompts/system-prompt.ts
```

记录输出，下一步会用到。

- [ ] **Step 2: 创建 `src/prompts/versions/v1.ts`**

将 `system-prompt.ts` 的全部内容复制过来，并在文件最顶部（第一行）加上元数据注释：

```ts
/**
 * @version v1
 * @date 2026-05-17
 * @description 基线版本，从 system-prompt.ts 迁移
 */
```

文件其余内容（所有 `const`、`export const` 行）与 `system-prompt.ts` 完全一致，一字不差。

- [ ] **Step 3: 验证文件存在且导出三个常量**

```bash
npx tsc --noEmit -p tsconfig.app.json 2>&1 | head -20
```

此时会有错误（因为 `system-prompt.ts` 还未改），这是预期的，只是检查 v1.ts 本身的语法没有问题：

```bash
# 只检查 v1.ts 的语法
node --input-type=module <<'EOF'
import { readFileSync } from 'fs';
const content = readFileSync('src/prompts/versions/v1.ts', 'utf8');
const hasAgent = content.includes('export const AGENT_SYSTEM_PROMPT');
const hasOpenAI = content.includes('export const AGENT_SYSTEM_PROMPT_OPENAI');
const hasImprovise = content.includes('export const IMPROVISE_SYSTEM_PROMPT');
console.log({ hasAgent, hasOpenAI, hasImprovise });
EOF
```

期望输出：`{ hasAgent: true, hasOpenAI: true, hasImprovise: true }`

- [ ] **Step 4: Commit**

```bash
git add src/prompts/versions/v1.ts
git commit -m "prompts: add baseline v1 version file"
```

---

### Task 2: 创建 `active.ts` 指针文件

**Files:**
- Create: `src/prompts/active.ts`

- [ ] **Step 1: 创建 `src/prompts/active.ts`**

文件全部内容如下（一行注释 + 一行导出，不多不少）：

```ts
// 切换版本：修改下面这一行的版本号即可，其他文件无需改动。
export * from './versions/v1';
```

- [ ] **Step 2: Commit**

```bash
git add src/prompts/active.ts
git commit -m "prompts: add active.ts pointer (currently v1)"
```

---

### Task 3: 将 `system-prompt.ts` 改为 re-export shim

**Files:**
- Modify: `src/prompts/system-prompt.ts`

- [ ] **Step 1: 替换 `system-prompt.ts` 的全部内容**

将文件的所有内容替换为以下内容（完整替换，不保留原有任何代码）：

```ts
// ============================================================================
// 此文件仅做转发。Prompt 内容在 src/prompts/versions/ 目录下维护。
// 切换版本：修改 src/prompts/active.ts 中的版本号。
// ============================================================================
export {
  AGENT_SYSTEM_PROMPT,
  AGENT_SYSTEM_PROMPT_OPENAI,
  IMPROVISE_SYSTEM_PROMPT,
} from './active';
```

- [ ] **Step 2: 全量 TypeScript 类型检查**

```bash
npx tsc --noEmit -p tsconfig.app.json
```

期望：**无任何错误输出**。如果有错误，检查 `versions/v1.ts` 中三个 `export const` 的名称是否与上面 named re-export 的名称完全一致。

- [ ] **Step 3: 运行测试套件**

```bash
npm test -- --run
```

期望：`Test Files X passed`，无 FAIL。

- [ ] **Step 4: Commit**

```bash
git add src/prompts/system-prompt.ts
git commit -m "prompts: replace system-prompt.ts with re-export shim (active-pointer pattern)"
```

---

## 回滚与日常使用说明（写在最后供参考）

**创建新版本（优化前）：**
```bash
cp src/prompts/versions/v1.ts src/prompts/versions/v2.ts
# 1. 修改 v2.ts 顶部 @version 为 v2，@description 填写改动内容
# 2. 编辑 v2.ts 中的 prompt 内容
# 3. 修改 active.ts：export * from './versions/v2';
git add src/prompts/versions/v2.ts src/prompts/active.ts
git commit -m "prompts: activate v2 - <改动描述>"
```

**效果变差，回滚：**
```bash
# 修改 active.ts 第二行：export * from './versions/v1';
git add src/prompts/active.ts
git commit -m "prompts: rollback to v1"
```
