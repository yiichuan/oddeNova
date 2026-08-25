// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';

type FakeEventTarget = Pick<Window | Document, 'addEventListener' | 'removeEventListener'> & {
  emit: (type: string) => void;
};

function createFakeEventTarget(): FakeEventTarget {
  const listeners = new Map<string, Set<EventListener>>();

  return {
    addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject | null) => {
      if (typeof listener !== 'function') return;
      const bucket = listeners.get(type) ?? new Set<EventListener>();
      bucket.add(listener);
      listeners.set(type, bucket);
    }),
    removeEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject | null) => {
      if (typeof listener !== 'function') return;
      listeners.get(type)?.delete(listener);
    }),
    emit: (type: string) => {
      listeners.get(type)?.forEach((listener) => listener(new Event(type)));
    },
  };
}

function createFakeAudioContext(state: AudioContextState | 'interrupted') {
  const destination = { label: 'destination' };
  const filter = {
    type: 'lowpass',
    frequency: { value: 0, setTargetAtTime: vi.fn() },
    connect: vi.fn(),
  };

  return {
    state,
    currentTime: 0,
    destination,
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {
      state = 'closed';
    }),
    createBiquadFilter: vi.fn(() => filter),
  } as unknown as AudioContext & { state: AudioContextState | 'interrupted' };
}

describe('Strudel code validation', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('../../lib/soundfont-loader');
    vi.doUnmock('../../lib/analytics');
  });

  it('rejects named .arp() modes before playback', async () => {
    vi.doMock('../../lib/soundfont-loader', () => ({ registerSoundfonts: vi.fn() }));
    vi.doMock('../../lib/analytics', () => ({ trackWavExportCompleted: vi.fn() }));

    const { validateCodeRuntime } = await import('../strudel');
    const result = validateCodeRuntime('({ arp() { return this } }).arp("pinkyup")');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Invalid .arp() argument');
      expect(result.error).toContain('numeric indices');
    }
  });

  it('allows numeric .arp() index patterns', async () => {
    vi.doMock('../../lib/soundfont-loader', () => ({ registerSoundfonts: vi.fn() }));
    vi.doMock('../../lib/analytics', () => ({ trackWavExportCompleted: vi.fn() }));

    const { validateCodeRuntime } = await import('../strudel');
    const result = validateCodeRuntime('({ arp() { return this } }).arp("0 [0,2] 1 [0,2]")');

    expect(result.ok).toBe(true);
  });

  it('rejects note patterns chained into .voicing() before playback', async () => {
    vi.doMock('../../lib/soundfont-loader', () => ({ registerSoundfonts: vi.fn() }));
    vi.doMock('../../lib/analytics', () => ({ trackWavExportCompleted: vi.fn() }));

    const { validateCodeRuntime } = await import('../strudel');
    const result = validateCodeRuntime(`
      const chain = {
        slow() { return this },
        dict() { return this },
        voicing() { return this },
        s() { return this },
      }
      function note() { return chain }
      note("<Cm7 Fm7 Ebmaj7 Dm7b5>")
        .slow(4)
        .dict("ireal")
        .voicing()
        .s("gm_pad_warm")
    `);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Use chord(...) before .voicing()');
    }
  });

  it('allows chord patterns chained into .voicing()', async () => {
    vi.doMock('../../lib/soundfont-loader', () => ({ registerSoundfonts: vi.fn() }));
    vi.doMock('../../lib/analytics', () => ({ trackWavExportCompleted: vi.fn() }));

    const { validateCodeRuntime } = await import('../strudel');
    const result = validateCodeRuntime(`
      const chain = {
        dict() { return this },
        voicing() { return this },
        s() { return this },
      }
      function chord() { return chain }
      chord("<Cm7 Fm7 Ebmaj7 Dm7b5>")
        .dict("ireal")
        .voicing()
        .s("gm_pad_warm")
    `);

    expect(result.ok).toBe(true);
  });
});

