# 代码质量基线 — 纯函数单元测试 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `src/agent/parser.ts` 和 `src/agent/tools.ts` 中的纯函数建立单元测试安全网，确保 agent 核心逻辑的回归问题能在 pre-commit 阶段被捕获。

**Architecture:** 使用 Vitest（已配置）在 `src/agent/__tests__/` 下新增两个测试文件，分别覆盖 parser 和 tool handlers。测试只依赖 Node 环境，通过构造 mock ctx 调用 tool handlers，不触碰浏览器 API。

**Tech Stack:** Vitest、TypeScript、现有 `src/agent/parser.ts` 和 `src/agent/tools.ts` 的导出 API。

---

## 文件结构

新增（仅新增，不修改现有代码）：

| 文件 | 职责 |
|---|---|
| `src/agent/__tests__/parser.test.ts` | 覆盖 `parseScore()`、`bpmToCps()`、`summariseScore()` |
| `src/agent/__tests__/tools.test.ts` | 覆盖 addLayer、removeLayer、replaceLayer、applyEffect、setTempo 的 handler 行为 |

---

## Task 1：parser 测试 — 基础结构解析

**Files:**
- Create: `src/agent/__tests__/parser.test.ts`

- [ ] **Step 1：创建测试文件，写前 5 个 case 并确认能跑**

```ts
// src/agent/__tests__/parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseScore, bpmToCps, summariseScore } from '../parser';

describe('parseScore — 基础结构', () => {
  it('空字符串返回空结果', () => {
    const r = parseScore('');
    expect(r.hasStack).toBe(false);
    expect(r.layers).toEqual([]);
    expect(r.cps).toBeNull();
  });

  it('只有 setcps 无 stack', () => {
    const r = parseScore('setcps(0.5)');
    expect(r.cps).toBeCloseTo(0.5);
    expect(r.bpm).toBe(120);
    expect(r.hasStack).toBe(false);
    expect(r.layers).toEqual([]);
  });

  it('标准结构：setcps + stack + 2 层', () => {
    const code = `setcps(0.5)
stack(
  /* @layer drums */
  s("bd ~ sd ~"),
  /* @layer bass */
  note("c2 e2")
)`;
    const r = parseScore(code);
    expect(r.hasStack).toBe(true);
    expect(r.layers).toHaveLength(2);
    expect(r.layers[0].name).toBe('drums');
    expect(r.layers[1].name).toBe('bass');
  });

  it('@layer 标记被识别，source 不含标记本身', () => {
    const code = `stack(\n  /* @layer pad */\n  note("c4")\n)`;
    const r = parseScore(code);
    expect(r.layers[0].name).toBe('pad');
    expect(r.layers[0].source).not.toContain('@layer');
    expect(r.layers[0].source).toContain('note("c4")');
  });

  it('无标记时自动命名 layer_0 / layer_1', () => {
    const code = `stack(\n  s("bd"),\n  s("sd")\n)`;
    const r = parseScore(code);
    expect(r.layers[0].name).toBe('layer_0');
    expect(r.layers[1].name).toBe('layer_1');
  });
});
```

- [ ] **Step 2：运行测试，确认 5 个 case 全部通过**

```bash
cd /Users/chaycao/workspace/oddeNova
npx vitest run src/agent/__tests__/parser.test.ts
```

期望输出：`5 passed`

---

## Task 2：parser 测试 — 边界 case

**Files:**
- Modify: `src/agent/__tests__/parser.test.ts`（追加 describe 块）

- [ ] **Step 1：追加嵌套括号、字符串内逗号、注释内 stack 的测试**

在文件末尾追加以下内容：

```ts
describe('parseScore — 边界 case', () => {
  it('嵌套括号内的逗号不被误切为 layer 分隔符', () => {
    const code = `stack(
  /* @layer melody */
  note("c3 e3").lpf(note("c3 e3")),
  /* @layer drums */
  s("bd sd")
)`;
    const r = parseScore(code);
    expect(r.layers).toHaveLength(2);
    expect(r.layers[0].name).toBe('melody');
    expect(r.layers[1].name).toBe('drums');
  });

  it('字符串内的逗号不被误切', () => {
    const code = `stack(\n  /* @layer x */\n  s("bd, sd")\n)`;
    const r = parseScore(code);
    expect(r.layers).toHaveLength(1);
    expect(r.layers[0].source).toContain('"bd, sd"');
  });

  it('注释内的 stack 关键字不触发 hasStack', () => {
    const code = `// stack(s("bd"))\nnote("c4")`;
    const r = parseScore(code);
    expect(r.hasStack).toBe(false);
  });

  it('silence 裸代码 layers 为空', () => {
    const r = parseScore('setcps(0.5)\nsilence');
    expect(r.layers).toEqual([]);
  });
});

