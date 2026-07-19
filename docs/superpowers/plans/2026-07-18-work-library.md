# 作品库 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为登录用户提供独立、可持久化的作品库，把已提交曲谱保存为可试听、导出和临时分享的不可变作品。

**Architecture:** 新增 `Work` 领域模型及独立的 Supabase `works` 表/API/客户端 repository；`useWorks` 只在已认证 owner 下加载和写入云端缓存。`App` 管理 `creator | works` 一级 destination，作品 UI 通过回调访问现有全局 Strudel 播放器、WAV 导出器和会话新建逻辑，绝不直接改变当前会话代码。

**Tech Stack:** React 18、TypeScript、Vitest、IndexedDB/idb、Supabase/Postgres RLS、Vercel serverless、Tailwind、Strudel/superdough。

## Global Constraints

- 作品库只对登录用户可写；访客不创建作品本地副本。
- `Work` 与 `Session` 无引用关系；作品保存最终代码和用户可见的 `ChatMessage` 记录。
- 分享 payload 不得包含创作记录，且沿用当前 30 天 Blob 清理和 `/s/:id` 导入路径。
- 试听只能调用 `useStrudel()` 暴露的接口；不调用 `sessions.setCurrentCode`。
- 不实现标签、描述、媒体上传、视频或曲谱文件导出、长期分享链接。

---

### Task 1: 定义作品模型、快照规则与客户端缓存

**Files:**
- Create: `src/lib/work.ts`
- Create: `src/lib/__tests__/work.test.ts`
- Modify: `src/lib/session-storage.ts`
- Modify: `src/lib/__tests__/session-storage.test.ts`

**Interfaces:**
- Produces: `Work`, `WorkRecord`, `createWorkSnapshot(session)`, `isVisibleRecordMessage(message)`, `WORK_STORE_NAME`, `getAllWorks`, `putWork`, `deleteWork`.
- Consumes: `Session` and `ChatMessage` types; existing owner-keyed IndexedDB initialization.

- [ ] **Step 1: Write the failing snapshot tests**

```ts
it('creates an independent work snapshot from code and visible messages', () => {
  const work = createWorkSnapshot(session);
  expect(work.code).toBe('s("bd")');
  expect(work.record.messages.map(({ role }) => role)).toEqual(['user', 'assistant']);
  expect(work.record.messages).not.toBe(session.messages);
});

it('excludes progress messages from the creative record', () => {
  expect(isVisibleRecordMessage(progressMessage)).toBe(false);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npx vitest run src/lib/__tests__/work.test.ts`

Expected: FAIL because `../work` does not exist.

- [ ] **Step 3: Implement the minimal immutable model**

```ts
export interface WorkRecord { messages: ChatMessage[]; code: string; }
export interface Work { id: string; title: string; code: string; coverSeed: string; record: WorkRecord; createdAt: number; updatedAt: number; }

export function isVisibleRecordMessage(message: ChatMessage): boolean {
  return message.role === 'user' || message.role === 'assistant';
}
```

`createWorkSnapshot` must reject an empty `session.code`, clone retained messages, set `record.code === code`, derive a stable random `coverSeed`, and set both timestamps once.

- [ ] **Step 4: Add IndexedDB tests before storage code**

```ts
await putWork(work, 'user-1');
expect(await getAllWorks('user-1')).toEqual([work]);
await deleteWork(work.id, 'user-1');
expect(await getAllWorks('user-1')).toEqual([]);
```

- [ ] **Step 5: Implement an owner-keyed `works_by_owner` store**

Increase `DB_VERSION`, create `WORK_STORE_NAME` with key path `['ownerKey', 'id']`, and implement the three helpers using the same fallback behavior as sessions. Sort reads by descending `createdAt`; do not write works for owner `guest`.

- [ ] **Step 6: Verify GREEN**

Run: `npx vitest run src/lib/__tests__/work.test.ts src/lib/__tests__/session-storage.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/work.ts src/lib/__tests__/work.test.ts src/lib/session-storage.ts src/lib/__tests__/session-storage.test.ts
git commit -m "feat: add persistent work snapshots"
```

### Task 2: 新增数据库迁移和受认证保护的作品 API

