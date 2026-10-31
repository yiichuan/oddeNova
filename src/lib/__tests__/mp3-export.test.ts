import { afterEach, describe, expect, it, vi } from 'vitest';
import { audioBufferToMp3 } from '../mp3-export';
import { audioBufferToM4a } from '../m4a-export';

class EncoderWorker {
  static instance: EncoderWorker;
  constructor() { EncoderWorker.instance = this; }
  onmessage?: (event: { data: unknown }) => void;
  onerror?: (event: { message: string }) => void;
  onmessageerror?: () => void;
  terminate = vi.fn();
  postMessage = vi.fn();
}

describe.each([['MP3', audioBufferToMp3], ['M4A', audioBufferToM4a]] as const)('%s worker lifecycle', (_format, encode) => {
  afterEach(() => vi.unstubAllGlobals());

  function start() {
    vi.stubGlobal('Worker', EncoderWorker);
    const pcm = new Float32Array([0, 0.5, -0.5]);
    const progress = vi.fn();
    const promise = encode({ numberOfChannels: 1, sampleRate: 48000, getChannelData: () => pcm } as unknown as AudioBuffer, progress);
    return { pcm, progress, promise, worker: EncoderWorker.instance };
  }

  it('transfers a copy of PCM and terminates after successful encoding', async () => {
    const { pcm, progress, promise, worker } = start();
    const [{ channels }, transfer] = worker.postMessage.mock.calls[0] as unknown as [{ channels: Float32Array[] }, ArrayBuffer[]];
    expect(channels[0]).toEqual(pcm);
    expect(channels[0].buffer).not.toBe(pcm.buffer);
    expect(transfer).toEqual([channels[0].buffer]);
    worker.onmessage?.({ data: { type: 'progress', progress: 0.5 } });
    expect(progress).toHaveBeenCalledWith(0.5);
    const blob = new Blob(['encoded'], { type: 'audio/mpeg' });
    worker.onmessage?.({ data: { type: 'done', blob } });
    expect(await promise).toBe(blob);
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it.each(['encoder', 'load', 'message'] as const)('rejects and terminates on %s errors', async (failure) => {
    const { promise, worker } = start();
    const assertion = expect(promise).rejects.toThrow();
    if (failure === 'encoder') worker.onmessage?.({ data: { type: 'error', message: 'failed' } });
    if (failure === 'load') worker.onerror?.({ message: 'failed' });
    if (failure === 'message') worker.onmessageerror?.();
    await assertion;
    expect(worker.terminate).toHaveBeenCalledOnce();
  });
});