describe('bpmToCps', () => {
  it('120 BPM = 0.5 CPS', () => {
    expect(bpmToCps(120)).toBeCloseTo(0.5);
  });

  it('240 BPM = 1.0 CPS', () => {
    expect(bpmToCps(240)).toBeCloseTo(1.0);
  });

  it('极小 BPM 被限制在 0.05', () => {
    expect(bpmToCps(1)).toBeCloseTo(0.05);
  });
});

describe('summariseScore', () => {
  it('包含 bpm 和 layers 的 name', () => {
    const code = `setcps(0.5)\nstack(\n  /* @layer drums */\n  s("bd")\n)`;
    const r = summariseScore(parseScore(code));
    expect(r.bpm).toBe(120);
    expect(r.layers[0].name).toBe('drums');
  });

  it('超长 source 被截断为 80 字符以内', () => {
    const longSrc = 's("bd")' + '.gain(0.5)'.repeat(20); // >> 80 chars
    const code = `stack(\n  /* @layer x */\n  ${longSrc}\n)`;
    const r = summariseScore(parseScore(code));
    expect(r.layers[0].preview.length).toBeLessThanOrEqual(80);
  });
});
```

- [ ] **Step 2：运行测试，全部通过**

```bash
npx vitest run src/agent/__tests__/parser.test.ts
```

期望输出：全部 case passed，无 fail

- [ ] **Step 3：提交**

```bash
git add src/agent/__tests__/parser.test.ts
git commit -m "test: add parser.test.ts — parseScore / bpmToCps / summariseScore"
```

---

## Task 3：tools 测试 — addLayer / removeLayer

**Files:**
- Create: `src/agent/__tests__/tools.test.ts`

> **背景知识：** tools.ts 里的 handler 通过 `TOOLS` 数组导出。每个 tool 有 `name` 和 `handler` 字段。handler 签名是 `(args, ctx) => ToolResult | Promise<ToolResult>`。ctx 包含 `state: { code, finalCode }` 和 `improviseLLM`（improvise tool 才用）。

- [ ] **Step 1：写 addLayer 和 removeLayer 的测试**

```ts
// src/agent/__tests__/tools.test.ts
import { describe, it, expect, vi } from 'vitest';
import { TOOLS, type AgentState, type ToolContext } from '../tools';

