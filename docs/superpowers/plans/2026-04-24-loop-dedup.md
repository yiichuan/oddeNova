# Loop 同轮工具调用去重 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 agent loop 的同一轮 LLM 响应中，若出现 name + arguments 完全相同的重复工具调用，只执行第一次，后续调用复用第一次的结果，不再触发 `onProgress`，消除 UI 里的重复进度行和冗余 sub-LLM 调用。

**Architecture:** 在 `src/agent/loop.ts` 的 `outer` for 循环体内，每轮迭代开始时初始化一个 `Map<string, string>` 作为本轮结果缓存。遍历 `resp.toolCalls` 时，命中缓存的 call 直接用缓存内容构造 `role: 'tool'` 消息并跳过执行；未命中则正常执行并将结果存入缓存。Map 生命周期仅限本轮，下一轮重新创建。

**Tech Stack:** TypeScript，无新依赖。

---

### Task 1: 在 loop.ts 中实现同轮去重

**Files:**
- Modify: `src/agent/loop.ts`（`outer` for 循环体内，处理 `resp.toolCalls` 的段落）

目前 `resp.toolCalls` 的处理逻辑（约 145-210 行）：

```
const outcomes: ToolCallOutcome[] = [];
for (const call of resp.toolCalls) {
  // 解析 args
  // onProgress tool_call
  // dispatchToolCall → outcomes.push
  // onProgress tool_result
  // catch CommitSignal → break outer
}
// 把 outcomes 写入 messages (role: 'tool')
```

修改后：在 `outcomes` 声明之前插入 `iterResultCache`，在 for 循环内对每个 call 先检查缓存。

- [ ] **Step 1: 在 `outcomes` 声明前插入缓存 Map**

在文件中找到以下代码：

```typescript
    const outcomes: ToolCallOutcome[] = [];
    for (const call of resp.toolCalls) {
```

替换为：

```typescript
    // Per-iteration dedup cache: key = `${name}:${arguments}`, value = tool result JSON.
    // Prevents duplicate tool_calls (same name + args) in a single LLM response from
    // being executed twice — a known parallel tool calling hallucination.
    const iterResultCache = new Map<string, string>();

    const outcomes: ToolCallOutcome[] = [];
    for (const call of resp.toolCalls) {
```

- [ ] **Step 2: 在 for 循环内，args 解析之后、`onProgress` 之前插入缓存命中检查**

在文件中找到以下代码（紧接在 parsedArgs 解析的 try/catch 块之后）：

```typescript
      console.debug(`[loop] iter ${i + 1} tool_call: ${call.name}`, parsedArgs);
      onProgress?.({ kind: 'tool_call', name: call.name, args: parsedArgs });

      try {
        const outcome = await dispatchToolCall(call, ctx);
```

替换为：

```typescript
      const dedupKey = `${call.name}:${call.arguments}`;
      const cachedResult = iterResultCache.get(dedupKey);
      if (cachedResult !== undefined) {
        console.debug(`[loop] iter ${i + 1} dedup: skipping duplicate tool_call "${call.name}"`);
        messages.push({
          role: 'tool',
          tool_call_id: call.id,
          name: call.name,
          content: cachedResult,
        });
        continue;
      }

      console.debug(`[loop] iter ${i + 1} tool_call: ${call.name}`, parsedArgs);
      onProgress?.({ kind: 'tool_call', name: call.name, args: parsedArgs });

      try {
        const outcome = await dispatchToolCall(call, ctx);
```

- [ ] **Step 3: 在正常执行成功后，将结果存入缓存**

在文件中找到以下代码：

```typescript
        const outcome = await dispatchToolCall(call, ctx);
        outcomes.push(outcome);
        if (!outcome.result.ok) {
          console.error(`[loop] iter ${i + 1} tool "${outcome.name}" 返回失败:`, outcome.result.error);
        }
        onProgress?.({
          kind: 'tool_result',
          name: outcome.name,
          ok: outcome.result.ok,
          error: outcome.result.error,
        });
```

替换为：

```typescript
        const outcome = await dispatchToolCall(call, ctx);
        outcomes.push(outcome);
        if (!outcome.result.ok) {
          console.error(`[loop] iter ${i + 1} tool "${outcome.name}" 返回失败:`, outcome.result.error);
        }
        // Cache the result JSON so duplicate calls in the same iteration can reuse it.
        const resultJson = JSON.stringify(
          outcome.result.ok
            ? { ok: true, ...(outcome.result.data as object || {}) }
            : { ok: false, error: outcome.result.error }
        );
        iterResultCache.set(dedupKey, resultJson);
        onProgress?.({
          kind: 'tool_result',
          name: outcome.name,
          ok: outcome.result.ok,
          error: outcome.result.error,
        });
```

- [ ] **Step 4: 在 CommitSignal 分支中也存入缓存**

在文件中找到以下代码（CommitSignal catch 块内）：

```typescript
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            name: call.name,
            content: JSON.stringify({ ok: true, committed: true }),
          });
          onProgress?.({ kind: 'commit', code: e.code });
          break outer;
```

替换为：

```typescript
          const commitResultJson = JSON.stringify({ ok: true, committed: true });
          iterResultCache.set(dedupKey, commitResultJson);
          messages.push({
            role: 'tool',
            tool_call_id: call.id,
            name: call.name,
            content: commitResultJson,
          });
          onProgress?.({ kind: 'commit', code: e.code });
          break outer;
```

- [ ] **Step 5: 在 catch 的 Error 分支中也存入缓存**

在文件中找到以下代码（CommitSignal 之后的 Error catch）：

```typescript
        const msg = e instanceof Error ? e.message : String(e);
        outcomes.push({
          id: call.id,
          name: call.name,
          result: { ok: false, error: msg },
        });
        onProgress?.({ kind: 'tool_result', name: call.name, ok: false, error: msg });
```

替换为：

```typescript
        const msg = e instanceof Error ? e.message : String(e);
        outcomes.push({
          id: call.id,
          name: call.name,
          result: { ok: false, error: msg },
        });
        iterResultCache.set(dedupKey, JSON.stringify({ ok: false, error: msg }));
        onProgress?.({ kind: 'tool_result', name: call.name, ok: false, error: msg });
```

- [ ] **Step 6: 手动测试**

启动 dev server，发送"来一段 lo-fi 鼓点"，观察 UI 进度行，确认：
- 不再出现两条完全相同的"即兴生成 hh（…）"进度行
- agent 仍能正常完成并播放代码

- [ ] **Step 7: 提交**

```bash
git add src/agent/loop.ts
git commit -m "fix: 去重 agent loop 同轮内相同工具调用，避免 UI 重复进度行"
```
