import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import ChatInput from '../components/conversation/ChatInput';
import ConversationView from '../components/conversation/ConversationView';
import AccountModal from '../components/overlays/AccountModal';
import ApiKeyModal from '../components/overlays/ApiKeyModal';
import { useAgentRunner, type AgentTurnInput } from '../hooks/useAgentRunner';
import { useAuth } from '../hooks/useAuth';
import type { ChatEntryPoint } from '../hooks/useChat';
import { useDailySuggestions } from '../hooks/useDailySuggestions';
import { useHummingInput } from '../hooks/useHummingInput';
import { useSessions } from '../hooks/useSessions';
import { useStrudel } from '../hooks/useStrudel';
import { useSuggestions } from '../hooks/useSuggestions';
import { getDemoMoodInstruction } from '../demo/demo-config';
import { createBatchedAgentProgressHandler } from '../lib/agent-progress-handler';
import { traceError, type AgentTraceSink } from '../lib/agent-trace';
import { conversationHistoryBefore } from '../lib/conversation-history';
import { codeBeforeMessage } from '../lib/draft-diff';
import { getEngineUnavailableMessage } from '../lib/engine-status';
import { deleteHummingDataForSession } from '../lib/humming-storage';
import type { ImageAttachment } from '../lib/image-attachments';
import { t, zh } from '../lib/i18n';
import { fetchMoodContext } from '../services/airjelly';
import { getActiveModelConfig, hasApiKeyConfigured } from '../services/llm-config';
import { resetClient } from '../services/llm-loader';
import { parseStepwiseChoice } from '../services/suggestions';
import type { HummingAttachment } from '../types/humming';
import AgentTraceTimeline, { type TracedTurn } from './AgentTraceTimeline';
import './agent-workflow.css';

export default function AgentWorkflowPage() {
  const auth = useAuth();
  const strudel = useStrudel();
  const { setRoot } = strudel;
  const connectEngine = useCallback((node: HTMLDivElement | null) => { if (node) setRoot(node); }, [setRoot]);
  const [accountOpen, setAccountOpen] = useState(false);
  const [generation, setGeneration] = useState(0);
  const signedIn = Boolean(auth.user);

  return (
    <main className="agent-workflow">
      <div className="agent-workflow__audio-engine" ref={connectEngine} aria-hidden="true" />
      <AgentWorkflowWorkspace
        key={generation + ':' + (auth.user?.id ?? 'guest')}
        signedIn={signedIn}
        strudel={strudel}
        openAccount={() => setAccountOpen(true)}
        reset={() => setGeneration(n => n + 1)}
      />
      {(accountOpen || auth.recoveringPassword || auth.oauthErrorKey) && (
        <AccountModal user={auth.user} configured={auth.configured}
          recoveringPassword={auth.recoveringPassword} oauthErrorKey={auth.oauthErrorKey}
          onClose={() => { auth.dismissOAuthError(); setAccountOpen(false); }} />
      )}
    </main>
  );
}

