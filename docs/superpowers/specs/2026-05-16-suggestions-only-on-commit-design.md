# 设计规格：提示词仅在 agent commit 后刷新

**日期：** 2026-05-16  
**状态：** 已批准

---

## 问题描述

`useSuggestions` hook 当前监听 `currentCode`（`strudel.code || current?.code`），该值随编辑器实时状态变化。以下两种操作会触发不必要的 LLM 请求：

1. **实时编辑代码**：用户在编辑器中每次击键都会更新 `strudel.code`，进而更新 `currentCode`。
2. **修改 BPM**：`setTempo()` 会对编辑器中的 `setcps(...)` 做外科式替换，更新 `strudel.code`。

这两种变更都不代表一次"用户意图表达完成"，不应触发 `buildSuggestions` LLM 调用。

---

## 目标

**只在 agent 成功 commit 代码后**刷新提示词 chips。

---

## 根因分析

```
App.tsx:
  const currentCode = strudel.code || (current?.code ?? '');
  // ↑ 实时编辑器代码，随击键 / BPM 变化
  
  useSuggestions({ currentCode, ... })
  // ↑ 监听 currentCode → 任何实时变化都触发 LLM
```

`current?.code` 是 session 的已提交代码，只在 `sessions.setCurrentCode()` 被调用时（即 agent commit 后）更新。应将其作为 suggestions 的触发信号。

---

## 设计

### 修改 1：`App.tsx`

将传给 `useSuggestions` 的 `currentCode` 改为 `current?.code ?? ''`：

```ts
// 修改前
const { suggestions, loading: suggestionsLoading } = useSuggestions({
  key: current?.id ?? '',
  currentCode,
  hasUserMessages: isDemoMode() ? false : hasUserMessages,
  messages,
});

// 修改后
const { suggestions, loading: suggestionsLoading } = useSuggestions({
  key: current?.id ?? '',
  currentCode: current?.code ?? '',
  hasUserMessages: isDemoMode() ? false : hasUserMessages,
  messages,
});
```

`currentCode`（含 `strudel.code`）继续用于 agent 指令上下文（`handleInstruction` 内），不变。

### 修改 2：`useSuggestions.ts`

更新 hook 头部 JSDoc 注释，明确 trigger 是 session committed code，不是 live editor code：

```ts
/**
 * ...
 * - When the conversation has no user messages yet → static defaults.
 * - After each agent commit (i.e. current.code changed and is non-empty) →
 *   fetch 2 fresh suggestions from the LLM with music state + style intent context.
 *   NOTE: live editor edits and BPM changes do NOT trigger a refetch; only
 *   committed code (session.code set via sessions.setCurrentCode()) does.
 * ...
 */
```

---

## 数据流对比

**修改前：**
```
用户击键 / setTempo()
  → strudel.code 变 → currentCode 变 → useSuggestions 触发 LLM ← 不期望

agent commit → sessions.setCurrentCode()
  → current.code 变 → currentCode 变 → useSuggestions 触发 LLM ✓
```

**修改后：**
```
用户击键 / setTempo()
  → strudel.code 变 → currentCode 变（agent 上下文用）
  ↛ useSuggestions（不再监听 strudel.code）

agent commit → sessions.setCurrentCode()
  → current.code 变 → useSuggestions 触发 LLM ✓
```

---

## 不变的部分

- `useSuggestions` hook 内部逻辑全部保持（`lastCodeRef` 去重、`hasUserMessages` 短路、demo 模式跳过、session 切换重置）
- Agent 收到的 `currentCode` 仍含实时编辑器代码（手动粘贴对 agent 可见）
- 静态默认提示词行为不变（无用户消息时展示 `STATIC_SUGGESTIONS` 随机 2 条）

---

## 改动范围

| 文件 | 改动类型 |
|------|----------|
| `src/App.tsx` | 修改 1 行（`useSuggestions` 调用处的 `currentCode` 参数） |
| `src/hooks/useSuggestions.ts` | 更新注释 |

无需修改测试（`useSuggestions` 的行为逻辑本身不变，只是调用方传入的数据来源变了）。
