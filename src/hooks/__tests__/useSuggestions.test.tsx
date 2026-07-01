// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '../useChat';

vi.mock('../../services/suggestions', () => ({
  STATIC_SUGGESTIONS: ['static one', 'static two', 'static three'],
  buildSuggestions: vi.fn(async () => ['fresh one', 'fresh two']),
}));

import { buildSuggestions } from '../../services/suggestions';
import { useSuggestions } from '../useSuggestions';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function Probe({
  onValue,
  ...props
}: Partial<Parameters<typeof useSuggestions>[0]> & {
  onValue?: (value: ReturnType<typeof useSuggestions>) => void;
} = {}) {
  const value = useSuggestions({
    key: props.key ?? 'session-1',
    currentCode: props.currentCode ?? 's("bd")',
    hasUserMessages: props.hasUserMessages ?? true,
    messages: props.messages ?? [
      { id: 'u1', role: 'user', content: '来点 house', timestamp: 1 } satisfies ChatMessage,
    ],
    ...props,
  });
  onValue?.(value);
  return null;
}

function renderProbe(
  props: Partial<Parameters<typeof useSuggestions>[0]> & {
    onValue?: (value: ReturnType<typeof useSuggestions>) => void;
  } = {},
) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(<Probe {...props} />);
  });

  return { root };
}

describe('useSuggestions', () => {
  const roots: Root[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => root.unmount());
    }
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('does not request LLM suggestions when disabled', async () => {
    const { root } = renderProbe({ enabled: false });
    roots.push(root);

    await act(async () => {
      await Promise.resolve();
    });

    expect(buildSuggestions).not.toHaveBeenCalled();
  });

  it('restores persisted suggestions for the current code without calling the LLM', async () => {
    let latest: ReturnType<typeof useSuggestions> | undefined;
    const { root } = renderProbe({
      currentCode: 's("bd sd")',
      persisted: { forCode: 's("bd sd")', items: ['加入贝斯', '让鼓点更密'] },
      onValue: (v) => { latest = v; },
    });
    roots.push(root);

    await act(async () => {
      await Promise.resolve();
    });

    expect(buildSuggestions).not.toHaveBeenCalled();
    expect(latest?.suggestions).toEqual(['加入贝斯', '让鼓点更密']);
  });

  it('ignores stale persisted suggestions and fetches fresh ones', async () => {
    const { root } = renderProbe({
      currentCode: 's("bd sd")',
      persisted: { forCode: 's("bd")', items: ['过期建议'] },
    });
    roots.push(root);

    await act(async () => {
      await Promise.resolve();
    });

    expect(buildSuggestions).toHaveBeenCalled();
  });

  it('persists freshly fetched suggestions via onSuggestions', async () => {
    const onSuggestions = vi.fn();
    const { root } = renderProbe({
      currentCode: 's("bd sd")',
      onSuggestions,
    });
    roots.push(root);

    await act(async () => {
      await Promise.resolve();
    });

    expect(onSuggestions).toHaveBeenCalledWith(['fresh one', 'fresh two'], 's("bd sd")');
  });
});
