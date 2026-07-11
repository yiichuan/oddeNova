// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/suggestions', () => ({
  STATIC_SUGGESTIONS: ['static one', 'static two', 'static three'],
}));

import { STATIC_SUGGESTIONS } from '../../services/suggestions';
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

  it('restores persisted suggestions generated for the current code', () => {
    let latest: ReturnType<typeof useSuggestions> | undefined;
    const { root } = renderProbe({
      currentCode: 's("bd sd")',
      persisted: { forCode: 's("bd sd")', items: ['加入贝斯', '让鼓点更密'] },
      onValue: (v) => { latest = v; },
    });
    roots.push(root);

    expect(latest?.suggestions).toEqual(['加入贝斯', '让鼓点更密']);
  });

  it('ignores stale persisted suggestions and shows static defaults', () => {
    let latest: ReturnType<typeof useSuggestions> | undefined;
    const { root } = renderProbe({
      currentCode: 's("bd sd")',
      persisted: { forCode: 's("bd")', items: ['过期建议'] },
      onValue: (v) => { latest = v; },
    });
    roots.push(root);

    expect(latest?.suggestions).not.toContain('过期建议');
    for (const s of latest?.suggestions ?? []) {
      expect(STATIC_SUGGESTIONS).toContain(s);
    }
  });

  it('shows and persists the latest commit next-steps', async () => {
    const onSuggestions = vi.fn();
    let latest: ReturnType<typeof useSuggestions> | undefined;
    const { root } = renderProbe({
      currentCode: 's("bd sd")',
      commitSuggestions: ['加入贝斯', '让鼓点更密'],
      onSuggestions,
      onValue: (v) => { latest = v; },
    });
    roots.push(root);

    await act(async () => {
      await Promise.resolve();
    });

    expect(latest?.suggestions).toEqual(['加入贝斯', '让鼓点更密']);
    expect(onSuggestions).toHaveBeenCalledWith(['加入贝斯', '让鼓点更密'], 's("bd sd")');
  });

  it('exposes up to five commit next-steps and caps the overflow', async () => {
    const onSuggestions = vi.fn();
    let latest: ReturnType<typeof useSuggestions> | undefined;
    const six = ['一', '二', '三', '四', '五', '六'];
    const { root } = renderProbe({
      currentCode: 's("bd sd")',
      commitSuggestions: six,
      onSuggestions,
      onValue: (v) => { latest = v; },
    });
    roots.push(root);

    await act(async () => {
      await Promise.resolve();
    });

    expect(latest?.suggestions).toEqual(['一', '二', '三', '四', '五']);
    expect(onSuggestions).toHaveBeenCalledWith(['一', '二', '三', '四', '五'], 's("bd sd")');
  });
});
