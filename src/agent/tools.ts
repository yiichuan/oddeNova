// Tool definitions for the strudel-coding agent.
// Each tool exposes an OpenAI-compatible JSON Schema (for function calling)
// and a handler that operates on a mutable AgentState. The `commit` tool is
// terminal — it throws CommitSignal which the loop catches.

import { parseScore } from './parser';
import { validateCodeRuntime, validateCodeTranspiler, normalizeCode } from '../services/strudel';
import { normalizeGmSampleNames } from '../lib/sample-allowlist';

export interface AgentState {
  code: string;
  finalCode: string | null;
}

export interface ToolContext {
  state: AgentState;
  isZh?: boolean;
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

// The Proxy dry-run in validateCodeRuntime throws `${name} is not defined` for
// any undefined global. Only attach the TidalCycles-substitute hint when the
// undefined name is actually one of these — otherwise the hint is a red
// herring that misdirects fixes toward unrelated code (e.g. `.late()`, which
// is a real, patternified Strudel API).
const TIDAL_ONLY_API_ERROR = /^(by|sometimesBy|someCyclesBy|within) is not defined$/;

// A runtime error message alone doesn't say which stack layer threw it. Re-run
// the dry-run against each named layer standalone; a layer only counts as a
// match if the *exact same* error reproduces in isolation — a different error
// usually just means that layer depends on something defined outside it (e.g.
// a shared variable), not that it's the culprit. This keeps false positives
// out: we'd rather report no location than a confidently wrong one.
function findFailingLayers(code: string, errorMessage: string): string[] {
  const score = parseScore(code);
  if (!score.hasStack || score.layers.length < 2) return [];
  const matches: string[] = [];
  for (const layer of score.layers) {
    const result = validateCodeRuntime(layer.source);
    if (!result.ok && result.kind === 'runtime' && result.error === errorMessage) {
      matches.push(layer.name);
    }
  }
  return matches;
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
      const zh = ctx.isZh ?? true;
      const code = typeof args.code === 'string' && args.code.trim() ? args.code : ctx.state.code;
      // validateCodeRuntime handles JS syntax check (engine not ready, kind:'syntax')
      // and Proxy dry-run (engine ready, kind:'runtime') in a single call.
      const runtime = validateCodeRuntime(code);
      if (!runtime.ok) {
        if (runtime.kind === 'syntax') {
          return { ok: false, error: zh
            ? `语法错误: ${runtime.error}`
            : `Syntax error: ${runtime.error}` };
        }
        const isTidalOnlyApi = TIDAL_ONLY_API_ERROR.test(runtime.error ?? '');
        const hintZh = isTidalOnlyApi ? '（请勿使用 TidalCycles 专有 API，如 by/sometimesBy/someCyclesBy/within；改用 .sometimes(fast(2)) 或 .every(N, fast(2)) 形式）' : '';
        const hintEn = isTidalOnlyApi ? ' (do not use TidalCycles-specific APIs such as by/sometimesBy/someCyclesBy/within; use .sometimes(fast(2)) or .every(N, fast(2)) instead)' : '';
        const failingLayers = findFailingLayers(code, runtime.error ?? '');
        const locationZh = failingLayers.length > 0 ? `（错误位于 @layer ${failingLayers.join(', ')}）` : '';
        const locationEn = failingLayers.length > 0 ? ` (error originates in @layer ${failingLayers.join(', ')})` : '';
        return { ok: false, error: zh
          ? `运行时错误: ${runtime.error}${locationZh}${hintZh}`
          : `Runtime error: ${runtime.error}${locationEn}${hintEn}` };
      }
      const transpilerCheck = validateCodeTranspiler(code);
      return transpilerCheck.ok
        ? { ok: true, data: { valid: true } }
        : { ok: false, error: zh
            ? `Mini-notation 错误: ${transpilerCheck.error}`
            : `Mini-notation error: ${transpilerCheck.error}` };
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
        return { ok: false, error: (ctx.isZh ?? true) ? 'code 不能为空' : 'code must not be empty' };
      }
      // Rewrite MIDI-standard GM names (e.g. gm_acoustic_grand_piano) to strudel's
      // canonical names (gm_piano) so the stored/validated/committed code stays
      // portable to vanilla strudel — oddeNova's runtime aliases are only a fallback.
      const code = normalizeGmSampleNames(args.code.trim());
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

// Bilingual schema descriptions — kept separate from handler logic so the
// schema sent to the LLM is always in the user's language.
const TOOL_SCHEMAS_ZH = {
  validate: {
    description:
      '对一段 strudel 代码做校验（不会播放）：先做 JS 语法检查，再在沙箱里 dry-run 一次以捕捉未定义函数（如 by/sometimesBy 等幻觉 API）和类型错误。在 commit 前应该至少 validate 一次最终代码；若失败请按错误信息修代码后再 validate 一次。',
    params: {
      code: '要校验的 strudel 代码；不传则校验当前编辑中的代码',
    },
  },
  setCode: {
    description:
      '设置完整的 Strudel 代码，适用于从头创作或在现有代码基础上编辑（如添加/修改/删除音层、调整 BPM 等任意改动）。若已有现存代码，代码已通过系统消息传入（含 BPM 和音层摘要），直接心算读取即可。设置后请用 validate 校验，通过后再 commit。',
    params: {
      code: '完整的 Strudel 代码：第一行写顶部注释 `// STYLE | BPM: N`，第二行 setcps(N)，后接 stack(...) 包含所有音层（每层 `/* @layer NAME */` 后另起一行写 `// 简短中文说明`）',
    },
  },
  commit: {
    description:
      '终止本次 agent 循环，把最终代码交给播放器 hot-reload 播放。必须在所有编辑完成且 validate 通过后调用。一次会话内只能调用一次。',
    params: {
      explanation:
        '【必填】一句话中文向用户解释这次改动，会作为聊天回复展示。如 "加了一层 lo-fi 鼓点" / "把 pad 调小声" / "切到 house 风格 128 BPM"。',
    },
  },
};

const TOOL_SCHEMAS_EN = {
  validate: {
    description:
      'Validate a snippet of Strudel code (no playback): runs a JS syntax check then dry-runs in a sandbox to catch undefined functions (e.g. hallucinated APIs like by/sometimesBy) and type errors. Call validate at least once before commit; if it fails, fix the code per the error message and validate again.',
    params: {
      code: 'The Strudel code to validate; omit to validate the code currently being edited',
    },
  },
  setCode: {
    description:
      'Write the complete Strudel code, for brand-new compositions or edits to existing code (add/edit/remove layers, change BPM, etc.). If existing code was provided, it was already injected via the system message (with BPM and layer summary) — read it mentally without calling any tool. After setting, call validate, then commit once it passes.',
    params: {
      code: 'Full Strudel code: first line is a top comment `// STYLE | BPM: N`, second line setcps(N), followed by stack(...) containing all layers (each `/* @layer NAME */` followed by a short English comment on the next line)',
    },
  },
  commit: {
    description:
      'Terminate the agent loop and hand the final code to the player for hot-reload playback. Must be called after all edits are complete and validate has passed. Can only be called once per session.',
    params: {
      explanation:
        '[Required] One short sentence in English explaining this change, shown as a chat reply. E.g. "Added a lo-fi drum layer" / "Turned the pad down" / "Switched to house style at 128 BPM".',
    },
  },
};

// OpenAI ChatCompletion `tools` array.
export function getOpenAIToolSchemas(isZh = true): Array<{
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}> {
  const schemas = isZh ? TOOL_SCHEMAS_ZH : TOOL_SCHEMAS_EN;
  return TOOLS.map((t) => {
    const s = schemas[t.name as keyof typeof schemas];
    // Merge bilingual param descriptions into a copy of the original parameters schema.
    const parameters = {
      ...t.parameters,
      properties: Object.fromEntries(
        Object.entries((t.parameters as { properties: Record<string, { type: string; description?: string }> }).properties).map(
          ([key, val]) => [key, { ...val, description: s.params[key as keyof typeof s.params] ?? val.description }]
        )
      ),
    };
    return {
      type: 'function',
      function: { name: t.name, description: s.description, parameters },
    };
  });
}

export function findTool(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name);
}
