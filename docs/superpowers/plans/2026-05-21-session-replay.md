# Session 回放功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Presentation 模式下，为当前已加载的 session 提供一键回放功能——逐条重演聊天消息、模拟用户打字发送、并在每次 commit 时同步播放音频。

**Architecture:** 新增 `useReplay` hook，内部将纯异步回放逻辑拆分为可测试的 `runReplay` 函数；hook 管理 React 状态（`isReplaying`、`replayMessages`、`replayInputText`）。App.tsx 在回放期间将 `replayMessages` 替换掉 ConversationView 的消息来源；`ChatInput` 新增 `replayValue` prop 接管输入框显示。

**Tech Stack:** React 18 + TypeScript（strict）、Vitest（fake timers）、现有 `useSessions`/`useStrudel` hook

---

## 文件一览

| 文件 | 操作 | 职责 |
|------|------|------|
| `src/demo/demo-config.ts` | 修改 | 新增 `isPresentationMode()` |
| `src/hooks/useReplay.ts` | **新建** | `runReplay`（纯逻辑）+ `useReplay`（React 封装）|
| `src/hooks/__tests__/useReplay.test.ts` | **新建** | `runReplay` 单元测试 |
| `src/components/ChatInput.tsx` | 修改 | 新增 `replayValue` prop |
| `src/components/Sidebar.tsx` | 修改 | 新增回放按钮 + 相关 props |
| `src/App.tsx` | 修改 | 接入 `useReplay`，切换 displayMessages |

---

## Task 1：`isPresentationMode()` + `useReplay` 骨架

**Files:**
- Modify: `src/demo/demo-config.ts`
- Create: `src/hooks/useReplay.ts`
- Create: `src/hooks/__tests__/useReplay.test.ts`

- [ ] **Step 1.1：在 demo-config.ts 末尾新增 `isPresentationMode`**

打开 `src/demo/demo-config.ts`，在文件最末尾（现有 `export` 的 `DEMO_PREFILL` 之后）追加：

```ts
export function isPresentationMode(): boolean {
  return window.location.pathname.includes('presentation');
}
```

- [ ] **Step 1.2：创建 `src/hooks/useReplay.ts`**

```ts
// src/hooks/useReplay.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage } from './useChat';
import type { Session } from './useSessions';

// ── 纯异步回放逻辑（可单独测试）──────────────────────────────────────

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  return new Promise((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(id);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

export interface ReplayCallbacks {
  onAppendMessage: (msg: ChatMessage) => void;
  onSetInputText: (text: string) => void;
  onPlay: (code: string) => void;
}

/**
 * 按 session 消息顺序依次回放，通过 callbacks 通知外层。
 * 若 signal 触发 abort，会提前退出（reject with AbortError）。
 */
export async function runReplay(
  messages: ChatMessage[],
  callbacks: ReplayCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const { onAppendMessage, onSetInputText, onPlay } = callbacks;

  for (const msg of messages) {
    if (signal?.aborted) return;

    if (msg.role === 'user') {
      // 逐字流入输入框
      let accumulated = '';
      for (const char of msg.content) {
        if (signal?.aborted) return;
        accumulated += char;
        onSetInputText(accumulated);
        await sleep(30, signal);
      }
      // 停顿模拟确认，然后"发送"
      await sleep(300, signal);
      onAppendMessage(msg);
      onSetInputText('');
      await sleep(600, signal);
    } else if (msg.role === 'progress') {
      const delay =
        msg.progressKind === 'thinking'
          ? 400
          : msg.progressKind === 'tool_call' || msg.progressKind === 'tool_result'
            ? 150
            : msg.progressKind === 'commit'
              ? 200
              : 100; // iteration / warn
      await sleep(delay, signal);
      onAppendMessage(msg);
    } else if (msg.role === 'assistant') {
      onAppendMessage(msg);
      if (msg.code) {
        onPlay(msg.code);
        await sleep(2000, signal);
      } else {
        await sleep(800, signal);
      }
    }
  }
}

// ── React Hook 封装 ───────────────────────────────────────────────────

export interface UseReplayReturn {
  isReplaying: boolean;
  replayMessages: ChatMessage[];
  replayInputText: string;
  startReplay: (session: Session) => void;
}

export function useReplay(onPlay: (code: string) => void): UseReplayReturn {
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayMessages, setReplayMessages] = useState<ChatMessage[]>([]);
  const [replayInputText, setReplayInputText] = useState('');
  const abortRef = useRef<AbortController | null>(null);
  const onPlayRef = useRef(onPlay);

  useEffect(() => {
    onPlayRef.current = onPlay;
  }, [onPlay]);

  const startReplay = useCallback((session: Session) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // 立即设为 true → 按钮消失；内部 500ms 后才开始推消息
    setIsReplaying(true);
    setReplayMessages([]);
    setReplayInputText('');

    (async () => {
      await sleep(500, controller.signal); // 等待 500ms 让 UI 稳定
      await runReplay(
        session.messages,
        {
          onAppendMessage: (msg) => setReplayMessages((prev) => [...prev, msg]),
          onSetInputText: setReplayInputText,
          onPlay: (code) => onPlayRef.current(code),
        },
        controller.signal,
      );
      setIsReplaying(false);
    })().catch((e: unknown) => {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setIsReplaying(false);
    });
  }, []);

  return { isReplaying, replayMessages, replayInputText, startReplay };
}
```

