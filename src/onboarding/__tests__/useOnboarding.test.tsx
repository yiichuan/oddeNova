// @vitest-environment happy-dom
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session, SessionImportPayload } from '../../hooks/useSessions';
import { adaptedScript, originalScript } from '../intro-piano-case';
import { progressKey } from '../onboarding-state';
import { useOnboarding, type Onboarding } from '../useOnboarding';

vi.mock('../../lib/soundfont-loader', () => ({ preloadSoundfontNotes: vi.fn(async () => {}) }));
vi.mock('../../lib/analytics', () => ({ trackOnboardingProgressed: vi.fn() }));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const CPS = 0.4;

/**
 * The studio's transport, driven the way the reader drives it: `pressPlay`
 * is the real play key, and the playhead advances with (fake) time from
 * wherever a pause left it.
 */
function fakeStudio(harness: { rerender: () => void; currentCode: () => string }) {
  const state = {
    isPlaying: false,
    activeCode: '',
    heldCycle: 0,
    startedAt: 0,
    stops: 0,
    pauses: 0,
  };
  const cycle = () => state.heldCycle + ((Date.now() - state.startedAt) / 1000) * CPS;
  return {
    state,
    pressPlay() {
      state.isPlaying = true;
      state.activeCode = harness.currentCode();
      state.startedAt = Date.now();
      harness.rerender();
    },
    pressPause() {
      state.heldCycle = cycle();
      state.isPlaying = false;
      harness.rerender();
    },
    transport: () => ({
      isPlaying: state.isPlaying,
      play: () => {
        state.isPlaying = true;
        state.activeCode = harness.currentCode();
        state.startedAt = Date.now();
        harness.rerender();
      },
      engineReady: true,
      activeCode: state.activeCode,
      getPlaybackCycle: () => (state.isPlaying ? cycle() : null),
      pause: () => {
        state.pauses += 1;
        state.heldCycle = cycle();
        state.isPlaying = false;
        harness.rerender();
      },
      stop: () => {
        state.stops += 1;
        state.heldCycle = 0;
        if (!state.isPlaying) return;
        state.isPlaying = false;
        harness.rerender();
      },
    }),
  };
}

/** The guide's own transport for the last step's comparison. */
function fakeComparePlayer() {
  let playing = false;
  let startedAt = 0;
  const listeners = new Set<(state: { isPlaying: boolean }) => void>();
  const emit = () => listeners.forEach((listener) => listener({ isPlaying: playing }));
  return {
    plays: [] as string[],
    stops: 0,
    get playing() { return playing; },
    async play(code: string) {
      this.plays.push(code);
      playing = true;
      startedAt = Date.now();
      emit();
      return true;
    },
    stop() {
      this.stops += 1;
      if (!playing) return;
      playing = false;
      emit();
    },
    currentCycle: () => (playing ? ((Date.now() - startedAt) / 1000) * CPS : null),
    onStateChange(callback: (state: { isPlaying: boolean }) => void) {
      listeners.add(callback);
      callback({ isPlaying: playing });
      return () => { listeners.delete(callback); };
    },
  };
}

interface Harness {
  root: Root;
  get: () => Onboarding;
  sessions: Session[];
  currentId: string | null;
  ownerKey: string;
  importSession: ReturnType<typeof vi.fn>;
  showCodeInEditor: ReturnType<typeof vi.fn>;
  studio: ReturnType<typeof fakeStudio>;
  compare: ReturnType<typeof fakeComparePlayer>;
  rerender: () => void;
}

