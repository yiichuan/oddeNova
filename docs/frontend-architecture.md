# oddeNova 前端架构导览

**面向：** 后端开发者 / vibe coders  
**目标：** 理解项目结构，能自信地新增功能、改 UI，不搞坏核心音频/AI 逻辑  
**更新：** 2026-05-16

---

## 快速定位

```
src/
├── main.tsx              # 应用入口（PostHog、渲染根节点）
├── App.tsx               # 根组件，协调所有核心逻辑
├── components/           # UI 组件（纯展示/交互）
├── hooks/                # 状态钩子（useStrudel、useSessions 是核心）
├── services/             # 外部系统对接（LLM、音频引擎、语音）
├── agent/                # AI Agent 内部逻辑（loop、tools、parser、executor）
├── lib/                  # 工具库（IndexedDB、采样白名单、soundfont）
├── prompts/              # 系统提示词
└── demo/                 # Demo 模式配置
```

---

## 架构全景

```
用户输入（ChatInput）
    │
    ▼
App.tsx handleInstruction()
    │
    ├── sessions.addUserMessage()   → useSessions（IndexedDB 持久化）
    │
    ├── services/llm.ts runAgent()
    │       │
    │       └── agent/loop.ts runAgentLoop()
    │               │
    │               ├── LLMCaller.chatWithTools()  → Claude / DeepSeek API
    │               │
    │               └── agent/executor.ts dispatchToolCall()
    │                       │
    │                       └── agent/tools.ts TOOLS[name].handler()
    │                               │
    │                               └── CommitSignal(code) ──┐
    │                                                         │
    ◀─────────────── result.code ◀───────────────────────────┘
    │
    ├── strudel.play(result.code)   → services/strudel.ts（音频引擎）
    │
    └── sessions.addAssistantMessage()  → UI 更新
```

---

## 核心模块详解

### 1. `src/hooks/useStrudel.ts` — 音频引擎钩子

**职责：** 包装 `strudelService` 单例，给 React 提供响应式状态。

| 方法 / 属性 | 用途 |
|---|---|
| `state.engineReady` | 音频是否可用（初始化异步） |
| `state.isPlaying` | 当前是否在播放 |
| `state.code` | 编辑器当前代码 |
| `play(code?)` | 播放，可选传代码 |
| `stop()` | 停止 |
| `setCode(code)` | 仅更新代码，不播放 |
| `undo()` | 回退到上一版代码并播放 |
| `exportWav(...)` | WAV 离线导出 |

**规则：**
- **不要** 在组件里直接 `import strudelService`，一律通过 `useStrudel()` 钩子访问
- **不要** 用 `new AudioContext()` — 音频 context 由 superdough 管理

---

### 2. `src/hooks/useSessions.ts` — 会话状态钩子

**职责：** 管理多会话列表，持久化到 IndexedDB（`src/lib/session-storage.ts`），IndexedDB 不可用时自动降级到内存。

**核心数据结构：**
```ts
interface Session {
  id: string;
  title: string;
  messages: ChatMessage[];  // user / assistant / progress
  code: string;             // 最后一次成功的代码
  createdAt: number;
  updatedAt: number;
}
```

| 方法 | 用途 |
|---|---|
| `currentSession` | 当前激活会话 |
| `sessions` | 全部会话列表 |
| `addUserMessage(text)` | 添加用户消息 |
| `addAssistantMessage(text, code?)` | 添加 AI 回复 |
| `addProgress(kind, text)` | 添加流式进度消息（thinking / tool_call 等） |
| `setCurrentCode(code)` | 更新当前会话的代码 |
| `newSession()` | 创建新会话（若已有空会话则复用） |
| `switchSession(id)` | 切换到指定会话 |

---

### 3. `src/agent/` — AI Agent 内部

```
agent/
├── loop.ts      # Agent 主循环（LLM 调用 → tool dispatch → 终止判断）
├── executor.ts  # 单个 tool call 的分发 + 重试逻辑
├── tools.ts     # TOOLS 数组：8 个工具定义（addLayer、commit 等）
└── parser.ts    # 解析 Strudel 代码为结构化 score（纯函数）
```

**工具列表（agent/tools.ts 中的 TOOLS）：**

| 工具名 | 功能 |
|---|---|
| `addLayer` | 新增一个声部 |
| `removeLayer` | 删除指定声部 |
| `replaceLayer` | 替换整个声部 |
| `applyEffect` | 修改效果参数 |
| `setTempo` | 修改 BPM |
| `getScore` | 读取当前代码结构（不修改） |
| `validate` | 语法校验 |
| `improvise` | 调用第二个 LLM 生成代码片段 |
| `commit` | 提交最终代码（抛出 CommitSignal 终止循环） |

> **注意：** `CommitSignal` 是用异常（throw）来控制循环终止的，不是 bug——这是刻意设计的控制流。

---

### 4. `src/services/` — 外部系统对接