// 辅助函数：根据 name 找到 tool handler
function getHandler(name: string) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool "${name}" not found`);
  return tool.handler;
}

// 辅助函数：构造最小 ctx
function makeCtx(code: string): ToolContext {
  const state: AgentState = { code, finalCode: null };
  return { state, improviseLLM: vi.fn() };
}

// 标准 2 层代码，用于多数测试的初始状态
const TWO_LAYER_CODE = `setcps(0.5)
stack(
  /* @layer drums */
  s("bd ~ sd ~"),
  /* @layer bass */
  note("c2 e2")
)`;

describe('addLayer', () => {
  const addLayer = getHandler('addLayer');

  it('向空 code 添加第一层', async () => {
    const ctx = makeCtx('');
    const result = await addLayer({ name: 'drums', code: 's("bd ~ sd ~")' }, ctx);
    expect(result.ok).toBe(true);
    expect(ctx.state.code).toContain('@layer drums');
    expect(ctx.state.code).toContain('s("bd ~ sd ~")');
    expect(ctx.state.code).toContain('stack(');
  });

  it('向已有 stack 追加层，layerCount 递增', async () => {
    const ctx = makeCtx(TWO_LAYER_CODE);
    const result = await addLayer({ name: 'lead', code: 'note("c4 e4")' }, ctx);
    expect(result.ok).toBe(true);
    expect((result.data as { layerCount: number }).layerCount).toBe(3);
    expect(ctx.state.code).toContain('@layer lead');
  });

  it('name 重复返回 ok: false，code 不变', async () => {
    const ctx = makeCtx(TWO_LAYER_CODE);
    const original = ctx.state.code;
    const result = await addLayer({ name: 'drums', code: 's("hh*8")' }, ctx);
    expect(result.ok).toBe(false);
    expect(ctx.state.code).toBe(original);
  });

  it('name 为空字符串返回 ok: false', async () => {
    const ctx = makeCtx(TWO_LAYER_CODE);
    const result = await addLayer({ name: '', code: 's("hh")' }, ctx);
    expect(result.ok).toBe(false);
  });

  it('code 为空字符串返回 ok: false', async () => {
    const ctx = makeCtx(TWO_LAYER_CODE);
    const result = await addLayer({ name: 'newlayer', code: '' }, ctx);
    expect(result.ok).toBe(false);
  });
});

describe('removeLayer', () => {
  const removeLayer = getHandler('removeLayer');

  it('移除存在的层，其余层不受影响', async () => {
    const ctx = makeCtx(TWO_LAYER_CODE);
    const result = await removeLayer({ name: 'bass' }, ctx);
    expect(result.ok).toBe(true);
    expect(ctx.state.code).toContain('@layer drums');
    expect(ctx.state.code).not.toContain('@layer bass');
    expect((result.data as { layerCount: number }).layerCount).toBe(1);
  });

  it('移除最后一层，code 变为 silence（不是 stack()）', async () => {
    const ctx = makeCtx(`stack(\n  /* @layer drums */\n  s("bd")\n)`);
    const result = await removeLayer({ name: 'drums' }, ctx);
    expect(result.ok).toBe(true);
    expect(ctx.state.code).toContain('silence');
    expect(ctx.state.code).not.toContain('stack(');
  });

  it('移除不存在的层，返回 ok: false，code 不变', async () => {
    const ctx = makeCtx(TWO_LAYER_CODE);
    const original = ctx.state.code;
    const result = await removeLayer({ name: 'nonexistent' }, ctx);
    expect(result.ok).toBe(false);
    expect(ctx.state.code).toBe(original);
  });
});
```

- [ ] **Step 2：运行测试，确认通过**

```bash
npx vitest run src/agent/__tests__/tools.test.ts
```

期望输出：所有 addLayer + removeLayer case passed

---

## Task 4：tools 测试 — replaceLayer / applyEffect / setTempo

**Files:**
- Modify: `src/agent/__tests__/tools.test.ts`（追加 describe 块）

- [ ] **Step 1：追加 replaceLayer、applyEffect、setTempo 测试**

在 tools.test.ts 末尾追加：

