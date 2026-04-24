# AirJelly 心情感知音乐生成 — 设计文档

**日期：** 2026-04-24  
**状态：** 已批准

---

## 背景

Vibe 是一个基于 Strudel + Claude Agent 的 AI 音乐生成应用。用户用自然语言描述音乐，Agent 调用工具组装 Strudel 代码并播放。

AirJelly 是一个桌面端的个人活动记录工具，能记录用户使用了哪些 App、做了什么事、时长多少。其 SDK `@airjelly/sdk` 暴露了 `getEventsByDate()` 等方法，可拉取最近若干小时的活动事件。

本功能的目标：**结合 AirJelly 感知用户当前情绪，自动生成与情绪匹配的 Strudel 音乐。**

---

## 核心设计决策

| 问题 | 决策 | 理由 |
|---|---|---|
| 触发时机 | 显式触发（用户点击按钮） | 可控、透明，AirJelly 不在线时可优雅降级 |
| 情绪推断方式 | 将原始事件摘要交给 LLM 推断 | 规则脆弱，LLM 上下文感知更准确，成本可忽略 |
| AirJelly 不可用时 | 按钮置灰 + tooltip 提示 | 保留功能可见性，不干扰正常使用 |

---

## 技术约束

`@airjelly/sdk` 的 `createClient()` 无参调用时依赖 Node.js `fs` 模块读取 `~/Library/Application Support/AirJelly/runtime.json`，**浏览器环境不可用**。

**解法：Vite 开发服务器中间件**
- `/api/airjelly-runtime`：由 Node.js 端读取 runtime.json，返回 `{ available, port, token }`
- `/api/airjelly-rpc`：将浏览器请求代理到 `http://127.0.0.1:{port}/rpc`，解决 CORS

浏览器端只调用这两个本地端点，不直接依赖 SDK 或 AirJelly Desktop。

---

## 架构

```
用户点击"根据心情生成"
  │
  ▼
App.tsx: handleMoodInstruction()
  │
  ▼
airjelly.ts: fetchMoodContext()
  ├── GET /api/airjelly-runtime  → { available, port, token }
  │   （available=false 时返回 null，不继续）
  └── POST /api/airjelly-rpc
        body: { method: "listEvents", args: [now-7200000, now] }
        └── events[]
              └── 聚合 + 格式化 → moodContext 字符串
  │
  ▼
runAgent("根据我的心情生成音乐", currentCode, onProgress, moodContext)
  │
  ▼
llm.ts: systemPrompt = AGENT_SYSTEM_PROMPT + "\n\n" + moodContext
  │
  ▼
runAgentLoop()  →  Claude 感知情绪 → 生成 Strudel 代码
```

---

## 改动文件（共 4 个）

### 1. `vite.config.ts`

新增 Vite 插件 `airjellyProxy()`，注册两个服务器中间件：

**`GET /api/airjelly-runtime`**
- 读取 `~/Library/Application Support/AirJelly/runtime.json`（macOS 路径；Windows/Linux 同 SDK 逻辑）
- 成功：返回 `{ available: true, port: number, token: string }`
- 失败（文件不存在 / AirJelly 未运行）：返回 `{ available: false }`

**`POST /api/airjelly-rpc`**（转发代理）
- 从 runtime.json 读取 `port` 和 `token`
- 将请求体原样转发到 `http://127.0.0.1:{port}/rpc`，附上 `Authorization: Bearer {token}`
- 将响应原样返回浏览器

---

### 2. `src/services/airjelly.ts`（新建）

**职责：** 封装对 Vite 中间件端点的调用，格式化 moodContext。

```typescript
// 检查 AirJelly 是否可用
export async function checkAirJellyAvailable(): Promise<boolean>

// 拉取最近 2 小时活动，格式化为 moodContext 字符串
// AirJelly 不可用时返回 null
export async function fetchMoodContext(): Promise<string | null>
```

**moodContext 格式：**
```
## User's current mood context (from AirJelly)
The user has been active for the past 2 hours. Recent activity summary:
- [VS Code] Coding session — 87 min
- [Figma] Reviewing UI designs — 23 min
- [Safari] Light browsing — 10 min

Based on this activity, infer the user's emotional state and choose a matching musical style and tempo. Do not mention AirJelly or this context to the user.
```

**格式化规则：**
- 拉取最近 2 小时事件（`now - 7200000` 到 `now`）
- 按 `app_name` 聚合 `duration_seconds`，取前 5 条
- 每条：`- [{app_name}] {title 前 40 字符} — {分钟}min`
- 如果事件列表为空，返回 null（不注入无意义的上下文）

---

### 3. `src/services/llm.ts`

`runAgent()` 加可选第 4 参数 `moodContext?: string`：

```typescript
export async function runAgent(
  instruction: string,
  currentCode: string,
  onProgress?: (e: ProgressEvent) => void,
  moodContext?: string,   // ← 新增
): Promise<RunAgentResult>
```

当 `moodContext` 不为 null/undefined 时，将其追加到 `AGENT_SYSTEM_PROMPT` 末尾后传入 `runAgentLoop`。

---

### 4. `src/components/Sidebar.tsx`

**新增 prop：**
```typescript
onMoodGenerate?: () => void;   // 点击"根据心情生成"的回调
airjellyAvailable?: boolean;   // 控制按钮是否可用
```

**新增按钮**（与现有两个按钮同行）：
- 文案："🎭 根据心情生成"
- `airjellyAvailable=false` 时：`disabled`，`title="需要运行 AirJelly Desktop"`，视觉置灰
- 点击时进入 `isLoading`（与现有 loading 状态共用）

**可用性检测：** `Sidebar` mount 时调一次 `checkAirJellyAvailable()`，结果存入本地 state，不重复请求。

---

### App.tsx

新增 `handleMoodInstruction()` 函数：
1. 调 `fetchMoodContext()` 拿到 `moodContext`（可能为 null）
2. 调 `runAgent("根据我的心情生成音乐", currentCode, onProgress, moodContext ?? undefined)`
3. 其余逻辑与 `handleInstruction()` 完全一致

---

## 降级行为

| 场景 | 行为 |
|---|---|
| AirJelly Desktop 未运行 | 按钮置灰，tooltip 提示；`checkAirJellyAvailable()` 返回 false |
| runtime.json 可读但 RPC 超时 | `fetchMoodContext()` 返回 null，以无 moodContext 继续生成 |
| events 列表为空 | `fetchMoodContext()` 返回 null，以无 moodContext 继续生成 |
| 生产构建（Vite 中间件不生效） | 中间件仅在 dev server 注册，生产环境 `checkAirJellyAvailable()` 会 fetch 失败，视为不可用 |

---

## 不在范围内

- 生产环境支持（本功能面向本地开发/黑客松演示场景）
- 手动情绪选择器备选方案
- 记忆/任务数据的读取（仅使用 `listEvents`）
- AirJelly 事件的持久化存储
