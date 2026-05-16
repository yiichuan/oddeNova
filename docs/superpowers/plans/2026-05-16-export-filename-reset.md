# Export Filename Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 每次打开导出弹窗时，文件名输入框清空，placeholder 更新为当前时间戳。

**Architecture:** 在 `ExportPopover` 组件内新增 `useEffect` 监听 `open` prop；`open` 变为 `true` 时重置 `filename`（空字符串）并重新生成 `filenamePlaceholder`（当前时间戳）。`beginCycle`、`endCycle`、`sampleRate` 保持不变。

**Tech Stack:** React 18, TypeScript (strict)

---

### Task 1: 修改 ExportPopover 状态与 effect

**Files:**
- Modify: `src/components/ExportPopover.tsx`

当前代码（约第 51-52 行）：

```ts
const [filename, setFilename] = useState('');
const [filenamePlaceholder] = useState(() => defaultFilename());
```

- [ ] **Step 1: 将 `filenamePlaceholder` 改为普通 useState，并新增 useEffect**

将上面两行改为：

```ts
const [filename, setFilename] = useState('');
const [filenamePlaceholder, setFilenamePlaceholder] = useState('');
```

然后在这两行**之后**（保持在其他 useState 下面）新增：

```ts
useEffect(() => {
  if (open) {
    setFilename('');
    setFilenamePlaceholder(defaultFilename());
  }
}, [open]);
```

确认 `useEffect` 已从 `react` 导入（文件顶部 import 已有 `useState`，在同一 import 中加上 `useEffect`）：

```ts
import { useEffect, useMemo, useState } from 'react';
```

- [ ] **Step 2: 验证 lint 与类型检查通过**

```bash
cd /Users/chaycao/workspace/oddeNova
npm run lint && npx tsc --noEmit -p tsconfig.app.json
```

期望：无错误，无警告。

- [ ] **Step 3: 运行测试**

```bash
npm test
```

期望：50 passed（现有测试全部通过）。

- [ ] **Step 4: 提交**

```bash
git add src/components/ExportPopover.tsx
git commit -m "fix: reset export filename and placeholder each time popover opens"
```
