// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const { fakeAudioContext, scheduledFrames } = vi.hoisted(() => {
  const oscillator = {
    frequency: { value: 0 },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  };
  return {
    fakeAudioContext: {
      state: 'running' as AudioContextState,
      resume: vi.fn(async () => {}),
      createOscillator: vi.fn(() => oscillator),
      destination: {},
      oscillator,
    },
    scheduledFrames: [] as Array<() => void>,
  };
});

vi.mock('@strudel/core', () => ({
  midi2note: (n: number) => {
    const pitchClasses = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
    return `${pitchClasses[n % 12]}${Math.floor(n / 12) - 1}`;
  },
}));

vi.mock('superdough', () => ({
  getAudioContext: () => fakeAudioContext,
}));

// The sweep loop runs on animation frames; capture them instead of running
// them so the loop is scheduled exactly once per sweep and the test can
// assert on the scheduling rather than chase frames.
vi.stubGlobal('requestAnimationFrame', vi.fn((callback: () => void) => {
  scheduledFrames.push(callback);
  return scheduledFrames.length;
}));
vi.stubGlobal('cancelAnimationFrame', vi.fn());

import { setThemePreference } from '../../lib/appearance-preferences';

const { default: PitchSlider } = await import('../PitchSlider');

interface Mount {
  container: HTMLElement;
  root: Root;
  unmount: () => void;
}

function mountSlider(props: Parameters<typeof PitchSlider>[0]): Mount {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<PitchSlider {...props} />));
  return {
    container,
    root,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('PitchSlider palette across themes', () => {
  let mounted: Mount | null = null;

  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
    scheduledFrames.length = 0;
    vi.mocked(requestAnimationFrame).mockClear();
    vi.mocked(cancelAnimationFrame).mockClear();
    fakeAudioContext.createOscillator.mockClear();
    fakeAudioContext.oscillator.stop.mockClear();
  });

  afterEach(() => {
    mounted?.unmount();
    mounted = null;
  });

  it('paints frequency blue and pitch yellow under the dark theme', () => {
    setThemePreference('dark');
    mounted = mountSlider({ showFrequencySlider: true, showPitchSlider: true });

    const html = mounted.container.innerHTML;
    expect(html).toContain('#3b82f6');
    expect(html).toContain('#eab308');
  });

  it('paints the darker frequency blue and the ochre pitch under the light theme', () => {
    setThemePreference('light');
    mounted = mountSlider({ showFrequencySlider: true, showPitchSlider: true });

    const html = mounted.container.innerHTML;
    expect(html).toContain('#1d4ed8');
    expect(html).toContain('#854d0e');
  });

  it('keeps the dragged value across a theme flip', () => {
    setThemePreference('dark');
    mounted = mountSlider({ showFrequencySlider: true, showPitchSlider: true });

    const slider = mounted.container.querySelector<HTMLInputElement>('input[aria-label="frequency"]');
    expect(slider).not.toBeNull();
    const input = slider!;
    const before = input.value;

    act(() => {
      // React's value tracker dedupes a plain `input.value = …` write, so
      // drag the value through the prototype's own setter the way a real
      // drag does.
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '0.5');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const dragged = input.value;
    expect(dragged).not.toBe(before);

    act(() => setThemePreference('light'));

    // The value survives the flip — the repaint touches colour only.
    expect(input.value).toBe(dragged);
    expect(mounted.container.innerHTML).toContain('#1d4ed8');
  });

  it('keeps a running sweep across a theme flip', () => {
    setThemePreference('dark');
    mounted = mountSlider({ animatable: true, plot: true, showFrequencySlider: true, showPitchSlider: true });

    const buttons = [...mounted.container.querySelectorAll<HTMLButtonElement>('button')];
    const frequencySweep = buttons.find((button) => button.textContent === '频率扫描');
    expect(frequencySweep).not.toBeUndefined();

    act(() => frequencySweep!.click());
    expect(fakeAudioContext.oscillator.stop).not.toHaveBeenCalled();

    act(() => setThemePreference('light'));

    // The sweep keeps going and the plot keeps its history: the flip neither
    // stops the oscillator nor tears the draw loop down.
    expect(fakeAudioContext.oscillator.stop).not.toHaveBeenCalled();
    expect(cancelAnimationFrame).not.toHaveBeenCalled();

    mounted!.unmount();
    mounted = null;
  });
});