function AgentWorkflowWorkspace({ signedIn, openAccount, reset, strudel }: {
  signedIn: boolean;
  openAccount: () => void;
  reset: () => void;
  strudel: ReturnType<typeof useStrudel>;
}) {
  const [ownerKey] = useState(() => 'agent-workflow:' + globalThis.crypto.randomUUID());
  const sessions = useSessions({ ownerKey, inMemory: true });
  const session = sessions.currentSession;
  const sessionId = sessions.currentId;
  const code = session?.code ?? '';
  const currentIdRef = useRef(sessionId);
  const abortControllersRef = useRef(new Map<string, AbortController>());
  const trackedIds = useRef(new Set<string>());
  const [loadingSessions, setLoadingSessions] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(false);
  const activeSend = useRef(false);
  const available = useRef(true);
  const [commitSuggestions, setCommitSuggestions] = useState<string[] | null>(null);
  const [prefill, setRollbackPrefill] = useState('');
  const [prefillImages, setPrefillImages] = useState<ImageAttachment[]>();
  const [focusTrigger, setFocusTrigger] = useState(0);
  const [modelSettings, setModelSettings] = useState(false);
  const [modelName, setModelName] = useState(() => getActiveModelConfig().model);
  const [error, setError] = useState('');
  const [turns, setTurns] = useState<TracedTurn[]>([]);
  const nextTurn = useRef(0);
  const loading = sessionId !== null && loadingSessions.has(sessionId);
  const busy = pending || loading;
  const makeProgressHandler = useCallback(
    (id: string, canPublish?: () => boolean) => createBatchedAgentProgressHandler(sessions, id, canPublish),
    [sessions],
  );
  const runTurn = useAgentRunner({
    localDiagnostics: true,
    analyticsOwnerKey: ownerKey,
    strudel,
    sessions,
    currentCode: code,
    getLiveEditorCode: () => code,
    abortControllersRef,
    currentIdRef,
    setLoadingSessions,
    setCommitSuggestions,
    setRollbackPrefill: value => { setRollbackPrefill(value); setPrefillImages(undefined); },
    makeProgressHandler,
  });
  const { stop, setCode } = strudel;
  useLayoutEffect(() => {
    currentIdRef.current = sessionId;
    if (sessionId) trackedIds.current.add(sessionId);
  }, [sessionId]);
  useEffect(() => {
    stop();
    setCode('');
  }, [sessionId, stop, setCode]);

  useEffect(() => {
    available.current = true;
    const ids = trackedIds.current;
    return () => {
      available.current = false;
      stop();
      for (const id of ids) void deleteHummingDataForSession(ownerKey, id).catch(() => undefined);
    };
  }, [ownerKey, stop]);

  const withTrace = async (title: string, run: (trace: AgentTraceSink) => Promise<void>) => {
    if (activeSend.current || !sessionId) throw new Error(t('chatSendInProgress'));
    if (!hasApiKeyConfigured()) {
      setModelSettings(true);
      throw new Error('请先配置模型。');
    }
    activeSend.current = true;
    setPending(true);
    setError('');
    const id = ++nextTurn.current;
    const started = performance.now();
    setTurns(previous => [...previous, { id, title, events: [] }]);
    const trace: AgentTraceSink = event => {
      if (!available.current) return;
      const entry = { ...event, elapsedMs: performance.now() - started };
      setTurns(previous => previous.map(turn => turn.id === id ? { ...turn, events: [...turn.events, entry] } : turn));
    };
    try {
      await run(trace);
    } catch (error) {
      trace({ from: 'client', label: '输入或运行异常', failed: true, data: traceError(error) });
      throw error;
    } finally {
      activeSend.current = false;
      if (available.current) {
        setPending(false);
        setTurns(previous => previous.map(turn => turn.id === id ? { ...turn, ended: true } : turn));
      }
    }
  };

  const send = (text: string, entryPoint: ChatEntryPoint, images?: ImageAttachment[], humming?: HummingAttachment) =>
    withTrace(text || '图片消息', trace => runTurn({
      text, images, humming, trace, entryPoint: entryPoint === 'choice' ? 'suggestion' : entryPoint,
      selectedChoice: entryPoint === 'choice' ? true : undefined,
      includeHistory: true,
    }));

  const humming = useHummingInput({
    ownerKey, sessionId, busy, pauseTransport: strudel.pause,
    onSend: (text, entryPoint, attachment) => send(text, entryPoint, undefined, attachment),
  });
  const defaults = useDailySuggestions(zh);
  const { suggestions } = useSuggestions({
    key: sessionId ?? '',
    currentCode: code,
    defaults,
    commitSuggestions: commitSuggestions ?? undefined,
    persisted: session?.suggestions,
    onSuggestions: sessions.setSuggestions,
  });
  const messages = session?.messages ?? [];
  const latest = messages.findLast(message => message.role !== 'progress');
  const choice = latest?.inputMode === 'choice' ? parseStepwiseChoice(latest.content) : null;

  const showError = (error: unknown) => setError(traceError(error).message);
  const mood = async () => {
    try {
      await withTrace(getDemoMoodInstruction(), async trace => {
        const unavailable = getEngineUnavailableMessage(strudel.engineStatus);
        if (unavailable) throw new Error(unavailable);
        trace({ from: 'client', label: '从 AirJelly 获取心情上下文' });
        const moodContext = await fetchMoodContext();
        if (!available.current) return;
        trace({ from: 'client', label: '收到心情上下文', data: { moodContext } });
        await runTurn({
          text: getDemoMoodInstruction(), moodContext: moodContext ?? undefined,
          entryPoint: 'mood', includeHistory: false, trace,
        });
      });
    } catch (error) {
      if (available.current) showError(error);
    }
  };

  function rewind(messageId: string) {
    const target = messages.find(message => message.id === messageId && message.role === 'user');
    const beforeCode = codeBeforeMessage(messages, session?.revisions, messageId, code);
    if (!target || beforeCode === null || !sessionId) return;
    strudel.stop();
    strudel.setCode(beforeCode);
    sessions.setCurrentCode(beforeCode, sessionId);
    return { target, beforeCode };
  }

  function rollback(messageId: string) {
    if (busy) return;
    const rewound = rewind(messageId);
    if (!rewound) return;
    sessions.truncate(messageId);
    setRollbackPrefill(rewound.target.selectedChoice ? '' : rewound.target.content);
    setPrefillImages(rewound.target.images);
    setFocusTrigger(n => n + 1);
    humming.discard();
    if (rewound.target.humming) void humming.restoreAttachment(rewound.target.humming);
  }

  function retry(replyId: string) {
    if (busy) return;
    const replyIndex = messages.findIndex(message => message.id === replyId);
    const target = replyIndex < 0 ? undefined : messages.slice(0, replyIndex).findLast(message => message.role === 'user');
    if (!target) return;
    void withTrace(target.content || '重试图片消息', trace => {
      const rewound = rewind(target.id);
      if (!rewound) return Promise.resolve();
      const index = messages.indexOf(target);
      sessions.truncateAndEdit(target.id, target.content);
      const input: AgentTurnInput = {
        text: target.content, images: target.images, humming: target.humming, trace,
        entryPoint: 'retry', includeHistory: true, skipAddMessage: true, messageId: target.id,
        initialCode: rewound.beforeCode,
        initialRevisionId: messages.slice(0, index).findLast(message => message.revisionId)?.revisionId,
        suppliedHistory: conversationHistoryBefore(messages, target.id),
      };
      return runTurn(input);
    }).catch(showError);
  }

  return (
    <>
      <header className="agent-workflow__masthead">
        <div>
          <a href="/local-tools">← 本地工具</a>
          <h1>双 Agent 工作流</h1>
        </div>
        <div className="agent-workflow__actions">
          <span className="agent-workflow__model">{modelName}</span>
          <button type="button" disabled={busy} onClick={() => setModelSettings(true)}>模型设置</button>
          <button type="button" onClick={openAccount}>{signedIn ? '账户' : '登录'}</button>
          <button type="button" disabled={busy} onClick={reset}>新测试</button>
        </div>
      </header>
      <div className="agent-workflow__layout">
        <section className="agent-workflow__conversation" aria-labelledby="agent-conversation-heading">
          <header className="agent-workflow__panel-header">
            <div><h2 id="agent-conversation-heading">对话</h2><p>使用正式输入栏发送消息。测试对话仅保留在此页面。</p></div>
          </header>
          <div className="agent-workflow__messages">
            <ConversationView key={sessionId}
              messages={messages} revisions={session?.revisions} ownerKey={ownerKey}
              liveRouterProgress={sessions.liveRouterProgress}
              isLoading={loading} pendingHumming={humming.pendingSubmission}
              hummingWaveformToolCalled={humming.waveformToolCalled} onCancelHumming={humming.cancelTranscription}
              onRollback={rollback} onRetry={retry} onBranch={id => { if (!busy) sessions.branchFromMessage(id); }}
              draftCode={code} engineReady={strudel.engineReady}
              isPlaying={strudel.isPlaying} playingCode={strudel.activeCode} isStarting={strudel.isStarting}
              onPlaySegment={(_id, take) => { void strudel.play(take, 'history'); }}
              onPlayCode={take => { void strudel.play(take, 'history'); }} onStopCode={strudel.stop} />
          </div>
          {(error || strudel.error) && <p className="agent-workflow__error" role="alert">{error || strudel.error}</p>}
          <div className="agent-workflow__composer">
            <ChatInput key={sessionId} recordingScope={ownerKey + ':' + sessionId} signedIn={signedIn}
              onRequestSignIn={openAccount} isLoading={loading || sessions.isLoading}
              engineReady={strudel.engineReady} engineStatus={strudel.engineStatus} onReinitEngine={strudel.reinit}
              onStop={() => { if (sessionId) abortControllersRef.current.get(sessionId)?.abort(); }}
              onSendText={send} onMoodGenerate={mood} humming={humming}
              inputMode={choice ? 'choice' : 'normal'} choiceOptions={choice?.options} suggestions={suggestions}
              prefill={prefill} prefillImages={prefillImages} focusTrigger={focusTrigger} />
          </div>
        </section>
        <AgentTraceTimeline turns={turns} />
      </div>
      {modelSettings && <ApiKeyModal onClose={() => setModelSettings(false)}
        onSaved={() => { resetClient(); setModelName(getActiveModelConfig().model); }} />}
    </>
  );
}