- [ ] **Step 1.3：创建测试文件**

```ts
// src/hooks/__tests__/useReplay.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runReplay } from '../useReplay';
import type { ChatMessage } from '../useChat';

function makeMsg(
  role: ChatMessage['role'],
  content: string,
  extra: Partial<ChatMessage> = {},
): ChatMessage {
  return { id: 'test', role, content, timestamp: 0, ...extra };
}

describe('runReplay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('user 消息逐字填充 inputText，发送后清空', async () => {
    const msgs = [makeMsg('user', 'hi')];
    const onAppendMessage = vi.fn();
    const onSetInputText = vi.fn();
    const onPlay = vi.fn();

    const promise = runReplay(msgs, { onAppendMessage, onSetInputText, onPlay });

    // 'h'(30ms) + 'i'(30ms) = 60ms 打字，300ms 停顿，发送，600ms 间隔
    await vi.advanceTimersByTimeAsync(990);
    await promise;

    expect(onSetInputText).toHaveBeenCalledWith('h');
    expect(onSetInputText).toHaveBeenCalledWith('hi');
    expect(onSetInputText).toHaveBeenCalledWith(''); // 发送后清空
    expect(onAppendMessage).toHaveBeenCalledOnce();
    expect(onAppendMessage).toHaveBeenCalledWith(msgs[0]);
  });

  it('assistant 消息有 code 时调用 onPlay', async () => {
    const code = 's("bd*4")';
    const msgs = [makeMsg('assistant', 'done', { code })];
    const onAppendMessage = vi.fn();
    const onPlay = vi.fn();

    const promise = runReplay(msgs, { onAppendMessage, onSetInputText: vi.fn(), onPlay });
    await vi.advanceTimersByTimeAsync(2000);
    await promise;

    expect(onPlay).toHaveBeenCalledWith(code);
    expect(onAppendMessage).toHaveBeenCalledWith(msgs[0]);
  });

  it('assistant 消息无 code 时不调用 onPlay', async () => {
    const msgs = [makeMsg('assistant', '出错了')];
    const onPlay = vi.fn();

    const promise = runReplay(msgs, { onAppendMessage: vi.fn(), onSetInputText: vi.fn(), onPlay });
    await vi.advanceTimersByTimeAsync(800);
    await promise;

    expect(onPlay).not.toHaveBeenCalled();
  });

  it('消息按原始顺序追加', async () => {
    const msgs = [
      makeMsg('progress', 'thinking...', { progressKind: 'thinking' }),
      makeMsg('progress', 'tool_call', { progressKind: 'tool_call' }),
      makeMsg('assistant', 'done', { code: 's("bd")' }),
    ];
    const order: string[] = [];
    const onAppendMessage = vi.fn((msg: ChatMessage) => order.push(msg.content));

    const promise = runReplay(msgs, { onAppendMessage, onSetInputText: vi.fn(), onPlay: vi.fn() });
    await vi.advanceTimersByTimeAsync(5000);
    await promise;

    expect(order).toEqual(['thinking...', 'tool_call', 'done']);
  });

  it('abort 后停止推送消息', async () => {
    const msgs = [makeMsg('user', 'hello world')];
    const onAppendMessage = vi.fn();
    const controller = new AbortController();

    const promise = runReplay(
      msgs,
      { onAppendMessage, onSetInputText: vi.fn(), onPlay: vi.fn() },
      controller.signal,
    );

    await vi.advanceTimersByTimeAsync(60); // 打字进行中
    controller.abort();

    await promise.catch(() => {}); // 忽略 AbortError
    expect(onAppendMessage).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 1.4：运行测试，确认通过**

```bash
npm test -- useReplay
```

预期：5 个测试全部 PASS

- [ ] **Step 1.5：提交**

```bash
git add src/demo/demo-config.ts src/hooks/useReplay.ts src/hooks/__tests__/useReplay.test.ts
git commit -m "feat: add runReplay function and useReplay hook"
```

---

## Task 2：`ChatInput` 新增 `replayValue` prop

**Files:**
- Modify: `src/components/ChatInput.tsx`

- [ ] **Step 2.1：更新 `ChatInputProps` 接口，在 `focusTrigger` 后追加**

找到：
```ts
interface ChatInputProps {
  isLoading: boolean;
  engineReady: boolean;
  onSendText: (text: string) => void;
  onReinitEngine: () => void;
  onStop?: () => void;
  prefill?: string;
  focusTrigger?: number;
}
```

替换为：
```ts
interface ChatInputProps {
  isLoading: boolean;
  engineReady: boolean;
  onSendText: (text: string) => void;
  onReinitEngine: () => void;
  onStop?: () => void;
  prefill?: string;
  focusTrigger?: number;
  /** 回放模式下由外部控制的输入框内容；有值时输入框只读、发送禁用 */
  replayValue?: string;
}
```

- [ ] **Step 2.2：更新组件函数签名，解构 `replayValue`**

找到：
```ts
export default function ChatInput({ isLoading, engineReady, onSendText, onReinitEngine, onStop, prefill, focusTrigger }: ChatInputProps) {
```

替换为：
```ts
export default function ChatInput({ isLoading, engineReady, onSendText, onReinitEngine, onStop, prefill, focusTrigger, replayValue }: ChatInputProps) {
```

- [ ] **Step 2.3：让 textarea 使用 `replayValue`（若有）**

找到：
```tsx
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            handleSubmit(e);
          }
        }}
        placeholder="输入文字描述音乐..."
        rows={1}
        disabled={isLoading}
