// src/agent/__tests__/tools.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../services/strudel', () => ({
  validateCode: vi.fn().mockReturnValue({ ok: true }),
  validateCodeRuntime: vi.fn().mockReturnValue({ ok: true }),
  normalizeCode: vi.fn((code: string) => code),
}));

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
