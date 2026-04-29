# 设计规格：会话状态指示器

**日期：** 2026-04-29  
**状态：** 已批准

## 背景

用户在使用多会话时，切换到其他会话后，后台会话的 AI 生成进度和新结果无从感知。本功能在历史面板的会话列表中为每条会话加入视觉状态指示器。

## 目标

在历史面板会话列表中，每条条目能直观显示以下三种状态：

1. **正在生成中** — AI 正在为该会话生成回复
2. **有未读结果** — 该会话已生成完毕，但用户尚未访问
3. **无特殊状态** — 正常状态

## 状态定义

| 状态 | 触发条件 | 清除条件 |
|------|----------|----------|
| 正在生成中 | 该会话 id 存在于 `loadingSessions` | 从 `loadingSessions` 移除时 |
| 有未读结果 | 该会话从 loading 完成，且此时不是当前会话 | 用户切换到该会话 |

## 架构

### 状态管理（App.tsx）

新增 `unreadSessions: Set<string>` state，纯内存，不持久化（刷新后视为已读）。

**填入逻辑：**

```
useEffect 监听 loadingSessions：
  对比上一轮（通过 useRef 保存），找出"本轮消失的 id"
  若该 id !== currentId，则加入 unreadSessions
```

**清除逻辑：**

```
handleSwitchSession(id)：
  切换会话时，从 unreadSessions 移除该 id
```

### 数据传递

`App` → `Sidebar` → `HistoryPanel`，新增两个 prop：

- `loadingSessions: Set<string>` — 正在生成中的会话 id 集合
- `unreadSessions: Set<string>` — 有未读结果的会话 id 集合

### 视觉渲染（HistoryPanel）

每条条目右侧区域按优先级显示状态指示器：

| 优先级 | 状态 | 视觉表现 |
|--------|------|----------|
| 1（最高） | 正在生成中 | 旋转动画小圆点（spinning dot，accent 色） |
| 2 | 有未读结果 | 静态高亮小圆点（accent 色） |
| 3 | 无特殊状态 | 无指示器 |

生成中时只显示 spinning dot，不叠加未读点。

**删除按钮**保持现有行为（hover 时出现），与指示器共存于同一右侧区域：指示器常显，删除按钮在 hover 时显示于其左侧。

## 变更范围

| 文件 | 变更内容 |
|------|----------|
| `src/App.tsx` | 新增 `unreadSessions` state、监听逻辑、清除逻辑；向 Sidebar 透传新 prop |
| `src/components/Sidebar.tsx` | 新增 `loadingSessions`、`unreadSessions` prop，透传给 HistoryPanel |
| `src/components/HistoryPanel.tsx` | 新增两个 prop，渲染状态指示器 |

## 不在范围内

- 持久化未读状态（刷新后重置合理）
- 声音/通知等系统级提醒
- 当前会话（currentId）的状态指示（已通过主界面 loading 状态体现）