```

替换为：
```tsx
      <textarea
        ref={textareaRef}
        value={replayValue !== undefined ? replayValue : text}
        onChange={replayValue !== undefined ? undefined : (e) => setText(e.target.value)}
        readOnly={replayValue !== undefined}
        onKeyDown={(e) => {
          if (replayValue !== undefined) return;
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            handleSubmit(e);
          }
        }}
        placeholder="输入文字描述音乐..."
        rows={1}
        disabled={isLoading}
```

- [ ] **Step 2.4：在 `doSubmit` 开头增加 replayValue 守卫**

找到：
```ts
  const doSubmit = () => {
    const value = text.trim();
    if (!value || isLoading) return;
```

替换为：
```ts
  const doSubmit = () => {
    if (replayValue !== undefined) return;
    const value = text.trim();
    if (!value || isLoading) return;
```

- [ ] **Step 2.5：检查 lint + tsc**

```bash
npm run lint -- --max-warnings 0 src/components/ChatInput.tsx
npx tsc --noEmit -p tsconfig.app.json
```

预期：无错误

- [ ] **Step 2.6：提交**

```bash
git add src/components/ChatInput.tsx
git commit -m "feat(ChatInput): add replayValue prop for replay mode"
```

---

## Task 3：`Sidebar` 新增回放按钮

**Files:**
- Modify: `src/components/Sidebar.tsx`

- [ ] **Step 3.1：更新 import，加入 `PlayIcon` 和 `isPresentationMode`**

找到：
```ts
import { PlusIcon, HistoryIcon, SettingsIcon } from './icons';
```

替换为：
```ts
import { PlusIcon, HistoryIcon, SettingsIcon, PlayIcon } from './icons';
```

然后找到：
```ts
import { isDemoMode } from '../demo/demo-config';
```

替换为：
```ts
import { isDemoMode, isPresentationMode } from '../demo/demo-config';
```

- [ ] **Step 3.2：更新 `SidebarProps` 接口，在末尾追加三个新 prop**

找到：
```ts
  isHistoryLoading?: boolean;
  loadingSessions?: Set<string>;
  unreadSessions?: Set<string>;
}
```

替换为：
```ts
  isHistoryLoading?: boolean;
  loadingSessions?: Set<string>;
  unreadSessions?: Set<string>;
  onReplay?: () => void;
  isReplaying?: boolean;
  replayInputText?: string;
}
```

- [ ] **Step 3.3：解构新 props**

找到：
```ts
  isHistoryLoading = false,
  loadingSessions = new Set<string>(),
  unreadSessions = new Set<string>(),
}: SidebarProps) {
```

替换为：
```ts
  isHistoryLoading = false,
  loadingSessions = new Set<string>(),
  unreadSessions = new Set<string>(),
  onReplay,
  isReplaying = false,
  replayInputText,
}: SidebarProps) {
```

- [ ] **Step 3.4：在 title row 的按钮组里插入回放按钮（`⏰` 左侧）**

找到：
```tsx
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setShowHistory(v => !v)}
            className={`w-7 h-7 rounded-full border border-border transition-colors flex items-center justify-center ${
              showHistory ? 'text-text-primary border-accent/50' : 'text-text-secondary hover:text-text-primary hover:border-accent/50'
            }`}
            title="查看历史"
          >
            <HistoryIcon size={14} />
          </button>
