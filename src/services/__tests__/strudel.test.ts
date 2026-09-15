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

    // Syntax highlight, scroll margins, tooltip bounds, read-only compartment.
    expect(dispatch).toHaveBeenCalledTimes(4);
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
