// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HummingAudioPlayer from '../HummingAudioPlayer';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const roots: Root[] = [];
let playMock: ReturnType<typeof vi.spyOn>;
let pauseMock: ReturnType<typeof vi.spyOn>;
let loadMock: ReturnType<typeof vi.spyOn>;

function renderPlayer(props: Partial<Parameters<typeof HummingAudioPlayer>[0]> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push(root);
  const render = (nextProps = props) => {
    act(() => {
      root.render(
        <HummingAudioPlayer src="blob:recording" durationSeconds={10} {...nextProps} />,
      );
    });
  };
  render();
  return { container, render };
}

function setMetadata(audio: HTMLAudioElement, duration: number) {
  Object.defineProperty(audio, 'duration', { configurable: true, value: duration });
  audio.dispatchEvent(new Event('loadedmetadata'));
}

describe('HummingAudioPlayer', () => {
  beforeEach(() => {
    playMock = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
      this.dispatchEvent(new Event('playing'));
      return Promise.resolve();
    });
    pauseMock = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
      this.dispatchEvent(new Event('pause'));
    });
    loadMock = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  });

  afterEach(() => {
    for (const root of roots.splice(0)) act(() => root.unmount());
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('recovers from a rejected play request and retries from the user action', async () => {
    playMock.mockImplementationOnce(() => Promise.reject(new Error('blocked')));
    const { container } = renderPlayer();
    const playButton = () => container.querySelector<HTMLButtonElement>('button[aria-label="Play"]');

    await act(async () => { playButton()?.click(); });

    expect(container.textContent).toContain('This recording could not be played');
    expect(container.querySelector('button[aria-label="Pause"]')).toBeNull();
    const retry = container.querySelector<HTMLButtonElement>('button[aria-label="Reload and play"]');
    expect(retry).not.toBeNull();
    await act(async () => { retry?.click(); });
    expect(playMock).toHaveBeenCalledTimes(2);
    expect(loadMock).toHaveBeenCalled();
    expect(container.querySelector('button[aria-label="Pause"]')).not.toBeNull();
    act(() => container.querySelector<HTMLButtonElement>('button[aria-label="Pause"]')?.click());
    expect(container.querySelector('button[aria-label="Play"]')).not.toBeNull();
  });

  it('follows media events, clamps seeking, and returns to the start after ending', async () => {
    const { container } = renderPlayer();
    const audio = container.querySelector('audio')!;
    act(() => {
      setMetadata(audio, 10);
      Object.defineProperty(audio, 'currentTime', { configurable: true, writable: true, value: 4 });
      audio.dispatchEvent(new Event('timeupdate'));
    });
    const range = container.querySelector<HTMLInputElement>('input[type="range"]')!;
    expect(range.disabled).toBe(false);
    expect(range.getAttribute('aria-valuetext')).toBe('0:04 / 0:10');

    act(() => {
      Object.defineProperty(audio, 'currentTime', { configurable: true, writable: true, value: 10 });
      audio.dispatchEvent(new Event('ended'));
    });
    expect(range.getAttribute('aria-valuetext')).toBe('0:10 / 0:10');
    await act(async () => {
      container.querySelector<HTMLButtonElement>('button[aria-label="Play"]')?.click();
    });
    expect(audio.currentTime).toBe(0);

    range.value = '99';
    act(() => range.dispatchEvent(new Event('input', { bubbles: true })));
    expect(audio.currentTime).toBe(10);
    expect(range.getAttribute('aria-valuetext')).toBe('0:10 / 0:10');
  });

  it('uses the attachment duration when media metadata is non-finite', () => {
    const { container } = renderPlayer({ durationSeconds: 5 });
    const audio = container.querySelector('audio')!;
    act(() => setMetadata(audio, Number.POSITIVE_INFINITY));

    expect(container.querySelector('input[type="range"]')?.getAttribute('aria-valuetext')).toBe('0:00 / 0:05');
    act(() => {
      Object.defineProperty(audio, 'duration', { configurable: true, value: Number.NaN });
      audio.dispatchEvent(new Event('durationchange'));
    });
    expect(container.querySelector('input[type="range"]')?.getAttribute('aria-valuetext')).toBe('0:00 / 0:05');
  });

  it('pauses and resets when its source changes or it becomes disabled', () => {
    const { container, render } = renderPlayer();
    const audio = container.querySelector('audio')!;
    act(() => {
      setMetadata(audio, 10);
      Object.defineProperty(audio, 'currentTime', { configurable: true, writable: true, value: 6 });
      audio.dispatchEvent(new Event('timeupdate'));
    });
    const before = pauseMock.mock.calls.length;

    render({ src: 'blob:replacement', durationSeconds: 8 });
    expect(pauseMock.mock.calls.length).toBeGreaterThan(before);
    expect(container.querySelector('input[type="range"]')?.getAttribute('aria-valuetext')).toBe('0:00 / 0:08');
    const afterSourceChange = pauseMock.mock.calls.length;
    render({ src: 'blob:replacement', durationSeconds: 8, disabled: true });
    expect(pauseMock.mock.calls.length).toBeGreaterThan(afterSourceChange);
  });

  it('allows only one humming preview to play at a time', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    roots.push(root);
    act(() => {
      root.render(
        <>
          <HummingAudioPlayer src="blob:first" durationSeconds={5} />
          <HummingAudioPlayer src="blob:second" durationSeconds={5} />
        </>,
      );
    });
    const players = [...container.querySelectorAll('[data-humming-audio-player]')];
    const firstAudio = players[0].querySelector('audio')!;
    const firstPlay = players[0].querySelector<HTMLButtonElement>('button[aria-label="Play"]')!;
    const secondPlay = players[1].querySelector<HTMLButtonElement>('button[aria-label="Play"]')!;
    await act(async () => { firstPlay.click(); });
    pauseMock.mockClear();
    await act(async () => { secondPlay.click(); });

    expect(pauseMock).toHaveBeenCalledWith();
    expect(players[0].querySelector('button[aria-label="Play"]')).not.toBeNull();
    expect(firstAudio.paused).toBe(true);
  });
});