```

替换为：
```tsx
        <div className="flex items-center gap-3 shrink-0">
          {isPresentationMode() && onReplay && !isReplaying && (
            <button
              onClick={onReplay}
              className="w-7 h-7 rounded-full border border-border text-text-secondary hover:text-text-primary hover:border-accent/50 transition-colors flex items-center justify-center"
              title="回放当前会话"
            >
              <PlayIcon size={14} />
            </button>
          )}
          <button
            onClick={() => setShowHistory(v => !v)}
            className={`w-7 h-7 rounded-full border border-border transition-colors flex items-center justify-center ${
              showHistory ? 'text-text-primary border-accent/50' : 'text-text-secondary hover:text-text-primary hover:border-accent/50'
            }`}
            title="查看历史"
          >
            <HistoryIcon size={14} />
          </button>
```

- [ ] **Step 3.5：把 `replayInputText` 透传给 `ChatInput`**

在 Sidebar 里找到 `<ChatInput` 的 render 位置，将 `replayInputText` 作为 `replayValue` prop 传入。

找到（ChatInput 的 props，实际内容以文件为准，添加在 `focusTrigger` 行后）：

```tsx
          focusTrigger={focusTrigger}
```

替换为：
```tsx
          focusTrigger={focusTrigger}
          replayValue={replayInputText}
