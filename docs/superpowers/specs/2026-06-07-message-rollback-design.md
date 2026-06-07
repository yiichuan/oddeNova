# Message Rollback — Design Spec

**Date:** 2026-06-07

## Goal

参照 Claude Code 的消息回滚 (rewind): 鼠标悬浮在用户消息气泡上时, 右上角显示一个回滚图标。点击后, 直接截断该消息及之后的所有消息、回退音频/代码状态到该消息发出前、并把该消息的内容回填进输入框供用户编辑后手动发送。移除现有的复制/编辑按钮。

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| 触发位置 | 气泡右上角悬浮图标 | 对齐 Claude Code 观感, 不占布局空间 |
| 替换范围 | 移除 copy + edit 按钮, 替换为单个回滚图标 | 用户明确要求；回滚已涵盖"取回内容再编辑"的诉求 |
| 回滚后是否自动重发 | 否, 仅回填输入框 + 聚焦, 用户手动发送 | 给用户最后编辑机会, 对齐 Claude Code rewind 行为 |
| 是否回退音频/代码状态 | 是, 复用 `handleResend` 的回退逻辑 | "回滚"应让会话与播放状态保持一致, 否则用户会看到代码与对话历史错位 |
| 适用范围 | 仅 user 消息 | copy/edit 现状也只存在于 user 消息；assistant 消息维持现有 retry/branch |

## UI Layer — `src/components/ConversationView.tsx`

- 删除 inline 编辑相关 state/UI: `editingId`, `editText`, `editTextareaRef`, 对应 textarea 块 (现 line 185-229)
- 删除 user 气泡内 copy + edit 按钮行 (现 line 234-254), 包括其依赖的 `copiedId`/`setCopiedId` (仅用于此处；assistant 代码块复制按钮独立维护自己的状态, 不受影响)
- 新增单个回滚按钮:
  - 定位: `absolute -top-2 right-1`
  - 可见性: `opacity-0 group-hover:opacity-100 transition-opacity`(与现有 hover 模式一致)
  - 图标: 新增 `RollbackIcon`
  - `title="回滚到此处"`
- Props 变更: 移除 `onResend: (messageId, content) => void`, 新增 `onRollback: (messageId: string) => void`

## Behavior — `handleRollback` (`src/App.tsx`)

从现有 `handleResend` (line 406-435) 中拆出回退状态的部分, 新写一个不自动重发的版本:

```ts
const handleRollback = useCallback(
  (messageId: string) => {
    const currentSessionId = sessions.currentId;
    if (currentSessionId) {
      abortControllersRef.current.get(currentSessionId)?.abort();
    }

    const allMessages = sessions.currentSession?.messages ?? [];
    const idx = allMessages.findIndex((m) => m.id === messageId);
    if (idx < 0) return;
    const target = allMessages[idx];
    const before = allMessages.slice(0, idx);
    const prevAssistant = [...before].reverse().find((m) => m.role === 'assistant' && m.code != null);
    const previousCode = prevAssistant?.code ?? '';

    if (previousCode) {
      void strudel.play(previousCode);
    } else {
      strudel.stop();
      strudel.setCode('');
    }
    if (sessions.currentId) {
      sessions.setCurrentCode(previousCode, sessions.currentId);
    }

    sessions.truncate(messageId);

    setRollbackPrefill(target.content);
    setInputFocusTrigger((n) => n + 1);
  },
  [sessions, strudel]
);
```

新增两个 App 级 state:
```ts
const [rollbackPrefill, setRollbackPrefill] = useState('');
const [inputFocusTrigger, setInputFocusTrigger] = useState(1);
```

`<ChatInput>` 渲染处 (line 707-716) 由原先固定 `focusTrigger={1}` 改为:
```tsx
<ChatInput
  ...
  prefill={rollbackPrefill}
  focusTrigger={inputFocusTrigger}
  ...
/>
```

`<ConversationView>` 渲染处把 `onResend={handleResend}` 改为 `onRollback={handleRollback}`(`handleResend`/`handleRetry` 仍保留, assistant 的 retry 路径不变)。

## Data Layer — `src/hooks/useSessions.ts`

新增纯函数(紧邻 `applyTruncateAndEdit`, line 55-68):
```ts
export function applyTruncate(s: Session, targetMessageId: string): Session {
  const index = s.messages.findIndex((m) => m.id === targetMessageId);
  if (index === -1) return s;
  return { ...s, messages: s.messages.slice(0, index) };
}
```

新增 hook 方法(紧邻 `truncateAndEdit`, line 149-154):
```ts
const truncate = useCallback(
  (targetMessageId: string): void => {
    updateCurrent((s) => applyTruncate(s, targetMessageId));
  },
  [updateCurrent]
);
```

在返回对象中导出 `truncate`(line ~389 附近, 与 `truncateAndEdit` 并列)。

## Input Box Refill — `src/components/ChatInput.tsx`

现状: `prefill?: string` 已存在但未被任何调用方传入(仅测试覆盖); 其 effect `useEffect(() => { if (prefill) setText(prefill); }, [prefill])` 在内容字符串不变时不会重触发——若用户连续两次回滚到内容相同的消息, 第二次不会刷新输入框。

修复方式: 让该 effect 同时依赖已存在的 `focusTrigger`(本身就是个用于强制聚焦的递增计数器):
```ts
useEffect(() => {
  // eslint-disable-next-line react-hooks/set-state-in-effect
  if (prefill) setText(prefill);
}, [prefill, focusTrigger]);
```
App 侧每次回滚都会同时更新 `prefill` 内容与递增 `focusTrigger`, 一次动作即"回填 + 聚焦", 不需要新增 prop。

## Icon — `src/components/icons.tsx`

新增 `RollbackIcon`, 与现有 `RetryIcon`/`HistoryIcon` 同样的 stroke 风格(`stroke="currentColor" strokeWidth="1.5"`, viewBox `24 24`), 语义为"回退到此刻"的倒带/返回箭头造型, 区别于 `RetryIcon`(循环重试)与 `HistoryIcon`(时钟历史)。

## Out of Scope

- assistant 消息的回滚(维持现有 retry/branch)
- 移动端触控交互的专门适配
- 消息版本历史 / 回滚后的"重做"