**Files:**
- Create: `supabase/migrations/20260718000000_works.sql`
- Create: `api/works.ts`
- Create: `api/works/[id].ts`
- Create: `tests/api/works.test.ts`
- Modify: `api/session-utils.ts`

**Interfaces:**
- Produces: `ApiWork`, `rowToWork`, `workToRow`; `GET /api/works`, `PUT|DELETE /api/works/:id`.
- Consumes: `requireUser`, `getStringQuery`, Supabase JWT-bound client.

- [ ] **Step 1: Write API tests for auth, list, upsert, and owner-scoped delete**

```ts
expect(response.statusCode).toBe(401);
expect(response.json()).toEqual({ error: 'Unauthorized' });
expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'user-1', work_id: 'work-1' }), { onConflict: 'user_id,work_id' });
expect(deleteQuery.eq).toHaveBeenCalledWith('user_id', 'user-1');
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run tests/api/works.test.ts`

Expected: FAIL because the works handlers do not exist.

- [ ] **Step 3: Add the RLS migration**

Create `public.works` with `id uuid primary key`, `work_id text`, `user_id uuid references auth.users(id) on delete cascade`, non-empty `title`, non-empty `code`, non-empty `cover_seed`, `record jsonb` constrained to an object, timestamps, `unique(user_id, work_id)`, update trigger, `(user_id, updated_at desc)` index, authenticated grants, and four `auth.uid() = user_id` policies matching `sessions`.

- [ ] **Step 4: Implement serializers and handlers**

Add `ApiWork` to `api/session-utils.ts`; serializers must convert database timestamps to epoch milliseconds, require `record.messages` to be an array, and reject malformed bodies with HTTP 400. The list handler selects only work fields and filters by authenticated `user_id`; the item handler checks URL/body ID equality before upsert and scopes delete by both `work_id` and `user_id`.

- [ ] **Step 5: Verify GREEN**

Run: `npx vitest run tests/api/works.test.ts tests/api/sessions.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260718000000_works.sql api/works.ts 'api/works/[id].ts' api/session-utils.ts tests/api/works.test.ts
git commit -m "feat: add authenticated works API"
```

### Task 3: 实现登录限定的作品 repository 和状态 Hook

**Files:**
- Create: `src/services/work-repository.ts`
- Create: `src/services/__tests__/work-repository.test.ts`
- Create: `src/hooks/useWorks.ts`
- Create: `src/hooks/__tests__/useWorks.test.tsx`

**Interfaces:**
- Produces: `listCloudWorks`, `saveCloudWork`, `deleteCloudWork`; `useWorks({ ownerKey, enabled })` returning `{ works, isLoading, error, createWork, renameWork, deleteWork }`.
- Consumes: `Work`, client cache helpers, `getAccessToken`.

- [ ] **Step 1: Write failing repository tests**

```ts
await saveCloudWork(work);
expect(fetch).toHaveBeenCalledWith('/api/works/work-1', expect.objectContaining({ method: 'PUT' }));
await expect(listCloudWorks()).rejects.toThrow('Not signed in');
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run src/services/__tests__/work-repository.test.ts`

Expected: FAIL because `work-repository` does not exist.

- [ ] **Step 3: Implement repository with the session repository’s auth/error conventions**

Use `Authorization: Bearer <token>` for each request; list reads `{ works }`, save uses `PUT /api/works/:id`, and delete uses `DELETE /api/works/:id`.

- [ ] **Step 4: Write failing hook tests**

```tsx
await act(async () => result.current.createWork(session));
expect(saveCloudWork).toHaveBeenCalledWith(expect.objectContaining({ record: expect.objectContaining({ messages: expect.any(Array) }) }));
expect(result.current.works).toHaveLength(1);
```

Also assert `enabled: false` neither lists nor writes works, and save/delete failures leave the previous React state unchanged.

- [ ] **Step 5: Implement `useWorks` with confirm-before-state semantics**

When enabled, load cloud works then cache them for `ownerKey`. `createWork`, `renameWork`, and `deleteWork` await the cloud operation before changing state/cache. `createWork` calls `createWorkSnapshot`; `renameWork` trims to 60 characters; errors remain available to the UI.

- [ ] **Step 6: Verify GREEN**