| 文件 | 职责 |
|---|---|
| `strudel.ts` | 封装 Strudel 音频引擎为单例 `strudelService` |
| `llm.ts` | LLM 客户端管理（Anthropic SDK / OpenAI SDK 双 provider），`runAgent()` 入口 |
| `llm-config.ts` | 模型配置（provider、baseURL、model），用户 API key 存 localStorage |
| `airjelly.ts` | AirJelly 心情采集接口（可选功能，失败不影响主流程） |
| `speech.ts` | 语音识别（Web Speech API） |
| `suggestions.ts` | 建议词条生成（基于当前会话上下文） |

---

### 5. `src/components/` — UI 组件

| 组件 | 职责 |
|---|---|
| `Sidebar.tsx` | 左侧面板（对话 + 输入区），是主要交互区域 |
| `ConversationView.tsx` | 消息列表渲染 |
| `ChatInput.tsx` | 输入框 + 发送按钮 |
| `CodePanel.tsx` | 代码编辑器（Strudel CodeMirror） |
| `VizPlaceholder.tsx` | 右侧可视化占位区 |
| `ExportPopover.tsx` | WAV 导出弹窗 |
| `HistoryPanel.tsx` | 历史会话面板 |
| `ApiKeyModal.tsx` | API Key 配置弹窗（首次使用时弹出） |
| `SuggestionChips.tsx` | 建议提示词标签 |
| `VoiceButton.tsx` | 语音输入按钮 |

---

## 常见改动场景

### 场景 A：改 UI 样式

直接编辑对应 `src/components/*.tsx`，使用 Tailwind CSS 类名。改样式不涉及状态，最安全。

```tsx
// 例：修改按钮颜色
<button className="bg-blue-600 hover:bg-blue-700 ...">
```

### 场景 B：在对话区新增一种消息类型

1. 在 `src/hooks/useChat.ts` 的 `ProgressKind` 类型加新值
2. 在 `src/hooks/useSessions.ts` 的 `addProgress()` 调用处传新 kind
3. 在 `src/components/ConversationView.tsx` 加对应渲染分支

### 场景 C：给 Agent 增加新工具

1. 在 `src/agent/tools.ts` 的 `TOOLS` 数组末尾追加新的 `ToolDef` 对象  
   - 必须有 `name`、`description`、`parameters`（OpenAI function schema）、`handler`
2. `handler(args, ctx)` 里：`ctx.state.code` 是当前代码，`ctx.state.finalCode` 是已 commit 的代码
3. 工具需要终止循环时，抛出 `new CommitSignal(code)`
4. 不需要修改 `loop.ts` 或 `executor.ts`——它们自动识别新工具

```ts
// 最小工具示例
{
  name: 'my_tool',
  description: '描述这个工具做什么',
  parameters: {
    type: 'object',
    properties: {
      value: { type: 'string', description: '...' },
    },
    required: ['value'],
  },
  handler: async (args, ctx) => {
    const { value } = args as { value: string };
    // 修改 ctx.state.code ...
    return { ok: true, data: { message: '完成' } };
  },
}
```

### 场景 D：新增一个外部 API 对接

1. 在 `src/services/` 新建 `yourService.ts`，模仿 `airjelly.ts` 的结构
2. 在 `App.tsx` 或对应 hook 里调用，**失败时 catch 并降级**（不要让外部 API 崩溃整个页面）

### 场景 E：新增持久化字段

在 `src/lib/session-storage.ts` 的 IndexedDB schema 里加字段，同时在 `useSessions.ts` 的 `Session` 接口和 `makeEmptySession()` 加默认值。**记得处理旧数据没有该字段的情况**（用 `?? defaultValue`）。

---

## 状态流转规则

```
用户输入 ──► App.tsx ──► useSessions（持久化）
                  │
                  ├──► useStrudel（音频，内存状态）
                  │
                  └──► services/llm runAgent（纯函数，无 React 状态）
```

**关键约定：**

- `useSessions` = 唯一的持久化状态，所有会话数据从这里读写
- `useStrudel` = 音频状态（不持久化），切换会话时会从 `session.code` 恢复
- `App.tsx` = 唯一真正调用 `runAgent` 的地方；components 通过 props/callbacks 向上传递意图，不直接调 LLM
- **组件不持有业务状态**：组件只负责渲染和上报事件，状态在 hooks 里

---

## 禁止事项（避免踩坑）

| 禁止 | 原因 |
|---|---|
| 从 `superdough/*` 深路径导入 | 破坏模块单例，导致导出 WAV 缺效果（lint 规则已阻断） |
| `new AudioContext()` | 会产生游离 context，与 superdough 管理的 context 冲突 |
| 在组件里直接 import `strudelService` | 绕过 `useStrudel` 响应式层，状态不同步 |
| 在组件里直接调用 `runAgent` | 破坏 abort 控制、loading 状态管理 |
| 把 `AudioContext` 存到 React state | 它是单例，多余且危险 |

---

## 开发工作流

```bash
npm run dev          # 启动开发服务器（热更新）
npm run lint         # ESLint 检查
npx tsc --noEmit -p tsconfig.app.json   # TypeScript 类型检查
npm test             # Vitest 单元测试

# 提交前自动运行（husky pre-commit hook）：tsc + lint + test
```

**改完代码后，运行：**
```bash
npm run lint && npx tsc --noEmit -p tsconfig.app.json
```
两者都通过再提交。TypeScript 严格模式会帮你发现大部分逻辑错误，比单靠直觉安全得多。
