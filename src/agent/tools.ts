// Tool definitions for the strudel-coding agent.
// Each tool exposes an OpenAI-compatible JSON Schema (for function calling)
// and a handler that operates on a mutable AgentState. The `commit` tool is
// terminal — it throws CommitSignal which the loop catches.

import { parseScore, summariseScore, bpmToCps, type ParsedScore } from './parser';
import { validateCodeRuntime, validateCodeTranspiler, normalizeCode, fixMiniNotationIssues } from '../services/strudel';
import { STYLE_GUIDES, type StyleId } from '../prompts/styles/index';

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

// ----- code rebuild helpers --------------------------------------------------

interface LayerLite {
  name: string;
  source: string;
}

// `silence` (no parens) is a Pattern *value* in @strudel/core, not a function.
// Earlier versions emitted `silence()` here, which throws `TypeError: silence
// is not a function` at evaluate-time and silently kills audio because Strudel's
// repl.evaluate swallows runtime errors.
function rebuildStack(layers: LayerLite[]): string {
  if (layers.length === 0) return 'silence';
  const inner = layers
    .map((l) => {
      const indentedSource = l.source
        .split('\n')
        .map((line) => '  ' + line)
        .join('\n');
      return `  /* @layer ${l.name} */\n${indentedSource}`;
    })
    .join(',\n');
  return `stack(\n${inner}\n)`;
}

// Treat both `silence` and the legacy-buggy `silence()` as the empty-body
// sentinel so older codepaths don't leak a fake "main" layer into rebuilt stacks.
function isSilencePlaceholder(src: string): boolean {
  const s = src.trim();
  return s === 'silence' || s === 'silence()';
}

function rebuildCode(
  score: ParsedScore,
  newLayers: LayerLite[],
  newCps?: number | null
): string {
  const cps = newCps !== undefined ? newCps : score.cps;
  const setcpsLine = cps !== null ? `setcps(${cps})\n` : '';
  return setcpsLine + rebuildStack(newLayers);
}