describe('StrudelService initialization recovery', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('@strudel/codemirror');
    vi.doUnmock('../../lib/soundfont-loader');
    vi.doUnmock('../../lib/analytics');
    vi.doUnmock('superdough');
  });

  it('keeps the mount container so reinit can retry after an early attach failure', async () => {
    vi.doMock('../../lib/soundfont-loader', () => ({ registerSoundfonts: vi.fn() }));
    vi.doMock('../../lib/analytics', () => ({ trackWavExportCompleted: vi.fn() }));
    vi.doMock('@strudel/codemirror', () => {
      throw new Error('codemirror import failed');
    });

    const { StrudelService } = await import('../strudel');
    const service = new StrudelService();
    const container = document.createElement('div');

    await expect(service.attach(container)).rejects.toThrow();

    expect((service as unknown as { containerElement: HTMLElement | null }).containerElement).toBe(container);
  });

  it('rebuilds the live audio graph when Safari leaves AudioContext interrupted after resume', async () => {
    vi.doMock('../../lib/soundfont-loader', () => ({ registerSoundfonts: vi.fn() }));
    vi.doMock('../../lib/analytics', () => ({ trackWavExportCompleted: vi.fn() }));

    let audioContext = createFakeAudioContext('interrupted');
    const replacementContext = createFakeAudioContext('running');
    const setAudioContext = vi.fn((next: AudioContext | null) => {
      audioContext = next ?? replacementContext;
      return audioContext;
    });
    const destinationGain = {
      gain: { setTargetAtTime: vi.fn() },
      disconnect: vi.fn(),
      connect: vi.fn(),
    };
    const superdoughMock = {
      getAudioContext: vi.fn(() => audioContext),
      setAudioContext,
      setSuperdoughAudioController: vi.fn(),
      getSuperdoughAudioController: vi.fn(() => ({ output: { destinationGain } })),
      clearNodePools: vi.fn(),
      resetGlobalEffects: vi.fn(),
      initAudio: vi.fn(async () => {}),
    };
    vi.doMock('superdough', () => superdoughMock);

    const { StrudelService } = await import('../strudel');
    const service = new StrudelService();
    const evaluate = vi.fn(async () => {});
    (service as unknown as {
      editorInstance: {
        evaluate: () => Promise<void>;
        repl: { stop: () => void };
        setCode: (code: string) => void;
      };
    }).editorInstance = {
      evaluate,
      repl: { stop: vi.fn() },
      setCode: vi.fn(),
    };

    await service.play();

    expect(audioContext).toBe(replacementContext);
    expect(setAudioContext).toHaveBeenCalledWith(null);
    expect(superdoughMock.setSuperdoughAudioController).toHaveBeenCalledWith(null);
    expect(superdoughMock.clearNodePools).toHaveBeenCalled();
    expect(superdoughMock.resetGlobalEffects).toHaveBeenCalled();
    expect(superdoughMock.initAudio).toHaveBeenCalledTimes(1);
    expect(superdoughMock.initAudio.mock.invocationCallOrder[0]).toBeLessThan(evaluate.mock.invocationCallOrder[0]);
    expect(evaluate).toHaveBeenCalledTimes(1);
  });

  it('surfaces the recovery retry error when playback still fails after rebuilding audio', async () => {
    vi.doMock('../../lib/soundfont-loader', () => ({ registerSoundfonts: vi.fn() }));
    vi.doMock('../../lib/analytics', () => ({ trackWavExportCompleted: vi.fn() }));

    let audioContext = createFakeAudioContext('running');
    const replacementContext = createFakeAudioContext('running');
    const destinationGain = {
      gain: { setTargetAtTime: vi.fn() },
      disconnect: vi.fn(),
      connect: vi.fn(),
    };
    vi.doMock('superdough', () => ({
      getAudioContext: vi.fn(() => audioContext),
      setAudioContext: vi.fn((next: AudioContext | null) => {
        audioContext = next ?? replacementContext;
        return audioContext;
      }),
      setSuperdoughAudioController: vi.fn(),
      getSuperdoughAudioController: vi.fn(() => ({ output: { destinationGain } })),
      clearNodePools: vi.fn(),
      resetGlobalEffects: vi.fn(),
      initAudio: vi.fn(async () => {}),
    }));

    const { StrudelService } = await import('../strudel');
    const service = new StrudelService();
    let error: string | null = null;
    service.onStateChange((state) => {
      error = state.error;
    });
    const evaluate = vi.fn()
      .mockRejectedValueOnce(new Error('InvalidAccessError: cannot connect AudioNode'))
      .mockRejectedValueOnce(new Error('retry failed'));
    (service as unknown as {
      editorInstance: {
        evaluate: () => Promise<void>;
        repl: { stop: () => void };
        setCode: (code: string) => void;
      };
    }).editorInstance = {
      evaluate,
      repl: { stop: vi.fn() },
      setCode: vi.fn(),
    };

    await expect(service.play()).rejects.toThrow('retry failed');

    expect(error).toBe('retry failed');
  });
});

