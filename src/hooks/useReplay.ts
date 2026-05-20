// src/hooks/useReplay.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage } from './useChat';
import type { Session } from './useSessions';

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
        await sleep(30, signal);
      }
      // 停顿模拟确认，然后"发送"
      await sleep(300, signal);
      onAppendMessage(msg);
      onSetInputText('');
      await sleep(600, signal);
    } else if (msg.role === 'progress') {
      const delay =
        msg.progressKind === 'thinking'
          ? 400
          : msg.progressKind === 'tool_call' || msg.progressKind === 'tool_result'
            ? 150
            : msg.progressKind === 'commit'
              ? 200
              : 100; // iteration / warn
      await sleep(delay, signal);
      onAppendMessage(msg);
    } else if (msg.role === 'assistant') {
      onAppendMessage(msg);
      if (msg.code) {
        onPlay(msg.code);
        await sleep(2000, signal);
      } else {
        await sleep(800, signal);
      }
    }
  }
}

// ── React Hook 封装 ───────────────────────────────────────────────────

export interface UseReplayReturn {
  isReplaying: boolean;
  replayMessages: ChatMessage[];
  replayInputText: string;
  startReplay: (session: Session) => void;
}

export function useReplay(onPlay: (code: string) => void): UseReplayReturn {
  const [isReplaying, setIsReplaying] = useState(false);
  const [replayMessages, setReplayMessages] = useState<ChatMessage[]>([]);
  const [replayInputText, setReplayInputText] = useState('');
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
      await sleep(500, controller.signal); // 等待 500ms 让 UI 稳定
      await runReplay(
        session.messages,
        {
          onAppendMessage: (msg) => setReplayMessages((prev) => [...prev, msg]),
          onSetInputText: setReplayInputText,
          onPlay: (code) => onPlayRef.current(code),
        },
        controller.signal,
      );
      setIsReplaying(false);
    })().catch((e: unknown) => {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      setIsReplaying(false);
    });
  }, []);

  return { isReplaying, replayMessages, replayInputText, startReplay };
}
