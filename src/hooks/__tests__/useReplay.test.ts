// src/hooks/__tests__/useReplay.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runReplay } from '../useReplay';
import type { ChatMessage } from '../useChat';

function makeMsg(
  role: ChatMessage['role'],
  content: string,
  extra: Partial<ChatMessage> = {},
): ChatMessage {
  return { id: 'test', role, content, timestamp: 0, ...extra };
}

describe('runReplay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('user 消息逐字填充 inputText，发送后清空', async () => {
    const msgs = [makeMsg('user', 'hi')];
    const onAppendMessage = vi.fn();
    const onSetInputText = vi.fn();
    const onPlay = vi.fn();

    const promise = runReplay(msgs, { onAppendMessage, onSetInputText, onPlay });

    // 'h'(30ms) + 'i'(30ms) = 60ms 打字，300ms 停顿，发送，600ms 间隔
    await vi.advanceTimersByTimeAsync(990);
    await promise;

    expect(onSetInputText).toHaveBeenCalledWith('h');
    expect(onSetInputText).toHaveBeenCalledWith('hi');
    expect(onSetInputText).toHaveBeenCalledWith(''); // 发送后清空
    expect(onAppendMessage).toHaveBeenCalledOnce();
    expect(onAppendMessage).toHaveBeenCalledWith(msgs[0]);
  });

  it('assistant 消息有 code 时调用 onPlay', async () => {
    const code = 's("bd*4")';
    const msgs = [makeMsg('assistant', 'done', { code })];
    const onAppendMessage = vi.fn();
    const onPlay = vi.fn();

    const promise = runReplay(msgs, { onAppendMessage, onSetInputText: vi.fn(), onPlay });
    await vi.advanceTimersByTimeAsync(2000);
    await promise;

    expect(onPlay).toHaveBeenCalledWith(code);
    expect(onAppendMessage).toHaveBeenCalledWith(msgs[0]);
  });

  it('assistant 消息无 code 时不调用 onPlay', async () => {
    const msgs = [makeMsg('assistant', '出错了')];
    const onPlay = vi.fn();

    const promise = runReplay(msgs, { onAppendMessage: vi.fn(), onSetInputText: vi.fn(), onPlay });
    await vi.advanceTimersByTimeAsync(800);
    await promise;

    expect(onPlay).not.toHaveBeenCalled();
  });

  it('消息按原始顺序追加', async () => {
    const msgs = [
      makeMsg('progress', 'thinking...', { progressKind: 'thinking' }),
      makeMsg('progress', 'tool_call', { progressKind: 'tool_call' }),
      makeMsg('assistant', 'done', { code: 's("bd")' }),
    ];
    const order: string[] = [];
    const onAppendMessage = vi.fn((msg: ChatMessage) => order.push(msg.content));

    const promise = runReplay(msgs, { onAppendMessage, onSetInputText: vi.fn(), onPlay: vi.fn() });
    await vi.advanceTimersByTimeAsync(5000);
    await promise;

    expect(order).toEqual(['thinking...', 'tool_call', 'done']);
  });

  it('abort 后停止推送消息', async () => {
    const msgs = [makeMsg('user', 'hello world')];
    const onAppendMessage = vi.fn();
    const controller = new AbortController();

    const promise = runReplay(
      msgs,
      { onAppendMessage, onSetInputText: vi.fn(), onPlay: vi.fn() },
      controller.signal,
    );

    await vi.advanceTimersByTimeAsync(60); // 打字进行中
    controller.abort();

    await promise.catch(() => {}); // 忽略 AbortError
    expect(onAppendMessage).not.toHaveBeenCalled();
  });
});
