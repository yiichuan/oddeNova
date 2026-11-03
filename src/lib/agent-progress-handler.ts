import type { useSessions } from '../hooks/useSessions';
import type { ProgressEvent } from '../services/llm';
import { t } from './i18n';

type AgentProgressSessions = Pick<
  ReturnType<typeof useSessions>,
  | 'addProgress'
  | 'appendToLastAssistant'
  | 'appendToLastThinking'
  | 'appendToLastReasoning'
  | 'discardAgentAttempt'
  | 'finalizeAgentAttempt'
>;

export function createAgentProgressHandler(
  sessions: AgentProgressSessions,
  sessionId: string,
): (event: ProgressEvent) => void {
  return (event) => {
    if (event.kind === 'request_attempt_discarded') {
      sessions.discardAgentAttempt(event.attemptId, sessionId);
      return;
    }
    if (event.kind === 'request_attempt_succeeded') {
      sessions.finalizeAgentAttempt(event.attemptId, sessionId);
      return;
    }
    if (event.kind === 'iteration') return;
    if (event.kind === 'tool_call') {
      if (event.name !== 'validate' && event.name !== 'commit') {
        sessions.addProgress('tool_call', formatToolCall(event.name, event.args), {
          toolName: event.name,
          sessionId,
        });
      }
      return;
    }
    if (event.kind === 'tool_result') {
      if (!event.ok) console.error(`[agent] ❌ tool "${event.name}" failed:`, event.error || 'unknown error');
      return;
    }
    if (event.kind === 'commit') {
      sessions.addProgress('commit', t('preparingToPlay'), { sessionId });
      return;
    }
    if (event.kind === 'warn') {
      sessions.addProgress('warn', event.message, { sessionId });
      return;
    }
    if (event.kind === 'reasoning_delta') {
      sessions.appendToLastReasoning(event.delta, sessionId, event.attemptId);
      return;
    }
    if (event.kind === 'assistant_text_delta') {
      sessions.appendToLastThinking(event.delta, sessionId, event.attemptId);
      return;
    }
    if (event.kind === 'assistant_reply_delta') {
      sessions.appendToLastAssistant(event.delta, sessionId, event.attemptId);
      return;
    }
    if (event.kind === 'assistant_text') {
      sessions.addProgress('thinking', event.text, { sessionId });
    }
  };
}

type StreamDeltaEvent = Extract<
  ProgressEvent,
  { kind: 'assistant_text_delta' | 'reasoning_delta' | 'assistant_reply_delta' }
>;

const STREAM_RENDER_INTERVAL_MS = 100;

/**
 * Coalesce token deltas before they reach React state. React's development
 * component track snapshots changed props on every render, so streaming a
 * growing reasoning string token-by-token can retain a large amount of cloned
 * text in the Performance timeline. Non-delta events flush first to preserve
 * their ordering relative to the stream.
 */
export function createBatchedAgentProgressHandler(
  sessions: AgentProgressSessions,
  sessionId: string,
): (event: ProgressEvent) => void {
  const handle = createAgentProgressHandler(sessions, sessionId);
  let pending: StreamDeltaEvent | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    const event = pending;
    pending = null;
    if (event) handle(event);
  };

  return (event) => {
    if (
      event.kind !== 'assistant_text_delta'
      && event.kind !== 'reasoning_delta'
      && event.kind !== 'assistant_reply_delta'
    ) {
      flush();
      handle(event);
      return;
    }

    if (
      pending
      && (pending.kind !== event.kind || pending.attemptId !== event.attemptId)
    ) {
      flush();
    }
    if (pending) pending = { ...pending, delta: pending.delta + event.delta };
    else pending = event;
    if (timer === null) timer = setTimeout(flush, STREAM_RENDER_INTERVAL_MS);
  };
}

function formatToolCall(name: string, args: Record<string, unknown>): string {
  switch (name) {
    case 'setCode':
      return t('arrangeMusic');
    case 'getScore':
      return t('readScore');
    case 'validate':
      return t('validateCode');
    case 'commit':
      return t('commitAndPlay');
    default:
      return `${name}(${JSON.stringify(args).slice(0, 60)})`;
  }
}
