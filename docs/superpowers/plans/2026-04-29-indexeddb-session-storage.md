# IndexedDB 会话存储迁移 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将会话持久化从 localStorage（50条上限）迁移至 IndexedDB，彻底解决历史记录因超限被静默删除的问题。

**Architecture:** 新增独立存储层 `src/lib/session-storage.ts` 封装所有 IndexedDB 操作（使用 `idb` 库）；`useSessions.ts` 改为异步加载，移除 MAX_SESSIONS 上限，每次 state 变更后增量写入 IndexedDB；首次启动时自动将旧 localStorage 数据迁移。

**Tech Stack:** React, TypeScript, `idb`（npm 包，~2KB gzip）

---

## 文件变更概览

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/lib/session-storage.ts` | 新增 | IndexedDB 读写封装，含迁移逻辑 |
| `src/hooks/useSessions.ts` | 修改 | 移除 localStorage 逻辑，改为异步加载，新增 `isLoading` |
| `src/components/HistoryPanel.tsx` | 修改 | 接收 `isLoading` prop，加载期间显示加载态 |
| `src/components/Sidebar.tsx` | 修改 | 透传 `isLoading` 给 HistoryPanel |
| `src/App.tsx` | 修改 | 从 `useSessions()` 解构 `isLoading`，传递给 Sidebar |

---

## Task 1：安装 idb 依赖

**Files:**
- Modify: `package.json`（自动更新）

- [ ] **Step 1: 安装 idb**

```bash
npm install idb
```

预期输出：`added 1 package`（idb 无任何子依赖）

- [ ] **Step 2: 确认安装成功**

```bash
node -e "require('./node_modules/idb/build/index.cjs'); console.log('idb ok')"
```

预期输出：`idb ok`

- [ ] **Step 3: 提交**

```bash
git add package.json package-lock.json
git commit -m "chore: add idb dependency for IndexedDB session storage"
```

---

## Task 2：新增 session-storage.ts

**Files:**
- Create: `src/lib/session-storage.ts`

- [ ] **Step 1: 创建文件**

创建 `src/lib/session-storage.ts`，内容如下：

```ts
import { openDB as idbOpenDB, type IDBPDatabase } from 'idb';
import type { Session } from '../hooks/useSessions';

const DB_NAME = 'oddenova-db';
const DB_VERSION = 1;
const STORE_NAME = 'sessions';

// localStorage keys for one-time migration
const LS_SESSIONS_KEY = 'vibe-sessions-v1';
const LS_CURRENT_KEY = 'vibe-sessions-current-v1';

let db: IDBPDatabase | null = null;
let memoryFallback = false;

export async function openDB(): Promise<void> {
  try {
    db = await idbOpenDB(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      },
    });
    await migrateFromLocalStorage();
  } catch (err) {
    console.warn('[session-storage] IndexedDB unavailable, falling back to memory mode.', err);
    memoryFallback = true;
  }
}

async function migrateFromLocalStorage(): Promise<void> {
  const raw = localStorage.getItem(LS_SESSIONS_KEY);
  if (!raw || !db) return;
  try {
    const sessions = JSON.parse(raw) as Session[];
    if (!Array.isArray(sessions) || sessions.length === 0) {
      localStorage.removeItem(LS_SESSIONS_KEY);
      localStorage.removeItem(LS_CURRENT_KEY);
      return;
    }
    const tx = db.transaction(STORE_NAME, 'readwrite');
    await Promise.all(sessions.map((s) => tx.store.put(s)));
    await tx.done;
    // Only clear localStorage after successful write
    localStorage.removeItem(LS_SESSIONS_KEY);
    localStorage.removeItem(LS_CURRENT_KEY);
  } catch (err) {
    console.warn('[session-storage] Migration from localStorage failed, will retry next launch.', err);
  }
}

export async function getAllSessions(): Promise<Session[]> {
  if (memoryFallback || !db) return [];
  try {
    const all = (await db.getAll(STORE_NAME)) as Session[];
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    return [];
  }
}