Run: `npx vitest run src/services/__tests__/work-repository.test.ts src/hooks/__tests__/useWorks.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/services/work-repository.ts src/services/__tests__/work-repository.test.ts src/hooks/useWorks.ts src/hooks/__tests__/useWorks.test.tsx
git commit -m "feat: add cloud-backed work state"
```

### Task 4: 扩展分享协议，保证作品分享不泄漏创作记录

**Files:**
- Modify: `src/services/share.ts`
- Modify: `src/hooks/useImportShare.ts`
- Modify: `src/hooks/useSessions.ts`
- Modify: `src/services/__tests__/share.test.ts`
- Modify: `src/hooks/__tests__/useOddeNovaImport.test.tsx` or create `src/hooks/__tests__/useImportShare.test.tsx`

**Interfaces:**
- Produces: discriminated `SharePayload` with `{ kind: 'session' | 'work' }`; `uploadWorkShare(work, locale)`; work-share import path.
- Consumes: existing `uploadShare`, `fetchShare`, `sessions.importSession`.

- [ ] **Step 1: Write failing share privacy tests**

```ts
await uploadWorkShare(work, 'zh-CN');
expect(JSON.parse(String(fetch.mock.calls[0][1].body))).toEqual(expect.objectContaining({ kind: 'work', code: work.code }));
expect(String(fetch.mock.calls[0][1].body)).not.toContain(work.record.messages[0].content);
```

- [ ] **Step 2: Run RED**

Run: `npx vitest run src/services/__tests__/share.test.ts`

Expected: FAIL because `uploadWorkShare` does not exist.

- [ ] **Step 3: Implement versioned work-only payload and normal-session import**

Keep legacy session payload parsing compatible. Work shares submit `{ version: 2, kind: 'work', title, code, sharedAt, locale }`. In `useImportShare`, map a work payload to `sessions.importSession({ title, code, messages: [import notice] })`; do not pass or reconstruct a `record`.

- [ ] **Step 4: Add import behavior test before wiring the UI**

```tsx
expect(importSession).toHaveBeenCalledWith(expect.objectContaining({ title: work.title, code: work.code }));
expect(importSession.mock.calls[0][0].messages).toHaveLength(1);
```

- [ ] **Step 5: Verify GREEN**

Run: `npx vitest run src/services/__tests__/share.test.ts src/hooks/__tests__/useImportShare.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/services/share.ts src/hooks/useImportShare.ts src/hooks/useSessions.ts src/services/__tests__/share.test.ts src/hooks/__tests__/useImportShare.test.tsx
git commit -m "feat: share works without creative records"
```

### Task 5: 构建作品库页面、详情和创作导航

**Files:**
- Create: `src/components/WorkLibrary.tsx`
- Create: `src/components/WorkDetail.tsx`
- Create: `src/components/WorkRecord.tsx`
- Create: `src/components/__tests__/WorkLibrary.test.tsx`
- Create: `src/components/__tests__/WorkDetail.test.tsx`
- Modify: `src/components/icons.tsx`
- Modify: `src/lib/i18n.ts`
- Modify: `src/App.tsx`
- Modify: `src/__tests__/App.test.tsx`

**Interfaces:**
- Produces: `WorkLibrary` and `WorkDetail` UI callbacks; App-level `destination: 'creator' | 'works'`.
- Consumes: `Work`, `useWorks`, existing account modal opener, `strudel.play`, `strudel.stop`, `strudel.exportWav`, `uploadWorkShare`, `sessions.importSession`.

- [ ] **Step 1: Write failing component tests**

```tsx
render(<WorkLibrary works={[older, newer]} onOpen={onOpen} onPreview={onPreview} />);
await user.type(screen.getByRole('searchbox'), 'new');
expect(screen.getByText('New work')).toBeVisible();
expect(screen.queryByText('Old work')).toBeNull();

await user.click(screen.getByRole('button', { name: /play/i }));
expect(onPreview).toHaveBeenCalledWith(newer);
```

Add tests that clicking the card opens detail without preview, and that the unauthenticated state invokes the login opener instead of rendering works.

- [ ] **Step 2: Run RED**

Run: `npx vitest run src/components/__tests__/WorkLibrary.test.tsx src/components/__tests__/WorkDetail.test.tsx`

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement focused presentation components**

