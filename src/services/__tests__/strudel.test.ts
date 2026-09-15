// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VERIDIS_QUO } from '../../lib/featured-scripts';

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
  beforeEach(() => {
    vi.stubGlobal('m', vi.fn(() => ({})));
  });

  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('../../lib/soundfont-loader');
    vi.doUnmock('../../lib/analytics');
    vi.doUnmock('@strudel/transpiler');
    vi.unstubAllGlobals();
  });

  it('rejects named .arp() modes before playback', async () => {
    vi.doMock('../../lib/soundfont-loader', () => ({ registerSoundfonts: vi.fn() }));
    vi.doMock('../../lib/analytics', () => ({ trackWavExportCompleted: vi.fn() }));

    const { validateCodeRuntime } = await import('../strudel');
    const result = await validateCodeRuntime('({ arp() { return this } }).arp("pinkyup")');

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
    const result = await validateCodeRuntime('({ arp() { return this } }).arp("0 [0,2] 1 [0,2]")');

    expect(result.ok).toBe(true);
  });

  it('rejects note patterns chained into .voicing() before playback', async () => {
    vi.doMock('../../lib/soundfont-loader', () => ({ registerSoundfonts: vi.fn() }));
    vi.doMock('../../lib/analytics', () => ({ trackWavExportCompleted: vi.fn() }));

    const { validateCodeRuntime } = await import('../strudel');
    const result = await validateCodeRuntime(`
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
    const result = await validateCodeRuntime(`
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

  it('allows a terminal line comment without a final newline in the runtime wrapper', async () => {
    vi.doMock('../../lib/soundfont-loader', () => ({ registerSoundfonts: vi.fn() }));
    vi.doMock('../../lib/analytics', () => ({ trackWavExportCompleted: vi.fn() }));

    const { validateCodeRuntime } = await import('../strudel');
    const result = await validateCodeRuntime('({ arp() { return this } }).arp("0")\n// @version 1.2');

    expect(result).toEqual({ ok: true });
  });

  it('allows literal custom samples, mini-notation controls, and a terminal version comment together', async () => {
    vi.doMock('../../lib/soundfont-loader', () => ({ registerSoundfonts: vi.fn() }));
    vi.doMock('../../lib/analytics', () => ({ trackWavExportCompleted: vi.fn() }));
    vi.stubGlobal('samples', vi.fn());
    vi.stubGlobal('s', vi.fn(() => ({})));

    const code = [
      "samples({ camera_flash: 'https://example.com/camera.wav', 'vox': 'https://example.com/vox.wav' })",
      's("<[- [- camera_flash] - -] [-]>/4")',
      '// @version 1.2',
    ].join('\n');

    const { validateCodeRuntime } = await import('../strudel');
    const result = await validateCodeRuntime(code);

    expect(result).toEqual({ ok: true });
  });

  it('validates arrange mini-notation after transpiling the same source as playback', async () => {
    vi.doMock('../../lib/soundfont-loader', () => ({ registerSoundfonts: vi.fn() }));
    vi.doMock('../../lib/analytics', () => ({ trackWavExportCompleted: vi.fn() }));

    vi.stubGlobal('arrange', vi.fn((...sections: [number, unknown][]) => {
      const pattern = sections[0]?.[1];
      if (!pattern || typeof pattern !== 'object' || !('fast' in pattern)) {
        throw new TypeError('arrange section pattern is not a Strudel pattern');
      }
      return (pattern as { fast: () => unknown }).fast();
    }));
    vi.stubGlobal('m', vi.fn(() => ({ fast: vi.fn(() => ({ kind: 'pattern' })) })));
    vi.stubGlobal('stack', vi.fn((...patterns: unknown[]) => patterns[0]));

    const code = [
      '// STYLE | BPM: 120',
      'setcps(0.5)',
      'const drums = arrange([1, "<bd>"])',
      'stack(drums)',
    ].join('\n');

    const { validateCodeRuntime } = await import('../strudel');
    const result = await validateCodeRuntime(code);

    expect(result).toEqual({ ok: true });
  });

  it('keeps samples registration side-effect free during validation', async () => {
    vi.doMock('../../lib/soundfont-loader', () => ({ registerSoundfonts: vi.fn() }));
    vi.doMock('../../lib/analytics', () => ({ trackWavExportCompleted: vi.fn() }));

    const samples = vi.fn(() => {
      throw new Error('samples should not execute during validation');
    });
    vi.stubGlobal('samples', samples);
    vi.stubGlobal('s', vi.fn(() => ({})));

    const { validateCodeRuntime } = await import('../strudel');
    const result = await validateCodeRuntime([
      'samples({ silent_custom: "https://example.com/silent.wav" })',
      's("silent_custom")',
    ].join('\n'));

    expect(result).toEqual({ ok: true });
    expect(samples).not.toHaveBeenCalled();
  });

  it('accepts the playable Veridis Quo script with named voices and pianorolls', async () => {
    vi.doMock('../../lib/soundfont-loader', () => ({ registerSoundfonts: vi.fn() }));
    vi.doMock('../../lib/analytics', () => ({ trackWavExportCompleted: vi.fn() }));

    const { evalScope } = await import('@strudel/core');
    await evalScope(
      import('@strudel/core'),
      import('@strudel/codemirror'),
      import('@strudel/draw'),
      import('@strudel/mini'),
      import('@strudel/tonal'),
      import('@strudel/webaudio'),
    );

    const { validateCodeRuntime } = await import('../strudel');
    const result = await validateCodeRuntime(VERIDIS_QUO);

    expect(result).toEqual({ ok: true });
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

    // Syntax highlight, scroll margins, read-only compartment, tooltip bounds,
    // track navigation.
    expect(dispatch).toHaveBeenCalledTimes(5);
    expect(reconfigure).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ effects: themeEffect });
    expect(dispatch.mock.calls[1][0]).toHaveProperty('effects');
    expect(dispatch.mock.calls[2][0]).toHaveProperty('effects');
  });
});

/* The engine can be rebuilt under a running piece — crossing the mobile
   breakpoint swaps which layout's CodePanel is mounted, and `reinit()` asks for
   a new one outright. `StrudelMirror` has no teardown of its own, so a replaced
   instance used to stay alive: still sounding, still listening on `document`,
   and still holding a callback into this service. That is what left the studio
   bar and the reading's widgets showing a play button under audible music —
   the sound was the new engine's, the state was the old engine's last word. */