export async function putSession(session: Session): Promise<void> {
  if (memoryFallback || !db) return;
  try {
    await db.put(STORE_NAME, session);
  } catch (err) {
    console.warn('[session-storage] putSession failed', err);
  }
}

export async function deleteSession(id: string): Promise<void> {
  if (memoryFallback || !db) return;
  try {
    await db.delete(STORE_NAME, id);
  } catch (err) {
    console.warn('[session-storage] deleteSession failed', err);
  }
}
```

- [ ] **Step 2: 确认 TypeScript 编译无报错**

```bash
npx tsc --noEmit
```

预期：无报错

- [ ] **Step 3: 提交**

```bash
git add src/lib/session-storage.ts
git commit -m "feat: add IndexedDB session storage layer"
```

---

## Task 3：重构 useSessions.ts

**Files:**
- Modify: `src/hooks/useSessions.ts`

- [ ] **Step 1: 用新版本替换 useSessions.ts**

将 `src/hooks/useSessions.ts` 改为以下内容（完整替换）：

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage, ProgressKind } from './useChat';
import {
  openDB,
  getAllSessions,
  putSession as dbPutSession,
  deleteSession as dbDeleteSession,
} from '../lib/session-storage';

export interface Session {
  id: string;
  title: string;
  messages: ChatMessage[];
  code: string;
  createdAt: number;
  updatedAt: number;
}

let messageId = 0;

function newSessionId(): string {
  return `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function newMessageId(): string {
  return `msg-${Date.now()}-${++messageId}`;
}

function deriveTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.role === 'user');
  if (!firstUser) return '新会话';
  const text = firstUser.content.trim();
  if (text.length <= 20) return text;
  return text.slice(0, 20) + '…';
}