describe('StrudelService editor preferences', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('@strudel/codemirror');
    vi.doUnmock('@strudel/transpiler');
    vi.doUnmock('@strudel/draw');
    vi.doUnmock('@strudel/webaudio');
    vi.doUnmock('../../lib/soundfont-loader');
    vi.doUnmock('../../lib/analytics');
  });

  it('delegates autocompletion changes to StrudelMirror', async () => {
    vi.doMock('../../lib/soundfont-loader', () => ({ registerSoundfonts: vi.fn() }));
    vi.doMock('../../lib/analytics', () => ({ trackWavExportCompleted: vi.fn() }));

    const { StrudelService } = await import('../strudel');
    const service = new StrudelService();
    const setAutocompletionEnabled = vi.fn();
    (service as unknown as {
      editorInstance: {
        setAutocompletionEnabled: (enabled: boolean) => void;
      };
    }).editorInstance = { setAutocompletionEnabled };

    (service as unknown as {
      setAutocompletionEnabled: (enabled: boolean) => void;
    }).setAutocompletionEnabled(true);

    expect(setAutocompletionEnabled).toHaveBeenCalledWith(true);
  });

  it('applies the requested autocompletion state after the editor attaches', async () => {
    vi.doMock('../../lib/soundfont-loader', () => ({ registerSoundfonts: vi.fn() }));
    vi.doMock('../../lib/analytics', () => ({ trackWavExportCompleted: vi.fn() }));
    const setAutocompletionEnabled = vi.fn();
    vi.doMock('@strudel/codemirror', () => ({
      compartments: { theme: { reconfigure: vi.fn() } },
      themes: {},
      settings: {},
      StrudelMirror: class {
        repl = { setCode: vi.fn(), stop: vi.fn() };
        setCode = vi.fn();
        evaluate = vi.fn(async () => {});
        setAutocompletionEnabled = setAutocompletionEnabled;
        setLineWrappingEnabled = vi.fn();
        changeSetting = vi.fn();
      },
    }));
    vi.doMock('@strudel/transpiler', () => ({ transpiler: vi.fn() }));
    vi.doMock('@strudel/draw', () => ({ getDrawContext: vi.fn(() => ({})) }));
    vi.doMock('@strudel/webaudio', () => ({ webaudioOutput: vi.fn() }));

    const { StrudelService } = await import('../strudel');
    const service = new StrudelService();
    service.setAutocompletionEnabled(true);

    await service.attach(document.createElement('div'));

    expect(setAutocompletionEnabled).toHaveBeenCalledWith(true);
  });

  it('enables Tab indentation when the editor attaches', async () => {
    vi.doMock('../../lib/soundfont-loader', () => ({ registerSoundfonts: vi.fn() }));
    vi.doMock('../../lib/analytics', () => ({ trackWavExportCompleted: vi.fn() }));
    const changeSetting = vi.fn();
    vi.doMock('@strudel/codemirror', () => ({
      compartments: { theme: { reconfigure: vi.fn() } },
      themes: {},
      settings: {},
      StrudelMirror: class {
        repl = { setCode: vi.fn(), stop: vi.fn() };
        setCode = vi.fn();
        evaluate = vi.fn(async () => {});
        setAutocompletionEnabled = vi.fn();
        setLineWrappingEnabled = vi.fn();
        changeSetting = changeSetting;
      },
    }));
    vi.doMock('@strudel/transpiler', () => ({ transpiler: vi.fn() }));
    vi.doMock('@strudel/draw', () => ({ getDrawContext: vi.fn(() => ({})) }));
    vi.doMock('@strudel/webaudio', () => ({ webaudioOutput: vi.fn() }));

    const { StrudelService } = await import('../strudel');
    const service = new StrudelService();

    await service.attach(document.createElement('div'));

    expect(changeSetting).toHaveBeenCalledWith('isTabIndentationEnabled', true);
  });

  it('installs the oddeNova Dark syntax highlight extension when the editor attaches', async () => {
    vi.doMock('../../lib/soundfont-loader', () => ({ registerSoundfonts: vi.fn() }));
    vi.doMock('../../lib/analytics', () => ({ trackWavExportCompleted: vi.fn() }));
    const dispatch = vi.fn();
    const themeEffect = { type: 'oddenova-theme' };
    const reconfigure = vi.fn(() => themeEffect);
    vi.doMock('@strudel/codemirror', () => ({
      compartments: { theme: { reconfigure } },
      themes: {},
      settings: {},
      StrudelMirror: class {
        editor = { dispatch };
        repl = { setCode: vi.fn(), stop: vi.fn() };
        setCode = vi.fn();
        evaluate = vi.fn(async () => {});
        setAutocompletionEnabled = vi.fn();
        setLineWrappingEnabled = vi.fn();
        changeSetting = vi.fn();
      },
    }));
    vi.doMock('@strudel/transpiler', () => ({ transpiler: vi.fn() }));
    vi.doMock('@strudel/draw', () => ({ getDrawContext: vi.fn(() => ({})) }));
    vi.doMock('@strudel/webaudio', () => ({ webaudioOutput: vi.fn() }));

    const { StrudelService } = await import('../strudel');
    const service = new StrudelService();

    await service.attach(document.createElement('div'));

    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(reconfigure).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ effects: themeEffect });
    expect(dispatch.mock.calls[1][0]).toHaveProperty('effects');
  });
});

