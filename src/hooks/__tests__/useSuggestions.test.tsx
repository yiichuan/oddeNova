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
  props,
  onValue,
}: {
  props: Partial<Parameters<typeof useSuggestions>[0]>;
  onValue?: (value: ReturnType<typeof useSuggestions>) => void;
}) {
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
  let latest: ReturnType<typeof useSuggestions> | undefined;

  const render = (next: typeof props) => {
    act(() => {
      root.render(
        <Probe
          props={next}
          onValue={(value) => {
            latest = value;
            next.onValue?.(value);
          }}
        />,
      );
    });
  };

  render(props);
  return {
    root,
    latest: () => latest,
    rerender: render,
  };
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

  it('replaces only bundled defaults when daily defaults arrive late', () => {
    const view = renderProbe({ defaults: undefined, currentCode: '' });
    roots.push(view.root);

    view.rerender({ defaults: ['daily 1', 'daily 2'], currentCode: '' });

    expect(view.latest()?.suggestions).toEqual(expect.arrayContaining(['daily 1', 'daily 2']));
  });

  it('does not replace restored suggestions when daily defaults arrive', () => {
    const persisted = { forCode: 's("bd")', items: ['继续加贝斯'] };
    const view = renderProbe({ currentCode: 's("bd")', persisted });
    roots.push(view.root);

    view.rerender({ currentCode: 's("bd")', persisted, defaults: ['daily 1'] });

    expect(view.latest()?.suggestions).toEqual(['继续加贝斯']);
  });

  it('does not replace commit suggestions when daily defaults arrive', () => {
    const view = renderProbe({ currentCode: 's("bd")', commitSuggestions: ['把鼓切碎'] });
    roots.push(view.root);

    view.rerender({
      currentCode: 's("bd")',
      commitSuggestions: ['把鼓切碎'],
      defaults: ['daily 1'],
    });

    expect(view.latest()?.suggestions).toEqual(['把鼓切碎']);
  });

  it('uses the loaded daily pool after switching to an empty session', () => {
    const view = renderProbe({
      key: 'one',
      currentCode: 's("bd")',
      persisted: { forCode: 's("bd")', items: ['继续'] },
      defaults: ['daily 1', 'daily 2'],
    });
    roots.push(view.root);

    view.rerender({ key: 'two', currentCode: '', defaults: ['daily 1', 'daily 2'] });

    expect(view.latest()?.suggestions).toEqual(expect.arrayContaining(['daily 1', 'daily 2']));
  });
});
