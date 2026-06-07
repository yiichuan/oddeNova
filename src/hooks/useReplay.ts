// src/hooks/useReplay.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage } from './useChat';
import type { Session } from './useSessions';

// ── 回放延时配置（统一调参入口）─────────────────────────────────────

export const REPLAY_TIMING = {
  /** 初始等待，让 UI 在开始推消息前先稳定 */
  initialStabilize: 500,

  /** 逐字打入输入框的每字间隔 */
  charInterval: 30,
  /** 打完一条用户消息后的确认停顿 */
  afterTyping: 300,
  /** 用户消息"发送"后到下一条消息的间隔 */
  afterUserSend: 600,

  /** progress 消息各类型的停顿 */
  progress: {
    thinking: 400,
    toolCallResult: 150,
    commit: 200,
    other: 100, // iteration / warn
  },

  /** 助手消息带代码（触发播放）后的停顿 */
  afterPlay: 4000,
  /** 助手消息无代码后的停顿 */
  afterAssistant: 800,

  /** 回放全部完成后，回放按钮再次出现前的延迟 */
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
 * 按 session 消息顺序依次回放，通过 callbacks 通知外层。
 * 若 signal 触发 abort，会提前退出（reject with AbortError）。
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
      // 逐字流入输入框
      let accumulated = '';
      for (const char of msg.content) {
        if (signal?.aborted) return;
        accumulated += char;
        onSetInputText(accumulated);
        await sleep(REPLAY_TIMING.charInterval, signal);
      }
      // 停顿模拟确认，然后"发送"
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

// ── React Hook 封装 ───────────────────────────────────────────────────

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

    // 立即设为 true → 按钮消失；内部 500ms 后才开始推消息
    setIsReplaying(true);
    setReplayMessages([]);
    setReplayInputText('');

    (async () => {
      await sleep(REPLAY_TIMING.initialStabilize, controller.signal); // 等待让 UI 稳定
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
