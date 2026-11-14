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

  async function service(queryArc: (begin: number, end: number) => unknown[] = () => []) {
    const { StrudelService } = await import('../strudel');
    const instance = new StrudelService();
    Object.assign(instance, {
      editorInstance: {
        evaluate: vi.fn(),
        repl: { stop: vi.fn(), scheduler: { cps: 0.5, pattern: { queryArc } } },
      },
    });
    return instance;
  }

  const params = { filename: 'song', beginCycle: 0, endCycle: 1, sampleRate: 48000 };

  it('schedules one cycle ahead in the same offline context', async () => {
    const steps: string[] = [];
    const contexts = new Set();
    const buffer = { numberOfChannels: 2, sampleRate: 48000, getChannelData: () => new Float32Array(8) };
    let complete!: (value: typeof buffer) => void;
    const render = new Promise<typeof buffer>((resolve) => { complete = resolve; });
    vi.stubGlobal('OfflineAudioContext', class extends OfflineContext {
      suspend(time: number) {
        steps.push(`pause at ${time}`);
        return Promise.resolve();
      }
      resume() {
        steps.push('resume');
        if (steps.includes('query 4–4.5')) complete(buffer);
        return Promise.resolve();
      }
      startRendering() {
        steps.push('start');
        return render;
      }
    });
    const { superdough } = await import('superdough');
    const note = (begin: number, duration: number, onset = true) => ({
      whole: { begin }, duration, hasOnset: () => onset, ensureObjectValue: () => {},
      value: { note: begin },
    });
    const instance = await service((begin, end) => {
      contexts.add(current);
      steps.push(`query ${begin}–${end}`);
      return begin === 2 ? [note(2.75, 1.5), note(2.25, 0.25)]
        : begin === 3 ? [note(2.75, 1.5, false), note(3, 0.5)] : [note(4, 0.5)];
    });
    await instance.exportAudio({ ...params, beginCycle: 2, endCycle: 4.5 });
    expect(steps).toEqual([
      'query 2–3', 'pause at 0', 'start',
      'query 3–4', 'pause at 2', 'resume',
      'query 4–4.5', 'resume',
    ]);
    expect(contexts.size).toBe(1);
    expect(vi.mocked(superdough).mock.calls).toEqual([
      [{ note: 2.25 }, 0.5, 0.5, 0.5, 0.5],
      [{ note: 2.75 }, 1.5, 3, 0.5, 1.5],
      [{ note: 3 }, 2, 1, 0.5, 2],
      [{ note: 4 }, 4, 1, 0.5, 4],
    ]);
  });

  it('uses one whole-range query when the browser cannot pause offline rendering', async () => {
    const queryArc = vi.fn(() => []);
    const instance = await service(queryArc);
    await instance.exportAudio({ ...params, endCycle: 8 });
    expect(queryArc).toHaveBeenCalledOnce();
    expect(queryArc).toHaveBeenCalledWith(0, 8, { _cps: 0.5 });
  });

  it('cancels while waiting for a cycle boundary without resuming the offline graph', async () => {
    let reachBoundary!: () => void;
    const boundary = new Promise<void>((resolve) => { reachBoundary = resolve; });
    const resume = vi.fn();
    const suspend = vi.fn(() => boundary);
    const start = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal('OfflineAudioContext', class extends OfflineContext {
      suspend = suspend;
      resume = resume;
      startRendering = start as OfflineContext['startRendering'];
    });
    const controller = new AbortController();
    const queryArc = vi.fn(() => []);
    const instance = await service(queryArc);
    const job = instance.exportAudio({ ...params, endCycle: 8, signal: controller.signal });
    const assertion = expect(job).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(start).toHaveBeenCalledOnce());
    controller.abort();
    await assertion;
    reachBoundary();
    await Promise.resolve();
    expect(suspend).toHaveBeenCalledOnce();
    expect(suspend).toHaveBeenCalledWith(0);
    expect(queryArc).toHaveBeenCalledOnce();
    expect(resume).not.toHaveBeenCalled();
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
    expect(current?.state).toBe('running');
  });

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

  it.each(['wav', 'mp3', 'm4a'] as const)('cancels a pending %s render, restores audio and discards a late result', async (format) => {
    const instance = await service();
    let finish!: (buffer: Awaited<ReturnType<OfflineContext['startRendering']>>) => void;
    const rendering = vi.spyOn(OfflineContext.prototype, 'startRendering').mockImplementationOnce(
      () => new Promise((resolve) => { finish = resolve; }),
    );
    const suspend = vi.fn(async () => {});
    vi.stubGlobal('OfflineAudioContext', class extends OfflineContext {
      suspend = suspend;
      currentTime = 0;
    });
    const controller = new AbortController();
    const progress = vi.fn();
    const job = instance.exportAudio({ ...params, format, signal: controller.signal, onProgress: progress });
    const assertion = expect(job).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(rendering).toHaveBeenCalled());
    controller.abort();
    await assertion;
    expect(suspend).toHaveBeenCalledOnce();
    expect(current?.state).toBe('running');
    expect(progress).not.toHaveBeenCalledWith(1);
    finish({ numberOfChannels: 2, sampleRate: 48000, getChannelData: () => new Float32Array(8) });
    await Promise.resolve();
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
    expect(mp3).not.toHaveBeenCalled();
    expect(m4a).not.toHaveBeenCalled();
    await instance.exportAudio({ ...params, format });
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledOnce();
  });

  it('does not download if cancellation arrives while the encoder is completing', async () => {
    const instance = await service();
    const controller = new AbortController();
    mp3.mockImplementationOnce(async () => {
      controller.abort();
      return new Blob(['late']);
    });
    await expect(instance.exportAudio({ ...params, format: 'mp3', signal: controller.signal }))
      .rejects.toMatchObject({ name: 'AbortError' });
    expect(HTMLAnchorElement.prototype.click).not.toHaveBeenCalled();
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