describe('StrudelService editor replacement', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('@strudel/codemirror');
    vi.doUnmock('@strudel/transpiler');
    vi.doUnmock('@strudel/draw');
    vi.doUnmock('@strudel/webaudio');
    vi.doUnmock('../../lib/soundfont-loader');
    vi.doUnmock('../../lib/analytics');
  });

  /** As much of StrudelMirror as the replacement path touches. */
  class FakeMirror {
    static built: FakeMirror[] = [];
    onUpdateState: (state: unknown) => void;
    code: string;
    scheduler = { started: false };
    repl: { setCode: () => void; stop: () => void; scheduler: { started: boolean } };
    drawer = { stop: vi.fn() };
    editor = { dispatch: vi.fn(), destroy: vi.fn() };
    onStartRepl: EventListener;
    id: string;
    setCode = vi.fn();
    setAutocompletionEnabled = vi.fn();
    setLineWrappingEnabled = vi.fn();
    changeSetting = vi.fn();
    evaluate = vi.fn(async () => { this.takeTheFloor(); });

    constructor(options: { initialCode?: string; onUpdateState: (state: unknown) => void }) {
      this.onUpdateState = options.onUpdateState;
      this.code = options.initialCode ?? '';
      this.repl = {
        setCode: vi.fn(),
        stop: vi.fn(() => { this.report(false); }),
        scheduler: this.scheduler,
      };
      // The real one answers every *other* instance's `start-repl` by stopping
      // itself, and never removes the listener.
      this.id = `mirror-${FakeMirror.built.length}`;
      this.onStartRepl = ((event: Event) => {
        if ((event as CustomEvent<string>).detail !== this.id) this.repl.stop();
      }) as EventListener;
      document.addEventListener('start-repl', this.onStartRepl);
      FakeMirror.built.push(this);
    }

    /** What the Cyclist's onToggle does: report, whether or not it changed. */
    report(started: boolean): void {
      this.scheduler.started = started;
      this.onUpdateState({ started, code: this.code, activeCode: this.code, isDirty: false });
    }

    /** Starting a solo repl tells every other repl on the page to stop. */
    takeTheFloor(): void {
      this.report(true);
      document.dispatchEvent(new CustomEvent('start-repl', { detail: this.id }));
    }
  }

  async function attachTwice() {
    vi.doMock('../../lib/soundfont-loader', () => ({ registerSoundfonts: vi.fn() }));
    vi.doMock('../../lib/analytics', () => ({ trackWavExportCompleted: vi.fn() }));
    vi.doMock('@strudel/codemirror', () => ({
      compartments: { theme: { reconfigure: vi.fn() } },
      themes: {},
      settings: {},
      StrudelMirror: FakeMirror,
    }));
    vi.doMock('@strudel/transpiler', () => ({ transpiler: vi.fn() }));
    // The panel's own canvas context: `play()` clears it before evaluating.
    vi.doMock('@strudel/draw', () => ({
      getDrawContext: vi.fn(() => ({ clearRect: vi.fn(), canvas: { width: 1, height: 1 } })),
    }));
    vi.doMock('@strudel/webaudio', () => ({ webaudioOutput: vi.fn() }));

    FakeMirror.built = [];
    const { StrudelService } = await import('../strudel');
    const service = new StrudelService();
    (service as unknown as { _isVideoMode: boolean })._isVideoMode = true;
    const playing: boolean[] = [];
    service.onStateChange((state) => playing.push(state.isPlaying));

    await service.attach(document.createElement('div'));
    await service.attach(document.createElement('div'));

    return { service, playing, outgoing: FakeMirror.built[0], current: FakeMirror.built[1] };
  }

  it('silences and unhooks the outgoing editor', async () => {
    const { outgoing, current } = await attachTwice();

    expect(outgoing).not.toBe(current);
    expect(outgoing.repl.stop).toHaveBeenCalled();
    expect(outgoing.drawer.stop).toHaveBeenCalled();
    expect(outgoing.editor.destroy).toHaveBeenCalled();
  });

  it('keeps the outgoing editor from reporting the new one stopped', async () => {
    const { service, playing, current } = await attachTwice();

    // The piece starts on the engine that is actually on screen. The old one
    // used to hear the `start-repl` that goes with it, stop itself, and report
    // that stop as this service's transport state.
    await service.play();

    expect(current.scheduler.started).toBe(true);
    expect(playing.at(-1)).toBe(true);
  });

  it('ignores a superseded editor that reports anyway', async () => {
    const { service, playing, outgoing } = await attachTwice();
    await service.play();

    outgoing.report(false);

    expect(playing.at(-1)).toBe(true);
  });
});

/* `isPlaying` used to have exactly one source: the Cyclist's `onToggle`, which
   fires only when the scheduler crosses between stopped and started. Evaluating
   into a scheduler that is already running toggles nothing — so a state that had
   gone out of step with the transport stayed wrong through every later press of
   play. A successful evaluate now ends by asserting what the scheduler says. */
describe('StrudelService transport truth', () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('../../lib/soundfont-loader');
    vi.doUnmock('../../lib/analytics');
  });

  async function serviceOnRunningScheduler() {
    vi.doMock('../../lib/soundfont-loader', () => ({ registerSoundfonts: vi.fn() }));
    vi.doMock('../../lib/analytics', () => ({ trackWavExportCompleted: vi.fn() }));
    const { StrudelService } = await import('../strudel');
    const service = new StrudelService();
    const mutable = service as unknown as {
      _isVideoMode: boolean;
      editorInstance: {
        evaluate: () => Promise<void>;
        repl: { stop: () => void; scheduler: { started: boolean } };
      };
    };
    mutable._isVideoMode = true;
    // Already running, and saying nothing about it.
    mutable.editorInstance = {
      evaluate: vi.fn(async () => {}),
      repl: { stop: vi.fn(), scheduler: { started: true } },
    };
    const states: { isPlaying: boolean; isPaused: boolean }[] = [];
    service.onStateChange(({ isPlaying, isPaused }) => states.push({ isPlaying, isPaused }));
    return { service, states };
  }

  it('reports the transport the scheduler is actually running after a play', async () => {
    const { service, states } = await serviceOnRunningScheduler();
    expect(states.at(-1)).toEqual({ isPlaying: false, isPaused: false });

    await service.play();

    expect(states.at(-1)).toEqual({ isPlaying: true, isPaused: false });
  });
});