function makeEmptySession(): Session {
  return {
    id: newSessionId(),
    title: '新会话',
    messages: [],
    code: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function useSessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Track pending DB writes to avoid race conditions
  const pendingWrites = useRef<Set<string>>(new Set());

  // Initialize: open DB (+ migrate) then load all sessions
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await openDB();
      const loaded = await getAllSessions();
      if (cancelled) return;

      if (loaded.length === 0) {
        const fresh = makeEmptySession();
        setSessions([fresh]);
        setCurrentId(fresh.id);
        await dbPutSession(fresh);
      } else {
        setSessions(loaded);
        setCurrentId(loaded[0].id);
      }
      setIsLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const currentSession =
    sessions.find((s) => s.id === currentId) || sessions[0] || null;

  // Internal: update a session in state and persist to DB
  const applyUpdate = useCallback(
    (sessionId: string, mut: (s: Session) => Session) => {
      setSessions((prev) => {
        const next = prev.map((s) => {
          if (s.id !== sessionId) return s;
          const updated = { ...mut(s), updatedAt: Date.now() };
          // Fire-and-forget DB write
          dbPutSession(updated);
          return updated;
        });
        return next;
      });
    },
    []
  );

  const updateCurrent = useCallback(
    (mut: (s: Session) => Session) => {
      setSessions((prev) => {
        const id = currentId || prev[0]?.id;
        if (!id) return prev;
        return prev.map((s) => {
          if (s.id !== id) return s;
          const updated = { ...mut(s), updatedAt: Date.now() };
          dbPutSession(updated);
          return updated;
        });
      });
    },
    [currentId]
  );

  const updateSession = useCallback(
    (sessionId: string, mut: (s: Session) => Session) => {
      applyUpdate(sessionId, mut);
    },
    [applyUpdate]
  );

  const addUserMessage = useCallback(
    (content: string, sessionId?: string): void => {
      const apply = sessionId
        ? (fn: (s: Session) => Session) => updateSession(sessionId, fn)
        : updateCurrent;
      apply((s) => {
        const messages = [
          ...s.messages,
          {
            id: newMessageId(),
            role: 'user' as const,
            content,
            timestamp: Date.now(),
          },
        ];
        const title = s.messages.some((m) => m.role === 'user') ? s.title : deriveTitle(messages);
        return { ...s, messages, title };
      });
    },
    [updateCurrent, updateSession]
  );

  const addAssistantMessage = useCallback(
    (content: string, code?: string, sessionId?: string): void => {
      const apply = sessionId
        ? (fn: (s: Session) => Session) => updateSession(sessionId, fn)
        : updateCurrent;
      apply((s) => ({
        ...s,
        messages: [
          ...s.messages,
          {
            id: newMessageId(),
            role: 'assistant' as const,
            content,
            code,
            timestamp: Date.now(),
          },
        ],
      }));
    },
    [updateCurrent, updateSession]
  );

  const addProgress = useCallback(
    (kind: ProgressKind, content: string, opts?: { toolName?: string; ok?: boolean; sessionId?: string }): void => {
      const apply = opts?.sessionId
        ? (fn: (s: Session) => Session) => updateSession(opts.sessionId!, fn)
        : updateCurrent;
      apply((s) => ({
        ...s,
        messages: [
          ...s.messages,
          {
            id: newMessageId(),
            role: 'progress' as const,
            content,
            timestamp: Date.now(),
            progressKind: kind,
            toolName: opts?.toolName,
            ok: opts?.ok,
          },
        ],
      }));
    },
    [updateCurrent, updateSession]
  );

  const appendToLastThinking = useCallback(
    (delta: string, sessionId?: string): void => {
      const apply = sessionId
        ? (fn: (s: Session) => Session) => updateSession(sessionId, fn)
        : updateCurrent;
      apply((s) => {
        const messages = [...s.messages];
        const last = messages[messages.length - 1];
        if (last?.role === 'progress' && last.progressKind === 'thinking') {
          messages[messages.length - 1] = { ...last, content: last.content + delta };
          return { ...s, messages };
        }
        return {
          ...s,
          messages: [
            ...messages,
            {
              id: newMessageId(),
              role: 'progress' as const,
              content: delta,
              timestamp: Date.now(),
              progressKind: 'thinking' as const,
            },
          ],
        };
      });
    },
    [updateCurrent, updateSession]
  );

  const setCurrentCode = useCallback(
    (code: string, sessionId?: string) => {
      const apply = sessionId
        ? (fn: (s: Session) => Session) => updateSession(sessionId, fn)
        : updateCurrent;
      apply((s) => ({ ...s, code }));
    },
    [updateCurrent, updateSession]
  );

  const newSession = useCallback(() => {
    setSessions((prev) => {
      const id = currentId || prev[0]?.id;
      const cur = prev.find((s) => s.id === id);
      if (cur && cur.messages.length === 0 && !cur.code) {
        if (id && currentId !== id) setCurrentId(id);
        return prev;
      }
      const fresh = makeEmptySession();
      setCurrentId(fresh.id);
      dbPutSession(fresh);
      return [fresh, ...prev];
    });
  }, [currentId]);

  const switchTo = useCallback((id: string) => {
    setCurrentId(id);
  }, []);

  const deleteSession = useCallback(
    (id: string) => {
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== id);
        dbDeleteSession(id);
        if (next.length === 0) {
          const fresh = makeEmptySession();
          setCurrentId(fresh.id);
          dbPutSession(fresh);
          return [fresh];
        }
        if (id === currentId) setCurrentId(next[0].id);
        return next;
      });
    },
    [currentId]
  );

  return {
    sessions,
    currentSession,
    currentId,
    isLoading,
    addUserMessage,
    addAssistantMessage,
    addProgress,
    appendToLastThinking,
    setCurrentCode,
    newSession,
    switchTo,
    deleteSession,
  };
}
```

- [ ] **Step 2: 确认 TypeScript 编译无报错**

```bash
npx tsc --noEmit
```

预期：无报错

- [ ] **Step 3: 提交**

```bash
git add src/hooks/useSessions.ts
git commit -m "feat: migrate useSessions to IndexedDB, remove MAX_SESSIONS limit"
```

---

## Task 4：更新 HistoryPanel 支持 isLoading

**Files:**
- Modify: `src/components/HistoryPanel.tsx`

- [ ] **Step 1: 添加 isLoading prop 和加载态**

将 `src/components/HistoryPanel.tsx` 的 interface 和组件函数签名更新如下：

```tsx
interface HistoryPanelProps {
  sessions: Session[];
  currentId: string | null;
  isLoading?: boolean;
  onSwitch: (id: string) => void;
  onDelete: (id: string) => void;
}

