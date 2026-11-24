// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { getAudioContext } from 'superdough';
import RecordingDots from '../RecordingDots';

vi.mock('superdough', () => ({ getAudioContext: vi.fn() }));

it('scrolls existing marks left and sets each new rounded mark from the current microphone level', () => {
  let amplitude = 0;
  let disconnectCount = 0;
  vi.mocked(getAudioContext).mockReturnValue({
    createAnalyser: () => ({
      getFloatTimeDomainData: (samples: Float32Array) => samples.fill(amplitude),
    }),
    createMediaStreamSource: () => ({
      connect: vi.fn(),
      disconnect: () => { disconnectCount += 1; },
    }),
  } as unknown as AudioContext);

  let draw: FrameRequestCallback = () => {};
  let resize = () => {};
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    draw = callback;
    return 1;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: () => void) { resize = callback; }
    observe() {}
    disconnect() {}
  });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);

  const container = document.createElement('div');
  const root = createRoot(container);
  try {
    act(() => root.render(<RecordingDots stream={{} as MediaStream} />));
    const svg = container.querySelector('svg')!;
    Object.defineProperty(svg, 'clientWidth', { value: 20 });
    resize();
    const path = svg.querySelector('path')!;

    draw(100);
    expect(path.getAttribute('d')).toMatch(/^M20 [^v]+v0\.01M15 /);
    draw(145);
    expect(path.getAttribute('d')).toMatch(/^M17\.5 [^v]+v0\.01M12\.5 /);

    amplitude = 0.25;
    draw(190);
    const [, loudLength] = path.getAttribute('d')!.match(/^M20 [^v]+v([^M]+)M15 [^v]+v0\.01/) ?? [];
    expect(Number(loudLength)).toBeGreaterThan(10);
    expect(path.getAttribute('stroke-width')).toBe('2.5');
  } finally {
    act(() => root.unmount());
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
  expect(disconnectCount).toBe(1);
});
