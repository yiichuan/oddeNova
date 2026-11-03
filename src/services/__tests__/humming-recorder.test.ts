// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startHummingRecording } from '../humming-recorder';

class DataAvailableEvent extends Event {
  data = new Blob(['recorded audio'], { type: 'audio/webm' });
}

class FakeMediaRecorder extends EventTarget {
  static isTypeSupported = vi.fn(() => false);
  state: RecordingState = 'inactive';
  mimeType = 'audio/webm';

  start() { this.state = 'recording'; }

  stop() {
    if (this.state === 'inactive') return;
    this.state = 'inactive';
    this.dispatchEvent(new DataAvailableEvent('dataavailable'));
    this.dispatchEvent(new Event('stop'));
  }
}

const track = {
  stop: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};
const stream = { getTracks: () => [track] } as unknown as MediaStream;
let originalMediaDevices: PropertyDescriptor | undefined;

describe('startHummingRecording stopping notifications', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('MediaRecorder', FakeMediaRecorder);
    originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => stream) },
    });
    track.stop.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    if (originalMediaDevices) Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices);
    else Reflect.deleteProperty(navigator, 'mediaDevices');
  });

  it('notifies before a manual stop and resolves the recording once', async () => {
    const onStopping = vi.fn();
    const session = await startHummingRecording(undefined, { onStopping });
    session.stop();
    session.stop();

    expect(onStopping).toHaveBeenCalledOnce();
    expect((await session.recording).blob.size).toBeGreaterThan(0);
    expect(track.stop).toHaveBeenCalledOnce();
  });

  it('uses the same notification path for the thirty second automatic stop', async () => {
    const onStopping = vi.fn();
    const session = await startHummingRecording(undefined, { onStopping });

    await vi.advanceTimersByTimeAsync(30_000);

    expect(onStopping).toHaveBeenCalledOnce();
    expect((await session.recording).durationSeconds).toBeLessThanOrEqual(30);
  });

  it('notifies when the page becomes hidden and keeps the recording result', async () => {
    const onStopping = vi.fn();
    const originalVisibility = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    try {
      const session = await startHummingRecording(undefined, { onStopping });
      document.dispatchEvent(new Event('visibilitychange'));

      expect(onStopping).toHaveBeenCalledOnce();
      expect((await session.recording).blob.size).toBeGreaterThan(0);
    } finally {
      if (originalVisibility) Object.defineProperty(document, 'visibilityState', originalVisibility);
      else Reflect.deleteProperty(document, 'visibilityState');
    }
  });
});
