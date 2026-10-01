import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session, SessionImportPayload } from '../hooks/useSessions';
import { trackOnboardingProgressed, type OnboardingStage } from '../lib/analytics';
import { zh } from '../lib/i18n';
import { preloadSoundfontNotes } from '../lib/soundfont-loader';
import {
  COMPARE_SOUND_DEPENDENCIES,
  COMPARE_WINDOW,
  INTRO_PIANO_CASE_ID,
  INTRO_PIANO_CPS,
  adaptedScript,
  introPianoContentHash,
  originalScript,
  presetInstruction,
} from './intro-piano-case';
import { watchListening } from './listening';
import {
  ONBOARDING_GUIDE_VERSION,
  TOUR_STEPS,
  canAdvance,
  canGoBack,
  initialProgress,
  readProgress,
  reduceOnboarding,
  shouldAutoInvite,
  stepNumber,
  writeProgress,
  type OnboardingEvent,
  type OnboardingProgress,
  type OnboardingStep,
} from './onboarding-state';
import {
  checkPracticeResume,
  makePracticeSessionPayload,
  presetReplyId,
  withPresetDelivered,
} from './practice-session';

/**
 * The first-run guide, wired to the studio.
 *
 * A six-step tour over the studio's own controls: the reader presses the real
 * play key, the real send key. What this owns is everything around those
 * presses that has to be cancellable and bound to one account and one
 * session — the practice session's creation, the preset turn's write, and
 * watching each listen so it pauses at 5 seconds and counts only when heard.
 * Nothing here reaches the model.
 */

export type OnboardingView = 'hidden' | 'invite' | 'resume' | 'cannot-resume' | 'step';
export type SoundStatus = 'preparing' | 'ready' | 'failed';

/** The slice of the studio transport the tour needs. */
export interface StudioTransport {
  isPlaying: boolean;
  engineReady: boolean;
  /** The source the sounding pattern was compiled from. */
  activeCode: string;
  getPlaybackCycle: () => number | null;
  /** The studio's own play key: saves the draft, then plays from the playhead. */
  play: () => Promise<unknown> | void;
  pause: () => void;
  stop: () => void;
}

/**
 * A transport of the guide's own for the last step's old-vs-new comparison.
 * The studio's editor holds the new version by then, and playing the original
 * through the studio would put it in the editor — and from there into the
 * session's draft.
 */
export interface ComparePlayer {
  play: (code: string) => Promise<boolean>;
  stop: () => void;
  currentCycle: () => number | null;
  onStateChange: (callback: (state: { isPlaying: boolean }) => void) => () => void;
}

export type CompareVersion = 'original' | 'adapted';

export interface CompareState {
  version: CompareVersion | null;
  phase: 'idle' | 'preparing' | 'playing';
  progress: number;
  failed: boolean;
}

const IDLE_COMPARE: CompareState = { version: null, phase: 'idle', progress: 0, failed: false };

/** The preset loads briefly and honestly — no imitation of a long generation. */
const PRESET_DELAY_MS = 1200;
/** "Later" asks again the next day, not the next page load. */
const POSTPONE_MS = 24 * 60 * 60 * 1000;
const PREPARE_TIMEOUT_MS = 20_000;

type Panel = 'auto' | 'dismissed' | 'invite' | 'resume' | 'cannot-resume' | 'step';

export interface UseOnboardingOptions {
  ownerKey: string;
  /** Top window, not the demo or a video render. */
  enabled: boolean;
  /** The studio is up with nothing else on screen: auth, sessions and imports settled. */
  canAutoInvite: boolean;
  /** The studio page is the one showing. */
  studioActive: boolean;
  /** This browser met oddeNova for the first time after the guide shipped. */
  eligible: boolean;
  sessions: readonly Session[];
  currentId: string | null;
  isPersistent: boolean;
  importSession: (payload: SessionImportPayload, options?: { activate?: boolean }) => Promise<void>;
  switchToSession: (id: string) => Promise<void> | void;
  /** Save the draft of whatever session is open before the practice takes its place. */
  leaveCurrentSession: () => Promise<void>;
  /** Put `code` in the editor as `sessionId`'s own, without it reading as a manual edit. */
  showCodeInEditor: (sessionId: string, code: string) => void;
  startNewSession: () => Promise<void> | void;
  focusInput: () => void;
  /**
   * A page sent to the background ends a listen under way (the phone's reading
   * of it). Off on the desktop, where a background tab plays on as it always has.
   */
  interruptOnHidden?: boolean;
  studio: StudioTransport;
  comparePlayer: ComparePlayer;
}

