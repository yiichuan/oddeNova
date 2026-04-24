# Demo Mode 设计文档

**日期：** 2026-04-24  
**状态：** 已批准

## 背景与目标

为演示场景提供一种"预设剧本"模式，绕过真实 LLM 调用，但保持完整的 agent 进度动画和音乐播放效果。支持两种演示场景：

- **场景1**：从空白开始，连续点击3次自动提示词，递进式构建同一首曲子
- **场景2**：输入框预填一段长提示词，发送后生成预设最终代码

## 激活方式

URL 参数 `?demo=true`。`isDemoMode()` 函数在客户端检测 `window.location.search`，普通访问不受任何影响。

## 架构：新增 `src/demo/` 模块

```
src/demo/
  demo-config.ts   — 演示数据（提示词 + Strudel 代码）
  demo-llm.ts      — 实现 LLMCaller 接口的剧本 LLM
```

### `demo-config.ts`

导出内容：

```ts
export function isDemoMode(): boolean

// 场景1：3个递进提示词，每个对应一段累积 Strudel 代码
export const DEMO_SCENARIO_1: Array<{ prompt: string; code: string }>

// 场景2：预填长提示词 + 最终 Strudel 代码
export const DEMO_SCENARIO_2: { prefill: string; code: string }
```

`DEMO_SCENARIO_1` 中的 `code` 是**累积代码**（每轮包含前几轮的所有 layer），而非增量 diff。

### `demo-llm.ts`

实现 `LLMCaller` 接口（来自 `src/agent/loop.ts`）：

```ts
export function createDemoLLMCaller(targetCode: string): LLMCaller
```

- 每次调用 `runAgent` 时创建新实例，内部 `step` 计数器从 0 开始
- `chatWithTools()` 按步骤返回预设工具调用序列：
  - step 0：`{ tool_calls: [{ name: 'addLayer', arguments: '{"name":"drum","code":"..."}' }] }`
  - step 1：`{ tool_calls: [{ name: 'commit', arguments: '{"code":"<targetCode>"}' }] }`
- 工具调用序列固定为两步（addLayer → commit），保证进度动画可见且流程简洁
- `targetCode` 由调用方根据 instruction 匹配 `DEMO_SCENARIO_1` 或 `DEMO_SCENARIO_2` 后传入

## `App.tsx` 改动（最小化）

### 1. LLM 替换

```ts
// handleInstruction 中
const llmToUse = isDemoMode()
  ? createDemoLLMCaller(resolvedDemoCode(text))
  : llmCaller;

await runAgent({ ..., llm: llmToUse });
```

`resolvedDemoCode(text)` 是一个纯函数：在 `DEMO_SCENARIO_1` 中按 prompt 精确匹配找到对应 `code`；若无匹配则返回 `DEMO_SCENARIO_2.code`。

### 2. 自动提示词

`useSuggestions` 正常调用（React hook 不可条件调用），但结果被覆盖：

```ts
const _suggestions = useSuggestions({ key, currentCode, hasUserMessages, messages });
const suggestions = isDemoMode()
  ? DEMO_SCENARIO_1.map(s => s.prompt)
  : _suggestions;
```

demo 模式下固定显示场景1的3个提示词，`useSuggestions` 的 LLM 请求仍会发出但结果被丢弃。若希望避免无效请求，可在 `useSuggestions` 内部增加 `isDemoMode()` 短路，但这属于可选优化，不在本次范围内。

### 3. 输入框预填（场景2）

`ChatInput` 新增可选 prop `prefill?: string`。组件内用 `useEffect` 在 `prefill` 首次非空时 `setText(prefill)`，之后不再干预（用户可自由编辑）。

App 传入：

```ts
prefill={isDemoMode() ? DEMO_SCENARIO_2.prefill : undefined}
```

## 数据流

```
URL ?demo=true
        ↓
isDemoMode() === true
        ↓
Suggestions → DEMO_SCENARIO_1[0..2].prompt（固定3个）
ChatInput   → 预填 DEMO_SCENARIO_2.prefill
        ↓
用户点击提示词 or 手动发送
        ↓
handleInstruction(text)
  resolvedDemoCode(text) → targetCode
  createDemoLLMCaller(targetCode)
        ↓
runAgent({ llm: demoLLMCaller })
  step 0: addLayer tool call → 进度动画显示
  step 1: commit(targetCode) → 音乐播放
```

## 不改动的部分

- `src/agent/loop.ts` — 不做任何修改
- `src/agent/tools.ts` — 不做任何修改
- `src/services/llm.ts` — 不做任何修改（`llmCaller` 对象保持不变）
- 所有其他 hooks 和组件

## 边界条件

- demo 模式下，`improviseLLM` 不会被调用（`demoLLMCaller` 不触发 `improvise` 工具）
- 若用户在 demo 模式下修改了预填文本后发送，`resolvedDemoCode` 无法匹配时回落到 `DEMO_SCENARIO_2.code`
- 场景1的3个提示词点完后，再次点击任意提示词仍会触发演示（循环匹配或回落到场景2代码）