```ts
describe('replaceLayer', () => {
  const replaceLayer = getHandler('replaceLayer');

  it('替换内容正确写入，其他层不变', async () => {
    const ctx = makeCtx(TWO_LAYER_CODE);
    const result = await replaceLayer({ name: 'bass', code: 'note("c3 g3")' }, ctx);
    expect(result.ok).toBe(true);
    expect(ctx.state.code).toContain('note("c3 g3")');
    expect(ctx.state.code).toContain('@layer drums');
    // 旧内容不再出现
    expect(ctx.state.code).not.toContain('note("c2 e2")');
  });

  it('目标层不存在返回 ok: false', async () => {
    const ctx = makeCtx(TWO_LAYER_CODE);
    const original = ctx.state.code;
    const result = await replaceLayer({ name: 'ghost', code: 'note("c4")' }, ctx);
    expect(result.ok).toBe(false);
    expect(ctx.state.code).toBe(original);
  });

  it('code 为空返回 ok: false', async () => {
    const ctx = makeCtx(TWO_LAYER_CODE);
    const result = await replaceLayer({ name: 'drums', code: '   ' }, ctx);
    expect(result.ok).toBe(false);
  });
});

describe('applyEffect', () => {
  const applyEffect = getHandler('applyEffect');

  it('chain 以点号开头，追加到目标层尾部', async () => {
    const ctx = makeCtx(TWO_LAYER_CODE);
    const result = await applyEffect({ layer: 'drums', chain: '.gain(0.8)' }, ctx);
    expect(result.ok).toBe(true);
    expect(ctx.state.code).toContain('s("bd ~ sd ~").gain(0.8)');
    expect(ctx.state.code).toContain('@layer bass'); // 其他层不变
  });

  it('chain 不以点号开头返回 ok: false', async () => {
    const ctx = makeCtx(TWO_LAYER_CODE);
    const result = await applyEffect({ layer: 'drums', chain: 'gain(0.8)' }, ctx);
    expect(result.ok).toBe(false);
  });

  it('目标层不存在返回 ok: false', async () => {
    const ctx = makeCtx(TWO_LAYER_CODE);
    const result = await applyEffect({ layer: 'ghost', chain: '.gain(0.5)' }, ctx);
    expect(result.ok).toBe(false);
  });
});

describe('setTempo', () => {
  const setTempo = getHandler('setTempo');

  it('120 BPM → setcps(0.5) 出现在输出 code 中', async () => {
    const ctx = makeCtx(TWO_LAYER_CODE);
    const result = await setTempo({ bpm: 120 }, ctx);
    expect(result.ok).toBe(true);
    expect(ctx.state.code).toContain('setcps(0.5)');
  });

  it('替换已有 setcps，不出现两行 setcps', async () => {
    const ctx = makeCtx(TWO_LAYER_CODE);
    await setTempo({ bpm: 140 }, ctx);
    const matches = ctx.state.code.match(/setcps/g) ?? [];
    expect(matches.length).toBe(1);
  });

  it('bpm 为 0 返回 ok: false', async () => {
    const ctx = makeCtx(TWO_LAYER_CODE);
    const result = await setTempo({ bpm: 0 }, ctx);
    expect(result.ok).toBe(false);
  });

  it('bpm 为负数返回 ok: false', async () => {
    const ctx = makeCtx(TWO_LAYER_CODE);
    const result = await setTempo({ bpm: -1 }, ctx);
    expect(result.ok).toBe(false);
  });

  it('bpm 为非数字字符串返回 ok: false', async () => {
    const ctx = makeCtx(TWO_LAYER_CODE);
    const result = await setTempo({ bpm: 'fast' }, ctx);
    expect(result.ok).toBe(false);
  });
});

describe('ensureStack（通过 addLayer 间接测试）', () => {
  const addLayer = getHandler('addLayer');

  it('无 stack 的裸代码（如 s("bd*4")）被包装为 main 层后能追加新层', async () => {
    const ctx = makeCtx('s("bd*4")');
    const result = await addLayer({ name: 'bass', code: 'note("c2")' }, ctx);
    expect(result.ok).toBe(true);
    // 原来的裸代码应该作为某层（main 或 layer_0）保留
    expect(ctx.state.code).toContain('s("bd*4")');
    expect(ctx.state.code).toContain('@layer bass');
  });

  it('silence 裸代码 addLayer 后不留残余 silence 层', async () => {
    const ctx = makeCtx('setcps(0.5)\nsilence');
    const result = await addLayer({ name: 'drums', code: 's("bd")' }, ctx);
    expect(result.ok).toBe(true);
    // silence 不应作为独立层出现在 stack 中
    const layerMatches = ctx.state.code.match(/@layer/g) ?? [];
    expect(layerMatches.length).toBe(1); // 只有 drums 这一层
  });
});
```

- [ ] **Step 2：运行全部 tools 测试**

```bash
npx vitest run src/agent/__tests__/tools.test.ts
```

期望输出：全部 case passed

- [ ] **Step 3：运行全量测试（含 parser + sample-allowlist）**

```bash
npm test
```

期望输出：全部测试文件通过，无 fail

- [ ] **Step 4：TypeScript 类型检查通过**

```bash
npx tsc --noEmit -p tsconfig.app.json
```

期望输出：无错误（exit code 0）

- [ ] **Step 5：Lint 通过**

```bash
npm run lint
```

期望输出：无错误

- [ ] **Step 6：提交**

```bash
git add src/agent/__tests__/tools.test.ts
git commit -m "test: add tools.test.ts — addLayer / removeLayer / replaceLayer / applyEffect / setTempo"
```

---

## 完成验证

所有任务完成后，运行完整检查：

```bash
npm run lint && npx tsc --noEmit -p tsconfig.app.json && npm test
```

期望输出：
- lint: 0 errors
- tsc: 0 errors  
- test: 3 test files, 所有 case passed

此时 husky pre-commit hook 已自动覆盖这三项检查，之后每次 `git commit` 都会自动运行。
