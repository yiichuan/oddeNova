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
    setLineWrappingEnabled: vi.fn(),
  },
}));

import CodePanel from '../CodePanel';
import { strudelService } from '../../services/strudel';
import { t } from '../../lib/i18n';

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
    code: 'setcps(0.5)\ns("bd sd").mask("<1 0>/16")',
    error: null,
    isPlaying: false,
    engineReady: true,
    onMount: vi.fn(),
    onPlay: vi.fn(),
    onStop: vi.fn(),
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

  it('does not render the desktop action bar inside the code panel region', () => {
    installMatchMedia(false);
    const { container, root } = renderCodePanel();
    roots.push(root);

    const settingsButton = [...container.querySelectorAll('button')]
      .find((button) => button.textContent === t('settings'));

    expect(settingsButton).toBeUndefined();
  });

  it('separates the desktop code and playback controls into matching sidebar surfaces', () => {
    installMatchMedia(false);
    const { container, root } = renderCodePanel();
    roots.push(root);

    const codeLayer = container.querySelector('[data-testid="code-panel-code-layer"]');
    const controlsLayer = container.querySelector('[data-testid="code-panel-controls-layer"]');

    expect(codeLayer).not.toBeNull();
    expect(controlsLayer).not.toBeNull();
    expect(codeLayer?.classList.contains('bg-conversation-surface')).toBe(true);
    expect(codeLayer?.classList.contains('border')).toBe(true);
    expect(codeLayer?.classList.contains('border-border')).toBe(true);
    expect(codeLayer?.classList.contains('overflow-hidden')).toBe(true);
    expect(controlsLayer?.classList.contains('bg-conversation-surface')).toBe(true);
    expect(controlsLayer?.classList.contains('code-panel-controls-glass')).toBe(true);
    expect(controlsLayer?.classList.contains('border')).toBe(true);
    expect(controlsLayer?.classList.contains('-mt-px')).toBe(true);
    expect(controlsLayer?.classList.contains('-ml-px')).toBe(true);
    expect(controlsLayer?.classList.contains('w-[calc(100%+2px)]')).toBe(true);
    expect(controlsLayer?.classList.contains('z-10')).toBe(true);
    expect(controlsLayer?.classList.contains('h-12')).toBe(true);
    expect(controlsLayer?.querySelector('[data-testid="code-panel-controls-light-border"]')).not.toBeNull();
    const playControl = controlsLayer?.querySelector<HTMLElement>('[data-testid="code-panel-play-control"]');
    expect(playControl?.style.marginLeft).toBe('var(--code-panel-play-button-offset)');
    expect(playControl?.style.width).toBe('');
    expect(playControl?.style.minWidth).toBe('');
    const lightBlobs = controlsLayer?.querySelectorAll('.code-panel-light-blob') ?? [];
    expect(lightBlobs).toHaveLength(6);
    expect(controlsLayer?.querySelectorAll('.code-panel-light-blob circle')).toHaveLength(15);
    expect(controlsLayer?.querySelectorAll('.code-panel-light-blob filter')).toHaveLength(6);
    expect(controlsLayer?.querySelectorAll('.code-panel-light-blob animate')).toHaveLength(30);
    lightBlobs.forEach((blob) => {
      expect(blob.querySelectorAll('circle').length).toBeGreaterThanOrEqual(2);
      expect(blob.querySelectorAll('circle').length).toBeLessThanOrEqual(3);
    });
  });

  it('keeps the playback button and timeline in the desktop controls layer', () => {
    installMatchMedia(false);
    const { container, root } = renderCodePanel();
    roots.push(root);

    const controlsLayer = container.querySelector('[data-testid="code-panel-controls-layer"]');
    const playButton = controlsLayer?.querySelector<HTMLButtonElement>('button');

    expect(controlsLayer?.querySelectorAll('button')).toHaveLength(1);
    expect(playButton?.classList.contains('bg-[#050505]')).toBe(true);
    expect(playButton?.classList.contains('text-text-primary')).toBe(true);
    expect(playButton?.classList.contains('w-7')).toBe(true);
    expect(playButton?.classList.contains('h-7')).toBe(true);
    expect(playButton?.querySelector('.lucide-play')).not.toBeNull();
    expect(controlsLayer?.querySelector('input[type="range"]')).toBeNull();
    const progress = controlsLayer?.querySelector<HTMLElement>('[role="progressbar"]');
    expect(progress?.getAttribute('aria-valuenow')).toBe('0');
    expect(progress?.classList.contains('text-text-primary')).toBe(true);
    expect(progress?.classList.contains('w-[100px]')).toBe(true);
    expect(controlsLayer?.querySelector('[data-testid="code-panel-playback-progress-fill"]')).not.toBeNull();
    expect(controlsLayer?.querySelector('[data-testid="code-panel-playback-time"]')?.textContent).toBe('00:00/00:32');
    expect(controlsLayer?.textContent).not.toContain('Volume');
    expect(controlsLayer?.textContent).not.toContain('BPM');
    expect(controlsLayer?.textContent).not.toContain('LPF');
    expect(controlsLayer?.querySelector<HTMLElement>(':scope > div')?.style.borderRight).toBe('');
  });

  it('uses the same circular background with a Lucide square while playing', () => {
    installMatchMedia(false);
    const { container, root } = renderCodePanel({ isPlaying: true });
    roots.push(root);

    const stopButton = container.querySelector<HTMLButtonElement>('[data-testid="code-panel-controls-layer"] button');

    expect(stopButton?.classList.contains('rounded-full')).toBe(true);
    expect(stopButton?.classList.contains('bg-[#050505]')).toBe(true);
    expect(stopButton?.classList.contains('text-text-primary')).toBe(true);
    expect(stopButton?.querySelector('.lucide-square')).not.toBeNull();
  });

  it('disables and grays the play button with a zero duration when code is empty', () => {
    installMatchMedia(false);
    const { container, root } = renderCodePanel({ code: '' });
    roots.push(root);

    const playButton = container.querySelector<HTMLButtonElement>('[data-testid="code-panel-controls-layer"] button');
    const time = container.querySelector('[data-testid="code-panel-playback-time"]');

    expect(playButton?.disabled).toBe(true);
    expect(playButton?.classList.contains('disabled:bg-[#2A2A2A]')).toBe(true);
    expect(playButton?.classList.contains('disabled:text-[#686868]')).toBe(true);
    expect(time?.textContent).toBe('00:00/00:00');
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

  it('wraps long lines on mobile but not on desktop', () => {
    installMatchMedia(true);
    const { root } = renderCodePanel();
    roots.push(root);

    expect(strudelService.setLineWrappingEnabled).toHaveBeenCalledWith(true);

    installMatchMedia(false);
    const second = renderCodePanel();
    roots.push(second.root);

    expect(strudelService.setLineWrappingEnabled).toHaveBeenLastCalledWith(false);
  });

  it('updates line wrapping when the layout crosses the mobile breakpoint', () => {
    const setMobile = installMatchMedia(false);
    const { root } = renderCodePanel();
    roots.push(root);

    act(() => setMobile(true));
    expect(strudelService.setLineWrappingEnabled).toHaveBeenLastCalledWith(true);

    act(() => setMobile(false));
    expect(strudelService.setLineWrappingEnabled).toHaveBeenLastCalledWith(false);
  });
});
