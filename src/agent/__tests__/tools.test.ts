// src/agent/__tests__/tools.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../services/strudel', () => ({
  validateCodeRuntime: vi.fn().mockReturnValue({ ok: true }),
  validateCodeTranspiler: vi.fn().mockReturnValue({ ok: true }),
  normalizeCode: vi.fn((code: string) => code),
}));

import { TOOLS, type AgentState, type ToolContext } from '../tools';
import { validateCodeRuntime, validateCodeTranspiler } from '../../services/strudel';

// Helper: find a tool handler by name
function getHandler(name: string) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`Tool "${name}" not found`);
  return tool.handler;
}

// Helper: build a minimal ctx
function makeCtx(code: string): ToolContext {
  const state: AgentState = { code, finalCode: null };
  return { state };
}

// Standard 2-layer code used as the initial state for most tests
const TWO_LAYER_CODE = `setcps(0.5)
stack(
  /* @layer drums */
  s("bd ~ sd ~"),
  /* @layer bass */
  note("c2 e2")
)`;

describe('validate', () => {
  const validate = getHandler('validate');

  it('代码合法 — 返回 ok: true, valid: true', async () => {
    const ctx = makeCtx('s("bd ~ sd ~")');
    const result = await validate({}, ctx);
    expect(result.ok).toBe(true);
    expect((result.data as { valid: boolean }).valid).toBe(true);
  });

  it('发现 "|" in <> — transpiler 返回 ok: false，error 含 Mini-notation，code 不改变', async () => {
    const badCode = 'n("<0 ~ 2 | 4 ~ 3>/2")';
    vi.mocked(validateCodeTranspiler).mockReturnValueOnce({
      ok: false,
      error: '[mini] parse error at line 1: Expected ... but "|" found.',
    });
    const ctx = makeCtx(badCode);
    const result = await validate({}, ctx);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Mini-notation 错误/);
    // code must not be modified; it is up to the agent to decide how to fix it
    expect(ctx.state.code).toBe(badCode);
  });

  it('语法错误 — 返回 ok: false，error 含"语法错误"', async () => {
    vi.mocked(validateCodeRuntime).mockReturnValueOnce({ ok: false, error: 'Unexpected token }', kind: 'syntax' });
    const ctx = makeCtx('s("bd") }}}');
    const result = await validate({}, ctx);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/语法错误/);
  });

  it('运行时错误（幻觉 API）— 返回 ok: false，error 含"运行时错误"', async () => {
    vi.mocked(validateCodeRuntime).mockReturnValueOnce({ ok: false, error: 'sometimesBy is not defined', kind: 'runtime' });
    const ctx = makeCtx('s("bd").sometimesBy(0.5, fast(2))');
    const result = await validate({}, ctx);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/运行时错误/);
  });
});

describe('setCode', () => {
  const setCode = getHandler('setCode');

  const FULL_CODE = `setcps(0.5)
stack(
  /* @layer drums */
  s("bd ~ sd ~")
    .gain(0.8),
  /* @layer bass */
  note("c2 e2")
    .s("sawtooth")
    .gain(0.6)
)`;

  it('设置完整代码后 ctx.state.code 更新', async () => {
    const ctx = makeCtx('');
    const result = await setCode({ code: FULL_CODE }, ctx);
    expect(result.ok).toBe(true);
    expect(ctx.state.code).toBe(FULL_CODE.trim());
  });

  it('返回正确的 layers 数量（2）和 bpm（120）', async () => {
    const ctx = makeCtx('');
    const result = await setCode({ code: FULL_CODE }, ctx);
    expect(result.ok).toBe(true);
    const data = result.data as { layers: number; bpm: number };
    expect(data.layers).toBe(2);
    expect(data.bpm).toBe(120);
  });

  it('替换已有代码', async () => {
    const ctx = makeCtx(TWO_LAYER_CODE);
    const result = await setCode({ code: FULL_CODE }, ctx);
    expect(result.ok).toBe(true);
    expect(ctx.state.code).toBe(FULL_CODE.trim());
  });

  it('code 为空字符串返回 ok: false', async () => {
    const ctx = makeCtx('');
    const result = await setCode({ code: '' }, ctx);
    expect(result.ok).toBe(false);
  });

  it('code 仅含空白字符返回 ok: false', async () => {
    const ctx = makeCtx('');
    const result = await setCode({ code: '   \n  ' }, ctx);
    expect(result.ok).toBe(false);
  });
});
