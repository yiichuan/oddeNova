# Agent 思考过程展示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 AI 创作思考过程中展示 LLM 的推理文字（`assistant_text` 事件），并通过 Prompt 引导模型输出自然语言意图说明。

**Architecture:** 新增 `'thinking'` ProgressKind 类型，在 `App.tsx` 的 `onProgress` 回调中捕获 `assistant_text` 事件并存入会话消息，`ConversationView.tsx` 为其渲染专属样式，`system-prompt.ts` 增加 Communication style 章节引导模型输出思考话语。

**Tech Stack:** React 19, TypeScript 6, Tailwind CSS v4

---

## 文件改动清单

| 文件 | 操作 |
|------|------|
| `src/hooks/useChat.ts` | Modify：新增 `'thinking'` 到 `ProgressKind` |
| `src/App.tsx` | Modify：onProgress 处理 `assistant_text`，新增 thinking 分支 |
| `src/components/ConversationView.tsx` | Modify：新增 thinking 消息样式渲染，`progressIcon` 新增 case |
| `src/prompts/system-prompt.ts` | Modify：`AGENT_SYSTEM_PROMPT` 末尾新增 `## Communication style` 章节 |

---

### Task 1: 新增 `'thinking'` ProgressKind 类型

**Files:**
- Modify: `src/hooks/useChat.ts`

- [ ] **Step 1: 修改 ProgressKind 联合类型，加入 `'thinking'`**

在 `src/hooks/useChat.ts` 中，将：

```ts
export type ProgressKind = 'tool_call' | 'tool_result' | 'commit' | 'warn' | 'iteration';
```

改为：

```ts
export type ProgressKind = 'tool_call' | 'tool_result' | 'commit' | 'warn' | 'iteration' | 'thinking';
```

- [ ] **Step 2: 运行 TypeScript 编译检查**

```bash
npx tsc --noEmit
```

预期：无错误输出（exit code 0）

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useChat.ts
git commit -m "feat: add 'thinking' to ProgressKind"
```

---

### Task 2: App.tsx 处理 assistant_text 事件

**Files:**
- Modify: `src/App.tsx`

当前 `onProgress` 回调缺少对 `assistant_text` 事件的处理。需要在现有的 `if (e.kind === 'warn')` 分支之后、`onProgress` 函数结束之前加入新分支。

- [ ] **Step 1: 在 onProgress 回调中加入 assistant_text 处理**

在 `src/App.tsx` 中，找到以下代码：

```ts
          if (e.kind === 'warn') {
            sessions.addProgress('warn', e.message);
            return;
          }
        };
```

改为：

```ts
          if (e.kind === 'warn') {
            sessions.addProgress('warn', e.message);
            return;
          }
          if (e.kind === 'assistant_text') {
            sessions.addProgress('thinking', e.text);
            return;
          }
        };
```

- [ ] **Step 2: 运行 TypeScript 编译检查**

```bash
npx tsc --noEmit
```

预期：无错误输出（exit code 0）

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: handle assistant_text progress event as thinking message"
```

---

### Task 3: ConversationView.tsx 渲染 thinking 消息样式

**Files:**
- Modify: `src/components/ConversationView.tsx`

需要两处改动：
1. 在 progress 消息渲染区域，为 `thinking` 类型增加专属样式（比 `tool_call` 的小字更显眼，使用斜体 `text-text-secondary` 颜色）
2. 在 `progressIcon` 函数中新增 `'thinking'` case

**改动说明：** 当前所有 progress 消息共用同一套渲染模板（`text-[11px] text-text-muted/70`）。`thinking` 类型需要视觉上与操作步骤有所区分，让用户感受到"AI 在说话"。

- [ ] **Step 1: 在 progress 渲染区域为 thinking 增加专属样式**

在 `src/components/ConversationView.tsx` 中，找到 progress 消息的渲染逻辑：

```tsx
        if (msg.role === 'progress') {
          // Skip progress lines while loading — they collapse into the
          // single "思考中" + subtitle indicator below.
          if (isLoading && msg === lastProgress) return null;
          return (
            <div key={msg.id} className="flex justify-start animate-fade-in-up">
              <div className="text-[11px] text-text-muted/70 px-1 flex items-center gap-1.5">
                <span className="opacity-60">{progressIcon(msg)}</span>
                <span>{msg.content}</span>
              </div>
            </div>
          );
        }
```

改为：

