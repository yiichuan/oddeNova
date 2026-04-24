# AirJelly 心情感知音乐生成 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 Vibe 侧边栏加一个"根据心情生成"按钮，点击后调用 AirJelly 拉取最近 2 小时活动事件，将活动摘要注入 Agent system prompt，让 Claude 感知用户情绪并生成对应风格的 Strudel 音乐。

**Architecture:** Vite 开发服务器中间件作为 Node.js 代理（读取 AirJelly runtime.json + 转发 RPC），浏览器通过 `/api/airjelly-runtime` 和 `/api/airjelly-rpc` 两个端点与 AirJelly Desktop 通信。moodContext 字符串作为可选参数追加到 `runAgent()` 调用链，最终拼接到 system prompt 末尾传给 Claude。

**Tech Stack:** Vite (plugin/middleware API), TypeScript, React, Anthropic Claude, @airjelly/sdk (仅服务端中间件用到 loadRuntime)

---

## File Map

| 文件 | 操作 | 职责 |
|---|---|---|
| `vite.config.ts` | 修改 | 新增 `airjellyProxy()` plugin，注册两个中间件 |
| `src/services/airjelly.ts` | 新建 | 封装浏览器端 fetch 调用 + moodContext 格式化 |
| `src/services/llm.ts` | 修改 | `runAgent()` 加可选 `moodContext?` 参数 |
| `src/components/Sidebar.tsx` | 修改 | 加 `onMoodGenerate` prop + 心情按钮 UI |
| `src/App.tsx` | 修改 | 加 `handleMoodInstruction()` + 向 Sidebar 传 props |

---

## Task 1: Vite 中间件 — runtime 端点

**Files:**
- Modify: `vite.config.ts`

