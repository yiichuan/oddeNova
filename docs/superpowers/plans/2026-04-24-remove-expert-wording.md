# 去除思考过程中"专家"措辞 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修改 system prompt 和工具描述，使 agent 在思考文字中不出现"专家"/"小专家"/"small expert"，改用音乐意图语言。

**Architecture:** 纯文本替换，改动 3 个文件中的提示词字符串。不改任何逻辑或类型。

**Tech Stack:** TypeScript（只改字符串内容）

---

### Task 1: 修改 system-prompt.ts — Working style 第 3 条

**Files:**
- Modify: `src/prompts/system-prompt.ts`（Working style 第 3 条 + Communication style 章节）

- [ ] **Step 1: 修改 Working style 第 3 条，去掉 "small expert"**

将 `src/prompts/system-prompt.ts` 中的：

```ts
  '3. To create a new instrumental layer, you may either (a) write the strudel snippet yourself in `addLayer({ code })`, or (b) ask the small expert with `improvise({ role, style, complement_task, hints })` and then plug its returned code into `addLayer` / `replaceLayer`. When calling `improvise`, ALWAYS pass `complement_task` describing what the layer should fill in (e.g. "off-beat hi-hat avoiding kick positions", "warm pad in C minor at 200-2000Hz").',
```

替换为：

```ts
  '3. To create a new instrumental layer, you may either (a) write the strudel snippet yourself in `addLayer({ code })`, or (b) draft it with `improvise({ role, style, complement_task, hints })` and then plug its returned code into `addLayer` / `replaceLayer`. When calling `improvise`, ALWAYS pass `complement_task` describing what the layer should fill in (e.g. "off-beat hi-hat avoiding kick positions", "warm pad in C minor at 200-2000Hz").',
```

- [ ] **Step 2: 在 Communication style 章节补充约束**

在 `## Communication style` 章节最后一行（`'- 示例："先铺一层温暖的 pad 做底色，用慢速弦乐感觉，再往上叠旋律。" / "低音层用 sine 合成，律动缓一点，不要抢主角。"'`）之后，追加一行：

```ts
  '- 调用 `improvise` 时，思考文字只描述音乐意图（如"先草拟一层鼓骨架"、"起手铺个底鼓"），不提工具名称和内部机制。',
```

- [ ] **Step 3: 验证文件无编译错误**

```bash
cd /Users/chaycao/workspace/Vibe-Live-Music && npx tsc --noEmit
```

Expected: 无报错输出

- [ ] **Step 4: Commit**

```bash
git add src/prompts/system-prompt.ts
git commit -m "prompt: 去除 working style 中 small expert 措辞，补充 improvise 思考语言约束"
```

---

### Task 2: 修改 tools.ts — improvise 工具描述

**Files:**
- Modify: `src/agent/tools.ts`（improvise description 字段）

- [ ] **Step 1: 替换工具描述中的"小专家"**

将 `src/agent/tools.ts` 中的：

```ts
      '请一个"小专家"模型为指定角色生成一个互补的单层 strudel 表达式。子模型会读取当前完整代码，识别 BPM/key/已有层，再生成与之互补的片段。返回的 code 不会自动落入当前曲子，需要你再调用 addLayer 或 replaceLayer 把它装配进去。',
```

替换为：

```ts
      '起草一个与当前曲子互补的单层 strudel 表达式。会读取当前完整代码，识别 BPM/key/已有层，生成与之互补的片段。返回的 code 不会自动落入当前曲子，需要你再调用 addLayer 或 replaceLayer 把它装配进去。',
```

- [ ] **Step 2: 验证文件无编译错误**

```bash
cd /Users/chaycao/workspace/Vibe-Live-Music && npx tsc --noEmit
```

Expected: 无报错输出

- [ ] **Step 3: Commit**

```bash
git add src/agent/tools.ts
git commit -m "prompt: 去除 improvise 工具描述中的小专家措辞"
```

---

### Task 3: 修改 scripts/run-agent-testcases.ts — 测试脚本同步

**Files:**
- Modify: `scripts/run-agent-testcases.ts`（improvise description 字段）

- [ ] **Step 1: 替换测试脚本中的"小专家"**

将 `scripts/run-agent-testcases.ts` 中的：

```ts
    name: 'improvise', description: '请一个"小专家"模型为指定角色即兴生成一个单层 strudel 表达式。返回的 code 不会自动落入当前曲子，需要你再调用 addLayer 或 replaceLayer 把它装配进去。',
```

替换为：

```ts
    name: 'improvise', description: '起草一个指定角色的单层 strudel 表达式。返回的 code 不会自动落入当前曲子，需要你再调用 addLayer 或 replaceLayer 把它装配进去。',
```

- [ ] **Step 2: 验证文件无编译错误**

```bash
cd /Users/chaycao/workspace/Vibe-Live-Music && npx tsc --noEmit
```

Expected: 无报错输出

- [ ] **Step 3: Commit**

```bash
git add scripts/run-agent-testcases.ts
git commit -m "prompt: 同步测试脚本中 improvise 工具描述"
```
