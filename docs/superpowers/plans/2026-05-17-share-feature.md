# Share Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 通过 `/s/{shareId}` 链接分享完整会话（聊天历史 + strudel 代码），接收方打开链接后自动 fork 会话到本地 oddeNova。

**Architecture:** 两个 Vercel serverless functions（`api/share.ts`）处理 POST 写入 / GET 读取，数据存储在 Vercel Blob 的 `shares/` 前缀下。`api/cleanup.ts` Cron Job 每天清理超过 30 天的旧 blob。前端通过 `useImportShare` hook 在挂载时检测 `/s/` 路径并执行导入，`ShareButton` 组件提供发起分享的 UI。

**Tech Stack:** `@vercel/blob`（Blob 读写）、React hooks、Vitest、Vercel Serverless Functions、Vercel Cron Jobs

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `api/share.ts` | 新建 | POST 写入 Blob / GET 读取 Blob |
| `api/cleanup.ts` | 新建 | Cron Job：删除 30 天以上旧 blob |
| `src/services/share.ts` | 新建 | `SharePayload` 类型 + `uploadShare()` / `fetchShare()` |
| `src/services/__tests__/share.test.ts` | 新建 | `uploadShare` / `fetchShare` 单元测试 |
| `src/components/icons.tsx` | 修改 | 新增 `ShareIcon` |
| `src/hooks/useSessions.ts` | 修改 | 新增 `importSession()` |
| `src/hooks/useImportShare.ts` | 新建 | 挂载时检测 `/s/` 路径并执行导入 |
| `src/components/ShareButton.tsx` | 新建 | 分享按钮 + 链接复制 Popover |
| `src/components/Sidebar.tsx` | 修改 | 桌面端 Logo 行加入 ShareButton |
| `src/App.tsx` | 修改 | 移动端顶栏加入 ShareButton + 接入 useImportShare |
| `vercel.json` | 修改 | 新增 `crons` 字段 |

---

## Task 1：安装依赖

**Files:** `package.json`

- [ ] **Step 1: 安装 `@vercel/blob`**

```bash
cd /Users/chaycao/workspace/oddeNova
npm install @vercel/blob
```

Expected: `@vercel/blob` 出现在 `package.json` 的 `dependencies` 中。

- [ ] **Step 2: 确认安装成功**

```bash
cat package.json | grep vercel
```

Expected: 输出包含 `"@vercel/blob"`。

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add @vercel/blob dependency"
```

---

## Task 2：新增 `ShareIcon` 到 icons.tsx

**Files:**
- Modify: `src/components/icons.tsx`

- [ ] **Step 1: 在 `icons.tsx` 末尾追加 `ShareIcon`**

在 `src/components/icons.tsx` 末尾（`DownloadIcon` 之后）添加：

```tsx
export function ShareIcon({ size = 16, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
    </svg>
  );
}
```

- [ ] **Step 2: 确认 lint 通过**

```bash
npm run lint -- src/components/icons.tsx
```

Expected: 无 lint 错误。

- [ ] **Step 3: Commit**

```bash
git add src/components/icons.tsx
git commit -m "feat: add ShareIcon to icons"
```

---

## Task 3：创建 `src/services/share.ts`（TDD）

**Files:**
- Create: `src/services/share.ts`
- Create: `src/services/__tests__/share.test.ts`

- [ ] **Step 1: 先写失败测试**

创建 `src/services/__tests__/share.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uploadShare, fetchShare } from '../share';

describe('uploadShare', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calls POST /api/share with correct payload and returns shareId', async () => {
    const mockShareId = 'abc1234567';
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ shareId: mockShareId }),
    } as Response);

    const shareId = await uploadShare({
      title: 'My Session',
      code: 'note "c5"',
      messages: [],
    });

    expect(fetch).toHaveBeenCalledWith('/api/share', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    }));
    const body = JSON.parse(
      (fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string
    );
    expect(body.version).toBe(1);
    expect(body.title).toBe('My Session');
    expect(body.code).toBe('note "c5"');
    expect(typeof body.sharedAt).toBe('number');
    expect(shareId).toBe(mockShareId);
  });

  it('throws when response is not ok', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
    } as Response);

    await expect(
      uploadShare({ title: '', code: '', messages: [] })
    ).rejects.toThrow('Share failed: 500');
  });
});

