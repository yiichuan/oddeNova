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
    setAutocompletionEnabled: vi.fn(),
  },
}));

import CodePanel from '../CodePanel';
import { strudelService } from '../../services/strudel';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function installMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => ({
      get matches() { return matches; },
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
    })),
  });

  return (nextMatches: boolean) => {
    matches = nextMatches;
    const event = { matches } as MediaQueryListEvent;
    listeners.forEach((listener) => listener(event));
  };
}

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
    onGenerateTitle: vi.fn().mockResolvedValue('Generated title'),
    onResetExportState: vi.fn(),
    session: null,
    messages: [],
    onOpenSettings: vi.fn(),
    onOpenAccount: vi.fn(),
    accountLabel: 'Sign in',
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
    vi.clearAllMocks();
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

  it('enables autocompletion by default on desktop', () => {
    installMatchMedia(false);

    const { root } = renderCodePanel();
    roots.push(root);

    expect(strudelService.setAutocompletionEnabled).toHaveBeenCalledWith(true);
  });

  it('disables autocompletion on mobile', () => {
    installMatchMedia(true);

    const { root } = renderCodePanel();
    roots.push(root);

    expect(strudelService.setAutocompletionEnabled).toHaveBeenCalledWith(false);
  });

  it('updates autocompletion when the layout crosses the mobile breakpoint', () => {
    const setMobile = installMatchMedia(false);
    const { root } = renderCodePanel();
    roots.push(root);

    act(() => setMobile(true));
    expect(strudelService.setAutocompletionEnabled).toHaveBeenLastCalledWith(false);

    act(() => setMobile(false));
    expect(strudelService.setAutocompletionEnabled).toHaveBeenLastCalledWith(true);
  });

  it.each([true, false])('stays silent while cloud sync is healthy (mobile: %s)', (mobile) => {
    installMatchMedia(mobile);
    const { container, root } = renderCodePanel({
      syncStatus: 'saving',
      showSyncStatus: true,
    });
    roots.push(root);

    expect(container.querySelector('[data-session-sync-status]')).toBeNull();
  });

  it('floats an unsynced warning over the code without taking layout height', () => {
    installMatchMedia(false);
    const { container, root } = renderCodePanel({
      syncStatus: 'offline',
      showSyncStatus: true,
    });
    roots.push(root);

    const status = container.querySelector('[data-session-sync-status="offline"]');
    expect(status).not.toBeNull();
    expect(status?.closest('.absolute')).not.toBeNull();
  });

  it('anchors the sync warning independently of the error banner', () => {
    installMatchMedia(false);
    const withError = renderCodePanel({
      error: 'boom',
      syncStatus: 'offline',
      showSyncStatus: true,
    });
    const withoutError = renderCodePanel({
      syncStatus: 'offline',
      showSyncStatus: true,
    });
    roots.push(withError.root, withoutError.root);

    const capsuleOf = (c: HTMLElement) => c.querySelector('[data-session-sync-status="offline"]');
    const overlay = capsuleOf(withError.container)?.parentElement;
    expect(overlay).not.toBeNull();
    // Banner and capsule share one bottom-aligned row, not a stack.
    expect(withError.container.querySelector('.bg-error\\/10')?.parentElement).toBe(overlay);
    expect(overlay?.className).not.toContain('flex-col');
    // Capsule stays the trailing item either way, so it never shifts.
    expect(overlay?.lastElementChild).toBe(capsuleOf(withError.container));
    expect(capsuleOf(withoutError.container)?.parentElement?.lastElementChild)
      .toBe(capsuleOf(withoutError.container));
  });
});
