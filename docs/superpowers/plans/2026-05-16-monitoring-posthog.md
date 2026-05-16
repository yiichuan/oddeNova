# 实施计划：PostHog 监控集成

**日期：** 2026-05-16  
**对应 Spec：** `docs/superpowers/specs/2026-05-16-monitoring-posthog-design.md`  
**预计任务数：** 7

---

## Task 1：安装 posthog-js 依赖

**说明：** `posthog-js` 包含 React 集成（`posthog-js/react`），无需额外安装 `posthog-react`。

```bash
npm install posthog-js
```

**验证：** `package.json` 的 `dependencies` 中出现 `"posthog-js"` 条目。

---

## Task 2：创建 `src/components/ErrorBoundary.tsx`

**说明：** React Error Boundary 类组件。`componentDidCatch` 向 PostHog 上报渲染错误；降级 UI 显示"页面出错了，请刷新"。当 PostHog 未初始化（无 `VITE_POSTHOG_KEY`）时，`posthog.capture()` 静默忽略，无副作用。

**新建文件：** `src/components/ErrorBoundary.tsx`

```tsx
import React from 'react';
import posthog from 'posthog-js';

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  constructor(props: React.PropsWithChildren) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    posthog.capture('$exception', {
      $exception_message: error.message,
      $exception_type: error.name,
      $exception_stack: error.stack,
      component_stack: info.componentStack,
    });
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen gap-3 text-gray-400">
          <p>页面出错了，请刷新重试</p>
          <button
            className="px-4 py-2 border border-gray-600 rounded text-sm hover:bg-gray-800 cursor-pointer"
            onClick={() => window.location.reload()}
          >
            刷新
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

**验证：** `npx tsc --noEmit -p tsconfig.app.json` 无报错。

---

## Task 3：修改 `src/main.tsx`（PostHog 初始化 + 组件包裹）

**说明：** 在 app 入口初始化 PostHog，`VITE_POSTHOG_KEY` 未设置时跳过 `init`（SDK 后续调用静默忽略）。用 `<PostHogProvider>` + `<ErrorBoundary>` 包裹 `<App />`。

**当前代码（完整文件）：**
```tsx
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { loadEditorPreferences } from './lib/editor-preferences'

loadEditorPreferences()

createRoot(document.getElementById('root')!).render(<App />)
```

**修改后：**
```tsx
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { loadEditorPreferences } from './lib/editor-preferences'
import posthog from 'posthog-js'
import { PostHogProvider } from 'posthog-js/react'
import ErrorBoundary from './components/ErrorBoundary'

const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined

if (POSTHOG_KEY) {
  posthog.init(POSTHOG_KEY, {
    api_host: (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? 'https://us.i.posthog.com',
    autocapture: false,
    capture_pageview: true,
    persistence: 'localStorage',
  })
}

loadEditorPreferences()

createRoot(document.getElementById('root')!).render(
  <PostHogProvider client={posthog}>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </PostHogProvider>
)
```

**验证：** 页面正常渲染，DevTools console 无报错。

---

## Task 4：修改 `src/App.tsx`（Agent 生命周期事件）

**说明：** `handleInstruction` 和 `handleMoodInstruction` 两处 `runAgent` 调用，各需添加 4 个事件埋点。在文件顶部加 `import posthog from 'posthog-js'`。

**需要修改的代码模式（两处 `runAgent` 块结构相同，下面用 `handleInstruction` 为例）：**

### 4a. 顶部导入（加一行）

在现有 imports 末尾添加：
```tsx
import posthog from 'posthog-js'
```

### 4b. `handleInstruction` 中的 4 个埋点

**① `agent_run_started`**（`runAgent` 调用前）：
```tsx
      // 在此行之前插入：
      const result = await runAgent(text, currentCode, onProgress, undefined, signal);
```
插入：
```tsx
      posthog.capture('agent_run_started', { session_id: sessionId });
      const result = await runAgent(text, currentCode, onProgress, undefined, signal);
```

**② `agent_run_aborted`**（`signal.aborted` 分支）：
```tsx
        if (signal.aborted) {
          sessions.addAssistantMessage('已中断', undefined, sessionId);
          return;
        }
```
改为：
```tsx
        if (signal.aborted) {
          posthog.capture('agent_run_aborted', { session_id: sessionId });
          sessions.addAssistantMessage('已中断', undefined, sessionId);
          return;
        }
```

**③ `agent_run_succeeded`**（result 存在，在 `if (result.code) {...} else {...}` 块结束之后、`finally` 之前）：

在 `} else {` / `sessions.addAssistantMessage(result.explanation || ...` 这行之后插入：
```tsx
        posthog.capture('agent_run_succeeded', { session_id: sessionId });
```

**④ `agent_run_failed` / `agent_run_aborted`**（`catch` 块）：
```tsx
      } catch (e: unknown) {
        if (isUserAbort(e, signal)) {
          sessions.addAssistantMessage('已中断', undefined, sessionId);
        } else {
          const errMsg = e instanceof Error ? e.message : '请求失败';
          sessions.addAssistantMessage(`出错了: ${errMsg}`, undefined, sessionId);
          strudel.setError(errMsg);
        }
      }
```
改为：
```tsx
      } catch (e: unknown) {
        if (isUserAbort(e, signal)) {
          posthog.capture('agent_run_aborted', { session_id: sessionId });
          sessions.addAssistantMessage('已中断', undefined, sessionId);
        } else {
          const errMsg = e instanceof Error ? e.message : '请求失败';
          posthog.capture('agent_run_failed', { session_id: sessionId, error_message: errMsg });
          sessions.addAssistantMessage(`出错了: ${errMsg}`, undefined, sessionId);
          strudel.setError(errMsg);
        }
      }