describe('fetchShare', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calls GET /api/share?id=... and returns payload', async () => {
    const mockPayload = {
      version: 1,
      title: 'Test',
      code: 'c',
      messages: [],
      sharedAt: 0,
    };
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockPayload),
    } as Response);

    const result = await fetchShare('abc123');

    expect(fetch).toHaveBeenCalledWith('/api/share?id=abc123');
    expect(result).toEqual(mockPayload);
  });

  it('throws when share not found', async () => {
    global.fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response);

    await expect(fetchShare('invalid')).rejects.toThrow('Fetch share failed: 404');
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
npm test -- src/services/__tests__/share.test.ts
```

Expected: FAIL — `Cannot find module '../share'`

- [ ] **Step 3: 创建 `src/services/share.ts`**

```typescript
import type { ChatMessage } from '../hooks/useChat';

export interface SharePayload {
  version: 1;
  title: string;
  code: string;
  messages: ChatMessage[];
  sharedAt: number;
}

interface UploadShareInput {
  title: string;
  code: string;
  messages: ChatMessage[];
}

export async function uploadShare(input: UploadShareInput): Promise<string> {
  const payload: SharePayload = {
    version: 1,
    title: input.title,
    code: input.code,
    messages: input.messages,
    sharedAt: Date.now(),
  };

  const res = await fetch('/api/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) throw new Error(`Share failed: ${res.status}`);

  const data = (await res.json()) as { shareId: string };
  return data.shareId;
}

export async function fetchShare(shareId: string): Promise<SharePayload> {
  const res = await fetch(`/api/share?id=${encodeURIComponent(shareId)}`);
  if (!res.ok) throw new Error(`Fetch share failed: ${res.status}`);
  return res.json() as Promise<SharePayload>;
}
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
npm test -- src/services/__tests__/share.test.ts
```

Expected: 4 tests PASS

- [ ] **Step 5: 确认全量测试不回归**

```bash
npm test
```

Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/services/share.ts src/services/__tests__/share.test.ts
git commit -m "feat: add share service with uploadShare and fetchShare"
```

---

## Task 4：在 `useSessions` 中新增 `importSession`

**Files:**
- Modify: `src/hooks/useSessions.ts`

- [ ] **Step 1: 在 `useSessions.ts` 中，`deleteSession` 的 `useCallback` 之后（return 语句之前）添加 `importSession`**

在 `deleteSession` 的 `useCallback` 定义结束后、`return {` 之前，插入：

```typescript
  const importSession = useCallback(
    async (payload: { title: string; code: string; messages: ChatMessage[] }): Promise<void> => {
      const id = newSessionId();
      const now = Date.now();
      const session: Session = {
        id,
        title: `${payload.title}（共享）`,
        messages: payload.messages,
        code: payload.code,
        createdAt: now,
        updatedAt: now,
      };
      await dbPutSession(session);
      setSessions((prev) => [session, ...prev]);
      setCurrentId(id);
    },
    []
  );
```

- [ ] **Step 2: 将 `importSession` 加入 return 对象**

找到 `return {` 块，在 `deleteSession,` 之后加入 `importSession,`：

```typescript
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
    importSession,
  };
```

- [ ] **Step 3: 确认 TypeScript 无报错**

```bash
npx tsc --noEmit -p tsconfig.app.json
```

Expected: 无错误输出。

- [ ] **Step 4: 确认全量测试通过**

```bash
npm test
```

Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useSessions.ts
git commit -m "feat: add importSession to useSessions"
```

---

## Task 5：创建 `api/share.ts` serverless function

**Files:**
- Create: `api/share.ts`

注意：`api/` 目录不在 `tsconfig.app.json` 的编译范围内，由 Vercel 在部署时单独处理。

- [ ] **Step 1: 创建 `api/share.ts`**

```typescript
import { put, list } from '@vercel/blob';
import { randomBytes } from 'crypto';

function generateShareId(): string {
  return randomBytes(8).toString('base64url').slice(0, 10);
}

export default async function handler(
  req: { method: string; body: unknown; query: Record<string, string | string[]> },
  res: { status: (code: number) => { json: (data: unknown) => void } }
) {
  if (req.method === 'POST') {
    const shareId = generateShareId();
    const blobPath = `shares/${shareId}.json`;

    await put(blobPath, JSON.stringify(req.body), {
      access: 'public',
      contentType: 'application/json',
    });

    return res.status(200).json({ shareId });
  }

  if (req.method === 'GET') {
    const id = req.query['id'];
    if (typeof id !== 'string' || !id) {
      return res.status(400).json({ error: 'Missing id' });
    }

    const { blobs } = await list({ prefix: `shares/${id}.json`, limit: 1 });
    if (!blobs[0]) {
      return res.status(404).json({ error: 'Share not found' });
    }

    const response = await fetch(blobs[0].url);
    const payload = await response.json();
    return res.status(200).json(payload);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
```

- [ ] **Step 2: Commit**

```bash
git add api/share.ts
git commit -m "feat: add api/share.ts serverless function"
```

---

## Task 6：创建 `src/hooks/useImportShare.ts`

**Files:**
- Create: `src/hooks/useImportShare.ts`

（useImportShare 依赖 `window.location`，不写单元测试，理由同 `validate/improvise` tool。）

- [ ] **Step 1: 创建 `src/hooks/useImportShare.ts`**

```typescript
import { useEffect, useState } from 'react';
import { fetchShare, type SharePayload } from '../services/share';

export type ImportStatus = 'idle' | 'loading' | 'error';

export function useImportShare(
  importSession: (payload: SharePayload) => Promise<void>
): ImportStatus {
  const [status, setStatus] = useState<ImportStatus>('idle');

  useEffect(() => {
    const match = window.location.pathname.match(/^\/s\/([^/]+)$/);
    if (!match) return;

    const shareId = match[1];
    setStatus('loading');

    fetchShare(shareId)
      .then((payload) => importSession(payload))
      .then(() => {
        window.history.replaceState(null, '', '/');
        setStatus('idle');
      })
      .catch(() => {
        setStatus('error');
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return status;
}
```

- [ ] **Step 2: 确认 TypeScript 无报错**

```bash
npx tsc --noEmit -p tsconfig.app.json
```

Expected: 无错误输出。

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useImportShare.ts
git commit -m "feat: add useImportShare hook"
```

---

## Task 7：创建 `src/components/ShareButton.tsx`

**Files:**
- Create: `src/components/ShareButton.tsx`

- [ ] **Step 1: 创建 `src/components/ShareButton.tsx`**

```tsx
import { useRef, useState } from 'react';
import type { Session } from '../hooks/useSessions';
import { uploadShare } from '../services/share';
import { ShareIcon } from './icons';

interface ShareButtonProps {
  session: Session | null;
}

export default function ShareButton({ session }: ShareButtonProps) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  async function handleShare() {
    if (!session || state === 'loading') return;
    setState('loading');
    setShareUrl(null);
    try {
      const shareId = await uploadShare({
        title: session.title,
        code: session.code,
        messages: session.messages,
      });
      const url = `${window.location.origin}/s/${shareId}`;
      setShareUrl(url);
      setState('done');
    } catch {
      setState('error');
      setTimeout(() => setState('idle'), 3000);
    }
  }

  async function handleCopy() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleClose() {
    setState('idle');
    setShareUrl(null);
    setCopied(false);
  }

  return (
    <div className="relative">
      <button
        onClick={handleShare}
        disabled={state === 'loading'}
        className="w-7 h-7 text-text-secondary hover:text-text-primary transition-colors flex items-center justify-center shrink-0 disabled:opacity-50"
        title="分享会话"
      >
        {state === 'loading' ? (
          <svg
            width={16}
            height={16}
            viewBox="0 0 24 24"
            className="animate-spin"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
            <path d="M12 2a10 10 0 0 1 10 10" />
          </svg>
        ) : (
          <ShareIcon size={16} />
        )}
      </button>

      {state === 'done' && shareUrl && (
        <div
          ref={popoverRef}
          className="absolute right-0 top-9 z-50 bg-bg-secondary border border-border rounded-lg shadow-lg p-3 w-72"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-text-muted">分享链接</span>
            <button
              onClick={handleClose}
              className="text-text-muted hover:text-text-primary transition-colors text-xs"
            >
              ✕
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={shareUrl}
              className="flex-1 bg-bg-primary border border-border rounded px-2 py-1 text-xs text-text-secondary truncate"
            />
            <button
              onClick={handleCopy}
              className="shrink-0 px-2 py-1 text-xs rounded border border-border text-text-secondary hover:text-text-primary hover:border-accent/50 transition-colors"
            >
              {copied ? '已复制' : '复制'}
            </button>
          </div>
        </div>
      )}

      {state === 'error' && (
        <div className="absolute right-0 top-9 z-50 bg-bg-secondary border border-border rounded-lg shadow-lg p-3 text-xs text-red-400">
          分享失败，请重试
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 确认 TypeScript 无报错**

```bash
npx tsc --noEmit -p tsconfig.app.json
```

Expected: 无错误输出。

- [ ] **Step 3: Commit**

```bash
git add src/components/ShareButton.tsx
git commit -m "feat: add ShareButton component"
```

---

## Task 8：将 ShareButton 接入桌面端 Sidebar

**Files:**
- Modify: `src/components/Sidebar.tsx`

- [ ] **Step 1: 在 `Sidebar.tsx` 中导入 ShareButton**

找到 `Sidebar.tsx` 第 4 行（import icons 那行），在其后添加：

```typescript
import ShareButton from './ShareButton';
```

- [ ] **Step 2: 在 `SidebarProps` interface 中添加 `currentSession` prop**

找到 `interface SidebarProps` 中 `onOpenSettings: () => void;` 这行，在其后添加：

```typescript
  currentSession: import('../hooks/useSessions').Session | null;
```

- [ ] **Step 3: 在解构参数中添加 `currentSession`**

找到 Sidebar 函数参数解构中的 `onOpenSettings,`，在其后添加：

```typescript
  currentSession,
```

- [ ] **Step 4: 在 Logo 行将 SettingsIcon 按钮包入 flex 组，并插入 ShareButton**

找到 Logo 行的 JSX（`pt-[5px] pb-2`），将右侧 SettingsIcon button 替换为：

```tsx
        <div className="flex items-center gap-1">
          <ShareButton session={currentSession} />
          <button
            onClick={onOpenSettings}
            className="w-7 h-7 text-text-secondary hover:text-text-primary transition-colors flex items-center justify-center shrink-0"
            title="设置 API Key"
          >
            <SettingsIcon size={18} />
          </button>
        </div>
```

- [ ] **Step 5: 确认 TypeScript 无报错**

```bash
npx tsc --noEmit -p tsconfig.app.json
```

Expected: 报错提示 `Sidebar` 调用处缺少 `currentSession` prop（正常，下一步在 App.tsx 里修复）。

- [ ] **Step 6: 在 `App.tsx` 中给 `<Sidebar>` 传入 `currentSession`**

在 `App.tsx` 中找到 `<Sidebar` 组件调用处，添加：

```tsx
          currentSession={sessions.currentSession}
```

- [ ] **Step 7: 确认 TypeScript 无报错**

```bash
npx tsc --noEmit -p tsconfig.app.json
```

Expected: 无错误输出。

- [ ] **Step 8: 确认全量测试通过**

```bash
npm test
```

Expected: all tests PASS

- [ ] **Step 9: Commit**

```bash
git add src/components/Sidebar.tsx src/App.tsx
git commit -m "feat: add ShareButton to desktop sidebar"
```

---

## Task 9：将 ShareButton 接入移动端顶栏，并接入 useImportShare

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: 在 `App.tsx` 中导入 ShareButton 和 useImportShare**

找到 `App.tsx` 顶部的 import 区，添加：

```typescript
import ShareButton from './components/ShareButton';
import { useImportShare } from './hooks/useImportShare';
```

- [ ] **Step 2: 在 App 组件 `if (isMobile)` 之前添加 `useImportShare` 调用**

找到 `const handleSwitchSession` 的定义之后、`if (isMobile) {` 之前，添加：

```typescript
  const importStatus = useImportShare(sessions.importSession);
```

- [ ] **Step 3: 在 `if (isMobile)` 分支内，在 ApiKeyModal 之后、主 JSX 之前添加导入状态处理**

找到移动端 `return (` 之后 `{showApiKeyModal && (` 之前，插入：

```tsx
        {importStatus === 'loading' && (
          <div className="absolute inset-0 z-50 bg-bg-primary flex items-center justify-center">
            <div className="text-text-secondary text-sm">正在加载分享内容…</div>
          </div>
        )}
        {importStatus === 'error' && (
          <div className="absolute inset-0 z-50 bg-bg-primary flex flex-col items-center justify-center gap-4">
            <p className="text-text-secondary text-sm">链接无效或已失效</p>
            <button
              onClick={() => sessions.newSession()}
              className="px-4 py-2 text-sm border border-border rounded text-text-secondary hover:text-text-primary transition-colors"
            >
              新建会话
            </button>
          </div>
        )}
```

- [ ] **Step 4: 在移动端顶栏 SettingsIcon 按钮之前添加 ShareButton**

找到移动端顶栏 `SettingsIcon` 的 `<button>` 元素（约 App.tsx line 398），在它之前插入：

```tsx
          <ShareButton session={sessions.currentSession} />
```

- [ ] **Step 5: 在桌面端（非 isMobile 分支）同样添加导入状态处理**

找到桌面端 `return (` 之后第一个子元素之前，插入：

```tsx
      {importStatus === 'loading' && (
        <div className="absolute inset-0 z-50 bg-bg-primary flex items-center justify-center">
          <div className="text-text-secondary text-sm">正在加载分享内容…</div>
        </div>
      )}
      {importStatus === 'error' && (
        <div className="absolute inset-0 z-50 bg-bg-primary flex flex-col items-center justify-center gap-4">
          <p className="text-text-secondary text-sm">链接无效或已失效</p>
          <button
            onClick={() => sessions.newSession()}
            className="px-4 py-2 text-sm border border-border rounded text-text-secondary hover:text-text-primary transition-colors"
          >
            新建会话
          </button>
        </div>
      )}
```

- [ ] **Step 6: 确认 TypeScript 无报错**

```bash
npx tsc --noEmit -p tsconfig.app.json
```

Expected: 无错误输出。

- [ ] **Step 7: 确认全量测试通过**

```bash
npm test
```

Expected: all tests PASS

- [ ] **Step 8: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add ShareButton to mobile nav and wire useImportShare"
```

---

## Task 10：创建 `api/cleanup.ts` Cron Job

**Files:**
- Create: `api/cleanup.ts`
- Modify: `vercel.json`

- [ ] **Step 1: 创建 `api/cleanup.ts`**

```typescript
import { list, del } from '@vercel/blob';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export default async function handler(
  req: { method: string; headers: Record<string, string | string[] | undefined> },
  res: { status: (code: number) => { json: (data: unknown) => void } }
) {
  // Vercel 在 Cron Job 请求中携带 Authorization: Bearer {CRON_SECRET}
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const cutoff = Date.now() - THIRTY_DAYS_MS;
  let deleted = 0;
  let cursor: string | undefined;

  do {
    const result = await list({ prefix: 'shares/', cursor, limit: 1000 });
    const oldBlobs = result.blobs.filter(
      (b) => new Date(b.uploadedAt).getTime() < cutoff
    );
    if (oldBlobs.length > 0) {
      await del(oldBlobs.map((b) => b.url));
      deleted += oldBlobs.length;
    }
    cursor = result.cursor;
  } while (cursor);

  return res.status(200).json({ deleted });
}
```

- [ ] **Step 2: 更新 `vercel.json` 添加 crons 配置**

将 `vercel.json` 改为：

```json
{
  "buildCommand": "vite build",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }],
  "crons": [
    {
      "path": "/api/cleanup",
      "schedule": "0 0 * * *"
    }
  ]
}
```

- [ ] **Step 3: Commit**

```bash
git add api/cleanup.ts vercel.json
git commit -m "feat: add cleanup cron job and vercel.json crons config"
```

---

## Task 11：Vercel 环境变量配置（部署后操作）

这些步骤在 Vercel Dashboard 中手动完成，不需要改代码：

- [ ] **Step 1: 在 Vercel 项目 Settings → Storage 中创建 Blob Store，并关联到项目**

Vercel 会自动注入 `BLOB_READ_WRITE_TOKEN` 环境变量。

- [ ] **Step 2: 在 Vercel 项目 Settings → Environment Variables 中添加 `CRON_SECRET`**

值设为任意随机字符串（如 `openssl rand -base64 32` 的输出）。

- [ ] **Step 3: 触发重新部署（push 代码或手动 Redeploy）**

Expected: `/api/share` 可正常接收 POST 请求并返回 `{ shareId }`；每天 UTC 00:00 Cron Job 自动运行。

---

## 验证清单

实现完成后，按以下步骤手动验证：

1. 本地 `npm run dev` 启动，创建一个包含聊天历史的会话
2. 点击顶部 Share 按钮 → 确认按钮进入 loading → 弹出 Popover 显示链接
3. 复制链接（格式为 `http://localhost:5173/s/xxxxxxxx`）
4. 在隐身窗口打开该链接 → 确认显示"正在加载分享内容…" → 自动跳回主界面 → 新会话出现在列表顶部，标题带"（共享）"后缀
5. 确认新会话包含原始的完整聊天历史和 strudel 代码
6. 测试无效链接（如 `/s/invalid123`）→ 确认显示"链接无效或已失效"错误页

> **注意**：本地开发时 `/api/share` 需要通过 `vercel dev` 启动才能调用（`npm run dev` 不启动 serverless functions）。可用 `vercel dev` 替代 `npm run dev` 进行联调测试。