```tsx
        if (msg.role === 'progress') {
          // Skip progress lines while loading — they collapse into the
          // single "思考中" + subtitle indicator below.
          if (isLoading && msg === lastProgress) return null;
          if (msg.progressKind === 'thinking') {
            return (
              <div key={msg.id} className="flex justify-start animate-fade-in-up">
                <div className="text-xs text-text-secondary px-1 flex items-start gap-1.5 italic">
                  <span className="opacity-70 mt-0.5">{progressIcon(msg)}</span>
                  <span>{msg.content}</span>
                </div>
              </div>
            );
          }
          return (
            <div key={msg.id} className="flex justify-start animate-fade-in-up">
              <div className="text-[11px] text-text-muted/70 px-1 flex items-center gap-1.5">
                <span className="opacity-60">{progressIcon(msg)}</span>
                <span>{msg.content}</span>
              </div>
            </div>
          );
        }
```

- [ ] **Step 2: 在 progressIcon 函数中新增 thinking case**

找到 `progressIcon` 函数：

```ts
function progressIcon(msg: ChatMessage): string {
  switch (msg.progressKind) {
    case 'tool_call':
      return '⚙';
    case 'tool_result':
      return msg.ok === false ? '✗' : '✓';
    case 'commit':
      return '▶';
    case 'warn':
      return '⚠';
    default:
      return '·';
  }
}
```

改为：

```ts
function progressIcon(msg: ChatMessage): string {
  switch (msg.progressKind) {
    case 'thinking':
      return '💭';
    case 'tool_call':
      return '⚙';
    case 'tool_result':
      return msg.ok === false ? '✗' : '✓';
    case 'commit':
      return '▶';
    case 'warn':
      return '⚠';
    default:
      return '·';
  }
}
```

- [ ] **Step 3: 运行 TypeScript 编译检查和 ESLint**

```bash
npx tsc --noEmit && npx eslint src/components/ConversationView.tsx
```

预期：无错误输出（exit code 0）

- [ ] **Step 4: Commit**

```bash
git add src/components/ConversationView.tsx
git commit -m "feat: add thinking message style in ConversationView"
```

---

### Task 4: system-prompt.ts 新增 Communication style 章节

**Files:**
- Modify: `src/prompts/system-prompt.ts`

需要在 `AGENT_SYSTEM_PROMPT` 数组的末尾（`'- Every session MUST end...'` 所在的 `## Rules` 章节之前）插入新的 `## Communication style` 章节，引导模型在调用工具前先用 1-2 句中文说明意图。

**注意：** Communication style 应放在 `## Rules` 之前，这样模型在读到规则之前已经建立了"输出思考话语"的习惯。

- [ ] **Step 1: 在 AGENT_SYSTEM_PROMPT 数组末尾加入 Communication style 章节**

在 `src/prompts/system-prompt.ts` 中，找到：

```ts
  '## Rules',
  '- Every session MUST end with exactly ONE `commit` call. Stopping after editing without committing is a BUG — the user will see no result. If you are running out of turns, SKIP further refinements and `commit` the current state immediately.',
```

在其之前插入（即在 `'## Rules',` 这一行之前添加新行）：

```ts
  '## Communication style',
  '- 每一轮调用工具之前，先用 1-2 句中文简述你的意图和思考（例如：你为何选择这个工具、这一步在整体构思中处于什么位置）。',
  '- 语气自然，像一位音乐人在构思，不要使用"步骤 N："这类模板语言。',
  '- 示例："先铺一层温暖的 pad 做底色，用慢速弦乐感觉，再往上叠旋律。" / "低音层用 sine 合成，律动缓一点，不要抢主角。"',
  '',
```

最终该段落在数组中的顺序为：
```
  STRUDEL_CHEATSHEET_CONCISE,
  '',
  '## Communication style',
  '- ...',
  '- ...',
  '- ...',
  '',
  '## Rules',
  '- Every session MUST end...',
```

- [ ] **Step 2: 运行 TypeScript 编译检查**

```bash
npx tsc --noEmit
```

预期：无错误输出（exit code 0）

- [ ] **Step 3: Commit**

```bash
git add src/prompts/system-prompt.ts
git commit -m "feat: add communication style to agent system prompt"
```

---

## 验证整体效果

完成所有 Task 后，运行一次完整编译确认无回归：

```bash
npx tsc --noEmit && npx eslint src/
```

预期：无错误。