`WorkLibrary` sorts by `createdAt` descending, filters only `title`, renders deterministic cover CSS from `coverSeed`, and has distinct card and preview buttons. `WorkDetail` owns rename/delete confirmation and delegates WAV export/share to supplied callbacks. `WorkRecord` renders the read-only retained messages plus code; it has no send/edit controls.

- [ ] **Step 4: Wire App destination and actions**

Add fixed `创作`/`作品` navigation to the desktop sidebar header and mobile top nav. `works` destination renders full-workspace library/detail. On authenticated creation, call `works.createWork(currentSession)` only when the current committed code is non-empty. Preview must call the Strudel service with `work.code` without writing session state. `基于此创作` imports a fresh Session with work code and one user-facing starter message, then switches destination to `creator`.

- [ ] **Step 5: Add App integration tests before final styling**

```tsx
await user.click(screen.getByRole('button', { name: /作品/i }));
expect(screen.getByText(/登录后保存作品/)).toBeVisible();

rerenderAuthenticatedApp();
await user.click(screen.getByRole('button', { name: /收藏为作品/i }));
expect(createWork).toHaveBeenCalledWith(currentSession);
```

- [ ] **Step 6: Verify GREEN**

Run: `npx vitest run src/components/__tests__/WorkLibrary.test.tsx src/components/__tests__/WorkDetail.test.tsx src/__tests__/App.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/WorkLibrary.tsx src/components/WorkDetail.tsx src/components/WorkRecord.tsx src/components/__tests__/WorkLibrary.test.tsx src/components/__tests__/WorkDetail.test.tsx src/components/icons.tsx src/lib/i18n.ts src/App.tsx src/__tests__/App.test.tsx
git commit -m "feat: add work library experience"
```

### Task 6: 完整验证与文档同步

**Files:**
- Modify: `docs/frontend-architecture.md`
- Modify: `docs/superpowers/specs/2026-07-18-work-library-design.md` only if implementation reveals a confirmed discrepancy

**Interfaces:**
- Consumes: completed works persistence, API, sharing, UI, and existing test commands.

- [ ] **Step 1: Write and run the final missing regression test before any cleanup**

```ts
it('keeps a work playable after its source session has been deleted', async () => {
  await user.click(deleteSourceSession);
  await user.click(openWork);
  await user.click(previewWork);
  expect(playWorkCode).toHaveBeenCalledWith(work.code);
});
```

- [ ] **Step 2: Run the focused regression suite**

Run: `npx vitest run src/lib/__tests__/work.test.ts src/hooks/__tests__/useWorks.test.tsx src/services/__tests__/work-repository.test.ts tests/api/works.test.ts src/services/__tests__/share.test.ts src/components/__tests__/WorkLibrary.test.tsx src/components/__tests__/WorkDetail.test.tsx`

Expected: PASS.

- [ ] **Step 3: Update architecture documentation**

Document that `useWorks` owns authenticated work state, `public.works` is its cloud authority, and work records have no Session foreign key.

- [ ] **Step 4: Run mandatory repository verification**

Run: `npm test && npm run lint && npm run build && git diff --check`

Expected: all commands exit 0.

- [ ] **Step 5: Manually smoke test**

Run `npm run dev`, sign in, create a work from committed code, refresh, delete its source session, preview it, inspect its record, create a fresh session from it, export WAV, and open its temporary share URL in a logged-out browser context.

- [ ] **Step 6: Commit documentation**

```bash
git add docs/frontend-architecture.md docs/superpowers/specs/2026-07-18-work-library-design.md
git commit -m "docs: describe work library architecture"
```

## Plan Self-Review

- Spec coverage: Tasks 1-3 implement independent authenticated persistence; Task 4 covers the privacy-preserving 30-day share path; Task 5 covers desktop/mobile navigation, browse/detail, preview, export, and fresh creation; Task 6 verifies all accepted behavior.
- Placeholder scan: no deferred implementation markers or generic testing instructions remain.
- Type consistency: `Work` is the shared client/domain/API concept; `record` is always an object containing `messages` and `code`; `kind: 'work'` distinguishes public work shares from legacy session shares.
