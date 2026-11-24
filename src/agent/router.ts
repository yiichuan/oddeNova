import { ROUTER_PROMPT, ROUTER_RESULT_PROMPT } from '../prompts/router';
import { getRetryDelayMs, isRetryableRequestError, waitForRetryDelay } from '../lib/errors';
import type { ChatMsg, LLMCaller } from './loop';
import { editScopes, scopedParameters, type EditScope, type describeEditTargets } from './session-scope';

export interface TurnRef {
  sessionId: string;
  messageId: string;
  turnId: string;
}

export interface SessionVersion {
  code: string;
  revisionId?: string;
}

export type RouterDecision =
  | { kind: 'reply'; text: string }
  | { kind: 'inspect'; question: string }
  | { kind: 'execute'; task: SessionTask };

export interface SessionTask {
  instruction: string;
  scope: EditScope;
  needsSynthesis: boolean;
}

interface RouterContext {
  hasCode: boolean;
  hasHumming: boolean;
  lastReceipt?: string;
  editTargets?: ReturnType<typeof describeEditTargets>;
  entryPoint?: string;
}

type RouterResponse = Awaited<ReturnType<LLMCaller['chatWithTools']>>;

const ROUTER_TOOLS: Parameters<LLMCaller['chatWithTools']>[1] = [
  {
    type: 'function',
    function: {
      name: 'inspectSession',
      description: 'Read facts from the current composition and its preceding version.',
      parameters: {
        type: 'object',
        properties: { question: { type: 'string' } },
        required: ['question'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'executeSession',
      description: 'Authorize a concrete music task with the narrowest applicable edit scope.',
      parameters: {
        type: 'object',
        properties: {
          instruction: { type: 'string', description: 'Resolved implementation brief with concrete outcome and preservation requirements.' },
          scope: { type: 'string', enum: [...editScopes] },
          targets: { type: 'array', items: { type: 'string' }, description: 'Required layer or section IDs for scoped edits.' },
          parameter: { type: 'string', enum: [...scopedParameters], description: 'Required for parameter scope.' },
          needsSynthesis: { type: 'boolean', description: 'True when the execution result needs additional synthesis to answer the user.' },
        },
        required: ['instruction', 'scope', 'needsSynthesis'],
        additionalProperties: false,
      },
    },
  },
];

class InvalidRouterResponse extends Error {}

function resolveScope(properties: Record<string, unknown>, context: RouterContext): EditScope | undefined {
  const { scope, targets, parameter } = properties;
  if (scope === 'create' && !context.hasCode && targets === undefined && parameter === undefined) return { kind: scope };
  if (!context.hasCode) return;
  if (targets === undefined && parameter === undefined) {
    if (scope === 'rewrite' || (scope === 'tempo' && context.editTargets?.tempoEditable)
      || (scope === 'add_layers' && context.editTargets?.canAddLayers)) return { kind: scope };
    return;
  }
  if (scope !== 'layers' && scope !== 'section' && scope !== 'parameter') return;
  const validTargets = scope === 'section' ? context.editTargets?.sections : context.editTargets?.layers;
  if (!Array.isArray(targets) || !targets.length || new Set(targets).size !== targets.length
    || !targets.every(target => typeof target === 'string' && validTargets?.some(entry => entry.id === target))) return;
  if (scope !== 'parameter') return parameter === undefined ? { kind: scope, targets } : undefined;
  const method = scopedParameters.find(item => item === parameter);
  if (method) return { kind: scope, targets, parameter: method };
}

function decisionFrom(response: RouterResponse, context: RouterContext): RouterDecision {
  const text = response.content?.trim();
  if (response.toolCalls.length === 0 && text) return { kind: 'reply', text };
  if (response.toolCalls.length !== 1) throw new InvalidRouterResponse('Expected one answer or delegation');

  const { name, arguments: json } = response.toolCalls[0];
  let args: unknown;
  try {
    args = JSON.parse(json);
  } catch {
    throw new InvalidRouterResponse('Invalid delegation arguments');
  }
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    throw new InvalidRouterResponse('Expected a delegation object');
  }
  const properties = args as Record<string, unknown>;
  if (name === 'inspectSession' && Object.keys(properties).length === 1
    && typeof properties.question === 'string' && properties.question.trim()) {
    return { kind: 'inspect', question: properties.question.trim() };
  }
  if (name === 'executeSession'
    && Object.keys(properties).every(key => ['instruction', 'scope', 'targets', 'parameter', 'needsSynthesis'].includes(key))
    && typeof properties.instruction === 'string' && properties.instruction.trim()
    && typeof properties.needsSynthesis === 'boolean') {
    const scope = resolveScope(properties, context);
    if (scope) return { kind: 'execute', task: {
      instruction: properties.instruction.trim(), scope, needsSynthesis: properties.needsSynthesis,
    } };
  }
  throw new InvalidRouterResponse('Invalid delegation');
}

const REQUEST_TIMEOUT_MS = 25_000;

async function requestRouter<T>(
  llm: LLMCaller,
  messages: ChatMsg[],
  tools: typeof ROUTER_TOOLS,
  parse: (response: RouterResponse) => T,
  signal?: AbortSignal,
  onRetry?: () => void,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted();
    const deadline = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const requestSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
    try {
      const response = await llm.chatWithTools(messages, tools, undefined, undefined, requestSignal, false);
      requestSignal.throwIfAborted();
      return parse(response);
    } catch (error) {
      signal?.throwIfAborted();
      if (attempt > 0 || !(deadline.aborted || error instanceof InvalidRouterResponse || isRetryableRequestError(error, signal))) {
        if (deadline.aborted) throw new Error('Router request timed out');
        throw error;
      }
      onRetry?.();
      await waitForRetryDelay(getRetryDelayMs(1), signal);
    }
  }
}

