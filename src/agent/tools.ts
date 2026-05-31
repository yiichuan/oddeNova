// Tool definitions for the strudel-coding agent.
// Each tool exposes an OpenAI-compatible JSON Schema (for function calling)
// and a handler that operates on a mutable AgentState. The `commit` tool is
// terminal — it throws CommitSignal which the loop catches.

import { parseScore } from './parser';
import { validateCodeRuntime, validateCodeTranspiler, normalizeCode } from '../services/strudel';

export interface AgentState {
  code: string;
  finalCode: string | null;
}

export interface ToolContext {
  state: AgentState;
}

export interface ToolResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

export type ToolArgs = Record<string, unknown>;

export type ToolHandler = (
  args: ToolArgs,
  ctx: ToolContext
) => Promise<ToolResult> | ToolResult;

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: ToolHandler;
}

export class CommitSignal extends Error {
  code: string;
  constructor(code: string) {
    super('commit');
    this.name = 'CommitSignal';
    this.code = code;
  }
}

// ----- tool definitions ------------------------------------------------------

export const TOOLS: ToolDef[] = [
  {
    name: 'validate',
    description:
      '对一段 strudel 代码做校验（不会播放）：先做 JS 语法检查，再在沙箱里 dry-run 一次以捕捉未定义函数（如 by/sometimesBy 等幻觉 API）和类型错误。在 commit 前应该至少 validate 一次最终代码；若失败请按错误信息修代码后再 validate 一次。',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: '要校验的 strudel 代码；不传则校验当前编辑中的代码',
        },
      },
      required: [],
    },
    handler: (args, ctx) => {
      const code = typeof args.code === 'string' && args.code.trim() ? args.code : ctx.state.code;
      // validateCodeRuntime handles JS syntax check (engine not ready, kind:'syntax')
      // and Proxy dry-run (engine ready, kind:'runtime') in a single call.
      const runtime = validateCodeRuntime(code);
      if (!runtime.ok) {
        if (runtime.kind === 'syntax') {
          return { ok: false, error: `语法错误: ${runtime.error}` };
        }
        return { ok: false, error: `运行时错误: ${runtime.error}（请勿使用 TidalCycles 专有 API，如 by/sometimesBy/someCyclesBy/within；改用 .sometimes(fast(2)) 或 .every(N, fast(2)) 形式）` };
      }
      const transpilerCheck = validateCodeTranspiler(code);
      return transpilerCheck.ok
        ? { ok: true, data: { valid: true } }
        : { ok: false, error: `Mini-notation 错误: ${transpilerCheck.error}` };
    },
  },

  {
    name: 'setCode',
    description:
      '设置完整的 Strudel 代码，适用于从头创作或在现有代码基础上编辑（如添加/修改/删除音层、调整 BPM 等任意改动）。若已有现存代码，代码已通过系统消息传入（含 BPM 和音层摘要），直接心算读取即可。设置后请用 validate 校验，通过后再 commit。',
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description:
            '完整的 Strudel 代码：第一行写顶部注释 `// STYLE | BPM: N`，第二行 setcps(N)，后接 stack(...) 包含所有音层（每层 `/* @layer NAME */` 后另起一行写 `// 简短中文说明`）',
        },
      },
      required: ['code'],
    },
    handler: (args, ctx) => {
      if (typeof args.code !== 'string' || !args.code.trim()) {
        return { ok: false, error: 'code 不能为空' };
      }
      const code = args.code.trim();
      const score = parseScore(code);
      ctx.state.code = code;
      return {
        ok: true,
        data: {
          layers: score.layers.length,
          bpm: score.bpm,
        },
      };
    },
  },

  {
    name: 'commit',
    description:
      '终止本次 agent 循环，把最终代码交给播放器 hot-reload 播放。必须在所有编辑完成且 validate 通过后调用。一次会话内只能调用一次。',
    parameters: {
      type: 'object',
      properties: {
        explanation: {
          type: 'string',
          description:
            '【必填】一句话中文向用户解释这次改动，会作为聊天回复展示。如 "加了一层 lo-fi 鼓点" / "把 pad 调小声" / "切到 house 风格 128 BPM"。',
        },
      },
      required: ['explanation'],
    },
    handler: (_args, ctx) => {
      // Always use the tool-managed state.code — never let the LLM pass its own
      // code blob, which would bypass setcps and other accumulated edits.
      // Normalize multiline strings so Strudel's evaluator doesn't choke.
      throw new CommitSignal(normalizeCode(ctx.state.code));
    },
  },
];

// OpenAI ChatCompletion `tools` array.
export function getOpenAIToolSchemas(): Array<{
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}> {
  return TOOLS.map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

export function findTool(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name);
}
