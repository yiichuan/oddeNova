# 设计规格：会话存储迁移至 IndexedDB

**日期：** 2026-04-29  
**状态：** 已批准  
**背景：** 用户发现历史记录丢失，根因是 localStorage 50 条上限静默淘汰旧会话。

---

## 问题陈述

当前会话存储使用 localStorage，存在以下限制：

- 硬性上限 50 条（`MAX_SESSIONS`），超出时静默删除最旧会话，用户无感知
- localStorage 容量约 5MB，大量会话内容可能导致写入静默失败
- 用户无法感知上限的存在，导致历史记录"神秘消失"

---

## 目标

- 移除会话条数上限，允许无限量保存历史记录
- 用户永不因存储上限丢失历史会话
- 保持现有 localStorage 数据的无缝迁移，不丢失旧会话

---

## 方案选择

采用 **方案 A：直接迁移至 IndexedDB（使用 `idb` 库）**。

- IndexedDB 容量 GB 级，无条数限制
- `idb` 库（2KB）提供简洁的 Promise API，降低原生 IndexedDB 复杂度
- 渲染进程自包含，无需改动 Electron 主进程
- 比 `localforage` 对 schema 有更强控制力

---

## 架构

```
useSessions.ts          ← React 状态管理（无存储细节）
    │
    ▼
src/lib/session-storage.ts  ← IndexedDB 读写封装（idb 库）
    │
    ▼
IndexedDB               ← DB: oddenova-db / store: sessions
```

### IndexedDB Schema

- **DB 名：** `oddenova-db`
- **版本：** 1
- **Object store：** `sessions`
  - 主键：`id`（字符串，即 Session.id）
  - 无索引（当前不需要按字段查询）
  - 无条数上限

---

## 组件设计

### `src/lib/session-storage.ts`（新增）

封装所有 IndexedDB 操作，对外暴露以下接口：

```ts
openDB(): Promise<void>
// 初始化 IndexedDB，执行旧数据迁移。应用启动时调用一次。

getAllSessions(): Promise<Session[]>
// 读取所有会话，按 updatedAt 降序返回。

putSession(session: Session): Promise<void>
// 新增或更新单条会话（upsert 语义）。

deleteSession(id: string): Promise<void>
// 删除指定 id 的会话。
```

**设计原则：**
- 每次操作单条 session（put/delete），不序列化整个列表，避免写放大
- 不向外暴露 idb 实例，存储实现细节完全隔离在此文件内

### `src/hooks/useSessions.ts`（修改）

- 移除所有 localStorage 逻辑（`loadSessions`、`persistSessions`、`STORAGE_KEY`、`STORAGE_CURRENT_KEY`）
- 移除 `MAX_SESSIONS` 常量及 `.slice(0, MAX_SESSIONS)` 调用
- 新增 `isLoading: boolean` 状态，初始为 `true`
- 初始化改为 `useEffect` 异步加载：调用 `openDB()` → `getAllSessions()` → 设置 state → `isLoading = false`
- 每次 `setSessions` 后，对增量变化调用 `putSession` / `deleteSession`（新增/更新/删除分别处理）
- `newSession`、`deleteSession` 等操作同步更新 React state，同时异步写入 IndexedDB

**新增返回值：**
```ts
isLoading: boolean  // true 表示历史记录正在从 IndexedDB 加载
```

### UI 层

`HistoryPanel.tsx` 接收 `isLoading` prop，加载期间显示简单骨架态（如"加载中…"文字或 spinner），防止历史列表闪烁。加载通常 <10ms，用户几乎无感知。

---

## 数据迁移

`openDB()` 在 DB 首次打开时执行一次性迁移：

1. 检查 localStorage `vibe-sessions-v1` 键是否存在
2. 若存在，解析数据并逐条写入 IndexedDB
3. 写入全部成功后，删除 localStorage 中的 `vibe-sessions-v1` 和 `vibe-sessions-current-v1`
4. 若写入过程失败，不删除 localStorage（下次启动重试）

---

## 错误处理

| 场景 | 处理方式 |
|------|---------|
| IndexedDB 打开失败（无痕模式、浏览器限制等） | 降级为纯内存模式，会话可正常使用但不持久化；`console.warn` 输出提示 |
| 单次 `putSession` 失败 | 静默忽略，React state 已更新，下次操作会重试写入 |
| 旧数据迁移读取失败 | 跳过迁移，不清除 localStorage，下次启动重试 |
| 迁移写入部分失败 | 不清除 localStorage，保留旧数据，下次重试 |

---

## 验证方案

手动验证，无需新增自动化测试：

1. 创建超过 50 条会话，确认历史列表不被截断
2. 重启应用，确认所有历史记录完整保留
3. 在有旧 localStorage 数据的环境启动，确认迁移成功且数据不丢失
4. 迁移后确认 localStorage 中的旧键已被清除

---

## 依赖变更

- 新增：`idb`（npm 包，~2KB gzip）
