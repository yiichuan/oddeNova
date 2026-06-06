// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../services/strudel', () => ({
  strudelService: {
    code: '',
    onStateChange: vi.fn(() => vi.fn()),
    setMasterLPF: vi.fn().mockResolvedValue(undefined),
    setMasterVolume: vi.fn().mockResolvedValue(undefined),
    setTempo: vi.fn(),
  },
}));

import CodePanel from '../CodePanel';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function renderCodePanel(props: Partial<Parameters<typeof CodePanel>[0]> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const defaultProps: Parameters<typeof CodePanel>[0] = {
    error: null,
    isPlaying: false,
    engineReady: true,
    hasCode: true,
    onMount: vi.fn(),
    onPlay: vi.fn(),
    onStop: vi.fn(),
    exportState: { status: 'idle', progress: 0 },
    onExport: vi.fn().mockResolvedValue(true),
    onResetExportState: vi.fn(),
    session: null,
    messages: [],
    onOpenSettings: vi.fn(),
  };

  act(() => {
    root.render(<CodePanel {...defaultProps} {...props} />);
  });

  return { container, root };
}

describe('CodePanel editor focus reporting', () => {
  const roots: Root[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => root.unmount());
    }
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('reports focus entering and leaving the editor mount', () => {
    vi.useFakeTimers();
    const onEditorFocusChange = vi.fn();
    const { container, root } = renderCodePanel({ onEditorFocusChange });
    roots.push(root);

    const editorMount = container.querySelector<HTMLElement>('[data-testid="code-panel-editor-root"]');
    expect(editorMount).not.toBeNull();

    act(() => {
      editorMount?.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    });

    expect(onEditorFocusChange).toHaveBeenCalledWith(true);

    act(() => {
      editorMount?.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: document.body }));
      vi.runAllTimers();
    });

    expect(onEditorFocusChange).toHaveBeenLastCalledWith(false);
  });

  it('does not report blur when focus moves inside the editor mount', () => {
    vi.useFakeTimers();
    const onEditorFocusChange = vi.fn();
    const { container, root } = renderCodePanel({ onEditorFocusChange });
    roots.push(root);

    const editorMount = container.querySelector<HTMLElement>('[data-testid="code-panel-editor-root"]');
    expect(editorMount).not.toBeNull();

    const child = document.createElement('textarea');
    editorMount?.appendChild(child);

    act(() => {
      editorMount?.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
      editorMount?.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: child }));
      vi.runAllTimers();
    });

    expect(onEditorFocusChange).toHaveBeenCalledTimes(1);
    expect(onEditorFocusChange).toHaveBeenCalledWith(true);
  });
});
