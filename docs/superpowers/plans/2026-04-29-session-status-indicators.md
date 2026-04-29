# 会话状态指示器 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在历史面板的会话列表中，为每条条目显示"正在生成中"和"有未读结果"的视觉状态指示器。

**Architecture:** 在 `App.tsx` 用内存 state `unreadSessions: Set<string>` 追踪未读会话，通过 `useEffect` 监听 `loadingSessions` 变化自动填入，切换会话时清除；将 `loadingSessions` 和 `unreadSessions` 透传给 `Sidebar` → `HistoryPanel`，在列表条目右侧渲染状态小圆点。

**Tech Stack:** React, TypeScript, Tailwind CSS

---

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/App.tsx` | 修改 | 新增 `unreadSessions` state、监听逻辑、清除逻辑；向 Sidebar 透传新 prop |
| `src/components/Sidebar.tsx` | 修改 | 新增 `loadingSessions`、`unreadSessions` prop，透传给 HistoryPanel |
| `src/components/HistoryPanel.tsx` | 修改 | 新增两个 prop，渲染状态指示器 |

---

### Task 1：App.tsx — 新增 unreadSessions state 与填入逻辑

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1：新增 state 与 prevLoadingRef**

  在 `App.tsx` 中，找到现有的 state 声明区（`loadingSessions`、`isMoodLoading` 等），在其后添加：

  ```tsx
  const [unreadSessions, setUnreadSessions] = useState<Set<string>>(new Set());
  const prevLoadingRef = useRef<Set<string>>(new Set());
  ```

- [ ] **Step 2：新增 useEffect 监听 loadingSessions 变化**

  在 `currentIdRef` 的 `useEffect` 之后（约第 27 行附近），添加以下 effect：

  ```tsx
  useEffect(() => {
    const prev = prevLoadingRef.current;
    const curr = loadingSessions;
    // 找出本轮从 loading 消失的 id（即生成完成的会话）
    const completed = [...prev].filter((id) => !curr.has(id));
    if (completed.length > 0) {
      setUnreadSessions((prevUnread) => {
        const next = new Set(prevUnread);
        for (const id of completed) {
          // 只有非当前会话才标为未读
          if (id !== currentIdRef.current) {
            next.add(id);
          }
        }
        return next;
      });
    }
    prevLoadingRef.current = curr;
  }, [loadingSessions]);
  ```

- [ ] **Step 3：提交**

  ```bash
  git add src/App.tsx
  git commit -m "feat: add unreadSessions state with auto-fill logic"
  ```

---

### Task 2：App.tsx — 切换会话时清除未读标记，并透传 prop

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1：创建带清除逻辑的 handleSwitchSession**

  在 `handleNewSession` 的 `useCallback` 之后，添加：

  ```tsx
  const handleSwitchSession = useCallback((id: string) => {
    setUnreadSessions((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    sessions.switchTo(id);
  }, [sessions]);
  ```

- [ ] **Step 2：更新 Sidebar 的 prop 传递**

  找到 `<Sidebar` 的 JSX，将现有的：

  ```tsx
  onSwitchSession={sessions.switchTo}
  onDeleteSession={sessions.deleteSession}
  ```

  替换为：

  ```tsx
  loadingSessions={loadingSessions}
  unreadSessions={unreadSessions}
  onSwitchSession={handleSwitchSession}
  onDeleteSession={sessions.deleteSession}
  ```

- [ ] **Step 3：提交**

  ```bash
  git add src/App.tsx
  git commit -m "feat: clear unread on session switch, pass new props to Sidebar"
  ```

---

### Task 3：Sidebar.tsx — 新增 prop 并透传

**Files:**
- Modify: `src/components/Sidebar.tsx`

- [ ] **Step 1：更新 SidebarProps interface**

  找到 `interface SidebarProps`，在 `isLoading: boolean;` 后添加：

  ```tsx
  loadingSessions?: Set<string>;
  unreadSessions?: Set<string>;
  ```

- [ ] **Step 2：更新函数参数解构**

  在解构参数中加入：

  ```tsx
  loadingSessions = new Set<string>(),
  unreadSessions = new Set<string>(),
  ```

- [ ] **Step 3：透传给 HistoryPanel**

  找到 `<HistoryPanel` 的 JSX，加入：

  ```tsx
  loadingSessions={loadingSessions}
  unreadSessions={unreadSessions}
  ```

- [ ] **Step 4：提交**

  ```bash
  git add src/components/Sidebar.tsx
  git commit -m "feat: pass loadingSessions and unreadSessions through Sidebar"
  ```

---

### Task 4：HistoryPanel.tsx — 渲染状态指示器

**Files:**
- Modify: `src/components/HistoryPanel.tsx`

- [ ] **Step 1：更新 HistoryPanelProps interface**

  在 `interface HistoryPanelProps` 中加入：

  ```tsx
  loadingSessions?: Set<string>;
  unreadSessions?: Set<string>;
  ```

- [ ] **Step 2：更新函数参数解构**

  ```tsx
  loadingSessions = new Set<string>(),
  unreadSessions = new Set<string>(),
  ```

- [ ] **Step 3：在条目中渲染状态指示器**

  找到条目内的 `<span className="flex-1 text-xs truncate"` 和删除按钮，将整个 `<div ... onClick={() => onSwitch(s.id)}>` 内部替换为：

  ```tsx
  <span className="flex-1 text-xs truncate" title={s.title}>
    {s.title || '新会话'}
  </span>
  {/* 状态指示器 + 删除按钮 */}
  <span className="flex items-center gap-1 shrink-0">
    <button
      onClick={(e) => {
        e.stopPropagation();
        onDelete(s.id);
      }}
      className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-error text-base transition-opacity leading-none"
      title="删除"
    >
      ×
    </button>
    {loadingSessions.has(s.id) ? (
      <span className="w-1.5 h-1.5 rounded-full bg-accent animate-spin" style={{ animationDuration: '1s', border: '1.5px solid transparent', borderTopColor: 'currentColor' }} />
    ) : unreadSessions.has(s.id) ? (
      <span className="w-1.5 h-1.5 rounded-full bg-accent" />
    ) : (
      <span className="w-1.5 h-1.5" /> /* 占位，保持布局稳定 */
    )}
  </span>
  ```

  > **注意：** spinning dot 用 CSS border trick 实现旋转效果：设置透明 border 并让 `borderTopColor` 为 accent 色，配合 `animate-spin`。

- [ ] **Step 4：验证视觉效果**

  启动开发服务器：
  ```bash
  npm run dev
  ```
  打开历史面板，手动触发一个非当前会话的 AI 请求（或在代码中临时把某个 id 加入 unreadSessions），确认：
  - 生成中：旋转小圆点出现
  - 生成完成（非当前会话）：静态高亮小圆点出现
  - 切换到该会话：小圆点消失

- [ ] **Step 5：提交**

  ```bash
  git add src/components/HistoryPanel.tsx
  git commit -m "feat: render session status indicators in HistoryPanel"
  ```
