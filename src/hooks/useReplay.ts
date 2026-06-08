// src/hooks/useReplay.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage } from './useChat';
import type { Session } from './useSessions';

// ── Replay timing configuration (single place to tune all delays) ─────────

export const REPLAY_TIMING = {
  /** Initial wait to let the UI stabilize before messages start being pushed */
  initialStabilize: 500,

  /** Interval between each character typed into the input box */
  charInterval: 30,
  /** Confirmation pause after finishing typing a user message */
  afterTyping: 300,
  /** Delay after a user message is "sent" before the next message */
  afterUserSend: 600,

  /** Pause durations for each type of progress message */
  progress: {
    thinking: 400,
    toolCallResult: 150,
    commit: 200,
    other: 100, // iteration / warn
  },

  /** Pause after an assistant message that carries code (triggering playback) */
  afterPlay: 4000,
  /** Pause after an assistant message with no code */
  afterAssistant: 800,

  /** Delay after all replay is complete before the replay button reappears */
  afterReplayComplete: 6000,
};

/** progress 消息各 kind 的回放停顿；未列出的 kind（reasoning/iteration/warn）走 other。 */
const PROGRESS_REPLAY_DELAY: Record<string, number> = {
  thinking: REPLAY_TIMING.progress.thinking,
  tool_call: REPLAY_TIMING.progress.toolCallResult,
  tool_result: REPLAY_TIMING.progress.toolCallResult,
  commit: REPLAY_TIMING.progress.commit,
};

// ── 纯异步回放逻辑（可单独测试）──────────────────────────────────────

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  return new Promise((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(id);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

export interface ReplayCallbacks {
  onAppendMessage: (msg: ChatMessage) => void;
  onSetInputText: (text: string) => void;
  onPlay: (code: string) => void;
}

/**
 * Replay session messages in order, notifying the outer layer via callbacks.
 * If the signal triggers an abort, exits early (rejects with AbortError).
 */
export async function runReplay(
  messages: ChatMessage[],
  callbacks: ReplayCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const { onAppendMessage, onSetInputText, onPlay } = callbacks;

  for (const msg of messages) {
    if (signal?.aborted) return;

    if (msg.role === 'user') {
      // Stream characters into the input box one at a time
      let accumulated = '';
      for (const char of msg.content) {
        if (signal?.aborted) return;
        accumulated += char;
        onSetInputText(accumulated);
        await sleep(REPLAY_TIMING.charInterval, signal);
      }
      // Pause to simulate confirmation, then "send"
      await sleep(REPLAY_TIMING.afterTyping, signal);
      onAppendMessage(msg);
      onSetInputText('');
      await sleep(REPLAY_TIMING.afterUserSend, signal);
    } else if (msg.role === 'progress') {
      const delay = PROGRESS_REPLAY_DELAY[msg.progressKind ?? ''] ?? REPLAY_TIMING.progress.other;
      await sleep(delay, signal);
      onAppendMessage(msg);
    } else if (msg.role === 'assistant') {
      onAppendMessage(msg);
      if (msg.code) {
        onPlay(msg.code);
        await sleep(REPLAY_TIMING.afterPlay, signal);
      } else {
        await sleep(REPLAY_TIMING.afterAssistant, signal);
      }
    }
  }
}

// ── React Hook wrapper ────────────────────────────────────────────────────

export interface UseReplayReturn {
  isReplaying: boolean;
  replayMessages: ChatMessage[];
  replayInputText: string | undefined;
  startReplay: (session: Session) => void;
}

export function useReplay(onPlay: (code: string) => void): UseReplayReturn {
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayMessages, setReplayMessages] = useState<ChatMessage[]>([]);
  const [replayInputText, setReplayInputText] = useState<string | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);
  const onPlayRef = useRef(onPlay);

  useEffect(() => {
    onPlayRef.current = onPlay;
  }, [onPlay]);

  const startReplay = useCallback((session: Session) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Set to true immediately → button disappears; messages start being pushed 500ms later
    setIsReplaying(true);
    setReplayMessages([]);
    setReplayInputText('');

    (async () => {
      await sleep(REPLAY_TIMING.initialStabilize, controller.signal); // wait for UI to stabilize
      await runReplay(
        session.messages,
        {
          onAppendMessage: (msg) => setReplayMessages((prev) => [...prev, msg]),
          onSetInputText: setReplayInputText,
          onPlay: (code) => onPlayRef.current(code),
        },
        controller.signal,
      );
      await sleep(REPLAY_TIMING.afterReplayComplete, controller.signal);
      setIsReplaying(false);
      setReplayInputText(undefined);
    })().catch((e: unknown) => {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setIsReplaying(false);
      setReplayInputText(undefined);
    });
  }, []);

  return { isReplaying, replayMessages, replayInputText, startReplay };
}