export default function HistoryPanel({
  sessions,
  currentId,
  isLoading = false,
  onSwitch,
  onDelete,
}: HistoryPanelProps) {
```

在列表渲染区域，将原来的：

```tsx
      <div className="flex-1 overflow-y-auto" style={{ fontFamily: '"GenWanMin TW", serif' }}>
        {ordered.length === 0 ? (
          <div className="p-4 text-xs text-text-muted">暂无会话</div>
        ) : (
```

改为：

```tsx
      <div className="flex-1 overflow-y-auto" style={{ fontFamily: '"GenWanMin TW", serif' }}>
        {isLoading ? (
          <div className="p-4 text-xs text-text-muted">加载中…</div>
        ) : ordered.length === 0 ? (
          <div className="p-4 text-xs text-text-muted">暂无会话</div>
        ) : (
```

- [ ] **Step 2: 确认 TypeScript 编译无报错**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: 提交**

```bash
git add src/components/HistoryPanel.tsx
git commit -m "feat: add isLoading state to HistoryPanel"
```

---

## Task 5：透传 isLoading 至 Sidebar 和 App

**Files:**
- Modify: `src/components/Sidebar.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: 在 Sidebar.tsx 的 SidebarProps 添加 isHistoryLoading**

在 `SidebarProps` interface 中添加：

```ts
isHistoryLoading?: boolean;
```

在组件函数参数解构中添加 `isHistoryLoading = false`，并将其传入 `HistoryPanel`：

```tsx
<HistoryPanel
  sessions={sessions}
  currentId={currentId}
  isLoading={isHistoryLoading}
  onSwitch={onSwitchSession}
  onDelete={onDeleteSession}
/>
```

- [ ] **Step 2: 在 App.tsx 中传递 isLoading**

在 `App.tsx` 中，从 `useSessions()` 解构新增的 `isLoading`：

```tsx
const sessions = useSessions();
```

在 `<Sidebar>` 组件上添加 prop：

```tsx
isHistoryLoading={sessions.isLoading}
```

- [ ] **Step 3: 确认 TypeScript 编译无报错**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: 提交**

```bash
git add src/components/Sidebar.tsx src/App.tsx
git commit -m "feat: pass isHistoryLoading through Sidebar to HistoryPanel"
```

---

## Task 6：手动验证

- [ ] **Step 1: 启动应用**

```bash
npm run dev
```

- [ ] **Step 2: 验证无上限**

创建超过 50 条会话（可通过快速点击「新建会话」），确认历史面板显示全部会话，无截断。

- [ ] **Step 3: 验证持久化**

在某个会话中发送一条消息，刷新页面，确认消息和会话仍然存在。

- [ ] **Step 4: 验证迁移（如有旧数据）**

若 localStorage 中有旧的 `vibe-sessions-v1` 数据，刷新应用后，确认历史记录完整显示，且 localStorage 中的 `vibe-sessions-v1` 键已被清除（可在浏览器开发者工具 Application > Local Storage 中确认）。

- [ ] **Step 5: 验证 IndexedDB 数据**

打开浏览器开发者工具 → Application → IndexedDB → `oddenova-db` → `sessions`，确认会话数据已正确存入。
