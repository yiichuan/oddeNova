# 去除思考过程中"专家"措辞设计

**日期：** 2026-04-24  
**状态：** 已批准  
**方案：** 改根源（system prompt + 工具描述）

---

## 背景

Agent 在思考过程（`assistant_text`）中会出现"让小专家生成一层合适的鼓"之类的表述，增加了用户的心智负担——用户看到的是实现机制，而非音乐意图。

根本原因：`system-prompt.ts` 和 `tools.ts` 的提示词文本里使用了"小专家"/"small expert"这一概念，LLM 在推理时自然复述这些词汇并输出到思考文字中。

---

## 目标

让 agent 思考文字只描述**音乐意图**（"先草拟一层鼓骨架"），不出现"专家"/"小专家"/"small expert"等词。

---

## 改动范围

### 1. `src/prompts/system-prompt.ts` — Working style 第 3 条

**现状：**
```
(b) ask the small expert with `improvise({ role, style, complement_task, hints })` and then plug its returned code into `addLayer` / `replaceLayer`.
```

**改为：**
```
(b) draft it with `improvise({ role, style, complement_task, hints })` and then plug its returned code into `addLayer` / `replaceLayer`.
```

同时在 `## Communication style` 章节补充约束：
```
- 调用 `improvise` 时，思考文字只描述音乐意图（如"先草拟一层鼓骨架"、"起手铺个底鼓"），不提工具名称和内部机制。
```

### 2. `src/agent/tools.ts` — `improvise` 工具 description 字段

**现状：**
```
'请一个"小专家"模型为指定角色生成一个互补的单层 strudel 表达式。子模型会读取当前完整代码，识别 BPM/key/已有层，再生成与之互补的片段。返回的 code 不会自动落入当前曲子，需要你再调用 addLayer 或 replaceLayer 把它装配进去。'
```

**改为：**
```
'起草一个与当前曲子互补的单层 strudel 表达式。会读取当前完整代码，识别 BPM/key/已有层，生成与之互补的片段。返回的 code 不会自动落入当前曲子，需要你再调用 addLayer 或 replaceLayer 把它装配进去。'
```

### 3. `scripts/run-agent-testcases.ts` — 测试脚本同步修改

**现状：**
```
'请一个"小专家"模型为指定角色即兴生成一个单层 strudel 表达式。返回的 code 不会自动落入当前曲子，需要你再调用 addLayer 或 replaceLayer 把它装配进去。'
```

**改为：**
```
'起草一个指定角色的单层 strudel 表达式。返回的 code 不会自动落入当前曲子，需要你再调用 addLayer 或 replaceLayer 把它装配进去。'
```

---

## 预期效果

思考文字从：
> "我来让小专家生成一层合适的鼓"

变为：
> "先草拟一层鼓骨架，看看 lo-fi 的律动感对不对"

---

## 不在此次改动范围内

- `docs/prompts.md` 里的"小专家"描述（面向开发者文档，不影响用户体验）
- `docs/test-case/` 里已有的测试评分记录（历史数据，不修改）
