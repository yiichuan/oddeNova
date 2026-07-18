# setCode 进度说明（explanation）设计

## 背景与问题

agent loop 每次编辑代码都会调用 `setCode`（其契约是**每次重写整段脚本**），
一次作曲常见十几到二十几次 setCode。当前进度区把每次 setCode 渲染成原始
JSON 前缀（[App.tsx `formatToolCall`](../../../src/App.tsx) 取参数 JSON 前 60
字符），例如：

```
⚙ setCode({"code":"// Avicii Tribute - 2016 Golden Days | BPM: 126\nse)
```

用户看不懂每一步在做什么。理想效果（见需求截图）是：每次 setCode 前面先有一条
persona 口吻的自然语言叙述，说明这步在做什么，再跟着原始的齿轮行。

截图里那条叙述目前来自**模型的自由正文**（`assistant_text`），与 setCode 在同一
轮里，所以天然"先消息、后齿轮行"。但模型**不保证每次都写正文**——lo-fi 那次 25
连发就完全没写，只剩 25 行光秃秃的 JSON。因此需要一个可靠机制强制每步都有说明。

## 目标

每次 `setCode` 在进度区呈现为：

1. 一条带 persona 头像的 **assistant 叙述消息**（persona 口吻，一句话现在进行时
   说明**当前这步**在做什么）；
2. 紧跟其后的原始 `⚙ setCode({"code":...})` 齿轮行（保持不变）。

## 非目标

- **不减少 setCode 的调用次数**。25 连发仍是 25 组（消息 + 齿轮行）。让"改一个
  滤波器就 setCode 一次"的碎步变少是另一个需求（prompt 引导），不在本设计内。
- 不改 `commit.explanation` 的行为。
- 不改齿轮行本身的 JSON 展示。

## 方案

沿用已有的 `commit.explanation` 成熟范式：给 `setCode` 增加一个**必填**的
`explanation` 参数，由模型填写，客户端把它渲染成 assistant 消息。

### 变量命名

统一用 `explanation`（不用 `note`）。理由：与 `commit.explanation` 意图一致
（都是"一句话向用户解释这次改动"），模型已习得该字段语义，零成本迁移，工具套件
命名一致。两处**都用 persona 口吻**，区别仅在**粒度**：

| 字段 | 时机 | 口吻 | 粒度 |
|---|---|---|---|
| `setCode.explanation` | 每一步改动 | persona | 当前这步在做什么（进行时、简短，一会话多条） |
| `commit.explanation` | 会话收尾 | persona | 整体改动的一句话总结（一会话一条） |

## 落地改动（5 处）

### 1. 工具 schema — `src/agent/tools.ts`

- `setCode.parameters.properties` 增加 `explanation: { type: 'string', ... }`，
  并把 `required` 改为 `['code', 'explanation']`。
- 中英双语 schema 描述（`TOOL_SCHEMAS_ZH` / `TOOL_SCHEMAS_EN`）为 `explanation`
  补 param 描述，强调："【必填】persona 口吻、一句话现在进行时说明**当前这步
  setCode** 在做什么，会作为进度消息展示给用户。"
- handler **不动**：`explanation` 纯展示用，不参与 code 规范化 / 解析 / 返回值。

### 2. 进度渲染 — `src/App.tsx` `makeAgentProgressHandler`

`tool_call` 分支里，当 `e.name === 'setCode'` 且 `e.args.explanation` 存在：

1. **先** `sessions.addAssistantMessage(explanation, undefined, sessionId)`
   —— 渲染成带 persona 头像的 assistant 消息（与现有 `assistant_text` 叙述同款
   role: 'assistant'，渲染路径一致）。
2. **再**照常 `sessions.addProgress('tool_call', formatToolCall(e.name, e.args),
   { toolName: e.name, sessionId })` —— 齿轮行不变。

`tool_call` 事件已携带完整 `parsedArgs`（[loop.ts](../../../src/agent/loop.ts)
`onProgress?.({ kind: 'tool_call', name, args: parsedArgs })`），`explanation`
可直接取用。

### 3. `formatToolCall` — `src/App.tsx`

**不变**。齿轮行仍显示 JSON 前 60 字符前缀。

### 4. System prompt — `src/prompts/versions/v21.ts`（原地改）

V21 是当前 active、在编的 NOVA-90 talk-mode 版本，直接原地改，不新建 v22。补一条
引导：

- 每次调用 `setCode` 都要在 `explanation` 里以 persona 口吻、一句话现在进行时
  说明本步改动。
- 这条说明写进 `explanation`，**不要再在自由正文里重复叙述**（否则一步会出现
  两条 assistant 消息）。
- 点明与 `commit.explanation` 的粒度区别：setCode 是逐步进度，commit 是最终总结；
  两处都 persona 口吻。
- 中英双语同步。

### 5. 测试 — `src/agent/__tests__/tools.test.ts`

- setCode handler 现有测试仍应通过（`explanation` 被 handler 忽略，不影响返回的
  `layers` / `bpm`）。
- 补断言：setCode schema 的 `required` 含 `explanation`，`properties` 含
  `explanation` 字段。

## 已知取舍

- **防重复靠 prompt**：`explanation` 走参数后，需靠 V21 引导模型别再写重复的自由
  正文，否则一步两条 assistant 消息。这是软约束；若实测仍双显，再考虑硬处理。
- **多步场景较长**：每步一条 persona 消息 + 一条齿轮行；25 连发会变成 25 组。这是
  "每步都要文字说明"的必然代价，与减少步数解耦。

## 验收标准

1. 单次 setCode 的作曲：进度区先出现一条 persona 头像的叙述消息，再出现齿轮行。
2. 多步 setCode：每步都有对应叙述消息（不再有无说明的裸 JSON 行）。
3. 模型未按预期填 `explanation` 属异常（required 应拦住）；齿轮行始终存在。
4. `npm run build`、`npm test`、`npm run lint` 全绿。
