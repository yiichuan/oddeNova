import type { useSessions } from '../hooks/useSessions';
import type { ProgressEvent } from '../services/llm-loader';
import { t } from './i18n';
import { summarizeSampleSearch } from './sample-search-summary';

type AgentProgressSessions = Pick<
  ReturnType<typeof useSessions>,
  | 'addProgress'
  | 'appendToLastAssistant'
  | 'appendToLastThinking'
  | 'appendToLastReasoning'
  | 'discardAgentAttempt'
  | 'finalizeAgentAttempt'
> & Partial<Pick<ReturnType<typeof useSessions>, 'updateLiveRouterProgress'>>;

export function createAgentProgressHandler(
  sessions: AgentProgressSessions,
  sessionId: string,
): (event: ProgressEvent) => void {
  return (event) => {
    if (event.kind === 'code_draft') {
      sessions.updateLiveRouterProgress?.(sessionId, current => ({ ...current, codeDraft: event.draft }));
      return;
    }
    if (event.kind === 'request_attempt_discarded') {
      sessions.discardAgentAttempt(event.attemptId, sessionId);
      return;
    }
    if (event.kind === 'request_attempt_succeeded') {
      sessions.finalizeAgentAttempt(event.attemptId, sessionId);
      return;
    }
    if (event.kind === 'iteration') return;
    if (event.kind === 'router_stage') {
      sessions.updateLiveRouterProgress?.(sessionId, current => ({ ...current, stage: event.stage, operation: undefined }));
      return;
    }
    if (event.kind === 'router_reply_complete') {
      sessions.updateLiveRouterProgress?.(sessionId, current => ({
        ...current, reply: event.text, replyComplete: true,
      }));
      return;
    }
    if (event.kind === 'router_reply_delta' || event.kind === 'router_reply_reset') {
      sessions.updateLiveRouterProgress?.(sessionId, current => ({
        ...current,
        reply: event.kind === 'router_reply_delta' ? (current.reply ?? '') + event.delta : undefined,
        replyComplete: undefined,
      }));
      return;
    }
    if (event.kind === 'router_progress') {
      if (event.entry.kind === 'operation') {
        sessions.updateLiveRouterProgress?.(sessionId, current =>
          !current.stage || current.stage === 'composition'
            ? { ...current, operation: event.entry.title }
            : current);
      }
      sessions.addProgress('router_progress', event.entry.title, { sessionId, routerProgress: event.entry });
      return;
    }
    if (event.kind === 'tool_call') {
      if (event.name !== 'validate' && event.name !== 'commit') {
        const summary = event.name === 'searchSamples' ? summarizeSampleSearch(event.args) : [];
        sessions.addProgress('tool_call', formatToolCall(event.name), {
          toolName: event.name,
          sessionId,
          ...(summary.length > 0 && { sampleSearchSummary: summary }),
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
  { kind: 'assistant_text_delta' | 'reasoning_delta' | 'assistant_reply_delta' | 'router_reply_delta' }
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
  canPublish: () => boolean = () => true,
): (event: ProgressEvent) => void {
  const handle = createAgentProgressHandler(sessions, sessionId);
  let pending: StreamDeltaEvent | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = (): void => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    const event = pending;
    pending = null;
    if (event && canPublish()) handle(event);
  };

  return (event) => {
    if (!canPublish()) return;
    if (
      event.kind !== 'assistant_text_delta'
      && event.kind !== 'reasoning_delta'
      && event.kind !== 'assistant_reply_delta'
      && event.kind !== 'router_reply_delta'
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

function formatToolCall(name: string): string {
  switch (name) {
    case 'searchSamples':
      return t('searchingSamples');
    case 'analyzeHummingWaveform':
      return t('hummingReadingWaveform');
    case 'setCode':
      return t('arrangeMusic');
    case 'getScore':
      return t('readScore');
    case 'validate':
      return t('validateCode');
    case 'commit':
      return t('commitAndPlay');
    default:
      return t('runningTool');
  }
}