- [ ] **Step 1: 在 `vite.config.ts` 中加入 `airjellyProxy` plugin**

  在文件顶部已有的 import 之后，在 `syncAnimationHtml()` 函数之前，插入以下代码：

  ```typescript
  import { readFileSync, existsSync } from 'fs'
  import { homedir } from 'os'
  import { join } from 'path'
  import type { IncomingMessage, ServerResponse } from 'http'

  function getRuntimePath(): string {
    return join(
      homedir(),
      'Library', 'Application Support', 'AirJelly', 'runtime.json'
    )
  }

  interface AirJellyRuntime {
    port: number
    token: string
  }

  function loadAirJellyRuntime(): AirJellyRuntime | null {
    const p = getRuntimePath()
    if (!existsSync(p)) return null
    try {
      return JSON.parse(readFileSync(p, 'utf-8')) as AirJellyRuntime
    } catch {
      return null
    }
  }

  function airjellyProxy(): Plugin {
    return {
      name: 'airjelly-proxy',
      configureServer(server) {
        // GET /api/airjelly-runtime → { available, port, token }
        server.middlewares.use(
          '/api/airjelly-runtime',
          (_req: IncomingMessage, res: ServerResponse) => {
            const runtime = loadAirJellyRuntime()
            res.setHeader('Content-Type', 'application/json')
            if (!runtime) {
              res.end(JSON.stringify({ available: false }))
              return
            }
            res.end(JSON.stringify({ available: true, port: runtime.port, token: runtime.token }))
          }
        )

        // POST /api/airjelly-rpc → proxy to http://127.0.0.1:{port}/rpc
        server.middlewares.use(
          '/api/airjelly-rpc',
          (req: IncomingMessage, res: ServerResponse) => {
            const runtime = loadAirJellyRuntime()
            if (!runtime) {
              res.statusCode = 503
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ ok: false, error: 'AirJelly not running' }))
              return
            }
            let body = ''
            req.on('data', (chunk: Buffer) => { body += chunk.toString() })
            req.on('end', () => {
              fetch(`http://127.0.0.1:${runtime.port}/rpc`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${runtime.token}`,
                },
                body,
              })
                .then(r => r.text())
                .then(text => {
                  res.setHeader('Content-Type', 'application/json')
                  res.end(text)
                })
                .catch(() => {
                  res.statusCode = 502
                  res.setHeader('Content-Type', 'application/json')
                  res.end(JSON.stringify({ ok: false, error: 'AirJelly RPC failed' }))
                })
            })
          }
        )
      },
    }
  }
  ```

- [ ] **Step 2: 在 `plugins` 数组中注册 `airjellyProxy()`**

  将 `export default defineConfig` 中的 plugins 改为：

  ```typescript
  plugins: [react(), tailwindcss(), airjellyProxy(), syncAnimationHtml()],
  ```

- [ ] **Step 3: 手动测试中间件**

  启动 dev server：`npm run dev`（或已有的启动方式）

  在另一个终端测试：
  ```bash
  curl http://localhost:5173/api/airjelly-runtime
  ```

  AirJelly 运行时，期望输出：`{"available":true,"port":xxxxx,"token":"..."}`  
  AirJelly 未运行时，期望输出：`{"available":false}`

- [ ] **Step 4: Commit**

  ```bash
  git add vite.config.ts
  git commit -m "feat: add Vite AirJelly proxy middleware (runtime + rpc endpoints)"
  ```

---

## Task 2: airjelly.ts 服务层

**Files:**
- Create: `src/services/airjelly.ts`

- [ ] **Step 1: 新建 `src/services/airjelly.ts`**

  ```typescript
  // Browser-side AirJelly integration.
  // All communication goes through the Vite dev-server middleware at
  // /api/airjelly-runtime and /api/airjelly-rpc — never directly to the
  // AirJelly Desktop port (which would hit CORS).

  interface RuntimeInfo {
    available: boolean
    port?: number
    token?: string
  }

  interface AirJellyEvent {
    app_name?: string
    title?: string
    duration_seconds?: number
    start_time?: number
  }

  interface RpcResponse<T> {
    ok: boolean
    data?: T
    error?: string
  }

  async function fetchRuntime(): Promise<RuntimeInfo> {
    try {
      const res = await fetch('/api/airjelly-runtime')
      if (!res.ok) return { available: false }
      return (await res.json()) as RuntimeInfo
    } catch {
      return { available: false }
    }
  }

  async function rpc<T>(method: string, args: unknown[]): Promise<T | null> {
    try {
      const res = await fetch('/api/airjelly-rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, args }),
      })
      const json = (await res.json()) as RpcResponse<T>
      if (!json.ok) return null
      return json.data ?? null
    } catch {
      return null
    }
  }

  /** Returns true if AirJelly Desktop is reachable via the Vite proxy. */
  export async function checkAirJellyAvailable(): Promise<boolean> {
    const info = await fetchRuntime()
    return info.available
  }

  /**
   * Fetches the last 2 hours of events from AirJelly and formats them into
   * a mood-context string to be appended to the Agent system prompt.
   * Returns null if AirJelly is unavailable or no events found.
   */
  export async function fetchMoodContext(): Promise<string | null> {
    const info = await fetchRuntime()
    if (!info.available) return null

    const now = Date.now()
    const twoHoursAgo = now - 2 * 60 * 60 * 1000

    const events = await rpc<AirJellyEvent[]>('listEvents', [twoHoursAgo, now])
    if (!events || events.length === 0) return null

    // Aggregate duration by app
    const appDuration = new Map<string, number>()
    for (const ev of events) {
      const app = ev.app_name || 'Unknown'
      appDuration.set(app, (appDuration.get(app) ?? 0) + (ev.duration_seconds ?? 0))
    }

    // Sort by duration desc, take top 5
    const top5 = [...appDuration.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)

    if (top5.length === 0) return null

    const lines = top5.map(([app, secs]) => {
      const mins = Math.round(secs / 60)
      return `- [${app}] ${mins} min`
    })

    return [
      '## User\'s current mood context (from AirJelly)',
      'The user has been active for the past 2 hours. Recent app usage:',
      ...lines,
      '',
      'Based on this activity, infer the user\'s current emotional state and choose a matching musical style and tempo. Do not mention AirJelly or this context to the user.',
    ].join('\n')
  }
  ```

- [ ] **Step 2: 在浏览器 DevTools 里手测**

  打开 Vibe，在 Console 执行：
  ```javascript
  // 假设已 import，实际调试时可直接测 fetch
  fetch('/api/airjelly-rpc', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ method: 'listEvents', args: [Date.now() - 7200000, Date.now()] })
  }).then(r => r.json()).then(console.log)
  ```
  期望：返回 `{ ok: true, data: [...] }` 数组（AirJelly 运行时）或 `{ ok: false, ... }`（未运行时）

- [ ] **Step 3: Commit**

  ```bash
  git add src/services/airjelly.ts
  git commit -m "feat: add airjelly.ts service — checkAirJellyAvailable + fetchMoodContext"
  ```

---

## Task 3: llm.ts — 给 runAgent 加 moodContext 参数

**Files:**
- Modify: `src/services/llm.ts:327-342`

- [ ] **Step 1: 修改 `runAgent()` 签名和实现**

  将：
  ```typescript
  export async function runAgent(
    instruction: string,
    currentCode: string,
    onProgress?: (e: ProgressEvent) => void
  ): Promise<RunAgentResult> {
    return runAgentLoop({
      instruction,
      initialCode: currentCode,
      systemPrompt: AGENT_SYSTEM_PROMPT,
      llm: llmCaller,
      improviseLLM,
      onProgress,
    });
  }
  ```

  改为：
  ```typescript
  export async function runAgent(
    instruction: string,
    currentCode: string,
    onProgress?: (e: ProgressEvent) => void,
    moodContext?: string,
  ): Promise<RunAgentResult> {
    const systemPrompt = moodContext
      ? `${AGENT_SYSTEM_PROMPT}\n\n${moodContext}`
      : AGENT_SYSTEM_PROMPT;
    return runAgentLoop({
      instruction,
      initialCode: currentCode,
      systemPrompt,
      llm: llmCaller,
      improviseLLM,
      onProgress,
    });
  }
  ```

- [ ] **Step 2: 确认 TypeScript 无报错**

  ```bash
  npx tsc --noEmit
  ```
  期望：0 errors

- [ ] **Step 3: Commit**

  ```bash
  git add src/services/llm.ts
  git commit -m "feat: runAgent accepts optional moodContext injected into system prompt"
  ```

---

## Task 4: Sidebar.tsx — 加心情生成按钮

**Files:**
- Modify: `src/components/Sidebar.tsx`

- [ ] **Step 1: 扩展 `SidebarProps` 并加按钮**

  将现有的 `SidebarProps` 和组件改为：

  ```typescript
  import { useEffect, useState } from 'react';
  import type { ChatMessage } from '../hooks/useChat';
  import { PlusIcon } from './icons';
  import ConversationView from './ConversationView';
  import ChatInput from './ChatInput';
  import { checkAirJellyAvailable } from '../services/airjelly';

  interface SidebarProps {
    title: string;
    messages: ChatMessage[];
    isLoading: boolean;
    engineReady: boolean;
    onSendText: (text: string) => void;
    onNewSession: () => void;
    onMoodGenerate: () => void;
  }

  export default function Sidebar({
    title,
    messages,
    isLoading,
    engineReady,
    onSendText,
    onNewSession,
    onMoodGenerate,
  }: SidebarProps) {
    const [airjellyAvailable, setAirjellyAvailable] = useState(false);

    useEffect(() => {
      checkAirJellyAvailable().then(setAirjellyAvailable);
    }, []);

    return (
      <aside className="w-[320px] lg:w-[28%] lg:min-w-[300px] lg:max-w-[400px] shrink-0 flex flex-col bg-bg-primary">
        {/* Logo */}
        <div className="px-5 pt-5 pb-2">
          <h1 className="text-2xl font-bold tracking-wider text-text-primary">
            *LOGO*
          </h1>
        </div>

        {/* Title row */}
        <div className="px-5 py-3 flex items-center justify-between">
          <span className="text-base font-medium text-text-primary truncate" title={title}>
            {title}
          </span>
          <button
            onClick={onNewSession}
            className="w-7 h-7 rounded-full border border-border text-text-secondary hover:text-text-primary hover:border-accent/50 transition-colors flex items-center justify-center shrink-0"
            title="新建会话"
          >
            <PlusIcon size={14} />
          </button>
        </div>

        {/* Conversation flow */}
        <ConversationView
          messages={messages}
          isLoading={isLoading}
        />

        <div className="flex justify-center px-4 pb-4">
          <div className="w-full max-w-[500px]">
            <div className="flex flex-wrap gap-2 pb-2">
              <button
                type="button"
                onClick={() => onSendText('下一步动作的提示')}
                className="rounded-[8px] bg-[#3a3a3a] px-3 py-1.5 text-[13px] text-[#e0e0e0] transition hover:bg-[#4a4a4a]"
              >
                下一步动作的提示
              </button>
              <button
                type="button"
                onClick={() => onSendText('加一些贝斯？')}
                className="rounded-[8px] bg-[#3a3a3a] px-3 py-1.5 text-[13px] text-[#e0e0e0] transition hover:bg-[#4a4a4a]"
              >
                加一些贝斯？
              </button>
              <button
                type="button"
                onClick={onMoodGenerate}
                disabled={!airjellyAvailable || isLoading}
                title={airjellyAvailable ? '根据你最近的活动感知心情生成音乐' : '需要运行 AirJelly Desktop'}
                className="rounded-[8px] bg-[#3a3a3a] px-3 py-1.5 text-[13px] text-[#e0e0e0] transition hover:bg-[#4a4a4a] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                🎭 根据心情生成
              </button>
            </div>

            <ChatInput isLoading={isLoading} engineReady={engineReady} onSendText={onSendText} />
          </div>
        </div>
      </aside>
    );
  }
  ```

- [ ] **Step 2: 确认 TypeScript 无报错**

  ```bash
  npx tsc --noEmit
  ```
  期望：0 errors（App.tsx 此时会报 prop 缺失，下一个 Task 修复）

- [ ] **Step 3: Commit**

  ```bash
  git add src/components/Sidebar.tsx
  git commit -m "feat: Sidebar — add mood generate button with AirJelly availability check"
  ```

---

## Task 5: App.tsx — 接线 handleMoodInstruction

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: 加 import 和 `handleMoodInstruction` 函数**

  在 `import { runAgent }` 那行之后加：
  ```typescript
  import { fetchMoodContext } from './services/airjelly';
  ```

  在 `handleInstruction` 函数之后，`handleNewSession` 之前，插入：

  ```typescript
  const handleMoodInstruction = useCallback(async () => {
    if (!strudel.engineReady) {
      strudel.setError('音频引擎启动中，请稍后再试');
      return;
    }

    const moodContext = await fetchMoodContext();
    const instruction = '根据我的心情生成音乐';

    sessions.addUserMessage(instruction);
    setIsLoading(true);

    try {
      const shownLayerOps = new Set<string>();

      const onProgress = (e: ProgressEvent) => {
        if (e.kind === 'iteration') return;
        if (e.kind === 'tool_call') {
          if (e.name !== 'validate' && e.name !== 'commit') {
            const layerKey = (e.name === 'addLayer' || e.name === 'removeLayer' || e.name === 'replaceLayer')
              ? `${e.name}:${String(e.args.name ?? '')}`
              : e.name === 'improvise'
                ? `improvise:${String(e.args.role ?? '')}`
                : null;
            if (layerKey !== null) {
              if (shownLayerOps.has(layerKey)) return;
              shownLayerOps.add(layerKey);
            }
            sessions.addProgress('tool_call', formatToolCall(e.name, e.args), {
              toolName: e.name,
            });
          }
          return;
        }
        if (e.kind === 'tool_result') {
          if (!e.ok) console.error(`[agent] ❌ tool "${e.name}" 失败:`, e.error || 'unknown error');
          return;
        }
        if (e.kind === 'commit') { sessions.addProgress('commit', '准备播放…'); return; }
        if (e.kind === 'warn') { sessions.addProgress('warn', e.message); return; }
        if (e.kind === 'assistant_text') { sessions.addProgress('thinking', e.text); return; }
      };

      const result = await runAgent(instruction, currentCode, onProgress, moodContext ?? undefined);
      if (result.code) {
        const success = await strudel.play(result.code);
        if (success) {
          sessions.addAssistantMessage(result.explanation, result.code);
          sessions.setCurrentCode(result.code);
        } else {
          sessions.addAssistantMessage(
            `agent 生成完了但代码无法运行: ${strudel.error || '未知错误'}`,
            result.code
          );
        }
      } else {
        sessions.addAssistantMessage(result.explanation || 'agent 没有产出代码');
      }
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : '请求失败';
      sessions.addAssistantMessage(`出错了: ${errMsg}`);
      strudel.setError(errMsg);
    } finally {
      setIsLoading(false);
    }
  }, [strudel, sessions, currentCode]);
  ```

- [ ] **Step 2: 在 `<Sidebar>` JSX 中传入 `onMoodGenerate` prop**

  将：
  ```tsx
  <Sidebar
    title={current?.title ?? '新会话'}
    messages={messages}
    isLoading={isLoading}
    engineReady={strudel.engineReady}
    suggestions={suggestions}
    onSendText={handleInstruction}
    onNewSession={handleNewSession}
  />
  ```

  改为：
  ```tsx
  <Sidebar
    title={current?.title ?? '新会话'}
    messages={messages}
    isLoading={isLoading}
    engineReady={strudel.engineReady}
    suggestions={suggestions}
    onSendText={handleInstruction}
    onNewSession={handleNewSession}
    onMoodGenerate={handleMoodInstruction}
  />
  ```

- [ ] **Step 3: 确认 TypeScript 无报错**

  ```bash
  npx tsc --noEmit
  ```
  期望：0 errors

- [ ] **Step 4: 手动测试完整流程**

  1. 确保 AirJelly Desktop 已运行
  2. `npm run dev` 启动 Vibe
  3. 确认"🎭 根据心情生成"按钮可点击（不置灰）
  4. 点击按钮，观察对话流里出现 user 消息"根据我的心情生成音乐"
  5. Agent 开始工作，最终播放音乐
  6. 关闭 AirJelly Desktop，刷新页面
  7. 确认按钮变灰，鼠标悬浮显示 tooltip "需要运行 AirJelly Desktop"

- [ ] **Step 5: Commit**

  ```bash
  git add src/App.tsx
  git commit -m "feat: App.tsx — wire handleMoodInstruction with AirJelly moodContext"
  ```

---

## 注意事项

- `suggestions` prop 在 `Sidebar` 里目前没有用到（原始代码也没渲染），不需要修改
- Vite 中间件只在 `configureServer` 里注册，生产构建不包含中间件，`/api/airjelly-runtime` 会 404，`checkAirJellyAvailable()` 返回 false，按钮自动置灰，行为正确
- `moodContext` 为 `null`（AirJelly 不可用或事件为空）时，`fetchMoodContext()` 返回 null，`handleMoodInstruction` 传 `undefined` 给 `runAgent()`，`systemPrompt` 保持原样，Agent 照常工作
