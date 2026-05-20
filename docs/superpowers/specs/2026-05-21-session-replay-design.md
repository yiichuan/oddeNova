# Session 回放功能设计

**日期**：2026-05-21  
**状态**：已批准，待实现

---

## 背景

录制演示视频时，需要边操作边录屏，一旦操作失误或忘记开录就功亏一篑。本功能在 Presentation 模式下提供一键回放能力，将已保存的 session（聊天记录 + 代码演进）重新动态播出，专门用于录制高质量演示视频。

---

## 需求摘要

- **数据来源**：现有 IndexedDB 中存储的 session（`Session.messages` + `Session.code`）
- **代码更新方式**：与正常模式一致（commit 时直接替换，不额外动画）
- **音频**：每次 assistant 消息含 `code` 字段时调用 `strudel.play(code)`，同步播放音乐
- **控制方式**：全自动，无暂停
- **入口**：Presentation 模式下，Sidebar title row 右侧按钮组，`[⏰]` 左边新增 `[▶]` 按钮
- **触发流程**：点击 `[▶]` → 按钮消失 → 等 500ms → 开始回放

---

## 架构

### 整体数据流

```
用户点击 ▶ (Sidebar title row)
    └─ App.tsx: isReplaying = true → 等 500ms → startReplay(currentSession)
           └─ useReplay (async loop)
                  ├─ user msg: 逐字流入 ChatInput → 停顿 300ms → 追加到 replayMessages → 等 600ms
                  ├─ progress msg: 等对应延迟 → 追加到 replayMessages
                  ├─ assistant msg (有 code): 追加 → strudel.play(code) → 等 2000ms
                  └─ assistant msg (无 code): 追加 → 等 800ms
           └─ 回放结束: isReplaying = false，▶ 按钮恢复
```

### ConversationView 消息来源切换

```ts
// App.tsx
const displayMessages = isReplaying
  ? replayMessages
  : currentSession?.messages ?? [];
```

回放期间 `replayMessages` 从空数组开始，逐条追加，不写入 IndexedDB。

---

## 文件改动清单

| 文件 | 类型 | 改动内容 |
|------|------|----------|
| `src/hooks/useReplay.ts` | **新建** | 核心回放逻辑 |
| `src/demo/demo-config.ts` | 修改 | 新增 `isPresentationMode()` |
| `src/components/icons.tsx` | 修改 | 新增 `PlayIcon` |
| `src/components/Sidebar.tsx` | 修改 | 新增 `onReplay`、`isReplaying`、`replayInputText` props；插入 ▶ 按钮 |
| `src/components/ChatInput.tsx` | 修改 | 新增 `replayValue` prop |
| `src/App.tsx` | 修改 | 接入 `useReplay`，传递相关 props |
| `src/hooks/__tests__/useReplay.test.ts` | **新建** | 单元测试 |

---

## `useReplay` hook 详细设计

### 接口

```ts
export function useReplay(onPlay: (code: string) => void): {
  isReplaying: boolean;
  replayMessages: ChatMessage[];
  replayInputText: string;      // 用户消息流式打字过程中的当前文字
  startReplay: (session: Session) => void;
}
```

### 内部实现

- 使用 `AbortController` 管理生命周期，支持中断（换 session 时）
- 每次 `startReplay` 调用前取消上一次未结束的回放
- `replayMessages` 从空数组开始，逐条 push（不直接 setState 整个数组，防止重渲染闪烁）

### 消息延迟策略

| 消息类型 | 处理方式 | 延迟 |
|---------|----------|------|
| `user` | 逐字流入 `replayInputText`（30ms/字） → 停顿 300ms → 追加到 replayMessages → 清空 inputText | 总计：字数×30ms + 300ms + 600ms |
| `progress: thinking` | 追加到 replayMessages | 400ms |
| `progress: tool_call / tool_result` | 追加到 replayMessages | 150ms |
| `progress: commit` | 追加到 replayMessages | 200ms |
| `progress: iteration / warn` | 追加到 replayMessages | 100ms |
| `assistant`（有 code） | 追加 → `onPlay(code)` → 等待 | 2000ms |
| `assistant`（无 code） | 追加 → 等待 | 800ms |

### User 消息打字动画伪代码

```ts
// replayInputText 逐字积累
for (const char of msg.content) {
  setReplayInputText(prev => prev + char);
  await sleep(30, signal);
}
await sleep(300, signal);           // 停顿，像真人确认
setReplayMessages(prev => [...prev, msg]);
setReplayInputText('');             // 模拟"发送"清空
await sleep(600, signal);
```

---

## `ChatInput` 改动

新增 `replayValue?: string` prop：
- 有值时：input 显示该值（受控，只读）；发送按钮和快捷键禁用
- 无值时：行为与现在完全一致（向后兼容）

---

## Sidebar 改动

新增三个 props：

```ts
onReplay?: () => void        // 触发回放
isReplaying?: boolean        // 回放中时隐藏 ▶ 按钮
replayInputText?: string     // 透传给 ChatInput
```

**按钮渲染逻辑**（在 `⏰` 左侧）：

```tsx
{isPresentationMode() && onReplay && !isReplaying && (
  <button onClick={onReplay} className="..." title="回放当前会话">
    <PlayIcon size={14} />
  </button>
)}
```

---

## `isPresentationMode()` 实现

添加到 `src/demo/demo-config.ts`：

```ts
export function isPresentationMode(): boolean {
  return window.location.pathname.includes('presentation');
}
```

---

## 测试计划

**`src/hooks/__tests__/useReplay.test.ts`**（Vitest + fake timers）：

- 消息按序追加，顺序与 session.messages 一致
- `user` 消息先逐字填充 `replayInputText`，发送后清空
- `assistant` 消息有 `code` 时，`onPlay` 被以该 code 调用
- `assistant` 消息无 `code` 时，`onPlay` 不被调用
- 回放结束后 `isReplaying` 变为 false

**不需要测试**：
- `isPresentationMode()`（单行 URL 检查）
- `PlayIcon`（纯 UI）

---

## 不在此次范围内

- 暂停 / 恢复控制
- 回放速度调节
- 从历史面板选择特定 session 回放（当前只回放已加载的 session）
- 持久化回放状态