export type RouterVoice = { name: string; prompt?: string };

export function withVoice(instructions: string, voice?: RouterVoice): string {
  if (!voice) return instructions;
  return `${instructions}

Use the selected persona for user-facing tone. Follow the instructions above.
${JSON.stringify({ name: voice.name, prompt: voice.prompt })}`;
}

export function routeConversation(
  llm: LLMCaller,
  history: ChatMsg[],
  userContent: string,
  sessionContext: RouterContext,
  options: { signal?: AbortSignal; onRetry?: () => void } = {},
): Promise<RouterDecision> {
  return requestRouter(llm, [
    { role: 'system', content: ROUTER_PROMPT },
    ...history,
    { role: 'user', content: JSON.stringify({ session: sessionContext, message: userContent }) },
  ], ROUTER_TOOLS, response => decisionFrom(response, sessionContext), options.signal, options.onRetry);
}

export async function answerWithSessionResult(
  llm: LLMCaller,
  history: ChatMsg[],
  userContent: string,
  result: unknown,
  signal?: AbortSignal,
  voice?: RouterVoice,
  onTextDelta?: (delta: string) => void,
): Promise<string> {
  signal?.throwIfAborted();
  const deadline = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const requestSignal = signal ? AbortSignal.any([signal, deadline]) : deadline;
  try {
    const response = await llm.chatWithTools([
      { role: 'system', content: withVoice(ROUTER_RESULT_PROMPT, voice) },
      ...history,
      { role: 'user', content: JSON.stringify({ message: userContent, sessionResult: result }) },
    ], [], onTextDelta && (delta => {
      if (!requestSignal.aborted) onTextDelta(delta);
    }), undefined, requestSignal, false);
    signal?.throwIfAborted();
    if (deadline.aborted) throw new Error('Router answer timed out');
    const text = response.content?.trim();
    if (!text || response.toolCalls.length) throw new InvalidRouterResponse('Expected a final answer');
    return text;
  } catch (error) {
    signal?.throwIfAborted();
    if (deadline.aborted) throw new Error('Router answer timed out');
    throw error;
  }
}
