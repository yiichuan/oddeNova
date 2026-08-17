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
    seekPlayback: vi.fn(),
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
    isPaused: false,
    engineReady: true,
    session: {
      id: 'session-1',
      title: 'Test session',
      messages: [],
      code: 's("bd")',
      createdAt: 0,
      updatedAt: 0,
    },
    messages: [],
    exportState: { status: 'idle', progress: 0 },
    onExport: vi.fn().mockResolvedValue(true),
    onGenerateTitle: vi.fn().mockResolvedValue('Generated title'),
    onResetExportState: vi.fn(),
    bpm: 120,
    onMount: vi.fn(),
    onPlay: vi.fn(),
    onPause: vi.fn(),
  };

  const render = (overrides: Partial<Parameters<typeof CodePanel>[0]>) => {
    act(() => {
      root.render(<CodePanel {...defaultProps} {...props} {...overrides} />);
    });
  };

  render({});

  return { container, root, rerender: render };
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

  it('shows runtime errors as a red rounded popover aligned to the CodePanel top-right', () => {
    const { container, root } = renderCodePanel({ error: 'notARealStrudelMethod is not defined' });
    roots.push(root);

    const errorPopover = container.querySelector<HTMLElement>('[data-testid="code-panel-runtime-error"]');
    expect(errorPopover?.classList.contains('top-[8px]')).toBe(true);
    expect(errorPopover?.classList.contains('right-[8px]')).toBe(true);
    expect(errorPopover?.classList.contains('rounded-[4px]')).toBe(true);
    expect(errorPopover?.classList.contains('border-[#E01A1A]')).toBe(true);
    expect(errorPopover?.classList.contains('text-[#E01A1A]')).toBe(true);
    expect(errorPopover?.style.maxWidth).toBe('min(420px, calc(100% - 24px))');
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
    expect(controlsLayer?.classList.contains('code-panel-controls')).toBe(true);
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

    expect(controlsLayer?.querySelectorAll('button')).toHaveLength(5);
    expect(playButton?.classList.contains('control-button-surface')).toBe(true);
    expect(playButton?.classList.contains('cursor-pointer')).toBe(true);
    expect(playButton?.classList.contains('hover:text-[#C8C8C8]')).toBe(true);
    expect(playButton?.classList.contains('hover:opacity-70')).toBe(false);
    expect(playButton?.classList.contains('text-[#A8A8A8]')).toBe(true);
    expect(playButton?.classList.contains('w-8')).toBe(true);
    expect(playButton?.classList.contains('h-8')).toBe(true);
    expect(playButton?.querySelector('.lucide-play')).not.toBeNull();
    const progress = controlsLayer?.querySelector<HTMLInputElement>('[data-testid="code-panel-playback-seek"]');
    expect(progress?.value).toBe('0');
    expect(progress?.type).toBe('range');
    expect(controlsLayer?.querySelector('[data-testid="code-panel-playback-progress-fill"]')).not.toBeNull();
    expect(controlsLayer?.querySelector('[data-testid="code-panel-playback-progress-fill"]')?.classList.contains('bg-[#CD5633]')).toBe(true);
    const track = controlsLayer?.querySelector('[data-testid="code-panel-playback-track"]');
    expect(track?.classList.contains('h-[2px]')).toBe(true);
    expect(track?.classList.contains('group-hover:h-[4px]')).toBe(true);
    expect(track?.classList.contains('group-focus-within:h-[4px]')).toBe(true);
    const thumb = controlsLayer?.querySelector('[data-testid="code-panel-playback-progress-thumb"]');
    expect(thumb?.classList.contains('h-[10px]')).toBe(true);
    expect(thumb?.classList.contains('w-[10px]')).toBe(true);
    expect(thumb?.classList.contains('group-hover:h-4')).toBe(true);
    expect(thumb?.classList.contains('group-hover:w-4')).toBe(true);
    expect(thumb?.classList.contains('group-hover:opacity-100')).toBe(true);
    expect(controlsLayer?.querySelector('[data-testid="code-panel-playback-time"]')?.textContent).toBe('00:00/01:04');
    expect(controlsLayer?.querySelector('[data-testid="code-panel-time-liquid-glass-preview"]')).toBeNull();
    expect(controlsLayer?.textContent).not.toContain('Volume');
    expect(controlsLayer?.textContent).not.toContain('BPM');
    expect(controlsLayer?.textContent).not.toContain('LPF');
    expect(controlsLayer?.querySelector<HTMLElement>(':scope > div')?.style.borderRight).toBe('');
  });

  it('shows a pause button while playing and invokes pause', () => {
    installMatchMedia(false);
    const onPause = vi.fn();
    const { container, root } = renderCodePanel({ isPlaying: true, onPause });
    roots.push(root);

    const pauseButton = container.querySelector<HTMLButtonElement>(`button[aria-label="${t('pause')}"]`);

    expect(pauseButton?.classList.contains('rounded-full')).toBe(true);
    expect(pauseButton?.classList.contains('control-button-surface')).toBe(true);
    expect(pauseButton?.classList.contains('text-[#A8A8A8]')).toBe(true);
    expect(pauseButton?.querySelector('.lucide-pause')).not.toBeNull();
    act(() => pauseButton?.click());
    expect(onPause).toHaveBeenCalledOnce();
  });

  it('seeks continuously and keeps the selected time while stopped', () => {
    installMatchMedia(false);
    const { container, root } = renderCodePanel();
    roots.push(root);

    const seek = container.querySelector<HTMLInputElement>('[data-testid="code-panel-playback-seek"]');
    const track = container.querySelector<HTMLElement>('[data-testid="code-panel-playback-track"]');
    const thumb = container.querySelector<HTMLElement>('[data-testid="code-panel-playback-progress-thumb"]');

    act(() => {
      seek?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      if (!seek) return;
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setValue?.call(seek, '500');
      seek.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(strudelService.seekPlayback).toHaveBeenCalledWith(0.5, 32);
    expect(container.querySelector('[data-testid="code-panel-playback-time"]')?.textContent).toBe('00:32/01:04');
    expect(track?.classList.contains('h-[4px]')).toBe(true);
    expect(thumb?.classList.contains('h-4')).toBe(true);
    expect(thumb?.classList.contains('w-4')).toBe(true);
    expect(thumb?.classList.contains('opacity-100')).toBe(true);

    act(() => {
      seek?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    });
    expect(track?.classList.contains('h-[2px]')).toBe(true);
    expect(thumb?.classList.contains('h-[10px]')).toBe(true);
    expect(thumb?.classList.contains('opacity-0')).toBe(true);
  });

  it('disables seeking when there is no playable code', () => {
    installMatchMedia(false);
    const { container, root } = renderCodePanel({ code: '' });
    roots.push(root);

    expect(container.querySelector<HTMLInputElement>('[data-testid="code-panel-playback-seek"]')?.disabled).toBe(true);
    expect(container.querySelector('[data-testid="code-panel-playback-time"]')?.textContent).toBe('00:00/00:00');
  });

  it('keeps the selected progress visible while paused', () => {
    installMatchMedia(false);
    const { container, root } = renderCodePanel({ isPaused: true });
    roots.push(root);

    const seek = container.querySelector<HTMLInputElement>('[data-testid="code-panel-playback-seek"]');
    act(() => {
      if (!seek) return;
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setValue?.call(seek, '500');
      seek.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(container.querySelector('[data-testid="code-panel-playback-time"]')?.textContent).toBe('00:32/01:04');
    expect(container.querySelector<HTMLButtonElement>(`button[aria-label="${t('play')}"]`)).not.toBeNull();
  });

  it('releases pointer-originated seek focus after the pointer leaves', () => {
    installMatchMedia(false);
    const { container, root } = renderCodePanel();
    roots.push(root);

    const seek = container.querySelector<HTMLInputElement>('[data-testid="code-panel-playback-seek"]');
    const wrapper = seek?.parentElement;

    act(() => {
      seek?.focus();
      seek?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      seek?.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
      wrapper?.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: document.body }));
    });

    expect(document.activeElement).not.toBe(seek);
  });

  it('disables and grays the play button with a zero duration when code is empty', () => {
    installMatchMedia(false);
    const { container, root } = renderCodePanel({ code: '' });
    roots.push(root);

    const playButton = container.querySelector<HTMLButtonElement>('[data-testid="code-panel-controls-layer"] button');
    const time = container.querySelector('[data-testid="code-panel-playback-time"]');

    expect(playButton?.disabled).toBe(true);
    expect(playButton?.classList.contains('control-button-surface')).toBe(true);
    expect(playButton?.className).not.toContain('disabled:bg-');
    expect(playButton?.classList.contains('disabled:text-[#686868]')).toBe(true);
    expect(time?.textContent).toBe('00:00/00:00');
  });

  it('renders volume, share, and export as icon-only actions on the right', () => {
    installMatchMedia(false);
    const { container, root } = renderCodePanel();
    roots.push(root);

    const actions = container.querySelector('[data-testid="code-panel-right-actions"]');
    const labels = [...(actions?.querySelectorAll('button') ?? [])]
      .map((button) => button.getAttribute('aria-label'));

    expect(labels).toEqual([t('mute'), t('collapseViz'), t('share'), t('download')]);
    expect(actions?.querySelector('.lucide-volume-2')).not.toBeNull();
    expect(actions?.querySelector('.lucide-share-2')).not.toBeNull();
    expect(actions?.querySelector('.lucide-download')).not.toBeNull();
    const volumeButton = actions?.querySelector<HTMLButtonElement>(`button[aria-label="${t('mute')}"]`);
    const shareButton = actions?.querySelector<HTMLButtonElement>(`button[aria-label="${t('share')}"]`);
    const exportButton = actions?.querySelector<HTMLButtonElement>(`button[aria-label="${t('download')}"]`);
    const capsule = actions?.querySelector('[data-testid="code-panel-share-export-capsule"]');
    expect(volumeButton?.classList.contains('rounded-full')).toBe(true);
    expect(volumeButton?.classList.contains('control-button-surface')).toBe(true);
    expect(volumeButton?.classList.contains('cursor-pointer')).toBe(true);
    expect(shareButton?.classList.contains('cursor-pointer')).toBe(true);
    expect(exportButton?.classList.contains('cursor-pointer')).toBe(true);
    expect(capsule?.classList.contains('rounded-full')).toBe(true);
    expect(capsule?.classList.contains('control-button-surface')).toBe(true);
    expect(capsule?.querySelectorAll('button')).toHaveLength(3);
    expect(volumeButton?.hasAttribute('title')).toBe(false);
    expect(shareButton?.hasAttribute('title')).toBe(false);
    expect(exportButton?.hasAttribute('title')).toBe(false);
    const playButton = container.querySelector<HTMLButtonElement>(`button[aria-label="${t('play')}"]`);
    expect(playButton?.hasAttribute('title')).toBe(false);
    actions?.querySelectorAll('button').forEach((button) => {
      expect(button.classList.contains('hover:text-[#C8C8C8]')).toBe(true);
      expect(button.classList.contains('hover:opacity-70')).toBe(false);
    });
  });

  it('toggles the visualizer pane from the capsule and swaps its label', () => {
    installMatchMedia(false);
    const onToggleViz = vi.fn();
    const { container, root, rerender } = renderCodePanel({ onToggleViz });
    roots.push(root);

    const collapse = container.querySelector<HTMLButtonElement>(`button[aria-label="${t('collapseViz')}"]`);
    act(() => collapse?.click());
    expect(onToggleViz).toHaveBeenCalledTimes(1);

    rerender({ vizCollapsed: true });
    expect(container.querySelector(`button[aria-label="${t('expandViz')}"]`)).not.toBeNull();
    expect(container.querySelector(`button[aria-label="${t('collapseViz')}"]`)).toBeNull();
  });

  it('runs the particle layer only while the visualizer is collapsed', () => {
    installMatchMedia(false);
    const { container, root, rerender } = renderCodePanel();
    roots.push(root);

    const particles = container.querySelector('[data-testid="code-panel-particle-field"]');

    // Always mounted so the fade has something to animate; only the drift is
    // keyed off the collapsed state.
    expect(particles).not.toBeNull();
    expect(particles?.getAttribute('data-active')).toBe('false');

    rerender({ vizCollapsed: true });
    expect(particles?.getAttribute('data-active')).toBe('true');
    // The motes stand in for the visualizer, so they must not intercept
    // clicks meant for the transport controls underneath.
    expect(particles?.getAttribute('aria-hidden')).toBe('true');
  });

  it('aligns the export popover to the CodePanel top-right corner', () => {
    installMatchMedia(false);
    const { container, root } = renderCodePanel();
    roots.push(root);

    const panel = container.firstElementChild as HTMLElement;
    const exportButton = container.querySelector<HTMLButtonElement>(`button[aria-label="${t('download')}"]`);
    vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({
      top: 24,
      right: 780,
      bottom: 600,
      left: 80,
      width: 700,
      height: 576,
      x: 80,
      y: 24,
      toJSON: () => ({}),
    });

    act(() => exportButton?.click());

    const popover = document.querySelector<HTMLElement>('[data-testid="export-popover"]');
    expect(popover?.style.top).toBe('24px');
    expect(popover?.style.right).toBe(`${window.innerWidth - 780}px`);
    expect(popover?.style.bottom).toBe('');
  });

  it('opens volume on hover and closes after leaving both trigger and popover', () => {
    vi.useFakeTimers();
    installMatchMedia(false);
    const { container, root } = renderCodePanel();
    roots.push(root);

    const volumeButton = container.querySelector<HTMLButtonElement>(`button[aria-label="${t('mute')}"]`);
    act(() => {
      volumeButton?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });

    const popover = document.querySelector<HTMLElement>('[data-testid="code-panel-volume-popover"]');
    expect(popover).not.toBeNull();

    act(() => {
      volumeButton?.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
      vi.advanceTimersByTime(100);
      popover?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      vi.advanceTimersByTime(100);
    });
    expect(document.querySelector('[data-testid="code-panel-volume-popover"]')).not.toBeNull();

    act(() => {
      popover?.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));
      vi.advanceTimersByTime(150);
    });
    expect(document.querySelector('[data-testid="code-panel-volume-popover"]')).toBeNull();
  });

  it('shows share and export hover labels above their buttons', () => {
    installMatchMedia(false);
    const { container, root } = renderCodePanel();
    roots.push(root);

    const shareButton = container.querySelector<HTMLButtonElement>(`button[aria-label="${t('share')}"]`);
    const exportButton = container.querySelector<HTMLButtonElement>(`button[aria-label="${t('download')}"]`);

    act(() => {
      shareButton?.parentElement?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      exportButton?.parentElement?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });

    const shareLabel = document.querySelector<HTMLElement>('[data-testid="code-panel-share-hover-label"]');
    const exportLabel = document.querySelector<HTMLElement>('[data-testid="code-panel-export-hover-label"]');
    expect(shareLabel?.textContent).toBe(t('share'));
    expect(exportLabel?.textContent).toBe(t('download'));
    expect(shareLabel?.classList.contains('primary-nav-tooltip')).toBe(true);
    expect(exportLabel?.classList.contains('primary-nav-tooltip')).toBe(true);
    expect(shareLabel?.parentElement?.style.bottom).not.toBe('');
    expect(exportLabel?.parentElement?.style.bottom).not.toBe('');
  });

  it('opens a vertical volume popover and updates master volume', () => {
    installMatchMedia(false);
    const { container, root } = renderCodePanel();
    roots.push(root);

    const volumeButton = container.querySelector<HTMLButtonElement>(`button[aria-label="${t('mute')}"]`);
    act(() => {
      volumeButton?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });

    const popover = document.querySelector<HTMLElement>('[data-testid="code-panel-volume-popover"]');
    const slider = document.querySelector<HTMLInputElement>('[data-testid="code-panel-volume-slider"]');
    expect(popover?.textContent).toContain('100%');
    expect(popover?.classList.contains('w-[44px]')).toBe(true);
    expect(popover?.classList.contains('gap-1')).toBe(true);
    expect(popover?.classList.contains('py-2')).toBe(true);
    expect(popover?.classList.contains('border')).toBe(true);
    expect(popover?.classList.contains('border-[#323232]')).toBe(true);
    expect(slider?.getAttribute('aria-orientation')).toBe('vertical');
    expect(slider?.classList.contains('code-panel-volume-slider')).toBe(true);
    expect(slider?.classList.contains('h-20')).toBe(true);
    expect(slider?.style.getPropertyValue('--volume-progress')).toBe('100%');

    act(() => {
      if (!slider) return;
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setValue?.call(slider, '45');
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(strudelService.setMasterVolume).toHaveBeenLastCalledWith(0.45);
    expect(popover?.textContent).toContain('45%');
    expect(slider?.style.getPropertyValue('--volume-progress')).toBe('45%');
  });

  it('toggles mute and restores the last nonzero volume', () => {
    installMatchMedia(false);
    const { container, root } = renderCodePanel();
    roots.push(root);

    let volumeButton = container.querySelector<HTMLButtonElement>(`button[aria-label="${t('mute')}"]`);
    act(() => {
      volumeButton?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    const slider = document.querySelector<HTMLInputElement>('[data-testid="code-panel-volume-slider"]');
    act(() => {
      if (!slider) return;
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setValue?.call(slider, '45');
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    });

    act(() => volumeButton?.click());

    volumeButton = container.querySelector<HTMLButtonElement>(`button[aria-label="${t('unmute')}"]`);
    expect(strudelService.setMasterVolume).toHaveBeenLastCalledWith(0);
    expect(volumeButton?.getAttribute('aria-pressed')).toBe('true');
    expect(volumeButton?.querySelector('.lucide-volume-x')).not.toBeNull();
    expect(document.querySelector('[data-testid="code-panel-volume-popover"]')?.textContent).toContain('0%');

    act(() => volumeButton?.click());

    expect(strudelService.setMasterVolume).toHaveBeenLastCalledWith(0.45);
    expect(container.querySelector<HTMLButtonElement>(`button[aria-label="${t('mute')}"]`)?.getAttribute('aria-pressed')).toBe('false');
  });

  it('keeps volume enabled but disables share and export when code is empty', () => {
    installMatchMedia(false);
    const { container, root } = renderCodePanel({ code: '' });
    roots.push(root);

    expect(container.querySelector<HTMLButtonElement>(`button[aria-label="${t('mute')}"]`)?.disabled).toBe(false);
    expect(container.querySelector<HTMLButtonElement>(`button[aria-label="${t('share')}"]`)?.disabled).toBe(true);
    expect(container.querySelector<HTMLButtonElement>(`button[aria-label="${t('download')}"]`)?.disabled).toBe(true);
  });

  it('opens the shared export popover above the export icon', () => {
    installMatchMedia(false);
    const { container, root } = renderCodePanel();
    roots.push(root);

    const exportButton = container.querySelector<HTMLButtonElement>(`button[aria-label="${t('download')}"]`);
    act(() => exportButton?.click());

    expect(document.body.textContent).toContain(t('exportWav'));
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