```

- [ ] **Step 3.6：检查 lint + tsc**

```bash
npm run lint -- --max-warnings 0 src/components/Sidebar.tsx
npx tsc --noEmit -p tsconfig.app.json
```

预期：无错误

- [ ] **Step 3.7：提交**

```bash
git add src/components/Sidebar.tsx
git commit -m "feat(Sidebar): add replay button in presentation mode"
```

---

## Task 4：`App.tsx` 接入 `useReplay`

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 4.1：新增 import**

找到（import 区域靠近 hooks 的位置，例如 `useStrudel` 那行附近）：
```ts
import { useStrudel } from './hooks/useStrudel';
```

在该行后追加：
```ts
import { useReplay } from './hooks/useReplay';
```

- [ ] **Step 4.2：初始化 `useReplay`**

在 `App()` 函数体内，找到：
```ts
  const strudel = useStrudel();
```

在该行后追加：
```ts
  const { isReplaying, replayMessages, replayInputText, startReplay } = useReplay(
    (code) => { strudel.play(code); },
  );
```

- [ ] **Step 4.3：切换 ConversationView 的消息来源**

在 App.tsx 里找到 Sidebar 被渲染时传入 `messages` 的位置。先确认当前传的是什么（通常是 `currentSession?.messages ?? []`）。

在 Sidebar 渲染之前（或 JSX 里）加入：

```ts
const displayMessages = isReplaying ? replayMessages : (currentSession?.messages ?? []);
```

然后将 Sidebar 的 `messages={...}` 改为 `messages={displayMessages}`。

具体操作：找到 Sidebar 组件的 `messages` prop 传值处：

```tsx
          messages={currentSession?.messages ?? []}
```

替换为：

```tsx
          messages={isReplaying ? replayMessages : (currentSession?.messages ?? [])}
```

- [ ] **Step 4.4：给 Sidebar 传回放相关 props**

找到 `<Sidebar` 组件调用处，在现有 props 的最末尾（`unreadSessions` 那行附近）追加：

```tsx
          onReplay={currentSession && currentSession.messages.length > 0
            ? () => startReplay(currentSession)
            : undefined}
          isReplaying={isReplaying}
          replayInputText={replayInputText}
```

- [ ] **Step 4.5：回放期间禁止用户发送新消息**

找到传给 Sidebar 的 `isLoading` prop，将其改为同时考虑 `isReplaying`：

找到（Sidebar 的 `isLoading` prop）：
```tsx
          isLoading={loadingSessions.has(sessions.currentId ?? '')}
```

（以实际文件内容为准，grep `isLoading` 在 Sidebar 附近的用法）替换为：

```tsx
          isLoading={loadingSessions.has(sessions.currentId ?? '') || isReplaying}
```

- [ ] **Step 4.6：运行全量检查**

```bash
npm run lint && npx tsc --noEmit -p tsconfig.app.json && npm test
```

预期：lint 0 warnings、tsc 无错误、所有测试 PASS

- [ ] **Step 4.7：提交**

```bash
git add src/App.tsx
git commit -m "feat(App): wire up useReplay for session playback"
```

---

## Task 5：手动验证

- [ ] **Step 5.1：启动开发服务器**

```bash
npm run dev
```

- [ ] **Step 5.2：打开 Presentation 页面并确认按钮出现**

浏览器访问：`http://localhost:5173/presentation.html`

加载一个有内容的历史 session 后，确认 Title row 右侧出现 ▶ 按钮（在 ⏰ 左侧）。

- [ ] **Step 5.3：触发回放并验证流程**

1. 点击 ▶ 按钮 → 按钮立即消失
2. 等待 500ms → 对话开始回放
3. 确认：user 消息先出现打字效果（ChatInput 逐字填充），再"发送"出现在对话流
4. 确认：progress 消息依次出现
5. 确认：assistant 消息出现后音乐播放
6. 确认：回放结束后 ▶ 按钮恢复

- [ ] **Step 5.4：在普通模式（`index.html`）确认按钮不出现**

访问 `http://localhost:5173/`，确认 Sidebar title row 没有 ▶ 按钮。

- [ ] **Step 5.5：提最终 commit（如有 fix）**

```bash
git add -A
git commit -m "fix: session replay manual verification fixes"
```