function mount(options: { eligible?: boolean; sessions?: Session[]; currentId?: string | null; interruptOnHidden?: boolean } = {}): Harness {
  const container = document.createElement('div');
  const root = createRoot(container);
  let latest: Onboarding | undefined;

  const harness = {
    root,
    get: () => latest!,
    sessions: options.sessions ?? [],
    currentId: options.currentId ?? null,
    ownerKey: 'guest',
    importSession: vi.fn(async (payload: SessionImportPayload, opts?: { activate?: boolean }) => {
      const session = { ...payload, id: payload.id!, createdAt: payload.createdAt ?? 0, updatedAt: payload.updatedAt ?? 0 } as Session;
      harness.sessions = [session, ...harness.sessions.filter((s) => s.id !== session.id)];
      if (opts?.activate ?? true) harness.currentId = session.id;
      harness.rerender();
    }),
    showCodeInEditor: vi.fn(),
    compare: fakeComparePlayer(),
    rerender: () => root.render(<Probe />),
  } as Harness;
  harness.studio = fakeStudio({
    rerender: () => harness.rerender(),
    currentCode: () => harness.sessions.find((s) => s.id === harness.currentId)?.code ?? '',
  });

  function Probe() {
    const value = useOnboarding({
      ownerKey: harness.ownerKey,
      enabled: true,
      canAutoInvite: true,
      studioActive: true,
      eligible: options.eligible ?? true,
      sessions: harness.sessions,
      currentId: harness.currentId,
      isPersistent: true,
      importSession: harness.importSession,
      switchToSession: (id) => { harness.currentId = id; harness.rerender(); },
      leaveCurrentSession: async () => {},
      showCodeInEditor: harness.showCodeInEditor,
      startNewSession: () => {},
      focusInput: () => {},
      interruptOnHidden: options.interruptOnHidden,
      studio: harness.studio.transport(),
      comparePlayer: harness.compare,
    });
    useEffect(() => { latest = value; });
    return null;
  }

  act(() => harness.rerender());
  return harness;
}

async function flush(ms = 0) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

async function started(options: Parameters<typeof mount>[0] = {}): Promise<Harness> {
  const h = mount(options);
  await act(async () => { await h.get().start(); });
  await flush();
  return h;
}

async function listenThrough(h: Harness) {
  await act(async () => { h.studio.pressPlay(); });
  await flush(5_600);
}

async function sendAndLand(h: Harness) {
  await act(async () => { void h.get().sendPreset(); });
  await flush(1_500);
}