describe('StrudelService playback seeking', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('../../lib/soundfont-loader');
    vi.doUnmock('../../lib/analytics');
  });

  it('maps normalized progress to the active scheduler cycle and clamps it', async () => {
    vi.doMock('../../lib/soundfont-loader', () => ({ registerSoundfonts: vi.fn() }));
    vi.doMock('../../lib/analytics', () => ({ trackWavExportCompleted: vi.fn() }));
    const { StrudelService } = await import('../strudel');
    const service = new StrudelService();
    const setCycle = vi.fn();
    (service as unknown as {
      _state: { isPlaying: boolean };
      editorInstance: { repl: { scheduler: { setCycle: (cycle: number) => void } } };
    })._state.isPlaying = true;
    (service as unknown as {
      editorInstance: { repl: { scheduler: { setCycle: (cycle: number) => void } } };
    }).editorInstance = { repl: { scheduler: { setCycle } } };

    expect(service.seekPlayback(0.25, 16)).toBe(true);
    expect(service.seekPlayback(2, 16)).toBe(true);
    expect(setCycle).toHaveBeenNthCalledWith(1, 4);
    expect(setCycle).toHaveBeenNthCalledWith(2, 16);
  });

  it('stores a stopped seek and applies it after the next successful play', async () => {
    vi.doMock('../../lib/soundfont-loader', () => ({ registerSoundfonts: vi.fn() }));
    vi.doMock('../../lib/analytics', () => ({ trackWavExportCompleted: vi.fn() }));
    const { StrudelService } = await import('../strudel');
    const service = new StrudelService();
    const setCycle = vi.fn();
    const evaluate = vi.fn(async () => {});
    const mutableService = service as unknown as {
      _isVideoMode: boolean;
      editorInstance: {
        evaluate: () => Promise<void>;
        repl: { stop: () => void; scheduler: { setCycle: (cycle: number) => void } };
      };
    };
    mutableService._isVideoMode = true;
    mutableService.editorInstance = {
      evaluate,
      repl: { stop: vi.fn(), scheduler: { setCycle } },
    };

    expect(service.seekPlayback(0.75, 8)).toBe(true);
    expect(setCycle).not.toHaveBeenCalled();

    await service.play();

    expect(evaluate).toHaveBeenCalledOnce();
    expect(setCycle).toHaveBeenCalledWith(6);
  });

  it('pauses at the scheduler cycle and resumes from it', async () => {
    vi.doMock('../../lib/soundfont-loader', () => ({ registerSoundfonts: vi.fn() }));
    vi.doMock('../../lib/analytics', () => ({ trackWavExportCompleted: vi.fn() }));
    const { StrudelService } = await import('../strudel');
    const service = new StrudelService();
    const pause = vi.fn();
    const setCycle = vi.fn();
    const evaluate = vi.fn(async () => {});
    const states: Array<{ isPlaying: boolean; isPaused: boolean }> = [];
    service.onStateChange((state) => states.push({ isPlaying: state.isPlaying, isPaused: state.isPaused }));
    const mutableService = service as unknown as {
      _isVideoMode: boolean;
      _state: { isPlaying: boolean; isPaused: boolean };
      editorInstance: {
        evaluate: () => Promise<void>;
        repl: {
          stop: () => void;
          scheduler: {
            now: () => number;
            pause: () => void;
            setCycle: (cycle: number) => void;
          };
        };
      };
    };
    mutableService._isVideoMode = true;
    mutableService._state.isPlaying = true;
    mutableService.editorInstance = {
      evaluate,
      repl: {
        stop: vi.fn(),
        scheduler: { now: () => 5.25, pause, setCycle },
      },
    };

    expect(service.pause()).toBe(true);
    expect(pause).toHaveBeenCalledOnce();
    expect(states.at(-1)).toEqual({ isPlaying: false, isPaused: true });

    await service.play();

    expect(setCycle).toHaveBeenCalledWith(5.25);
  });

  it('clears paused state and the resume cycle on stop and code changes', async () => {
    vi.doMock('../../lib/soundfont-loader', () => ({ registerSoundfonts: vi.fn() }));
    vi.doMock('../../lib/analytics', () => ({ trackWavExportCompleted: vi.fn() }));
    const { StrudelService } = await import('../strudel');
    const service = new StrudelService();
    const mutableService = service as unknown as {
      _state: { code: string; isPlaying: boolean; isPaused: boolean };
      pendingSeekCycle: number | null;
    };

    mutableService._state.isPaused = true;
    mutableService.pendingSeekCycle = 4;
    service.stop();
    expect(mutableService._state.isPaused).toBe(false);
    expect(mutableService.pendingSeekCycle).toBeNull();

    mutableService._state.isPaused = true;
    mutableService.pendingSeekCycle = 3;
    service.setCode('s("bd")');
    expect(mutableService._state.isPaused).toBe(false);
    expect(mutableService.pendingSeekCycle).toBeNull();
  });
});