function track(stage: OnboardingStage, step?: string): void {
  try {
    trackOnboardingProgressed({
      stage,
      step,
      guide_version: ONBOARDING_GUIDE_VERSION,
      case_id: INTRO_PIANO_CASE_ID,
    });
  } catch {
    // Analytics never changes what the guide does.
  }
}

const STAGE_FOR_EVENT: Partial<Record<OnboardingEvent['type'], OnboardingStage>> = {
  start: 'started',
  'original-heard': 'original_heard',
  delivered: 'preset_sent',
  'adapted-heard': 'adapted_heard',
  finish: 'completed',
  skip: 'skipped',
  postpone: 'postponed',
  'real-instruction': 'first_real_instruction',
};

type Lang = 'zh' | 'en';

function readerLang(): Lang {
  return zh ? 'zh' : 'en';
}

function freshProgress(): OnboardingProgress {
  return initialProgress(INTRO_PIANO_CASE_ID, introPianoContentHash(readerLang()));
}

function isListenStep(step: OnboardingStep): step is 'listen-original' | 'listen-adapted' {
  return step === 'listen-original' || step === 'listen-adapted';
}

async function prepareSounds(): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('sound preparation timed out')), PREPARE_TIMEOUT_MS);
  });
  try {
    await Promise.race([
      Promise.all(COMPARE_SOUND_DEPENDENCIES.map((dep) => preloadSoundfontNotes(dep.sound, dep.notes))),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** The language the practice was made in — its preset and scripts must match its piece. */
function practiceLang(sessions: readonly Session[], progress: OnboardingProgress): Lang {
  const session = sessions.find((s) => s.id === progress.sessionId);
  const check = checkPracticeResume(session, progress);
  return check.kind === 'ok' ? check.lang : readerLang();
}

function wait(ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }
    const id = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve(true);
    }, ms);
    const onAbort = () => {
      clearTimeout(id);
      resolve(false);
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

export function useOnboarding(options: UseOnboardingOptions) {
  const {
    ownerKey,
    enabled,
    canAutoInvite,
    studioActive,
    eligible,
    sessions,
    currentId,
    isPersistent,
    studio,
  } = options;

  // Progress is per account. Held with the owner it belongs to, so a change of
  // account is seen during render and never shows one account the other's.
  const [store, setStore] = useState(() => ({
    ownerKey,
    progress: readProgress(ownerKey, freshProgress()),
    panel: 'auto' as Panel,
  }));
  let current = store;
  if (store.ownerKey !== ownerKey) {
    current = { ownerKey, progress: readProgress(ownerKey, freshProgress()), panel: 'auto' };
    setStore(current);
  }
  const { progress, panel } = current;

  const [sending, setSending] = useState(false);
  const [deliveryError, setDeliveryError] = useState(false);
  const [startError, setStartError] = useState(false);
  const [starting, setStarting] = useState(false);
  /** null while nothing is settled: preparing, or not yet asked. */
  const [soundResult, setSoundResult] = useState<'ready' | 'failed' | null>(null);
  const [compare, setCompare] = useState<CompareState>(IDLE_COMPARE);
  /** Bumped by every compare press and stop; a listen belongs to one token. */
  const compareTokenRef = useRef(0);
  /** Playhead through the current listen, 0..1, tagged with the step it belongs to. */
  const [listenProgress, setListenProgress] = useState<{ step: OnboardingStep; value: number } | null>(null);

  // Read by the async flows, which must see the present rather than the render
  // they were started from.
  const optionsRef = useRef(options);
  const progressRef = useRef(progress);
  const ownerRef = useRef(ownerKey);
  /** Bumped by anything that invalidates work in flight: account change, exit, unmount. */
  const generationRef = useRef(0);
  /**
   * Bumped by an interrupted listen. A watch that already stopped the
   * transport still reports after its tail; one interrupted in between must
   * not come back later and mark the window heard.
   */
  const listenGenerationRef = useRef(0);
  const deliveryRef = useRef<AbortController | null>(null);
  const startingRef = useRef(false);
  const preparingRef = useRef(false);
  const inviteTrackedRef = useRef(false);
  useEffect(() => {
    optionsRef.current = options;
    progressRef.current = progress;
    ownerRef.current = ownerKey;
  });

  const setPanel = useCallback((next: Panel) => {
    setStore((s) => ({ ...s, panel: next }));
  }, []);

  const dispatch = useCallback((event: OnboardingEvent): OnboardingProgress => {
    const before = progressRef.current;
    const after = reduceOnboarding(before, event);
    if (after === before) return before;
    progressRef.current = after;
    writeProgress(ownerRef.current, after);
    setStore((s) => (s.ownerKey === ownerRef.current ? { ...s, progress: after } : s));
    const stage = STAGE_FOR_EVENT[event.type];
    if (stage) track(stage, event.type === 'skip' ? before.step : undefined);
    return after;
  }, []);

  const cancelInFlight = useCallback(() => {
    generationRef.current += 1;
    deliveryRef.current?.abort();
    deliveryRef.current = null;
  }, []);

  // A change of account, or the guide going away, cancels anything still
  // running on the previous one: a late result must not land on the next.
  useEffect(() => cancelInFlight, [ownerKey, cancelInFlight]);

  const practiceId = progress.status === 'active' ? progress.sessionId : null;
  const isPracticeCurrent = practiceId !== null && practiceId === currentId;

  const view: OnboardingView = useMemo(() => {
    if (!enabled || !studioActive) return 'hidden';
    switch (panel) {
      case 'dismissed':
        return 'hidden';
      case 'invite':
      case 'cannot-resume':
      case 'resume':
        return panel;
      case 'step':
        if (progress.status !== 'active') return 'hidden';
        return isPracticeCurrent ? 'step' : 'resume';
      case 'auto':
        if (!canAutoInvite) return 'hidden';
        if (progress.status === 'active') return 'resume';
        return shouldAutoInvite(progress, { eligible, now: Date.now() }) ? 'invite' : 'hidden';
    }
  }, [enabled, studioActive, panel, progress, isPracticeCurrent, canAutoInvite, eligible]);

  useEffect(() => {
    if (view !== 'invite' || inviteTrackedRef.current) return;
    inviteTrackedRef.current = true;
    track('invite_shown');
  }, [view]);

  const onStep = view === 'step';
  const step = progress.step;
  const lang = practiceLang(sessions, progress);

  // Every step starts from silence, and a listening step from the top of the
  // piece: stopping rewinds, so the play key always begins at 0:00.
  useEffect(() => {
    if (!onStep) return;
    optionsRef.current.studio.stop();
  }, [onStep, step]);

  // ── Listening ───────────────────────────────────────────────────────────

  const listening = onStep && isListenStep(step);
  const heard = step === 'listen-original' ? progress.originalHeard : step === 'listen-adapted' ? progress.adaptedHeard : false;

  // Sounds are loaded before the play key opens, so the seconds a listen
  // counts are seconds of music rather than of network.
  useEffect(() => {
    if (!listening || !studio.engineReady || soundResult !== null || preparingRef.current) return;
    preparingRef.current = true;
    const generation = generationRef.current;
    prepareSounds().then(
      () => { if (generation === generationRef.current) setSoundResult('ready'); },
      () => { if (generation === generationRef.current) setSoundResult('failed'); },
    ).finally(() => { preparingRef.current = false; });
  }, [listening, studio.engineReady, soundResult]);

  const soundStatus: SoundStatus = !studio.engineReady || soundResult === null ? 'preparing' : soundResult;

  // Every listen on these steps is the 5-second window, the first and every
  // replay: it stops there and rewinds, so the next press starts at 0:00.
  const expectedCode = step === 'listen-original' ? originalScript(lang) : adaptedScript(lang);
  const watching = listening && studio.isPlaying && studio.activeCode === expectedCode;
  /** Which watch owns the progress bar; a finished one's tail must not overwrite a replay's. */
  const watchIdRef = useRef(0);
  /**
   * Where the playhead was when the watch stopped the transport, and when. The
   * watch stops it a little before 5 s (see PAUSE_LEAD_CYCLES) and the queued
   * notes sound on to the end; the bar has to go on moving through that tail
   * too, or it halts short of full and then jumps.
   */
  const tailRef = useRef<{ cycle: number; at: number } | null>(null);
  useEffect(() => {
    if (!watching) return;
    const generation = generationRef.current;
    const listenGeneration = listenGenerationRef.current;
    const watchedStep = step;
    const id = ++watchIdRef.current;
    tailRef.current = null;
    const watch = watchListening(
      {
        currentCycle: () => optionsRef.current.studio.getPlaybackCycle(),
        stop: () => {
          const cycle = optionsRef.current.studio.getPlaybackCycle();
          tailRef.current = cycle === null ? null : { cycle, at: performance.now() };
          optionsRef.current.studio.stop();
        },
      },
      COMPARE_WINDOW,
      {
        cps: INTRO_PIANO_CPS,
        onProgress: (value) => {
          if (id === watchIdRef.current) setListenProgress({ step: watchedStep, value });
        },
        onHeard: () => {
          // The tail has played out: the bar rests on the heard listen from
          // here, and a playhead carried on past the end would read full
          // for whatever listen comes next on this step (a replay, a restart).
          if (id === watchIdRef.current) tailRef.current = null;
          if (generation !== generationRef.current || listenGeneration !== listenGenerationRef.current) return;
          dispatch({ type: watchedStep === 'listen-original' ? 'original-heard' : 'adapted-heard' });
        },
      },
    );
    return () => watch.cancel();
  }, [watching, step, dispatch]);

  const watchingRef = useRef(watching);
  useEffect(() => {
    watchingRef.current = watching;
  });
  /**
   * The playhead through the window right now, 0..1, or null while nothing is
   * being listened to. Read straight off the scheduler (whose clock is the
   * audio clock, so it is continuous) for a bar that redraws every frame
   * without a render — `listen.progress` only moves at the watch's 20 Hz.
   * Through the tail after the watch's own stop, the scheduler has nothing to
   * say, so the playhead is carried on from where it stopped at the tempo.
   */
  const readListenPlayhead = useCallback((): number | null => {
    const span = COMPARE_WINDOW.endCycle - COMPARE_WINDOW.startCycle;
    const toProgress = (cycle: number) => Math.max(0, Math.min(1, (cycle - COMPARE_WINDOW.startCycle) / span));
    if (watchingRef.current) {
      const cycle = optionsRef.current.studio.getPlaybackCycle();
      if (cycle !== null) return toProgress(cycle);
    }
    const tail = tailRef.current;
    if (!tail) return null;
    return toProgress(tail.cycle + ((performance.now() - tail.at) / 1000) * INTRO_PIANO_CPS);
  }, []);
  // A step's tail is its own: moving on drops it.
  useEffect(() => {
    tailRef.current = null;
  }, [step]);

  const listenValue = listenProgress?.step === step ? listenProgress.value : 0;
  const listen = {
    status: soundStatus,
    heard,
    progress: watching ? listenValue : heard ? 1 : listenValue,
    playing: watching,
  };

  /**
   * The play key drawn in the card's copy does what the real one does: play,
   * or pause what is playing.
   */
  const togglePlayback = useCallback(() => {
    const transport = optionsRef.current.studio;
    if (transport.isPlaying) transport.pause();
    else void transport.play();
  }, []);

  const retrySounds = useCallback(() => setSoundResult(null), []);

  /**
   * Silence a listen that was cut short from outside — the page going to the
   * background, the layout changing under it — and forget how far it got. The
   * step stays, and so does anything already heard; the reader plays again.
   */
  /** Drop everything a listen left behind, so the next one starts its bar at 0. */
  const forgetListen = useCallback(() => {
    watchIdRef.current += 1;
    tailRef.current = null;
    setListenProgress(null);
  }, []);

  const interruptListening = useCallback(() => {
    listenGenerationRef.current += 1;
    forgetListen();
    optionsRef.current.studio.stop();
    if (compareRef.current.phase !== 'idle') {
      compareTokenRef.current += 1;
      optionsRef.current.comparePlayer.stop();
      setCompare(IDLE_COMPARE);
    }
  }, [forgetListen]);

  const interruptOnHidden = options.interruptOnHidden ?? false;
  useEffect(() => {
    if (!onStep || !interruptOnHidden) return;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') interruptListening();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [onStep, interruptOnHidden, interruptListening]);

  // ── The last step's old-vs-new comparison ───────────────────────────────

  const stopCompare = useCallback(() => {
    compareTokenRef.current += 1;
    optionsRef.current.comparePlayer.stop();
    setCompare(IDLE_COMPARE);
  }, []);

  /**
   * Play one version's first 5 seconds from the top, on the guide's own
   * transport, and stop there. Pressing the version already sounding stops it.
   */
  const playCompare = useCallback(async (version: CompareVersion) => {
    if (compareRef.current.version === version && compareRef.current.phase !== 'idle') {
      stopCompare();
      return;
    }
    stopCompare();
    const token = compareTokenRef.current;
    const player = optionsRef.current.comparePlayer;
    const isCurrent = () => token === compareTokenRef.current;
    setCompare({ version, phase: 'preparing', progress: 0, failed: false });

    try {
      await prepareSounds();
    } catch {
      if (isCurrent()) setCompare({ ...IDLE_COMPARE, failed: true });
      return;
    }
    if (!isCurrent()) return;

    const p = progressRef.current;
    const lang = practiceLang(optionsRef.current.sessions, p);
    let stoppedByUs = false;
    let armed = false;
    let watch: { cancel: () => void } | null = null;
    const finish = () => {
      watch?.cancel();
      unsubscribe();
      if (isCurrent()) setCompare(IDLE_COMPARE);
    };
    // Silence nobody here asked for — the reader took the floor elsewhere —
    // ends the listen quietly.
    const unsubscribe = player.onStateChange((state) => {
      if (armed && !state.isPlaying && !stoppedByUs) finish();
    });

    const started = await player.play(version === 'original' ? originalScript(lang) : adaptedScript(lang));
    if (!isCurrent()) {
      unsubscribe();
      if (started) player.stop();
      return;
    }
    if (!started) {
      unsubscribe();
      setCompare({ ...IDLE_COMPARE, failed: true });
      return;
    }
    armed = true;
    setCompare({ version, phase: 'playing', progress: 0, failed: false });
    watch = watchListening(
      {
        currentCycle: () => player.currentCycle(),
        stop: () => {
          stoppedByUs = true;
          player.stop();
        },
      },
      COMPARE_WINDOW,
      {
        cps: INTRO_PIANO_CPS,
        onProgress: (value) => {
          if (isCurrent()) setCompare((c) => (c.phase === 'playing' ? { ...c, progress: value } : c));
        },
        onHeard: finish,
      },
    );
  }, [stopCompare]);

  const compareRef = useRef(compare);
  useEffect(() => {
    compareRef.current = compare;
  });

  // The comparison belongs to the last step: anything that leaves it silences it.
  const onLastStep = onStep && step === 'done';
  useEffect(() => {
    if (onLastStep) return;
    if (compareRef.current.phase === 'idle') return;
    stopCompare();
  }, [onLastStep, stopCompare]);
  useEffect(() => () => {
    compareTokenRef.current += 1;
    optionsRef.current.comparePlayer.stop();
  }, []);

  // ── Invitation ──────────────────────────────────────────────────────────

  const start = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    setStartError(false);
    // A new practice begins at the first listen, which is the step a finished
    // one may have been left on: nothing of that listen carries over.
    forgetListen();
    const generation = generationRef.current;
    try {
      const practiceLanguage = readerLang();
      const id = crypto.randomUUID();
      await optionsRef.current.leaveCurrentSession();
      if (generation !== generationRef.current) return;
      // Recorded before the session is written, so a second press or a
      // refresh finds this practice instead of making another one.
      dispatch({
        type: 'start',
        sessionId: id,
        caseId: INTRO_PIANO_CASE_ID,
        contentHash: introPianoContentHash(practiceLanguage),
      });
      await optionsRef.current.importSession(makePracticeSessionPayload({ id, lang: practiceLanguage }), { activate: true });
      if (generation !== generationRef.current) return;
      setDeliveryError(false);
      setPanel('step');
    } catch {
      if (generation !== generationRef.current) return;
      dispatch({ type: 'reset' });
      setStartError(true);
      track('error', 'invite');
    } finally {
      startingRef.current = false;
      setStarting(false);
    }
  }, [dispatch, forgetListen, setPanel]);

  const postpone = useCallback(() => {
    dispatch({ type: 'postpone', until: Date.now() + POSTPONE_MS });
    setPanel('dismissed');
  }, [dispatch, setPanel]);

  /** "Later" on a practice under way: out of the way for now, offered again next visit. */
  const dismiss = useCallback(() => setPanel('dismissed'), [setPanel]);

  // ── Resume ──────────────────────────────────────────────────────────────

  const resume = useCallback(async () => {
    const p = progressRef.current;
    const session = optionsRef.current.sessions.find((s) => s.id === p.sessionId);
    const check = checkPracticeResume(session, p);
    if (!session || check.kind !== 'ok' || p.contentHash !== introPianoContentHash(check.lang)) {
      setPanel('cannot-resume');
      return;
    }
    if (optionsRef.current.currentId !== session.id) {
      await optionsRef.current.switchToSession(session.id);
    }
    // The page went away after the preset was written but before that was recorded.
    if (check.delivered && !p.delivered) dispatch({ type: 'delivered' });
    setDeliveryError(false);
    setPanel('step');
  }, [dispatch, setPanel]);

  const restart = useCallback(async () => {
    cancelInFlight();
    optionsRef.current.studio.stop();
    dispatch({ type: 'reset' });
    await start();
  }, [cancelInFlight, dispatch, start]);

  /** "More → Getting started": resume a practice under way, or offer a new one. */
  const openFromMenu = useCallback(() => {
    setPanel(progressRef.current.status === 'active' ? 'resume' : 'invite');
  }, [setPanel]);

  // ── Moving through the tour ─────────────────────────────────────────────

  const next = useCallback(() => {
    dispatch({ type: 'next' });
  }, [dispatch]);

  const prev = useCallback(() => {
    dispatch({ type: 'prev' });
  }, [dispatch]);

  /** "Skip": the guide is settled and goes; the practice session stays. */
  const skip = useCallback(() => {
    cancelInFlight();
    optionsRef.current.studio.stop();
    setSending(false);
    dispatch({ type: 'skip' });
    setPanel('dismissed');
  }, [cancelInFlight, dispatch, setPanel]);

  // ── The preset turn ─────────────────────────────────────────────────────

  const sendPreset = useCallback(async () => {
    const p = progressRef.current;
    if (deliveryRef.current || p.status !== 'active' || p.step !== 'send-instruction' || p.delivered) return;
    const sessionId = p.sessionId;
    if (!sessionId || optionsRef.current.currentId !== sessionId) return;
    optionsRef.current.studio.stop();
    const controller = new AbortController();
    deliveryRef.current = controller;
    const generation = generationRef.current;
    setDeliveryError(false);
    setSending(true);

    try {
      if (!(await wait(PRESET_DELAY_MS, controller.signal))
        || generation !== generationRef.current
        || optionsRef.current.currentId !== sessionId) {
        return;
      }
      const session = optionsRef.current.sessions.find((s) => s.id === sessionId);
      const check = checkPracticeResume(session, progressRef.current);
      if (!session || check.kind !== 'ok') {
        setPanel('cannot-resume');
        return;
      }
      const payload = withPresetDelivered(session);
      if (payload) {
        // The editor first, flagged as the session's own code, so the manual
        // edit mirror never reads the old buffer as a change and writes the
        // original back over the result.
        optionsRef.current.showCodeInEditor(sessionId, payload.code);
        try {
          await optionsRef.current.importSession(payload, { activate: true });
        } catch (error) {
          if (generation === generationRef.current) optionsRef.current.showCodeInEditor(sessionId, session.code);
          throw error;
        }
      }
      if (generation !== generationRef.current) return;
      dispatch({ type: 'delivered' });
    } catch {
      if (generation !== generationRef.current) return;
      setDeliveryError(true);
      track('error', 'send-instruction');
    } finally {
      if (deliveryRef.current === controller) deliveryRef.current = null;
      if (generation === generationRef.current) setSending(false);
    }
  }, [dispatch, setPanel]);

  // Walking off the practice session calls off a preset still loading.
  useEffect(() => {
    if (isPracticeCurrent || !deliveryRef.current) return;
    deliveryRef.current.abort();
    deliveryRef.current = null;
  }, [isPracticeCurrent]);

  // ── Hand-off ────────────────────────────────────────────────────────────

  const keepEditing = useCallback(() => {
    stopCompare();
    optionsRef.current.studio.stop();
    dispatch({ type: 'finish' });
    setPanel('dismissed');
    optionsRef.current.focusInput();
  }, [dispatch, setPanel, stopCompare]);

  const createNew = useCallback(async () => {
    stopCompare();
    optionsRef.current.studio.stop();
    dispatch({ type: 'finish' });
    setPanel('dismissed');
    await optionsRef.current.startNewSession();
  }, [dispatch, setPanel, stopCompare]);

  /**
   * Called for every genuine instruction. One sent into the practice once the
   * result is in is carrying on for real — the same as "keep working on this"
   * — so it settles the guide; then the first one is counted.
   */
  const noteRealInstruction = useCallback(() => {
    const p = progressRef.current;
    if (p.status === 'active' && p.delivered && optionsRef.current.currentId === p.sessionId) {
      dispatch({ type: 'finish' });
      setPanel('dismissed');
    }
    dispatch({ type: 'real-instruction' });
  }, [dispatch, setPanel]);

  const practiceSession = sessions.find((s) => s.id === progress.sessionId);

  return {
    view,
    progress,
    step,
    stepNumber: stepNumber(step),
    stepCount: TOUR_STEPS.length,
    canNext: canAdvance(progress),
    canPrev: canGoBack(progress),
    listen,
    sending,
    deliveryError,
    startError,
    starting,
    /** Whether "saved in your history" is true of this device's storage. */
    persistent: isPersistent,
    presetText: presetInstruction(lang),
    replyMessageId: presetReplyId(practiceSession),
    start,
    postpone,
    dismiss,
    resume,
    restart,
    openFromMenu,
    next,
    prev,
    skip,
    retrySounds,
    interruptListening,
    togglePlayback,
    readListenPlayhead,
    /** Progress per second through the window at the piece's tempo. */
    listenRate: INTRO_PIANO_CPS / (COMPARE_WINDOW.endCycle - COMPARE_WINDOW.startCycle),
    studioPlaying: studio.isPlaying,
    compare,
    playCompare,
    stopCompare,
    sendPreset,
    keepEditing,
    createNew,
    noteRealInstruction,
  };
}

export type Onboarding = ReturnType<typeof useOnboarding>;
