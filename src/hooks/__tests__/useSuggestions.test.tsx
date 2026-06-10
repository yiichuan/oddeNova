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

function Probe(props: Partial<Parameters<typeof useSuggestions>[0]> = {}) {
  useSuggestions({
    key: props.key ?? 'session-1',
    currentCode: props.currentCode ?? 's("bd")',
    hasUserMessages: props.hasUserMessages ?? true,
    messages: props.messages ?? [
      { id: 'u1', role: 'user', content: '来点 house', timestamp: 1 } satisfies ChatMessage,
    ],
    ...props,
  });
  return null;
}

function renderProbe(props: Partial<Parameters<typeof useSuggestions>[0]> = {}) {
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
});
