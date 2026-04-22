# Agent 思考过程展示设计

**日期：** 2026-04-21  
**状态：** 已批准  
**方案：** A（展示 assistant_text）+ C（Prompt 引导思考话语）

---

## 背景

当前 AI Agent 在思考过程中只展示每个工具调用的操作名称（如"即兴生成 pad（...）"），缺乏 LLM 真实推理意图的呈现。`ProgressEvent` 中已有 `assistant_text` 事件类型，但 `App.tsx` 中未处理，导致 LLM 主动输出的推理文字被完全丢弃。

---

## 目标

让用户在 AI 创作过程中能看到：
1. LLM 在每步操作前用自然语言说明的思考意图
2. 每个工具调用步骤的操作描述

---

## 架构与改动范围

### 1. `src/hooks/useChat.ts`

新增 `'thinking'` 到 `ProgressKind` 联合类型：

```ts
export type ProgressKind = 'tool_call' | 'tool_result' | 'commit' | 'warn' | 'iteration' | 'thinking';
```

### 2. `src/App.tsx`

在 `onProgress` 回调中补充 `assistant_text` 分支：

```ts
if (e.kind === 'assistant_text') {
  sessions.addProgress('thinking', e.text);
  return;
}
```

`formatToolCall` 中各工具文案保持现有中文描述，酌情丰富（无需大改，现有文案已经可读）。

### 3. `src/components/ConversationView.tsx`

为 `'thinking'` 类型的 progress 消息增加专属渲染：
- 与 `tool_call` 的小字灰色操作描述**视觉区分**
- 样式：正常字号（`text-xs`），`text-text-secondary`（比 muted 亮一级），斜体，左边无图标或用"💭"区分
- 在加载中状态时同样像 `tool_call` 一样显示（不折叠）

`progressIcon` 函数中 `'thinking'` 返回 `'💭'`（或空字符串，视最终视觉效果决定）。

### 4. `src/prompts/system-prompt.ts`

在 `AGENT_SYSTEM_PROMPT` 中新增 `## Communication style` 章节：

```
## Communication style
- 每一轮调用工具之前，先用 1-2 句中文简述你的意图和思考（比如：你为何选择这个工具、这一步在整体构思中处于什么位置）。
- 语气自然，像一位音乐人在思考，不要用"步骤 N："这样的模板语言。
- 示例："先建立整体的和声骨架，选 C major，110 BPM，偏向宫崎骏的空灵感。" / "低音层需要温暖但不厚重，用 sine 合成加上慢律动。"
```

---

## 数据流

```
LLM 推理
  └─ 输出 assistant message content（推理文字）
       └─ loop.ts: onProgress({ kind: 'assistant_text', text })
            └─ App.tsx: sessions.addProgress('thinking', text)
                 └─ ConversationView.tsx: 渲染为 thinking 样式气泡

  └─ 输出 tool_calls
       └─ loop.ts: onProgress({ kind: 'tool_call', name, args })
            └─ App.tsx: sessions.addProgress('tool_call', formatToolCall(...))
                 └─ ConversationView.tsx: 渲染为操作步骤（小字灰色）
```

---

## 边界条件

- LLM 并非每轮都会输出 `assistant_text`（取决于模型行为）；无文字时静默，无需 fallback
- `thinking` 类型的消息在加载完成后保留在历史消息中（与 `tool_call` 一致）
- `lastProgress` 逻辑（"思考中..."副标题）优先显示最后一条 `thinking` 或 `tool_call` 消息，不区分类型

---

## 不在本次范围内

- 修改 `formatToolCall` 文案（现有文案已足够可读，不做大改）
- 增加动画或流式显示思考文字
- 改变"思考中..."主指示器的样式