describe('page audio recovery', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('prompts for a user gesture when the page becomes visible again', async () => {
    vi.doMock('../../lib/soundfont-loader', () => ({ registerSoundfonts: vi.fn() }));
    vi.doMock('../../lib/analytics', () => ({ trackWavExportCompleted: vi.fn() }));

    const { installPageAudioRecovery } = await import('../strudel');
    const windowTarget = createFakeEventTarget();
    const documentTarget = createFakeEventTarget();
    let visibilityState: DocumentVisibilityState = 'hidden';
    const onPlaybackInterrupted = vi.fn();
    const requestUserResume = vi.fn();

    installPageAudioRecovery({
      getIsPlaying: () => true,
      getVisibilityState: () => visibilityState,
      shouldInterruptOnHidden: () => true,
      onPlaybackInterrupted,
      requestUserResume,
      windowTarget,
      documentTarget,
    });

    documentTarget.emit('visibilitychange');
    windowTarget.emit('pagehide');
    visibilityState = 'visible';
    documentTarget.emit('visibilitychange');
    windowTarget.emit('focus');

    expect(onPlaybackInterrupted).toHaveBeenCalledTimes(1);
    expect(requestUserResume).toHaveBeenCalledTimes(1);
  });

  it('keeps playing on hidden when interruption is disabled (desktop)', async () => {
    vi.doMock('../../lib/soundfont-loader', () => ({ registerSoundfonts: vi.fn() }));
    vi.doMock('../../lib/analytics', () => ({ trackWavExportCompleted: vi.fn() }));

    const { installPageAudioRecovery } = await import('../strudel');
    const windowTarget = createFakeEventTarget();
    const documentTarget = createFakeEventTarget();
    let visibilityState: DocumentVisibilityState = 'hidden';
    const onPlaybackInterrupted = vi.fn();
    const requestUserResume = vi.fn();

    installPageAudioRecovery({
      getIsPlaying: () => true,
      getVisibilityState: () => visibilityState,
      shouldInterruptOnHidden: () => false,
      onPlaybackInterrupted,
      requestUserResume,
      windowTarget,
      documentTarget,
    });

    documentTarget.emit('visibilitychange');
    visibilityState = 'visible';
    documentTarget.emit('visibilitychange');
    windowTarget.emit('focus');

    expect(onPlaybackInterrupted).not.toHaveBeenCalled();
    expect(requestUserResume).not.toHaveBeenCalled();
  });
});
