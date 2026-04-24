# 设计：agent loop 同轮工具调用去重

**日期**：2026-04-24  
**状态**：待实现

## 背景

LLM 在 parallel tool calling 时偶尔会在同一次响应中输出两个 name + arguments 完全相同的工具调用（如两次 `improvise hh` 带相同参数）。这是模型的幻觉行为，会导致：

1. UI 里出现两条内容完全一样的进度行（视觉重复）
2. `improvise` 被调用两次，浪费一次 sub-LLM 请求
3. 如果是 `addLayer`，同一层会被叠入两次

## 目标

在同一轮 LLM 响应内，若出现 name + arguments 完全相同的重复工具调用，只执行第一次，后续调用复用第一次的结果，不触发 `onProgress`。

## 范围

**不包含**跨轮次去重。模型在后续迭代中重新发起的相同工具调用（例如首次 improvise 效果不理想后重试）属于合理行为，不应被拦截。

## 设计

### 改动文件

仅 `src/agent/loop.ts`。

### 机制

在 `outer` for 循环体内（处理 `resp.toolCalls` 的 `for` 循环之前）声明：

```ts
const iterResultCache = new Map<string, string>(); // key: `${name}:${arguments}`, value: tool result JSON
```

遍历 `resp.toolCalls` 时：

1. 计算 dedup key：`const dedupKey = \`${call.name}:${call.arguments}\``
2. **命中缓存**：key 已存在 → 直接将缓存 result JSON 追加 `role: 'tool'` 消息，`continue` 跳过执行和 `onProgress`
3. **未命中**：正常执行工具，把执行结果序列化后存入 `iterResultCache`

### tool result JSON 格式

正常执行时已有一段构造 `messages.push({ role: 'tool', ... })` 的逻辑，序列化的内容即为 `JSON.stringify(outcome.result)` 或 commit 的固定值 `JSON.stringify({ ok: true, committed: true })`。缓存存的是这个字符串，复用时原样传入。

### CommitSignal

`CommitSignal` 从 `dispatchToolCall` 中 throw，在 try/catch 里被捕获并 break outer。commit 的 dedup key 理论上不会在同一轮出现两次，但即使出现，第二次会走缓存路径（`{ ok: true, committed: true }`），不会 throw CommitSignal，循环不会重复 break。这是安全的。

### 日志

命中缓存时打印一行 debug 日志：

```ts
console.debug(`[loop] iter ${i+1} dedup: skipping duplicate tool_call "${call.name}"`);
```

## 测试

- 手动测试：给 agent 发送"来一段 lo-fi 鼓点"，观察是否还出现两条相同进度行
- 已有测试脚本 `scripts/run-agent-testcases.ts` 可用于回归验证 agent 整体行为不受影响

## 改动量

约 15 行，全部在 `src/agent/loop.ts` 的 `outer` for 循环体内。
