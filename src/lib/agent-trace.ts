import type { LLMCaller } from '../agent/loop';
import { getErrorMessage, getErrorStatus } from './errors';

export type TraceActor = 'client' | 'router' | 'session' | 'model' | 'tool';
export type AgentTraceSink = (event: {
  from: TraceActor;
  to?: TraceActor;
  label: string;
  data?: unknown;
  durationMs?: number;
  failed?: boolean;
}) => void;

export function traceError(error: unknown) {
  const message = getErrorMessage(error)
    .replace(/\bBearer\s+[A-Za-z0-9_.~+/-]+/gi, 'Bearer [redacted]')
    .replace(/\bsk-[A-Za-z0-9_*-]{8,}/g, '[redacted]');
  return { message, status: getErrorStatus(error) };
}

export function traceModel(
  caller: LLMCaller,
  trace: AgentTraceSink | undefined,
  actor: 'router' | 'session',
  label: string,
  model: { provider: string; model: string },
): LLMCaller {
  if (!trace) return caller;
  let request = 0;
  return {
    async chatWithTools(...args) {
      const id = ++request;
      const [messages, tools, , , , thinking, thinkingLevel] = args;
      const started = performance.now();
      trace({
        from: actor, to: 'model', label: label + ' · 请求 ' + id, data: {
          provider: model.provider, model: model.model, thinking, thinkingLevel,
          messages: messages.map(({ role, content, tool_calls, tool_call_id, name }) => ({
            role, content, tool_calls, tool_call_id, name,
          })),
          tools,
        },
      });
      try {
        const response = await caller.chatWithTools(...args);
        const { content, toolCalls, usage } = response;
        trace({
          from: 'model', to: actor, label: label + ' · 响应 ' + id, durationMs: performance.now() - started,
          data: { content, toolCalls, usage },
        });
        return response;
      } catch (error) {
        trace({
          from: 'model', to: actor, label: label + ' · 请求失败 ' + id,
          durationMs: performance.now() - started, data: traceError(error), failed: true,
        });
        throw error;
      }
    },
  };
}
