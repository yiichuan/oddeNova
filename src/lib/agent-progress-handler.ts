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

function formatToolCall(name: string): string {
  switch (name) {
    case 'searchSamples':
      return t('searchingSamples');
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