```

> **注意：** `handleMoodInstruction` 中同样有 `runAgent` 调用，结构相同，施同等改动。

**验证：** `npx tsc --noEmit -p tsconfig.app.json` 无报错；`npm run lint` 无报错。

---

## Task 5：修改 `src/hooks/useSessions.ts`（`session_created` 事件）

**说明：** 在两处真正调用 `makeEmptySession()` 并持久化新会话的地方发送事件：
1. 初始 `useEffect`（页面加载时的首个会话）
2. `newSession()` 中实际创建 fresh session 的分支（不包括复用 existingEmpty 的情况）

在文件顶部加：
```tsx
import posthog from 'posthog-js'
```

**5a. 初始 useEffect 中：**
```tsx
      // 每次启动/刷新都创建新会话
      const fresh = makeEmptySession();
      await dbPutSession(fresh);
      setSessions([fresh, ...loaded]);
      setCurrentId(fresh.id);
```
改为：
```tsx
      // 每次启动/刷新都创建新会话
      const fresh = makeEmptySession();
      await dbPutSession(fresh);
      posthog.capture('session_created');
      setSessions([fresh, ...loaded]);
      setCurrentId(fresh.id);
```

**5b. `newSession()` 函数中创建 fresh session 的分支：**
```tsx
      const fresh = makeEmptySession();
      setCurrentId(fresh.id);
      dbPutSession(fresh);
      return [fresh, ...prev];
```
改为：
```tsx
      const fresh = makeEmptySession();
      setCurrentId(fresh.id);
      dbPutSession(fresh);
      posthog.capture('session_created');
      return [fresh, ...prev];
```

**验证：** TypeScript 无报错。

---

## Task 6：修改 `src/components/ExportPopover.tsx`（`export_wav_completed` 事件）

**说明：** `handleExport` 当前丢弃了 `onExport` 的返回值（`boolean`）。捕获它，`true` 时上报成功事件，`false` 时上报失败事件。

在文件顶部加：
```tsx
import posthog from 'posthog-js'
```

**当前：**
```tsx
  const handleExport = async () => {
    if (!canExport) return;
    await onExport({
      filename: filename.trim() || filenamePlaceholder,
      beginCycle,
      endCycle,
      sampleRate,
    });
  };
```

**改为：**
```tsx
  const handleExport = async () => {
    if (!canExport) return;
    const success = await onExport({
      filename: filename.trim() || filenamePlaceholder,
      beginCycle,
      endCycle,
      sampleRate,
    });
    if (success) {
      posthog.capture('export_wav_completed');
    }
  };
```

**验证：** TypeScript 无报错；导出流程不受影响（`success` 为 `false` 时 `exportState.status` 已由父组件设为 `'error'`，UI 已有错误展示）。

---

## Task 7：环境变量配置文件

### 7a. 创建 `.env.example`（提交 git）

**新建文件：** `.env.example`

```
# PostHog 监控配置（可选）
# 本地开发不填则不上报，Vercel 部署时在 Dashboard 填入真实值
VITE_POSTHOG_KEY=
VITE_POSTHOG_HOST=https://us.i.posthog.com
```

### 7b. 检查 `.gitignore`

确认 `.gitignore` 中已有 `.env*.local` 或 `.env.production` 的忽略规则。若没有，追加：
```
.env.production
```

**注意：** Vercel 部署时通过 **Dashboard → Project Settings → Environment Variables** 注入 `VITE_POSTHOG_KEY`，不需要上传 `.env.production` 文件。

**验证：** `git status` 看不到 `.env.production`（若已创建该文件）。

---

## 最终验证

```bash
npm run lint && npx tsc --noEmit -p tsconfig.app.json && npm test
```

全部通过，提交。

---

## 后续配置（不在代码改动范围内）

1. 登录 [posthog.com](https://posthog.com) 注册账号，创建 Project，获取 `POSTHOG_KEY`
2. 在 Vercel Dashboard → Environment Variables 中填入 `VITE_POSTHOG_KEY`
3. 重新部署后，在 PostHog Events 面板验证 6 个事件是否正常上报