describe('useOnboarding', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('invites an eligible newcomer and nobody else', () => {
    expect(mount({ eligible: true }).get().view).toBe('invite');
    expect(mount({ eligible: false }).get().view).toBe('hidden');
  });

  it('makes exactly one practice session however often start is pressed', async () => {
    const h = mount();
    await act(async () => {
      void h.get().start();
      void h.get().start();
    });
    await flush();
    expect(h.importSession).toHaveBeenCalledTimes(1);
    expect(h.sessions).toHaveLength(1);
    expect(h.sessions[0].code).toBe(originalScript('en'));
    expect(h.currentId).toBe(h.sessions[0].id);
    expect(h.get()).toMatchObject({ view: 'step', step: 'listen-original', stepNumber: 1, stepCount: 6 });
  });

  it('walks all six steps through the studio transport, writing the preset once', async () => {
    const h = await started();
    expect(h.get().canNext).toBe(false);
    expect(h.get().canPrev).toBe(false);

    // 1/6: the reader presses play; the tour stops it at 5 s, rewound, and opens "next".
    await listenThrough(h);
    expect(h.studio.state.pauses).toBe(0);
    expect(h.studio.state.isPlaying).toBe(false);
    expect(h.studio.state.heldCycle).toBe(0);
    expect(h.get().listen).toMatchObject({ heard: true, progress: 1 });
    expect(h.get().canNext).toBe(true);
    await act(async () => { h.get().next(); });

    // 2/6: only sending moves on, and a double send writes one turn.
    expect(h.get().step).toBe('send-instruction');
    expect(h.get().canNext).toBe(false);
    await act(async () => {
      void h.get().sendPreset();
      void h.get().sendPreset();
    });
    expect(h.get().sending).toBe(true);
    await flush(1_500);
    expect(h.importSession).toHaveBeenCalledTimes(2); // the practice, then the preset turn
    const practice = h.sessions[0];
    expect(practice.code).toBe(adaptedScript('en'));
    expect(practice.messages.filter((m) => m.role === 'user')).toHaveLength(1);

    // 3/6: the reply, which cannot be stepped back across.
    expect(h.get().step).toBe('read-reply');
    expect(h.get().replyMessageId).toBe(practice.messages.at(-1)!.id);
    expect(h.get().canPrev).toBe(false);
    await act(async () => { h.get().next(); });

    // 4/6: the new version, from the top.
    expect(h.get().step).toBe('listen-adapted');
    expect(h.get().canNext).toBe(false);
    await listenThrough(h);
    expect(h.get().canNext).toBe(true);
    await act(async () => { h.get().next(); });

    // 5/6 and 6/6.
    expect(h.get().step).toBe('view-change');
    await act(async () => { h.get().next(); });
    expect(h.get()).toMatchObject({ step: 'done', stepNumber: 6 });
    await act(async () => { h.get().keepEditing(); });
    expect(h.get().progress.status).toBe('completed');
    expect(h.get().view).toBe('hidden');
  });

  it('compares the first 5 seconds of each version on its own transport, never the studio\'s', async () => {
    const h = await started();
    await listenThrough(h);
    await act(async () => { h.get().next(); });
    await sendAndLand(h);
    await act(async () => { h.get().next(); });
    await listenThrough(h);
    await act(async () => { h.get().next(); });
    await act(async () => { h.get().next(); });
    expect(h.get().step).toBe('done');
    const studioPlaysBefore = h.studio.state.activeCode;

    await act(async () => { void h.get().playCompare('original'); });
    await flush();
    expect(h.compare.plays).toEqual([originalScript('en')]);
    expect(h.get().compare).toMatchObject({ version: 'original', phase: 'playing' });
    await flush(5_600);
    // Stopped at 5 s by itself, and the studio's editor and session untouched.
    expect(h.compare.playing).toBe(false);
    expect(h.get().compare.phase).toBe('idle');
    expect(h.studio.state.activeCode).toBe(studioPlaysBefore);
    expect(h.sessions[0].code).toBe(adaptedScript('en'));

    // Switching versions mid-listen starts the other from the top.
    await act(async () => { void h.get().playCompare('adapted'); });
    await flush(1_000);
    await act(async () => { void h.get().playCompare('original'); });
    await flush();
    expect(h.compare.plays.at(-1)).toBe(originalScript('en'));
    expect(h.get().compare.version).toBe('original');

    // Stepping back off the last step silences it.
    await act(async () => { h.get().prev(); });
    expect(h.get().step).toBe('view-change');
    expect(h.compare.playing).toBe(false);
    expect(h.get().compare.phase).toBe('idle');

    // So does finishing.
    await act(async () => { h.get().next(); });
    await act(async () => { void h.get().playCompare('adapted'); });
    await flush();
    await act(async () => { h.get().keepEditing(); });
    expect(h.compare.playing).toBe(false);
    expect(h.get().compare.phase).toBe('idle');
  });

  it('pressing the version that is sounding stops it', async () => {
    const h = await started();
    await act(async () => { void h.get().playCompare('adapted'); });
    await flush();
    await act(async () => { void h.get().playCompare('adapted'); });
    expect(h.compare.playing).toBe(false);
    expect(h.get().compare.phase).toBe('idle');
  });

  it('counts only the practice piece, and only what the playhead reached', async () => {
    const h = await started();
    // Something else playing — not the version this step is about.
    await act(async () => {
      h.studio.pressPlay();
      h.studio.state.activeCode = 'note("c")';
    });
    await flush(6_000);
    expect(h.get().listen.heard).toBe(false);
  });

  it('plays the window again from the top after it was heard, and stops at 5 s again', async () => {
    const h = await started();
    await listenThrough(h);
    expect(h.get().listen.heard).toBe(true);

    await act(async () => { h.studio.pressPlay(); });
    await flush(1_000);
    // From 0:00, not from 0:05 where the first listen ended.
    expect(h.get().listen.progress).toBeGreaterThan(0.1);
    expect(h.get().listen.progress).toBeLessThan(0.3);
    await flush(4_600);
    expect(h.studio.state.isPlaying).toBe(false);
    expect(h.studio.state.heldCycle).toBe(0);
    expect(h.get().listen).toMatchObject({ heard: true, progress: 1 });
  });

  it('keeps the bar moving through the tail after its own stop, up to full', async () => {
    let clock = 0;
    const now = vi.spyOn(performance, 'now').mockImplementation(() => clock);
    try {
      const h = await started();
      await act(async () => { h.studio.pressPlay(); });
      // Just past the watch's stop point (~4.7 s), before the window is heard.
      await flush(4_750);
      expect(h.studio.state.isPlaying).toBe(false);
      expect(h.get().listen.heard).toBe(false);
      const atStop = h.get().readListenPlayhead()!;
      expect(atStop).toBeGreaterThan(0.9);
      expect(atStop).toBeLessThan(1);
      clock += 150;
      const later = h.get().readListenPlayhead()!;
      expect(later).toBeGreaterThan(atStop);
      clock += 1_000;
      expect(h.get().readListenPlayhead()).toBe(1);
    } finally {
      now.mockRestore();
    }
  });

  it('the play key in the card plays and pauses like the real one', async () => {
    const h = await started();
    await act(async () => { h.get().togglePlayback(); });
    expect(h.studio.state.isPlaying).toBe(true);
    expect(h.get().studioPlaying).toBe(true);
    await flush(2_000);
    await act(async () => { h.get().togglePlayback(); });
    expect(h.studio.state).toMatchObject({ isPlaying: false, pauses: 1 });
    // A pause keeps the playhead; the next press carries on to 5 s.
    await act(async () => { h.get().togglePlayback(); });
    await flush(3_600);
    expect(h.get().listen.heard).toBe(true);
  });

  it('keeps what was heard across a pause, and finishes on the next play', async () => {
    const h = await started();
    await act(async () => { h.studio.pressPlay(); });
    await flush(3_000);
    await act(async () => { h.studio.pressPause(); });
    await flush(10_000);
    expect(h.get().listen.heard).toBe(false);
    expect(h.get().listen.progress).toBeGreaterThan(0.5);
    await act(async () => { h.studio.pressPlay(); });
    await flush(2_600);
    expect(h.get().listen.heard).toBe(true);
  });

  it('starts every step from silence, so a listen always begins at the top', async () => {
    const h = await started();
    await listenThrough(h);
    const stopsBefore = h.studio.state.stops;
    await act(async () => { h.get().next(); });
    expect(h.studio.state.stops).toBeGreaterThan(stopsBefore);
    await act(async () => { h.get().prev(); });
    expect(h.get().step).toBe('listen-original');
    expect(h.studio.state.heldCycle).toBe(0);
  });

  it('calls off a loading preset when the reader switches to another session', async () => {
    const other = { id: 'other', title: 'Mine', messages: [], code: 'mine', createdAt: 0, updatedAt: 0 } as Session;
    const h = mount({ sessions: [other], currentId: 'other' });
    await act(async () => { await h.get().start(); });
    await listenThrough(h);
    await act(async () => { h.get().next(); });
    await act(async () => { void h.get().sendPreset(); });
    await act(async () => { h.currentId = 'other'; h.rerender(); });
    await flush(2_000);
    expect(h.importSession).toHaveBeenCalledTimes(1);
    expect(h.showCodeInEditor).not.toHaveBeenCalled();
    expect(h.sessions.find((s) => s.id === 'other')!.code).toBe('mine');
  });

  it('does not let a late preset land after the account changes', async () => {
    const h = await started();
    await listenThrough(h);
    await act(async () => { h.get().next(); });
    await act(async () => { void h.get().sendPreset(); });
    await act(async () => { h.ownerKey = 'user:someone'; h.rerender(); });
    await flush(2_000);
    expect(h.importSession).toHaveBeenCalledTimes(1);
    expect(h.get().progress.status).toBe('new');
  });

  it('offers to resume after a refresh instead of playing anything', async () => {
    const first = await started();
    await listenThrough(first);
    await act(async () => { first.get().next(); });

    const second = mount({ sessions: first.sessions, currentId: 'elsewhere' });
    expect(second.get().view).toBe('resume');
    expect(second.studio.state.isPlaying).toBe(false);
    await act(async () => { await second.get().resume(); });
    expect(second.get()).toMatchObject({ view: 'step', step: 'send-instruction' });
  });

  it('will not resume onto a piece the reader edited, and restarts without overwriting it', async () => {
    const first = await started();
    const edited = { ...first.sessions[0], code: `${originalScript('en')}\n// mine` };
    const second = mount({ sessions: [edited], currentId: edited.id });
    await act(async () => { await second.get().resume(); });
    expect(second.get().view).toBe('cannot-resume');
    await act(async () => { await second.get().restart(); });
    await flush();
    expect(second.sessions.find((s) => s.id === edited.id)!.code).toBe(edited.code);
    expect(second.sessions).toHaveLength(2);
    expect(second.get()).toMatchObject({ view: 'step', step: 'listen-original' });
  });

  it('treats a real instruction sent after the result as carrying on', async () => {
    const h = await started();
    await listenThrough(h);
    await act(async () => { h.get().next(); });
    await sendAndLand(h);
    await act(async () => { h.get().noteRealInstruction(); });
    expect(h.get().progress).toMatchObject({ status: 'completed', realInstructionCounted: true });
    expect(h.get().view).toBe('hidden');
  });

  it('skipping keeps the practice session and never invites again by itself', async () => {
    const h = await started();
    await act(async () => { h.get().skip(); });
    expect(h.get().view).toBe('hidden');
    expect(h.sessions).toHaveLength(1);
    const stored = JSON.parse(localStorage.getItem(progressKey('guest'))!);
    expect(stored.status).toBe('skipped');
    expect(mount({ sessions: h.sessions }).get().view).toBe('hidden');
  });
});

