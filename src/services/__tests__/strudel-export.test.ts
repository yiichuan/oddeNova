// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function liveContext(initialState: AudioContextState = 'running') {
  return {
    state: initialState,
    destination: {},
    createBiquadFilter: () => ({ frequency: { value: 0 }, connect: vi.fn() }),
    close: vi.fn(async function (this: { state: AudioContextState }) {
      if (this.state === 'closed') throw new Error('Cannot close a closed AudioContext.');
      this.state = 'closed';
    }),
  };
}

class OfflineContext {
  state = 'suspended';
  destination = {};
  static failNextRender = false;
  async startRendering() {
    if (OfflineContext.failNextRender) {
      OfflineContext.failNextRender = false;
      throw new Error('render failed');
    }
    this.state = 'closed';
    return { numberOfChannels: 2, sampleRate: 48000, getChannelData: () => new Float32Array(8) };
  }
}

describe('audio export context recovery', () => {
  let current: ReturnType<typeof liveContext> | OfflineContext | null;
  let mp3: ReturnType<typeof vi.fn>;
  let m4a: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    current = liveContext();
    OfflineContext.failNextRender = false;
    mp3 = vi.fn(async () => new Blob(['mp3'], { type: 'audio/mpeg' }));
    m4a = vi.fn(async () => new Blob(['m4a'], { type: 'audio/mp4' }));
    vi.stubGlobal('OfflineAudioContext', OfflineContext);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:export');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.doMock('superdough', () => ({
      superdough: vi.fn(),
      errorLogger: vi.fn(),
      getAudioContext: () => current ??= liveContext(),
      setAudioContext: (ctx: typeof current) => { current = ctx; },
      setSuperdoughAudioController: vi.fn(),
      // No destination gain during export; provide one for live graph rebuild.
      getSuperdoughAudioController: () => current instanceof OfflineContext
        ? { nodes: {} }
        : { output: { destinationGain: { connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1 } } } },
      initAudio: vi.fn(),
      clearNodePools: vi.fn(),
      resetGlobalEffects: vi.fn(),
    }));
    vi.doMock('../../lib/soundfont-loader', () => ({ registerSoundfonts: vi.fn() }));
    vi.doMock('../../lib/analytics', () => ({ trackWavExportCompleted: vi.fn() }));
    vi.doMock('../../lib/mp3-export', () => ({ audioBufferToMp3: mp3 }));
    vi.doMock('../../lib/m4a-export', () => ({ audioBufferToM4a: m4a }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
    vi.doUnmock('superdough');
    vi.doUnmock('../../lib/soundfont-loader');
    vi.doUnmock('../../lib/analytics');
    vi.doUnmock('../../lib/mp3-export');
    vi.doUnmock('../../lib/m4a-export');
  });

  async function service() {
    const { StrudelService } = await import('../strudel');
    const instance = new StrudelService();
    Object.assign(instance, {
      editorInstance: {
        evaluate: vi.fn(),
        repl: { stop: vi.fn(), scheduler: { cps: 0.5, pattern: { queryArc: () => [] } } },
      },
    });
    return instance;
  }

  const params = { filename: 'song', beginCycle: 0, endCycle: 1, sampleRate: 48000 };

  it('does not attach the spectrum sampler to the offline export graph', async () => {
    const instance = await service();
    const offline = new OfflineContext();
    const createAnalyser = vi.fn();
    Object.assign(offline, { createAnalyser });
    const getController = vi.fn();
    Object.assign(instance, {
      audioAccess: { getAudioContext: () => offline, getSuperdoughAudioController: getController },
    });
    expect(instance.sampleAudioSpectrum()).toBeNull();
    expect(createAnalyser).not.toHaveBeenCalled();
    expect(getController).not.toHaveBeenCalled();
  });

  it('exports WAV then MP3 even when the initial live context is already closed', async () => {
    const closed = liveContext('closed');
    current = closed;
    const instance = await service();
    await instance.exportAudio(params);
    expect(closed.close).not.toHaveBeenCalled();
    expect(current?.state).toBe('running');
    const restored = current as ReturnType<typeof liveContext>;
    await instance.exportAudio({ ...params, format: 'mp3' });
    expect(restored.close).toHaveBeenCalledOnce();
    expect(mp3).toHaveBeenCalledOnce();
    expect(current?.state).toBe('running');
  });

  it.each(['render', 'encode'])('restores live audio after a %s failure and permits retry', async (failure) => {
    const instance = await service();
    if (failure === 'render') OfflineContext.failNextRender = true;
    else mp3.mockRejectedValueOnce(new Error('encoding failed'));
    await expect(instance.exportAudio({ ...params, format: 'mp3' })).rejects.toThrow();
    expect(current).not.toBeInstanceOf(OfflineContext);
    expect(current?.state).toBe('running');
    await expect(instance.exportAudio({ ...params, format: 'mp3' })).resolves.toBeUndefined();
    expect(current?.state).toBe('running');
  });

  it('downloads M4A with the correct extension and MIME type, and recovers after encoder failure', async () => {
    const instance = await service();
    m4a.mockRejectedValueOnce(new Error('AAC encoding failed'));
    await expect(instance.exportAudio({ ...params, format: 'm4a' })).rejects.toThrow('AAC encoding failed');
    expect(current?.state).toBe('running');
    let downloaded = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { downloaded = this.download; });
    await instance.exportAudio({ ...params, filename: 'song.MP3', format: 'm4a' });
    expect(downloaded).toBe('song.m4a');
    const blob = vi.mocked(URL.createObjectURL).mock.calls.at(-1)?.[0];
    expect(blob).toBeInstanceOf(Blob);
    expect((blob as Blob).type).toBe('audio/mp4');
    expect(current?.state).toBe('running');
  });

  it('replaces a leftover offline context without trying to close it', async () => {
    current = new OfflineContext();
    current.state = 'closed';
    const instance = await service();
    await expect(instance.exportAudio(params)).resolves.toBeUndefined();
    expect(current?.state).toBe('running');
  });

  it('continues when close rejects before the public context state catches up', async () => {
    const closing = liveContext('running');
    closing.close.mockRejectedValueOnce(new DOMException('Cannot close a closed AudioContext.', 'InvalidStateError'));
    current = closing;
    const instance = await service();
    await expect(instance.exportAudio({ ...params, format: 'mp3' })).resolves.toBeUndefined();
    expect(mp3).toHaveBeenCalledOnce();
    expect(current?.state).toBe('running');
  });

  it('preserves unrelated close errors and restores a usable graph', async () => {
    const failing = liveContext();
    failing.close.mockRejectedValueOnce(new DOMException('Document is not fully active', 'InvalidStateError'));
    current = failing;
    const instance = await service();
    await expect(instance.exportAudio(params)).rejects.toThrow('Document is not fully active');
    expect(current?.state).toBe('running');
  });
});
