# Session Title Editing — Design Spec

**Date:** 2026-06-13

## Goal

让已有内容的会话支持手动编辑会话名。当前会话顶部标题和历史列表中的标题都可以编辑，并同步更新同一个 `Session.title`。空的新会话仍保持临时的“新会话”状态，不提供标题编辑入口。

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| 编辑范围 | 当前会话顶部标题 + 历史列表标题 | 用户选择两处都可编辑；两处展示的是同一个 session 标题 |
| 空会话行为 | 不可编辑 | 空会话没有有效内容，避免命名后形成难以区分的空历史项 |
| 数据模型 | 不新增字段，复用 `Session.title` | 当前需求只需要保存标题文本，不需要迁移或区分标题来源 |
| 自动标题 | 仅当标题仍是 `t('newSessionTitle')` 时自动派生 | 保留第一次消息生成标题，同时避免覆盖用户手动命名 |
| 保存方式 | 内联编辑，Enter/blur 保存，Escape 取消 | 对单个短文本字段最轻量，符合现有紧凑 UI |
| 标题校验 | `trim()` 后保存；空字符串不保存；输入限制 60 字 | 防止空标题和过长标题破坏列表布局 |

## Data Layer — `src/hooks/useSessions.ts`

新增 hook 方法：

```ts
const renameSession = useCallback((sessionId: string, title: string): void => {
  const nextTitle = title.trim();
  if (!nextTitle) return;
  updateSession(sessionId, (s) => ({ ...s, title: nextTitle }));
}, [updateSession]);
```

并在 `useSessions()` 返回对象中导出 `renameSession`。

自动派生标题的路径保持存在，但收紧触发条件：

- `addUserMessage`: 只有当当前 session 没有用户消息且标题仍是 `t('newSessionTitle')` 时，才用第一条用户消息派生标题。
- `applyTruncateAndEdit`: 只有当目标消息之前没有用户消息且当前标题仍是 `t('newSessionTitle')` 时，才重新派生标题。

这样第一次发送消息仍然能把“新会话”变成可识别标题；用户手动改过标题后，即使之后回滚或编辑首条消息，也不会被消息内容覆盖。

## UI Layer

### Shared Inline Title Editor

抽取一个轻量组件，例如 `EditableSessionTitle`，供 `Sidebar` 顶部和 `HistoryPanel` 复用。

Props:

```ts
interface EditableSessionTitleProps {
  title: string;
  canEdit: boolean;
  className?: string;
  inputClassName?: string;
  titleTextClassName?: string;
  onRename: (title: string) => void;
}
```

行为：

- `canEdit=false` 时只渲染普通标题文本。
- `canEdit=true` 时点击标题或编辑按钮进入编辑态。
- 编辑态使用单行 input，初始值为当前标题，并自动 focus/select。
- `Enter` 保存，`Escape` 取消，失焦保存。
- 保存时 trim；空值取消保存；`maxLength={60}`。
- 保存后退出编辑态。

### `src/components/Sidebar.tsx`

新增 prop:

```ts
onRenameSession: (id: string, title: string) => void;
```

顶部标题区域改用 `EditableSessionTitle`：

- `title` 仍来自当前会话标题。
- `canEdit` 为当前会话存在且 `messages.length > 0`。
- `onRename` 调用 `onRenameSession(currentId, nextTitle)`。
- 编辑态输入框需要保持当前标题行的高度稳定，不挤压右侧历史/新建按钮。

### `src/components/HistoryPanel.tsx`

新增 prop:

```ts
onRename: (id: string, title: string) => void;
```

历史列表中的标题改用同一个 `EditableSessionTitle`：

- 历史列表本身已经过滤掉 `messages.length === 0` 的 session，因此列表项默认可编辑。
- 编辑输入框的点击、keydown、blur 保存过程都需要阻止冒泡，避免触发 `onSwitch(s.id)`。
- 删除按钮保留现有 hover 展示和 `stopPropagation()` 行为。

### `src/App.tsx`

把 `sessions.renameSession` 传给桌面 `Sidebar`、移动历史面板和其它直接渲染 `HistoryPanel` 的入口。

## Error Handling

- 空标题：不保存，退出编辑态并恢复旧标题。
- 只有空白字符：按空标题处理。
- DB 写入失败：沿用现有 `dbPutSession` 的 fire-and-forget 行为；当前页面内存状态会立即更新，刷新后的持久化结果取决于 IndexedDB 写入是否成功。
- 当前会话不存在或 `currentId` 为空：顶部编辑入口不可用。

## Testing

- `useSessions` 纯函数测试：
  - `applyTruncateAndEdit` 在标题是 `新会话` 且截断到首条用户消息时继续派生标题。
  - `applyTruncateAndEdit` 在标题已有自定义值时不覆盖标题。
- `EditableSessionTitle` 组件测试：
  - 点击进入编辑态。
  - `Enter` 保存 trim 后标题。
  - `Escape` 取消。
  - 空白标题不调用 `onRename`。
  - `canEdit=false` 时不进入编辑态。
- `HistoryPanel` 组件测试：
  - 编辑历史标题时调用 `onRename(id, title)`。
  - 编辑操作不触发 `onSwitch`。
  - 删除按钮行为不变。
- `Sidebar` 或集成测试：
  - 当前会话有消息时顶部标题可编辑。
  - 空新会话顶部标题不可编辑。

## Out of Scope

- 批量重命名或标题模板。
- 为标题来源新增 `titleEdited`、`titleSource` 等 schema 字段。
- 对旧数据执行迁移。
- 支持多行标题。