describe('StrudelService playback seeking', () => {
  type TransportEventStub = {
    revision: number;
    cycle: number;
    seek: { cycle: number; source: string } | null;
    reason: string;
  };

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
    const refresh = vi.spyOn(service.trackPreview, 'refresh');
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
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('seeks the running scheduler to an absolute cycle and announces the entry point', async () => {
    vi.doMock('../../lib/soundfont-loader', () => ({ registerSoundfonts: vi.fn() }));
    vi.doMock('../../lib/analytics', () => ({ trackWavExportCompleted: vi.fn() }));
    const { StrudelService } = await import('../strudel');
    const service = new StrudelService();
    const setCycle = vi.fn();
    const events: Array<{ revision: number; cycle: number; seek: { cycle: number; source: string } | null }> = [];
    service.onTransportChange((event) => events.push({ revision: event.revision, cycle: event.cycle, seek: event.seek }));
    const refresh = vi.spyOn(service.trackPreview, 'refresh');
    const mutableService = service as unknown as {
      _state: { isPlaying: boolean };
      editorInstance: { repl: { scheduler: { setCycle: (cycle: number) => void } } };
    };
    mutableService._state.isPlaying = true;
    mutableService.editorInstance = { repl: { scheduler: { setCycle } } };

    // A seek into a later loop must reach the scheduler as the absolute cycle,
    // not folded back into the first estimated loop.
    expect(service.seekToCycle(18.5, 'timeline')).toBe(true);
    expect(setCycle).toHaveBeenCalledWith(18.5);
    expect(refresh).toHaveBeenCalledOnce();
    expect(events.at(-1)).toEqual({ revision: 1, cycle: 18.5, seek: { cycle: 18.5, source: 'timeline' } });

    expect(service.seekToCycle(3.25, 'progress')).toBe(true);
    expect(setCycle).toHaveBeenLastCalledWith(3.25);
    expect(events.at(-1)?.seek).toEqual({ cycle: 3.25, source: 'progress' });
  });

  it('rejects non-finite or negative cycles without publishing a located state', async () => {
    vi.doMock('../../lib/soundfont-loader', () => ({ registerSoundfonts: vi.fn() }));
    vi.doMock('../../lib/analytics', () => ({ trackWavExportCompleted: vi.fn() }));
    const { StrudelService } = await import('../strudel');
    const service = new StrudelService();
    const setCycle = vi.fn();
    const refresh = vi.spyOn(service.trackPreview, 'refresh');
    const events: TransportEventStub[] = [];
    service.onTransportChange((event) => events.push(event));
    const mutableService = service as unknown as {
      _state: { isPlaying: boolean };
      pendingSeekCycle: number | null;
      editorInstance: { repl: { scheduler: { setCycle: (cycle: number) => void } } };
    };
    mutableService._state.isPlaying = true;
    mutableService.pendingSeekCycle = null;
    mutableService.editorInstance = { repl: { scheduler: { setCycle } } };

    for (const cycle of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      expect(service.seekToCycle(cycle, 'timeline')).toBe(false);
    }

    expect(setCycle).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(mutableService.pendingSeekCycle).toBeNull();
    expect(events).toHaveLength(1); // only the initial snapshot, no seek notification
  });

  it('queues a seek on a stopped or paused transport and reports it as the position', async () => {
    vi.doMock('../../lib/soundfont-loader', () => ({ registerSoundfonts: vi.fn() }));
    vi.doMock('../../lib/analytics', () => ({ trackWavExportCompleted: vi.fn() }));
    const { StrudelService } = await import('../strudel');
    const service = new StrudelService();
    const setCycle = vi.fn();
    const events: TransportEventStub[] = [];
    service.onTransportChange((event) => events.push(event));
    const mutableService = service as unknown as {
      _state: { isPlaying: boolean; isPaused: boolean };
      pendingSeekCycle: number | null;
      editorInstance: { repl: { scheduler: { setCycle: (cycle: number) => void } } };
    };
    mutableService.editorInstance = { repl: { scheduler: { setCycle } } };

    // Fully stopped: a seek sets the position the next play starts from.
    expect(service.seekToCycle(22, 'timeline')).toBe(true);
    expect(setCycle).not.toHaveBeenCalled();
    expect(mutableService.pendingSeekCycle).toBe(22);
    expect(service.getPlaybackPosition()).toBe(22);
    expect(events.at(-1)?.reason).toBe('seek');

    // Paused: same slot, transport stays paused and silent.
    mutableService._state.isPaused = true;
    expect(service.seekToCycle(7, 'timeline')).toBe(true);
    expect(service.getPlaybackPosition()).toBe(7);
    expect(events.filter(event => event.reason === 'seek')).toHaveLength(2);
  });

  it('keeps the accepted playing seek visible until the scheduler catches up', async () => {
    vi.doMock('../../lib/soundfont-loader', () => ({ registerSoundfonts: vi.fn() }));
    vi.doMock('../../lib/analytics', () => ({ trackWavExportCompleted: vi.fn() }));
    const { StrudelService } = await import('../strudel');
    const service = new StrudelService();
    let queuedCycle: number | null = null;
    let schedulerCaughtUp = false;
    const scheduler = {
      setCycle: (cycle: number) => { queuedCycle = cycle; },
      now: () => (schedulerCaughtUp ? queuedCycle : 9),
    };
    const mutableService = service as unknown as {
      _state: { isPlaying: boolean };
      editorInstance: { repl: { scheduler: typeof scheduler } };
    };
    mutableService._state.isPlaying = true;
    mutableService.editorInstance = { repl: { scheduler } };

    expect(service.seekToCycle(12, 'timeline')).toBe(true);
    // The scheduler has not ticked yet: the position must not flash back to 9.
    expect(service.getPlaybackPosition()).toBe(12);
    expect(service.getPlaybackPosition()).toBe(12);

    schedulerCaughtUp = true;
    expect(service.getPlaybackPosition()).toBe(12);

    // Past the accepted target the scheduler read is authoritative again.
    queuedCycle = 12.4;
    expect(service.getPlaybackPosition()).toBe(12.4);
    schedulerCaughtUp = false;
    // The hold is released, so a later stale read is no longer masked.
    expect(service.getPlaybackPosition()).toBe(9);
  });

  it('stops at cycle zero without erasing a seek made after the stop', async () => {
    vi.doMock('../../lib/soundfont-loader', () => ({ registerSoundfonts: vi.fn() }));
    vi.doMock('../../lib/analytics', () => ({ trackWavExportCompleted: vi.fn() }));
    const { StrudelService } = await import('../strudel');
    const service = new StrudelService();
    const setCycle = vi.fn();
    const events: TransportEventStub[] = [];
    service.onTransportChange((event) => events.push(event));
    const evaluate = vi.fn(async () => {});
    const mutableService = service as unknown as {
      _isVideoMode: boolean;
      _state: { isPlaying: boolean; isPaused: boolean };
      pendingSeekCycle: number | null;
      editorInstance: {
        evaluate: () => Promise<void>;
        repl: { stop: () => void; scheduler: { setCycle: (cycle: number) => void } };
      };
    };
    mutableService._isVideoMode = true;
    mutableService._state.isPaused = true;
    mutableService.pendingSeekCycle = 5;
    mutableService.editorInstance = { evaluate, repl: { stop: vi.fn(), scheduler: { setCycle } } };

    service.stop();
    const stopEvents = events.filter(event => event.reason === 'stop');
    expect(stopEvents).toHaveLength(1);
    expect(stopEvents[0]?.cycle).toBe(0);
    expect(service.getPlaybackPosition()).toBe(0);

    // Stopping and seeking back are two events: a stopped seek survives stop
    // and the next play starts from it.
    expect(service.seekToCycle(30, 'timeline')).toBe(true);
    expect(service.getPlaybackPosition()).toBe(30);

    await service.play();
    expect(setCycle).toHaveBeenLastCalledWith(30);
  });

  it('publishes the frozen cycle when pausing and the applied target when resuming', async () => {
    vi.doMock('../../lib/soundfont-loader', () => ({ registerSoundfonts: vi.fn() }));
    vi.doMock('../../lib/analytics', () => ({ trackWavExportCompleted: vi.fn() }));
    const { StrudelService } = await import('../strudel');
    const service = new StrudelService();
    const events: TransportEventStub[] = [];
    service.onTransportChange((event) => events.push(event));
    const setCycle = vi.fn();
    const mutableService = service as unknown as {
      _isVideoMode: boolean;
      _state: { isPlaying: boolean; isPaused: boolean };
      pendingSeekCycle: number | null;
      editorInstance: {
        evaluate: () => Promise<void>;
        repl: { stop: () => void; scheduler: { now: () => number; pause: () => void; setCycle: (cycle: number) => void } };
      };
    };
    mutableService._isVideoMode = true;
    mutableService._state.isPlaying = true;
    mutableService.pendingSeekCycle = 2;
    mutableService.editorInstance = {
      evaluate: vi.fn(async () => {}),
      repl: { stop: vi.fn(), scheduler: { now: () => 5.25, pause: vi.fn(), setCycle } },
    };

    expect(service.pause()).toBe(true);
    const pauseEvents = events.filter(event => event.reason === 'pause');
    expect(pauseEvents).toHaveLength(1);
    expect(pauseEvents[0]?.cycle).toBe(5.25);

    await service.play();
    // The resume consumed the frozen pending seek before evaluate, so the
    // position stays on the paused cycle and the scheduler saw it once.
    expect(setCycle).toHaveBeenLastCalledWith(5.25);
    expect(service.getPlaybackPosition()).toBe(5.25);
  });

  it('reveals a track source only while the document still matches the compile', async () => {
    vi.doMock('../../lib/soundfont-loader', () => ({ registerSoundfonts: vi.fn() }));
    vi.doMock('../../lib/analytics', () => ({ trackWavExportCompleted: vi.fn() }));
    const { StrudelService } = await import('../strudel');
    const service = new StrudelService();
    const compiledCode = 'stack(/* @layer MELODY */ s("bd"), s("cp"))';
    const dispatch = vi.fn();
    const mutableService = service as unknown as {
      editorInstance: { repl: object; editor: { dispatch: () => void; state: { doc: { toString(): string } } } } | null;
    };
    mutableService.editorInstance = { repl: {}, editor: { dispatch, state: { doc: { toString: () => compiledCode } } } };

    // Nothing committed yet: no track, no navigation.
    expect(service.revealTrackSource('1:0')).toBe('unknown-track');

    service.trackPreview.commit({ queryArc: () => [] }, {
      oddenovaTracks: {
        tracks: [
          { id: '1:0', name: 'MELODY', sourceRange: { from: compiledCode.indexOf('/* @layer MELODY */ s("bd")'), to: compiledCode.indexOf('/* @layer MELODY */ s("bd")') + 's("bd")'.length } },
        ],
        sourceCode: compiledCode,
      },
    });

    expect(service.revealTrackSource('1:0')).toBe('revealed');
    expect(dispatch).toHaveBeenCalledOnce();

    // An unheard edit refuses the stale range without touching the editor.
    mutableService.editorInstance = { repl: {}, editor: { dispatch, state: { doc: { toString: () => compiledCode + '\n// edited' } } } };
    expect(service.revealTrackSource('1:0')).toBe('stale-code');
    expect(dispatch).toHaveBeenCalledOnce();

    // Unknown tracks and out-of-document ranges never dispatch either.
    expect(service.revealTrackSource('9:9')).toBe('unknown-track');
    mutableService.editorInstance = { repl: {}, editor: { dispatch, state: { doc: { toString: () => compiledCode } } } };
    expect(service.revealTrackSource('missing')).toBe('unknown-track');
    service.trackPreview.commit({ queryArc: () => [] }, {
      oddenovaTracks: { tracks: [{ id: '1:0', name: 'MELODY', sourceRange: { from: -1, to: 3 } }], sourceCode: compiledCode },
    });
    expect(service.revealTrackSource('1:0')).toBe('unknown-track');
    expect(dispatch).toHaveBeenCalledOnce();
  });

  it('stores a stopped seek and applies it after the next successful play', async () => {
    vi.doMock('../../lib/soundfont-loader', () => ({ registerSoundfonts: vi.fn() }));
    vi.doMock('../../lib/analytics', () => ({ trackWavExportCompleted: vi.fn() }));
    const { StrudelService } = await import('../strudel');
    const service = new StrudelService();
    const setCycle = vi.fn();
    const refresh = vi.spyOn(service.trackPreview, 'refresh');
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
    expect(refresh).toHaveBeenCalledOnce();

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

    pause.mockImplementation(() => {
      expect(states.at(-1)).toEqual({ isPlaying: false, isPaused: true });
    });
    expect(service.pause()).toBe(true);
    expect(pause).toHaveBeenCalledOnce();
    expect(states.at(-1)).toEqual({ isPlaying: false, isPaused: true });

    await service.play();

    expect(setCycle).toHaveBeenCalledWith(5.25);
  });

  it('keeps the resume target visible until asynchronous playback has applied it', async () => {
    vi.doMock('../../lib/soundfont-loader', () => ({ registerSoundfonts: vi.fn() }));
    vi.doMock('../../lib/analytics', () => ({ trackWavExportCompleted: vi.fn() }));
    const { StrudelService } = await import('../strudel');
    const service = new StrudelService();
    let schedulerCycle = 9.5;
    const setCycle = vi.fn((cycle: number) => { schedulerCycle = cycle; });
    let resolveEvaluate!: () => void;
    const evaluate = vi.fn(() => new Promise<void>((resolve) => { resolveEvaluate = resolve; }));
    const mutableService = service as unknown as {
      _isVideoMode: boolean;
      _state: { isPlaying: boolean; isPaused: boolean };
      pendingSeekCycle: number | null;
      editorInstance: {
        evaluate: () => Promise<void>;
        repl: { scheduler: { now: () => number; setCycle: (cycle: number) => void } };
      };
    };
    mutableService._isVideoMode = true;
    mutableService._state.isPaused = true;
    mutableService.pendingSeekCycle = 5.25;
    mutableService.editorInstance = {
      evaluate,
      repl: { scheduler: { now: () => schedulerCycle, setCycle } },
    };

    const playPromise = service.play();
    await Promise.resolve();
    await Promise.resolve();

    expect(evaluate).toHaveBeenCalledOnce();
    expect(service.getPlaybackPosition()).toBe(5.25);

    mutableService._state.isPlaying = true;
    resolveEvaluate();
    await playPromise;

    expect(setCycle).toHaveBeenCalledOnce();
    expect(setCycle).toHaveBeenLastCalledWith(5.25);
    expect(service.getPlaybackPosition()).toBe(5.25);
  });

  it('lets a seek received during recovery replace the captured pause position', async () => {
    vi.doMock('../../lib/soundfont-loader', () => ({ registerSoundfonts: vi.fn() }));
    vi.doMock('../../lib/analytics', () => ({ trackWavExportCompleted: vi.fn() }));
    const { StrudelService } = await import('../strudel');
    const service = new StrudelService();
    const setCycle = vi.fn();
    let resolveEvaluate!: () => void;
    const evaluate = vi.fn(() => new Promise<void>((resolve) => { resolveEvaluate = resolve; }));
    const mutableService = service as unknown as {
      _isVideoMode: boolean;
      _state: { isPaused: boolean };
      pendingSeekCycle: number | null;
      editorInstance: {
        evaluate: () => Promise<void>;
        repl: { scheduler: { setCycle: (cycle: number) => void } };
      };
    };
    mutableService._isVideoMode = true;
    mutableService._state.isPaused = true;
    mutableService.pendingSeekCycle = 5.25;
    mutableService.editorInstance = { evaluate, repl: { scheduler: { setCycle } } };

    const playPromise = service.play();
    await Promise.resolve();
    await Promise.resolve();
    expect(service.seekPlayback(0.75, 8)).toBe(true);
    expect(service.getPlaybackPosition()).toBe(6);

    resolveEvaluate();
    await playPromise;
    expect(setCycle).toHaveBeenLastCalledWith(6);
    expect(mutableService.pendingSeekCycle).toBeNull();
  });

  it('does not let stop commit a stale asynchronous resume result', async () => {
    vi.doMock('../../lib/soundfont-loader', () => ({ registerSoundfonts: vi.fn() }));
    vi.doMock('../../lib/analytics', () => ({ trackWavExportCompleted: vi.fn() }));
    const { StrudelService } = await import('../strudel');
    const service = new StrudelService();
    const setCycle = vi.fn();
    const schedulerStop = vi.fn();
    let resolveEvaluate!: () => void;
    const evaluate = vi.fn(() => new Promise<void>((resolve) => { resolveEvaluate = resolve; }));
    const replStop = vi.fn();
    const mutableService = service as unknown as {
      _isVideoMode: boolean;
      _state: { isPaused: boolean; isPlaying: boolean };
      pendingSeekCycle: number | null;
      editorInstance: {
        evaluate: () => Promise<void>;
        repl: {
          stop: () => void;
          scheduler: { setCycle: (cycle: number) => void; stop: () => void };
        };
      };
    };
    mutableService._isVideoMode = true;
    mutableService._state.isPaused = true;
    mutableService.pendingSeekCycle = 5.25;
    mutableService.editorInstance = {
      evaluate,
      repl: { stop: replStop, scheduler: { setCycle, stop: schedulerStop } },
    };

    const playPromise = service.play();
    await Promise.resolve();
    await Promise.resolve();
    const callsBeforeStop = setCycle.mock.calls.length;
    const schedulerStopsBeforeStop = schedulerStop.mock.calls.length;

    service.stop();
    resolveEvaluate();
    await playPromise;

    expect(setCycle.mock.calls.length).toBe(callsBeforeStop);
    expect(replStop).toHaveBeenCalledOnce();
    expect(schedulerStop.mock.calls.length).toBe(schedulerStopsBeforeStop + 1);
    expect(service.getPlaybackPosition()).toBe(0);
  });

  it('queues a new play behind an invalidated asynchronous resume', async () => {
    vi.doMock('../../lib/soundfont-loader', () => ({ registerSoundfonts: vi.fn() }));
    vi.doMock('../../lib/analytics', () => ({ trackWavExportCompleted: vi.fn() }));
    const { StrudelService } = await import('../strudel');
    const service = new StrudelService();
    const resolves: Array<() => void> = [];
    const evaluate = vi.fn(() => new Promise<void>((resolve) => { resolves.push(resolve); }));
    const mutableService = service as unknown as {
      _isVideoMode: boolean;
      _state: { isPaused: boolean };
      pendingSeekCycle: number | null;
      editorInstance: {
        evaluate: () => Promise<void>;
        repl: { stop: () => void; scheduler: { setCycle: (cycle: number) => void } };
      };
    };
    mutableService._isVideoMode = true;
    mutableService._state.isPaused = true;
    mutableService.pendingSeekCycle = 5.25;
    mutableService.editorInstance = {
      evaluate,
      repl: { stop: vi.fn(), scheduler: { setCycle: vi.fn() } },
    };

    const firstPlay = service.play();
    await Promise.resolve();
    await Promise.resolve();
    expect(evaluate).toHaveBeenCalledOnce();

    service.stop();
    const secondPlay = service.play();
    expect(secondPlay).not.toBe(firstPlay);
    expect(evaluate).toHaveBeenCalledOnce();

    resolves.shift()?.();
    await firstPlay;
    await Promise.resolve();
    await Promise.resolve();
    expect(evaluate).toHaveBeenCalledTimes(2);

    resolves.shift()?.();
    await secondPlay;
  });

  it('falls back to the last valid cycle when the running scheduler read is invalid', async () => {
    vi.doMock('../../lib/soundfont-loader', () => ({ registerSoundfonts: vi.fn() }));
    vi.doMock('../../lib/analytics', () => ({ trackWavExportCompleted: vi.fn() }));
    const { StrudelService } = await import('../strudel');
    const service = new StrudelService();
    let cycle = 4.5;
    const mutableService = service as unknown as {
      _state: { isPlaying: boolean; isPaused: boolean };
      pendingSeekCycle: number | null;
      lastPlaybackCycle: number;
      editorInstance: { repl: { scheduler: { now: () => number } } };
    };
    mutableService._state.isPlaying = true;
    mutableService.editorInstance = { repl: { scheduler: { now: () => cycle } } };

    expect(service.getPlaybackPosition()).toBe(4.5);
    cycle = Number.NaN;
    expect(service.getPlaybackPosition()).toBe(4.5);

    mutableService._state.isPlaying = false;
    mutableService._state.isPaused = true;
    mutableService.pendingSeekCycle = null;
    expect(service.getPlaybackPosition()).toBe(4.5);

    mutableService._state.isPaused = false;
    expect(service.getPlaybackPosition()).toBe(0);
  });

  it('keeps the paused target when evaluate reports an error without rejecting', async () => {
    vi.doMock('../../lib/soundfont-loader', () => ({ registerSoundfonts: vi.fn() }));
    vi.doMock('../../lib/analytics', () => ({ trackWavExportCompleted: vi.fn() }));
    const { StrudelService } = await import('../strudel');
    const service = new StrudelService();
    const mutableService = service as unknown as {
      _isVideoMode: boolean;
      _state: { isPaused: boolean };
      pendingSeekCycle: number | null;
      editorInstance: {
        evaluate: () => Promise<void>;
        repl: { scheduler: { setCycle: (cycle: number) => void }; state: { evalError: Error } };
      };
    };
    mutableService._isVideoMode = true;
    mutableService._state.isPaused = true;
    mutableService.pendingSeekCycle = 5.25;
    mutableService.editorInstance = {
      evaluate: vi.fn(async () => {}),
      repl: {
        scheduler: { setCycle: vi.fn() },
        state: { evalError: new Error('compile failed') },
      },
    };

    await service.play();

    expect(mutableService.pendingSeekCycle).toBe(5.25);
    expect(service.getPlaybackPosition()).toBe(5.25);
  });

  it('clears paused state on stop and rewinds a paused piece when the code changes', async () => {
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

    // Paused: the progress bar rewinds to 0:00 on an edit, so the transport
    // has to be sent back to cycle 0 too — the Cyclist would otherwise resume
    // from the pre-edit playhead it kept through pause().
    mutableService._state.isPaused = true;
    mutableService.pendingSeekCycle = 3;
    service.setCode('s("bd")');
    expect(mutableService._state.isPaused).toBe(false);
    expect(mutableService.pendingSeekCycle).toBe(0);

    // Playing: update() swaps the new pattern in at the next cycle boundary,
    // so the playhead is deliberately left alone.
    mutableService._state.isPlaying = true;
    mutableService.pendingSeekCycle = 3;
    service.setCode('s("hh")');
    expect(mutableService.pendingSeekCycle).toBeNull();
  });

  it('resumes at cycle 0 when the code is edited while paused', async () => {
    vi.doMock('../../lib/soundfont-loader', () => ({ registerSoundfonts: vi.fn() }));
    vi.doMock('../../lib/analytics', () => ({ trackWavExportCompleted: vi.fn() }));
    const { StrudelService } = await import('../strudel');
    const service = new StrudelService();
    const setCycle = vi.fn();
    const evaluate = vi.fn(async () => {});
    const mutableService = service as unknown as {
      _isVideoMode: boolean;
      _state: { isPlaying: boolean };
      editorInstance: {
        evaluate: () => Promise<void>;
        setCode: (code: string) => void;
        repl: {
          stop: () => void;
          scheduler: { now: () => number; pause: () => void; setCycle: (cycle: number) => void };
        };
      };
    };
    mutableService._isVideoMode = true;
    mutableService._state.isPlaying = true;
    mutableService.editorInstance = {
      evaluate,
      setCode: vi.fn(),
      repl: {
        stop: vi.fn(),
        scheduler: { now: () => 5.25, pause: vi.fn(), setCycle },
      },
    };

    service.pause();
    service.setCode('s("bd sd")');
    await service.play();

    expect(setCycle).toHaveBeenCalledWith(0);
    expect(setCycle).not.toHaveBeenCalledWith(5.25);
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

// The editor/audio device is external here; compile/query real Strudel patterns
// and assert the events actually reaching the output boundary.
describe('studio track audition integration', () => {
  afterEach(() => {
    vi.resetModules();
    for (const name of ['@strudel/codemirror', '@strudel/draw', '@strudel/webaudio', '../../lib/soundfont-loader', '../../lib/analytics', 'superdough']) vi.doUnmock(name);
    vi.unstubAllGlobals();
  });

  it('gates live output without reevaluation, preserves the transport, and restores all layers on successful apply', async () => {
    const heard: unknown[] = [];
    let options: {
      transpiler: (code: string) => { output: string };
      afterEval: (result: unknown) => void;
      defaultOutput: (hap: unknown, deadline: number, duration: number, cps: number, time: number) => Promise<void>;
    };
    const evaluate = vi.fn();
    const scheduler = { now: () => 3.25, cps: .5, started: true, pattern: undefined as unknown };
    vi.doMock('../../lib/soundfont-loader', () => ({ registerSoundfonts: vi.fn() }));
    vi.doMock('../../lib/analytics', () => ({ trackWavExportCompleted: vi.fn() }));
    vi.doMock('@strudel/draw', () => ({ getDrawContext: () => ({ clearRect: () => {} }) }));
    vi.doMock('@strudel/webaudio', () => ({ webaudioOutput: async (hap: unknown) => { heard.push(hap); } }));
    vi.doMock('@strudel/codemirror', () => ({
      compartments: {}, themes: {}, settings: {},
      StrudelMirror: class {
        constructor(opts: typeof options) { options = opts; }
        repl = { scheduler, stop: vi.fn(), setCode: vi.fn() };
        setCode = vi.fn(); evaluate = evaluate;
        setAutocompletionEnabled = vi.fn(); setLineWrappingEnabled = vi.fn(); changeSetting = vi.fn();
      },
    }));
    const { StrudelService } = await import('../strudel');
    const core = await import('@strudel/core');
    const mini = await import('@strudel/mini');
    await core.evalScope(core, mini);
    const service = new StrudelService();
    await service.attach(document.createElement('div'));
    const code = 'stack(/* @layer kick */ s("bd"), /* @layer hat */ s("hh"))';
    const result = await core.evaluate(code, options!.transpiler);
    options!.afterEval(result);
    const haps = result.pattern.queryArc(0, 1);
    service.trackPreview.toggleSolo(service.trackPreview.snapshot.tracks[1].id);
    for (const hap of haps) await options!.defaultOutput(hap, 0, 1, .5, 1);
    expect(heard).toEqual([haps[1]]);
    expect(scheduler.now()).toBe(3.25);
    expect(evaluate).not.toHaveBeenCalled();
    // Compilation alone, including a failed evaluation, cannot reset audition.
    options!.transpiler(code);
    expect(service.trackPreview.snapshot.soloId).not.toBeNull();
    options!.afterEval(result);
    expect(service.trackPreview.snapshot.soloId).toBeNull();
    heard.length = 0;
    for (const hap of haps) await options!.defaultOutput(hap, 0, 1, .5, 1);
    expect(heard).toEqual(haps);
    service.trackPreview.toggleSolo(service.trackPreview.snapshot.tracks[0].id);
    // Stop at the audio-rendering boundary after the real exporter schedules
    // its haps. Device rendering is deliberately outside this Node test.
    const scheduled: unknown[] = [];
    const renderingBoundary = new Error('rendering boundary');
    vi.stubGlobal('OfflineAudioContext', class {
      startRendering = async () => { throw renderingBoundary; };
    });
    vi.doMock('superdough', () => ({
      superdough: async (value: { s: unknown }) => { scheduled.push(value.s); },
      getAudioContext: () => ({ close: async () => {} }),
      setAudioContext: () => {}, setSuperdoughAudioController: () => {},
      getSuperdoughAudioController: () => null, initAudio: async () => {},
      clearNodePools: () => {}, resetGlobalEffects: () => {}, errorLogger: () => {},
    }));
    scheduler.pattern = result.pattern;
    evaluate.mockImplementation(async () => { options!.afterEval(result); });
    await expect(service.exportWav({ filename: 'test', beginCycle: 0, endCycle: 1, sampleRate: 44100 })).rejects.toBe(renderingBoundary);
    expect(scheduled).toEqual(['bd', 'hh']);
    expect(service.trackPreview.snapshot.soloId).toBeNull();
    service.trackPreview.toggleSolo(service.trackPreview.snapshot.tracks[0].id);
    service.setCode('s("cp")');
    expect(service.trackPreview.snapshot.soloId).toBeNull();
  });

  it('compiles the track preview on demand while stopped without starting playback', async () => {
    vi.doMock('../../lib/soundfont-loader', () => ({ registerSoundfonts: vi.fn() }));
    vi.doMock('../../lib/analytics', () => ({ trackWavExportCompleted: vi.fn() }));
    const { StrudelService } = await import('../strudel');
    const service = new StrudelService();
    const evaluate = vi.fn(async (autostart = true) => {
      expect(autostart).toBe(false);
      service.trackPreview.commit({ queryArc: () => [] }, {
        oddenovaTracks: { tracks: [{ id: 'bass', name: '贝斯' }] },
      });
    });
    const mutableService = service as unknown as {
      _state: { code: string; isPlaying: boolean };
      editorInstance: { evaluate: (autostart?: boolean) => Promise<void>; repl: { stop: () => void } };
    };
    mutableService._state.code = 'stack(/* @layer 贝斯 */ s("sawtooth"))';
    mutableService._state.isPlaying = false;
    mutableService.editorInstance = { evaluate, repl: { stop: vi.fn() } };

    await service.prepareTrackPreview();
    await service.prepareTrackPreview();

    expect(evaluate).toHaveBeenCalledOnce();
    expect(evaluate).toHaveBeenCalledWith(false);
    expect(service.trackPreview.snapshot.status).toBe('ready');
    expect(mutableService._state.isPlaying).toBe(false);
  });
});

// Track rename: a local editor transaction that must never reach the compile
// path. The harness replicates the real editor wiring — dispatch applies the
// change, the doc change calls repl.setCode, and the repl reports state back
// into the service — so callback order is exercised, not assumed.
describe('track rename transactions', () => {
  const CODE = 'stack(/* @layer 鼓组 */ s("bd"), /* @layer 贝斯 */ note("c2"))';
  const MARKER_0 = '/* @layer 鼓组 */';
  const MARKER_1 = '/* @layer 贝斯 */';

  async function makeRenameService(options: { started?: boolean; paused?: boolean } = {}) {
    vi.doMock('../../lib/soundfont-loader', () => ({ registerSoundfonts: vi.fn() }));
    vi.doMock('../../lib/analytics', () => ({ trackWavExportCompleted: vi.fn() }));
    const { StrudelService } = await import('../strudel');
    const service = new StrudelService();
    let doc = CODE;
    const mutable = service as unknown as {
      _isVideoMode: boolean;
      _state: { code: string; activeCode: string; isPlaying: boolean; isPaused: boolean; isDirty: boolean };
      isAudioInitialized: boolean;
      editorInstance: unknown;
      pendingSeekCycle: number | null;
      compileBusy: boolean;
      handleReplUpdateState: (state: { code?: string; activeCode?: string; started?: boolean; isDirty?: boolean; evalError?: unknown }) => void;
    };
    mutable._isVideoMode = true;
    mutable.isAudioInitialized = true;
    mutable._state.code = CODE;
    mutable._state.isPlaying = options.started ?? false;
    mutable._state.isPaused = options.paused ?? false;
    const repl = {
      setCode: (next: string) => {
        mutable.handleReplUpdateState({
          code: next,
          started: mutable._state.isPlaying,
          isDirty: next !== mutable._state.activeCode,
        });
      },
      stop: vi.fn(),
      scheduler: { setCycle: vi.fn(), now: () => 0 },
    };
    const dispatch = vi.fn((transaction: { changes?: { from: number; to: number; insert: string } }) => {
      const change = transaction.changes;
      if (!change) return;
      doc = doc.slice(0, change.from) + change.insert + doc.slice(change.to);
      repl.setCode(doc);
    });
    mutable.editorInstance = {
      editor: { dispatch, state: { doc: { toString: () => doc } } },
      repl,
    };
    const marker0 = CODE.indexOf(MARKER_0);
    const marker1 = CODE.indexOf(MARKER_1);
    service.trackPreview.commit({ queryArc: () => [] }, {
      oddenovaTracks: {
        tracks: [
          {
            id: '1:0', name: '鼓组', colorKey: '鼓组',
            sourceRange: { from: marker0, to: marker0 + MARKER_0.length + ' s("bd")'.length },
            markerRange: { from: marker0, to: marker0 + MARKER_0.length },
            nameRange: { from: marker0 + 10, to: marker0 + 12 },
          },
          {
            id: '1:1', name: '贝斯', colorKey: '贝斯',
            sourceRange: { from: marker1, to: CODE.length },
            markerRange: { from: marker1, to: marker1 + MARKER_1.length },
            nameRange: { from: marker1 + 10, to: marker1 + 12 },
          },
        ],
        sourceCode: CODE,
        stackRange: { from: 0, to: CODE.length },
      },
    });
    const transportEvents: { reason: string }[] = [];
    service.onTransportChange(event => transportEvents.push({ reason: event.reason }));
    return {
      service, dispatch, mutable,
      getDoc: () => doc,
      transportEvents,
      tracks: () => service.trackPreview.snapshot.tracks,
    };
  }

  afterEach(() => {
    vi.resetModules();
    vi.doUnmock('../../lib/soundfont-loader');
    vi.doUnmock('../../lib/analytics');
  });

  it('renames with one splice, updates the mapping, and leaves the transport untouched', async () => {
    const harness = await makeRenameService({ paused: true });
    harness.mutable.pendingSeekCycle = 3.25;

    const result = harness.service.renameTrack('1:0', '  主鼓 ');

    expect(result).toEqual({ status: 'renamed', name: '主鼓' });
    expect(harness.getDoc()).toBe(CODE.replace('鼓组', '主鼓'));
    expect(harness.dispatch).toHaveBeenCalledOnce();
    expect(harness.tracks().map(t => t.name)).toEqual(['主鼓', '贝斯']);
    // Navigation trusts the mapped code; the compiled source is intact.
    expect(harness.service.trackPreview.trackSource('1:0')?.sourceCode).toBe(harness.getDoc());
    expect((harness.service.trackPreview as unknown as { compiledSourceCode: string }).compiledSourceCode).toBe(CODE);
    // Transport: no seek, no rewind, pause position kept, isDirty is real.
    expect(harness.transportEvents).toEqual([{ reason: 'apply' }]);
    expect(harness.mutable.pendingSeekCycle).toBe(3.25);
    expect(harness.mutable._state.isPaused).toBe(true);
    expect(harness.mutable._state.isPlaying).toBe(false);
    expect(harness.mutable._state.isDirty).toBe(true);
    expect(harness.mutable._state.activeCode).toBe('');
  });

  it('renames while playing without rewinding or stopping the scheduler', async () => {
    const harness = await makeRenameService({ started: true });

    const result = harness.service.renameTrack('1:1', 'bassline');

    expect(result).toEqual({ status: 'renamed', name: 'bassline' });
    expect(harness.tracks().map(t => t.name)).toEqual(['鼓组', 'bassline']);
    expect(harness.mutable._state.isPlaying).toBe(true);
    expect(harness.mutable._state.isPaused).toBe(false);
    expect(harness.transportEvents).toEqual([{ reason: 'apply' }]);
    expect(harness.mutable.pendingSeekCycle).toBeNull();
  });

  it('treats a same-name submit as a no-op', async () => {
    const harness = await makeRenameService();
    expect(harness.service.renameTrack('1:0', ' 鼓组 ')).toEqual({ status: 'unchanged', name: '鼓组' });
    expect(harness.dispatch).not.toHaveBeenCalled();
    expect(harness.getDoc()).toBe(CODE);
  });

  it('rejects invalid names without touching the editor', async () => {
    const harness = await makeRenameService();
    expect(harness.service.renameTrack('1:0', '   ')).toEqual({ status: 'invalid-name', reason: 'empty' });
    expect(harness.service.renameTrack('1:0', 'a'.repeat(65))).toEqual({ status: 'invalid-name', reason: 'too-long' });
    expect(harness.service.renameTrack('1:0', '鼓*组')).toEqual({ status: 'invalid-name', reason: 'invalid-character' });
    expect(harness.service.renameTrack('1:0', 'a\nb')).toEqual({ status: 'invalid-name', reason: 'invalid-character' });
    expect(harness.dispatch).not.toHaveBeenCalled();
  });

  it('refuses a document that no longer matches the mapped source', async () => {
    const harness = await makeRenameService();
    harness.mutable._state.code = CODE + '\n// edited';
    (harness.mutable.editorInstance as { editor: { state: { doc: { toString: () => string } } } }).editor.state.doc.toString = () => CODE + '\n// edited';
    expect(harness.service.renameTrack('1:0', '主鼓')).toEqual({ status: 'stale-code' });
    expect(harness.dispatch).not.toHaveBeenCalled();
  });

  it('refuses unknown tracks and unavailable engines', async () => {
    const harness = await makeRenameService();
    expect(harness.service.renameTrack('9:9', 'x')).toEqual({ status: 'unknown-track' });
    harness.mutable.editorInstance = null;
    expect(harness.service.renameTrack('1:0', 'x')).toEqual({ status: 'unavailable' });
  });

  it('reports busy while a play operation or a compile owns the engine', async () => {
    const harness = await makeRenameService();
    const mutable = harness.service as unknown as { playPromise: Promise<void> | null; compileBusy: boolean };
    mutable.playPromise = Promise.resolve();
    expect(harness.service.renameTrack('1:0', '主鼓')).toEqual({ status: 'busy' });
    mutable.playPromise = null;
    mutable.compileBusy = true;
    expect(harness.service.renameTrack('1:0', '主鼓')).toEqual({ status: 'busy' });
    mutable.compileBusy = false;
    expect(harness.service.renameTrack('1:0', '主鼓').status).toBe('renamed');
  });

  it('syncs an undo and a redo through the registered versions without touching the transport', async () => {
    const harness = await makeRenameService({ paused: true });
    harness.service.renameTrack('1:0', '主鼓');
    const renamedDoc = harness.getDoc();
    harness.transportEvents.length = 0;

    // CodeMirror undo restores the previous document text.
    harness.mutable.handleReplUpdateState({ code: CODE, started: false, isDirty: true });
    expect(harness.tracks().map(t => t.name)).toEqual(['鼓组', '贝斯']);
    expect(harness.mutable._state.code).toBe(CODE);
    expect(harness.mutable._state.isPaused).toBe(true);
    expect(harness.service.trackPreview.trackSource('1:0')?.sourceCode).toBe(CODE);
    expect(harness.transportEvents).toEqual([]);

    // Redo lands on the registered after-text again.
    harness.mutable.handleReplUpdateState({ code: renamedDoc, started: false, isDirty: true });
    expect(harness.tracks().map(t => t.name)).toEqual(['主鼓', '贝斯']);
    expect(harness.transportEvents).toEqual([]);
  });

  it('keeps walking a two-rename history one undo at a time', async () => {
    const harness = await makeRenameService();
    harness.service.renameTrack('1:0', '主鼓');
    harness.service.renameTrack('1:1', '低音');
    const secondDoc = harness.getDoc();
    expect(secondDoc).toBe(CODE.replace('鼓组', '主鼓').replace('贝斯', '低音'));

    harness.mutable.handleReplUpdateState({ code: CODE.replace('鼓组', '主鼓'), started: false, isDirty: true });
    expect(harness.tracks().map(t => t.name)).toEqual(['主鼓', '贝斯']);
    harness.mutable.handleReplUpdateState({ code: CODE, started: false, isDirty: true });
    expect(harness.tracks().map(t => t.name)).toEqual(['鼓组', '贝斯']);
    // Redo walks forward one registered step at a time.
    harness.mutable.handleReplUpdateState({ code: CODE.replace('鼓组', '主鼓'), started: false, isDirty: true });
    expect(harness.tracks().map(t => t.name)).toEqual(['主鼓', '贝斯']);
    harness.mutable.handleReplUpdateState({ code: secondDoc, started: false, isDirty: true });
    expect(harness.tracks().map(t => t.name)).toEqual(['主鼓', '低音']);
  });

  it('treats a structurally different document as an ordinary edit that rewinds', async () => {
    const harness = await makeRenameService({ paused: true });
    harness.service.renameTrack('1:0', '主鼓');
    harness.transportEvents.length = 0;

    const edited = CODE.replace('s("bd")', 's("bd sd")');
    harness.mutable.handleReplUpdateState({ code: edited, started: false, isDirty: true });

    expect(harness.transportEvents).toEqual([{ reason: 'code-change' }]);
    expect(harness.mutable.pendingSeekCycle).toBe(0);
    expect(harness.mutable._state.isPaused).toBe(false);
    // The mapping stays on the last confirmed rename, not on the edit.
    expect(harness.service.trackPreview.trackSource('1:0')?.sourceCode).not.toBe(edited);
  });

  it('does not let a new compile inherit old rename history', async () => {
    const harness = await makeRenameService();
    harness.service.renameTrack('1:0', '主鼓');
    // A successful compile rebuilds mapping and history from the new source.
    harness.service.trackPreview.commit({ queryArc: () => [] }, {
      oddenovaTracks: {
        tracks: [{ id: '2:0', name: '主鼓', sourceRange: { from: 0, to: 10 } }],
        sourceCode: harness.getDoc(),
        stackRange: { from: 0, to: harness.getDoc().length },
      },
    });
    harness.transportEvents.length = 0;

    // Undoing into the pre-compile text is now an ordinary edit.
    harness.mutable.handleReplUpdateState({ code: CODE, started: false, isDirty: true });
    expect(harness.transportEvents).toEqual([{ reason: 'code-change' }]);
    expect(harness.tracks().map(t => t.name)).toEqual(['主鼓']);
  });

  it('syncs a rename applied by an editor without a repl callback wiring', async () => {
    vi.doMock('../../lib/soundfont-loader', () => ({ registerSoundfonts: vi.fn() }));
    vi.doMock('../../lib/analytics', () => ({ trackWavExportCompleted: vi.fn() }));
    const { StrudelService } = await import('../strudel');
    const service = new StrudelService();
    const mutable = service as unknown as { _state: { code: string; activeCode: string }; isAudioInitialized: boolean; editorInstance: unknown };
    mutable.isAudioInitialized = true;
    mutable._state.code = CODE;
    let doc = CODE;
    const dispatch = vi.fn((transaction: { changes?: { from: number; to: number; insert: string } }) => {
      const change = transaction.changes!;
      doc = doc.slice(0, change.from) + change.insert + doc.slice(change.to);
    });
    mutable.editorInstance = { editor: { dispatch, state: { doc: { toString: () => doc } } }, repl: {} };
    const marker0 = CODE.indexOf(MARKER_0);
    const marker1 = CODE.indexOf(MARKER_1);
    service.trackPreview.commit({ queryArc: () => [] }, {
      oddenovaTracks: {
        tracks: [
          {
            id: '1:0', name: '鼓组',
            sourceRange: { from: marker0, to: marker0 + MARKER_0.length + ' s("bd")'.length },
            markerRange: { from: marker0, to: marker0 + MARKER_0.length },
            nameRange: { from: marker0 + 10, to: marker0 + 12 },
          },
          {
            id: '1:1', name: '贝斯',
            sourceRange: { from: marker1, to: CODE.length },
            markerRange: { from: marker1, to: marker1 + MARKER_1.length },
            nameRange: { from: marker1 + 10, to: marker1 + 12 },
          },
        ],
        sourceCode: CODE,
        stackRange: { from: 0, to: CODE.length },
      },
    });

    expect(service.renameTrack('1:0', '主鼓')).toEqual({ status: 'renamed', name: '主鼓' });
    expect(doc).toBe(CODE.replace('鼓组', '主鼓'));
    expect(service.trackPreview.snapshot.tracks[0].name).toBe('主鼓');
    expect(mutable._state.code).toBe(doc);
  });
});
