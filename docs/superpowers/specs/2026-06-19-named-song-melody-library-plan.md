# 具名歌曲旋律库 — 实现计划

对应设计文档：[2026-06-19-named-song-melody-library-design.md](./2026-06-19-named-song-melody-library-design.md)

按依赖顺序分 5 个阶段。每阶段结束跑 `npm test` + `npx tsc --noEmit -p tsconfig.app.json` 保持绿。

---

## 阶段 1：旋律库数据模块（无依赖，先做）

**目标**：建立旋律库的唯一权威来源，带结构自洽测试。

1. 新建 `src/lib/melody-library.ts`：
   - 导出 `interface MelodyEntry { id; names: string[]; melody: string; key: string; bpm: number; meter?: string }`。
   - 导出 `MELODY_LIBRARY: MelodyEntry[]`，先放 **2 首已校验旋律**（生日快乐、小星星）打通链路，其余 7 首留到阶段 4 补齐。
   - 导出 `findMelody(query: string): MelodyEntry | undefined`：归一化（小写、去标点/空格）后对每条 `names` 做包含/分词匹配。匹配逻辑放这里，让工具 handler 薄一层、也好单测。
2. 新建 `src/lib/__tests__/melody-library.test.ts`：
   - 遍历 `MELODY_LIBRARY`：`id`/`names`/`melody`/`key`/`bpm` 齐全、`names` 无空串、`id` 全局唯一。
   - `findMelody`：中文别名命中、英文别名命中、大小写/标点变体命中、未知词返回 `undefined`。

**产出**：纯数据 + 纯函数 + 单测。不碰 agent。

---

## 阶段 2：`lookupMelody` 工具（依赖阶段 1）

**目标**：把库接入 agent 工具循环。

1. `src/agent/tools.ts`：
   - `import { findMelody } from '../lib/melody-library'`。
   - 在 `TOOLS` 数组加第 4 个 `ToolDef`：`name: 'lookupMelody'`，`parameters: { query: string }`，`required: ['query']`。
   - Handler：
     - `query` 空 → `{ ok: false, error: zh ? 'query 不能为空' : 'query must not be empty' }`。
     - `findMelody(query)` 命中 → `{ ok: true, data: { found: true, name, melody, key, bpm, hint } }`（`hint` 双语）。
     - 未命中 → `{ ok: true, data: { found: false, message } }`（`message` 双语，引导 LLM 兜底）。
   - 在 `TOOL_SCHEMAS_ZH` / `TOOL_SCHEMAS_EN` 各加 `lookupMelody` 的 `description` + `params.query`。
2. `src/agent/__tests__/tools.test.ts`（复用 `getHandler` / `makeCtx`）：
   - 命中：中文 / 英文 query 返回 `found: true` 且 `melody` 非空。
   - 未命中：`found: false` 且 **`ok: true`**（断言不触发重试语义）。
   - 空 query：`ok: false`。

**验证点**：executor 不用改——`findTool` 已通用分发。确认 `getOpenAIToolSchemas` 输出含 4 个工具。

---

## 阶段 3：系统 prompt v17（依赖阶段 2）

**目标**：让 agent 知道何时、如何用 `lookupMelody`。

1. 复制 `src/prompts/versions/v16.ts` → `src/prompts/versions/v17.ts`，更新头部 `@version` / `@date` / `@description`（说明新增具名歌曲支持）。**不改 v16。**
2. 在 v17 的中、英两版各加《具名歌曲》章节：
   - 具名歌曲 → 先 `lookupMelody({ query })` 再 `setCode`。
   - `found: true` → `melody` 逐音照用，按 `key`/`bpm` 定调定速。
   - `found: false` → 凭自身知识忠实转写。
   - 仅对具名歌曲调用；情绪/抽象请求不调。
   - 编曲程度推断：偏还原 → 裸旋律层；偏改编 → 完整多音层。
   - 更新"典型流程"为 `lookupMelody + setCode + validate + commit ≈ 4 轮`。
3. `src/prompts/active.ts`：把 `./versions/v16` 改为 `./versions/v17`。`system-prompt.ts` 转发 shim 不动。
4. 跑 `src/prompts/__tests__/build-system-prompt.test.ts`，如有版本/快照断言则相应更新。

---

## 阶段 4：补齐种子曲库（依赖阶段 1，可与 2/3 并行）

**目标**：把库扩到 ~9 首，每首旋律经过校验。

1. 在 dev server（`npm run dev`）里逐首验证旋律：粘进编辑器 → transpiler 通过 → 试听确认正确。
2. 把校验过的 mini-notation 填入 `MELODY_LIBRARY`：欢乐颂、两只老虎、铃儿响叮当、致爱丽丝、卡农片段、We Wish You、玛丽有只小羊羔。
3. 全部公共版权；每条补全 `names` 多语言别名。
4. 阶段 1 的结构自洽测试自动覆盖新增条目。

**注**：melody 播放正确性靠此手工校验，不进 Vitest（`validate` 依赖浏览器 AudioContext）。

---

## 阶段 5：端到端验证与收尾

1. `npm run lint`、`npx tsc --noEmit -p tsconfig.app.json`、`npm test` 全绿。
2. `npm run dev` 手测：
   - "弹个生日歌" → agent 调 lookupMelody → 裸旋律，正确。
   - "给生日歌配个 house 鼓" → 完整编曲，旋律仍正确。
   - "随便来首没有的歌"（库外）→ found:false → LLM 兜底转写，能播。
   - "做点 lo-fi"（情绪请求）→ **不**调 lookupMelody，照常创作。
3. 可选：给 `demo-config.ts` 加一条点歌的 canned 序列，便于无 key 演示。
4. 提交，开 PR。

---

## 风险与缓解

- **库里旋律本身错**：用阶段 4 的入库校验兜住——库优先的前提是库正确。
- **agent 对情绪请求误调 lookupMelody**：prompt v17 明确"仅具名歌曲"；未命中分支也会安全回落到兜底。
- **迭代预算**：多一轮 lookupMelody，已在 v17 预算说明中体现，14 轮充足。
