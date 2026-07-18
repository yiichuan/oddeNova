// src/agent/__tests__/tools.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../services/strudel', () => ({
  validateCodeRuntime: vi.fn().mockReturnValue({ ok: true }),
  validateCodeTranspiler: vi.fn().mockReturnValue({ ok: true }),
  normalizeCode: vi.fn((code: string) => code),
}));

import { CommitSignal, TOOLS, getOpenAIToolSchemas, type AgentState, type ToolContext } from '../tools';
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

  it('拒绝校验不同于当前状态的临时代码，避免提交旧代码', async () => {
    const ctx = makeCtx('stack(s("bd") s("hh"))');
    const result = await validate({ code: 'stack(s("bd"), s("hh"))' }, ctx);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/setCode/);
    expect(ctx.state.code).toBe('stack(s("bd") s("hh"))');
  });

  it('接受与 setCode 相同但含 GM 别名的原始代码（normalize 后不应误拒）', async () => {
    const raw = `setcps(0.5)
stack(
  /* @layer keys */
  note("c3 e3").s("gm_acoustic_grand_piano")
)`;
    const setCode = getHandler('setCode');
    const ctx = makeCtx('');
    await setCode({ code: raw, explanation: 'add keys' }, ctx);
    // state holds the normalized code (gm_piano), so it differs from raw
    expect(ctx.state.code).not.toBe(raw);
    const result = await validate({ code: raw }, ctx);
    expect(result.ok).toBe(true);
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

  it('运行时错误（幻觉 API）— 返回 ok: false，error 含"运行时错误"和 TidalCycles 提示', async () => {
    vi.mocked(validateCodeRuntime).mockReturnValueOnce({ ok: false, error: 'sometimesBy is not defined', kind: 'runtime' });
    const ctx = makeCtx('s("bd").sometimesBy(0.5, fast(2))');
    const result = await validate({}, ctx);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/运行时错误/);
    expect(result.error).toMatch(/TidalCycles/);
  });

  it('运行时错误（与 TidalCycles 专有 API 无关）— 不附加误导性的 TidalCycles 提示', async () => {
    vi.mocked(validateCodeRuntime).mockReturnValueOnce({ ok: false, error: 'Invalid argument', kind: 'runtime' });
    const ctx = makeCtx('s("bd").late("[0 .04]*4")');
    const result = await validate({}, ctx);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/运行时错误/);
    expect(result.error).not.toMatch(/TidalCycles/);
  });

  it('运行时错误（多音层）— 隔离复现出同一错误的音层，在 error 中标出 @layer 名称', async () => {
    vi.mocked(validateCodeRuntime)
      .mockReturnValueOnce({ ok: false, error: 'Invalid argument', kind: 'runtime' }) // full code
      .mockReturnValueOnce({ ok: true }) // drums layer in isolation: passes
      .mockReturnValueOnce({ ok: false, error: 'Invalid argument', kind: 'runtime' }); // bass layer in isolation: reproduces
    const ctx = makeCtx(`setcps(0.5)
stack(
  /* @layer drums */
  s("bd ~ sd ~"),
  /* @layer bass */
  s("bd sd").late("[0 .04]*4")
)`);
    const result = await validate({}, ctx);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/@layer bass/);
  });

  it('运行时错误（多音层，隔离后无法复现）— 不猜测位置', async () => {
    vi.mocked(validateCodeRuntime)
      .mockReturnValueOnce({ ok: false, error: 'Invalid argument', kind: 'runtime' }) // full code
      .mockReturnValueOnce({ ok: true }) // drums layer in isolation: passes
      .mockReturnValueOnce({ ok: true }); // bass layer in isolation: also passes (error only appears in combination)
    const ctx = makeCtx(`setcps(0.5)
stack(
  /* @layer drums */
  s("bd ~ sd ~"),
  /* @layer bass */
  s("bd sd").late("[0 .04]*4")
)`);
    const result = await validate({}, ctx);
    expect(result.ok).toBe(false);
    expect(result.error).not.toMatch(/@layer/);
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

  it('把 MIDI 标准 GM 名归一化为 strudel 规范名', async () => {
    const ctx = makeCtx('');
    const result = await setCode(
      { code: 'note("c4 e4 g4").s("gm_acoustic_grand_piano")' },
      ctx,
    );
    expect(result.ok).toBe(true);
    expect(ctx.state.code).toBe('note("c4 e4 g4").s("gm_piano")');
  });

  it('requires explanation in the schema (both languages)', () => {
    for (const isZh of [true, false]) {
      const schema = getOpenAIToolSchemas(isZh).find((s) => s.function.name === 'setCode');
      expect(schema, `setCode schema missing (isZh=${isZh})`).toBeDefined();
      const params = schema!.function.parameters as {
        properties: Record<string, { description?: string }>;
        required: string[];
      };
      expect(params.properties).toHaveProperty('explanation');
      expect(params.required).toContain('explanation');
      // param description must be localized, not the raw ZH fallback in the EN schema
      expect(params.properties.explanation.description).toBeTruthy();
    }
  });
});

describe('commit', () => {
  const commit = getHandler('commit');

  it('当前状态代码语法错误时返回失败，不提交', async () => {
    vi.mocked(validateCodeRuntime).mockReturnValueOnce({
      ok: false,
      error: 'missing ) after argument list',
      kind: 'syntax',
    });
    const ctx = makeCtx('stack(s("bd") s("hh"))');
    const result = await commit({ explanation: 'done' }, ctx);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/missing \) after argument list/);
  });

  it('当前状态代码合法时仍发出 CommitSignal', () => {
    const ctx = makeCtx('stack(s("bd"), s("hh"))');
    expect(() => commit({ explanation: 'done' }, ctx)).toThrow(CommitSignal);
  });
});