// Split a chained expression at top-level dot boundaries.
// Handles strings, nested parens/brackets, and existing newlines in the input.
function splitChainParts(code: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inStr: string | null = null;
  let cur = '';
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (inStr) {
      cur += ch;
      if (ch === inStr && code[i - 1] !== '\\') inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; cur += ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') { depth++; cur += ch; continue; }
    if (ch === ')' || ch === ']' || ch === '}') { depth--; cur += ch; continue; }
    if (ch === '.' && depth === 0 && cur !== '') {
      parts.push(cur.trim());
      cur = '.';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

// Format a full layer expression: base on first line, each method on its own
// line indented by 2 spaces. Normalises both single-line and already-multi-line input.
function formatLayerCode(code: string): string {
  const parts = splitChainParts(code);
  if (parts.length <= 1) return code.trim();
  return parts[0] + parts.slice(1).map((p) => '\n  ' + p).join('');
}

// Format an effect chain (starts with "."). All parts get a leading newline+indent
// because they are appended to an existing source expression.
function formatChain(chain: string): string {
  return splitChainParts(chain).map((p) => '\n  ' + p).join('');
}

function layersOf(score: ParsedScore): LayerLite[] {
  return score.layers.map((l) => ({ name: l.name, source: l.source }));
}

// If the current code has no stack but does have a single top-level expression
// (e.g. just `s("bd*4")`), wrap it as a default layer so layer-ops work.
function ensureStack(code: string): { score: ParsedScore; layers: LayerLite[] } {
  const score = parseScore(code);
  if (score.hasStack) {
    // Drop any placeholder-`silence` layers that older rebuilds may have left
    // behind so they never get re-serialised into a real stack.
    return {
      score,
      layers: layersOf(score).filter((l) => !isSilencePlaceholder(l.source)),
    };
  }
  // No stack — treat any non-setcps body as one layer named "main", except
  // when the body is just the empty-stack sentinel (`silence` / `silence()`).
  const body = score.setcpsMatch
    ? (code.slice(0, score.setcpsMatch.start) + code.slice(score.setcpsMatch.end))
    : code;
  const trimmed = body.trim().replace(/;$/, '').trim();
  if (!trimmed || isSilencePlaceholder(trimmed)) return { score, layers: [] };
  return { score, layers: [{ name: 'main', source: trimmed }] };
}

// ----- tool definitions ------------------------------------------------------

export const TOOLS: ToolDef[] = [
  {
    name: 'getScore',
    description:
      '读取当前正在编辑的 strudel 代码及其结构化信息（bpm、所有层名称与片段预览）。在做任何修改前应先调用一次了解现状。',
    parameters: { type: 'object', properties: {}, required: [] },
    handler: (_args, ctx) => {
      const score = parseScore(ctx.state.code);
      return {
        ok: true,
        data: {
          // layers and bpm first so the LLM sees structure before raw code.
          // code is included last for reference but is not the primary payload.
          ...summariseScore(score),
          code: ctx.state.code,
        },
      };
    },
  },

  {
    name: 'addLayer',
    description:
      '向 stack 中添加一个新层。layer name 必须唯一；若当前还没有 stack 会自动创建。code 字段填该层的 strudel 表达式（如 s("bd sd bd sd").gain(0.8)）。code 必须满足 Layer Code Generation 规则：与当前调性/音阶对齐、遵守频段分离要求、使用该角色对应的 gain 范围。',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: '层名称，建议用语义化短词：drums / hh / bass / pad / lead / fx',
        },
        code: {
          type: 'string',
          description: '该层的完整 strudel 表达式，不要包含外层 stack/setcps',
        },
      },
      required: ['name', 'code'],
    },
    handler: (args, ctx) => {
      if (typeof args.name !== 'string' || !args.name.trim()) {
        return { ok: false, error: 'name 不能为空' };
      }
      if (typeof args.code !== 'string' || !args.code.trim()) {
        return { ok: false, error: 'code 不能为空' };
      }
      const { score, layers } = ensureStack(ctx.state.code);
      if (layers.some((l) => l.name === args.name)) {
        return {
          ok: false,
          error: `layer "${args.name}" 已存在，如需修改请用 replaceLayer 或 applyEffect`,
        };
      }
      const newLayers = [...layers, { name: args.name, source: formatLayerCode(args.code) }];
      ctx.state.code = rebuildCode(score, newLayers);
      return { ok: true, data: { code: ctx.state.code, layerCount: newLayers.length } };
    },
  },

  {
    name: 'removeLayer',
    description: '从 stack 中移除指定名称的层。',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '要移除的层名称（来自 getScore 的返回）' },
      },
      required: ['name'],
    },
    handler: (args, ctx) => {
      const name = String(args.name || '');
      if (!name) return { ok: false, error: 'name 不能为空' };
      const { score, layers } = ensureStack(ctx.state.code);
      const idx = layers.findIndex((l) => l.name === name);
      if (idx < 0) {
        return { ok: false, error: `未找到 layer "${name}"` };
      }
      const newLayers = layers.filter((_, i) => i !== idx);
      ctx.state.code = rebuildCode(score, newLayers);
      return { ok: true, data: { code: ctx.state.code, layerCount: newLayers.length } };
    },
  },

  {
    name: 'replaceLayer',
    description: '把指定层的整段表达式替换为新代码。code 必须满足 Layer Code Generation 规则：与当前调性/音阶对齐、遵守频段分离要求、使用该角色对应的 gain 范围。',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '要替换的层名称' },
        code: { type: 'string', description: '新的 strudel 表达式' },
      },
      required: ['name', 'code'],
    },
    handler: (args, ctx) => {
      const name = String(args.name || '');
      if (!name) return { ok: false, error: 'name 不能为空' };
      if (typeof args.code !== 'string' || !args.code.trim()) {
        return { ok: false, error: 'code 不能为空' };
      }
      const { score, layers } = ensureStack(ctx.state.code);
      const idx = layers.findIndex((l) => l.name === name);
      if (idx < 0) {
        return { ok: false, error: `未找到 layer "${name}"` };
      }
      const newLayers = layers.slice();
      newLayers[idx] = { name, source: formatLayerCode(args.code) };
      ctx.state.code = rebuildCode(score, newLayers);
      return { ok: true, data: { code: ctx.state.code } };
    },
  },

  {
    name: 'applyEffect',
    description:
      '在指定层尾部追加效果链，例如 ".lpf(800).gain(0.7)"。chain 必须以点号开头。',
    parameters: {
      type: 'object',
      properties: {
        layer: { type: 'string', description: '目标层名称' },
        chain: {
          type: 'string',
          description: '效果链字符串，必须以点号开头，如 ".delay(0.3).room(2)"',
        },
      },
      required: ['layer', 'chain'],
    },
    handler: (args, ctx) => {
      const layerName = String(args.layer || '');
      const chain = String(args.chain || '').trim();
      if (!chain.startsWith('.')) {
        return { ok: false, error: 'chain 必须以 "." 开头' };
      }
      const { score, layers } = ensureStack(ctx.state.code);
      const idx = layers.findIndex((l) => l.name === layerName);
      if (idx < 0) {
        return { ok: false, error: `未找到 layer "${layerName}"` };
      }
      const newLayers = layers.slice();
      newLayers[idx] = { name: layerName, source: layers[idx].source + formatChain(chain) };
      ctx.state.code = rebuildCode(score, newLayers);
      return { ok: true, data: { code: ctx.state.code } };
    },
  },

  {
    name: 'setTempo',
    description: '修改速度。bpm 范围约 30 ~ 240。内部会换算为 cps（cps = bpm / 240）。',
    parameters: {
      type: 'object',
      properties: {
        bpm: { type: 'number', description: '每分钟节拍数，常见值 90/120/140/170' },
      },
      required: ['bpm'],
    },
    handler: (args, ctx) => {
      const bpm = Number(args.bpm);
      if (!isFinite(bpm) || bpm <= 0) {
        return { ok: false, error: 'bpm 必须是正数' };
      }
      const cps = bpmToCps(bpm);
      const { score, layers } = ensureStack(ctx.state.code);
      ctx.state.code = rebuildCode(score, layers, cps);
      return { ok: true, data: { code: ctx.state.code, bpm: Math.round(cps * 240), cps } };
    },
  },

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
      // Auto-fix known mini-notation issues (e.g. ";" inside "<>") before validation
      const { fixed, fixes } = fixMiniNotationIssues(code);
      const codeToValidate = fixes.length > 0 ? fixed : code;
      if (fixes.length > 0) {
        ctx.state.code = fixed;
      }
      // validateCodeRuntime handles JS syntax check (engine not ready, kind:'syntax')
      // and Proxy dry-run (engine ready, kind:'runtime') in a single call.
      const runtime = validateCodeRuntime(codeToValidate);
      if (!runtime.ok) {
        if (runtime.kind === 'syntax') {
          return { ok: false, error: `语法错误: ${runtime.error}` };
        }
        return { ok: false, error: `运行时错误: ${runtime.error}（请勿使用 TidalCycles 专有 API，如 by/sometimesBy/someCyclesBy/within；改用 .sometimes(fast(2)) 或 .every(N, fast(2)) 形式）` };
      }
      const transpilerCheck = validateCodeTranspiler(codeToValidate);
      return transpilerCheck.ok
        ? { ok: true, data: { valid: true, ...(fixes.length > 0 && { autoFixed: fixes }) } }
        : { ok: false, error: `Mini-notation 错误: ${transpilerCheck.error}` };
    },
  },

  {
    name: 'getStyleGuide',
    description:
      '获取指定风格的完整作曲规范（BPM 范围、sample bank、各角色代码骨架、风格标志技巧）。匹配到用户描述的风格后，在生成任何层代码之前调用此工具，按其规范编写 layer code。',
    parameters: {
      type: 'object',
      properties: {
        styleId: {
          type: 'string',
          enum: Object.keys(STYLE_GUIDES),
          description: '风格 ID，与用户描述匹配的风格名称',
        },
      },
      required: ['styleId'],
    },
    handler: (args, _ctx): ToolResult => {
      const { styleId } = args as { styleId: string };
      const guide = STYLE_GUIDES[styleId as StyleId];
      if (!guide) {
        return {
          ok: false,
          error: `Style guide not found for: "${styleId}". Use your own musical judgment.`,
        };
      }
      return { ok: true, data: { styleId, guide } };
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