describe('useOnboarding listen bar', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('rests full once heard, and a restart starts the bar at 0 again', async () => {
    const h = await started();
    await listenThrough(h);
    expect(h.get().progress.originalHeard).toBe(true);
    expect(h.get().listen.progress).toBe(1);
    // The tail is spent: nothing carries a playhead on past the end.
    expect(h.get().readListenPlayhead()).toBeNull();

    await act(async () => { await h.get().restart(); });
    await flush();
    expect(h.get().step).toBe('listen-original');
    expect(h.get().progress.originalHeard).toBe(false);
    expect(h.get().listen.progress).toBe(0);
    expect(h.get().readListenPlayhead()).toBeNull();
  });
});

describe('useOnboarding interrupted listens', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(document, 'visibilityState');
  });

  it('forgets a listen cut short from outside, keeps the step, and counts a full replay', async () => {
    const h = await started();
    await act(async () => { h.studio.pressPlay(); });
    await flush(3_000);
    expect(h.get().listen.progress).toBeGreaterThan(0.5);

    const stopsBefore = h.studio.state.stops;
    act(() => h.get().interruptListening());
    expect(h.studio.state.stops).toBeGreaterThan(stopsBefore);
    expect(h.studio.state.isPlaying).toBe(false);
    expect(h.get().listen.progress).toBe(0);
    await flush(5_000);
    expect(h.get().progress.originalHeard).toBe(false);
    expect(h.get().step).toBe('listen-original');

    await listenThrough(h);
    expect(h.get().progress.originalHeard).toBe(true);
  });

  it('does not let the tail of a stopped listen land after an interruption', async () => {
    const h = await started();
    await act(async () => { h.studio.pressPlay(); });
    // Past the watch's own stop (a little before 5 s), inside the tail it
    // waits out before reporting.
    await flush(4_800);
    expect(h.studio.state.isPlaying).toBe(false);
    act(() => h.get().interruptListening());
    await flush(1_000);
    expect(h.get().progress.originalHeard).toBe(false);
  });

  it('ends a listen when the page goes to the background, only when asked to', async () => {
    const h = await started({ interruptOnHidden: true });
    await act(async () => { h.studio.pressPlay(); });
    await flush(2_000);
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(h.studio.state.isPlaying).toBe(false);
    await flush(5_000);
    expect(h.get().progress.originalHeard).toBe(false);

    const desktop = await started();
    await act(async () => { desktop.studio.pressPlay(); });
    await flush(1_000);
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(desktop.studio.state.isPlaying).toBe(true);
  });
});
