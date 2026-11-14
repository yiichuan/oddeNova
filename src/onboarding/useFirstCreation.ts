import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CodeRevisionDraft, Session, SessionImportPayload } from '../hooks/useSessions';
import { trackOnboardingProgressed, type OnboardingStage } from '../lib/analytics';
import { t } from '../lib/i18n';
import {
  FIRST_CREATION_CASE_ID,
  FIRST_CREATION_TURN_COUNT,
  creationTurn,
  firstCreationContentHash,
  langOfContentHash,
  readerCreationLang,
  type CreationLang,
} from './first-creation-case';
import {
  checkCreationResume,
  makeCreationSessionPayload,
  withoutUnfinishedTurn,
} from './first-creation-session';
import {
  FIRST_CREATION_GUIDE_VERSION,
  composeTurnOf,
  creationStepCount,
  creationStepNumber,
  explainTurnOf,
  initialCreationProgress,
  isCreationSettled,
  readCreationProgress,
  reconcileDelivered,
  reduceCreation,
  shouldAutoInviteCreation,
  writeCreationProgress,
  type CreationEvent,
  type CreationLayout,
  type CreationProgress,
} from './first-creation-state';
import { useCloudSettled } from './use-cloud-settled';

/**
 * The first-run guide, wired to the studio — on both layouts.
 *
 * Four turns over the studio's own controls: the preset sits in the real
 * message box, the reader presses the real send key, and the turn plays out in
 * the conversation the way a real one does — the instruction, a short stretch
 * of thinking, the reply with its code — and the code then plays. Every
 * message is written through the session's ordinary writers, so the practice
 * is a real conversation afterwards. Nothing here reaches the model.
 */

export type CreationView = 'hidden' | 'invite' | 'resume' | 'cannot-resume' | 'step';

/** The session writers a turn plays out through — the same ones a real turn uses. */
export interface CreationTurnWriter {
  addUserMessage: (text: string, sessionId: string) => void;
  appendReasoning: (delta: string, sessionId: string) => void;
  addProgress: (kind: 'tool_call' | 'commit', content: string, opts: { toolName?: string; sessionId: string }) => void;
  addAssistantMessage: (text: string, code: string, sessionId: string, revision: CodeRevisionDraft) => void;
  setCurrentCode: (code: string, sessionId: string) => void;
  checkpoint: (sessionId: string) => Promise<void>;
  /** Raise the conversation's thinking indicator; its stop key aborts the controller. */
  beginGenerating: (sessionId: string) => AbortController;
  endGenerating: (sessionId: string, controller: AbortController) => void;
}

export interface UseFirstCreationOptions {
  ownerKey: string;
  /** Which path the steps take after each turn (see first-creation-state). */
  layout: CreationLayout;
  enabled: boolean;
  canAutoInvite: boolean;
  studioActive: boolean;
  guestEligible: boolean;
  sessions: readonly Session[];
  currentId: string | null;
  isPersistent: boolean;
  importSession: (payload: SessionImportPayload, options?: { activate?: boolean }) => Promise<void>;
  switchToSession: (id: string) => Promise<void> | void;
  leaveCurrentSession: () => Promise<void>;
  startNewSession: () => Promise<void> | void;
  focusInput: () => void;
  writer: CreationTurnWriter;
  studio: {
    play: (code: string) => Promise<boolean>;
    stop: () => void;
  };
}

/** Pauses that let each part of the turn be seen arriving. */
const TIMING = {
  beforeThinking: 600,
  thinkingTotal: 1600,
  thinkingTick: 50,
  beforeArranging: 400,
  arranging: 1200,
  /**
   * Phone only: how long the reply and its widget, already playing, are left
   * in view before the next turn's card comes up over them.
   */
  mobileLinger: 1800,
};

type Panel = 'auto' | 'dismissed' | 'invite' | 'manual-invite' | 'resume' | 'cannot-resume' | 'step';

const STAGE_FOR_EVENT: Partial<Record<CreationEvent['type'], OnboardingStage>> = {
  start: 'started',
  delivered: 'turn_delivered',
  finish: 'completed',
  skip: 'skipped',
  postpone: 'postponed',
  'real-instruction': 'first_real_instruction',
};

function track(stage: OnboardingStage, step?: string): void {
  try {
    trackOnboardingProgressed({
      stage,
      step,
      guide_version: FIRST_CREATION_GUIDE_VERSION,
      case_id: FIRST_CREATION_CASE_ID,
    });
  } catch {
    // Analytics never changes what the guide does.
  }
}

function freshProgress(): CreationProgress {
  return initialCreationProgress(FIRST_CREATION_CASE_ID, firstCreationContentHash(readerCreationLang()));
}

function langOf(progress: CreationProgress): CreationLang {
  return langOfContentHash(progress.contentHash) ?? readerCreationLang();
}

function wait(ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }
    const onAbort = () => {
      clearTimeout(id);
      resolve(false);
    };
    const id = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve(true);
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** `text` in pieces sized so that streaming it takes about `total` ms. */
function streamChunks(text: string): string[] {
  const ticks = Math.max(1, Math.round(TIMING.thinkingTotal / TIMING.thinkingTick));
  const size = Math.max(1, Math.ceil(text.length / ticks));
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks;
}

export function useFirstCreation(options: UseFirstCreationOptions) {
  const { ownerKey, layout, enabled, canAutoInvite, studioActive, guestEligible, currentId, isPersistent } = options;
  const eligible = ownerKey !== 'guest' || guestEligible;

  // Progress is per account, held with the owner it belongs to, so a change of
  // account is seen during render and never shows one account another's.
  const [store, setStore] = useState(() => ({
    ownerKey,
    progress: readCreationProgress(ownerKey, freshProgress()),
    panel: 'auto' as Panel,
  }));
  let current = store;
  if (store.ownerKey !== ownerKey) {
    current = { ownerKey, progress: readCreationProgress(ownerKey, freshProgress()), panel: 'auto' };
    setStore(current);
  }
  const { progress, panel } = current;

  const [sending, setSending] = useState(false);
  const [deliveryError, setDeliveryError] = useState(false);
  const [startError, setStartError] = useState(false);
  const [starting, setStarting] = useState(false);
  const [exitHintVisible, setExitHintVisible] = useState(false);

  const optionsRef = useRef(options);
  const progressRef = useRef(progress);
  const ownerRef = useRef(ownerKey);
  /** Bumped by anything that invalidates work in flight: account change, restart, unmount. */
  const generationRef = useRef(0);
  const deliveryRef = useRef<AbortController | null>(null);
  const startingRef = useRef(false);
  const inviteTrackedRef = useRef(false);
  useEffect(() => {
    optionsRef.current = options;
    progressRef.current = progress;
    ownerRef.current = ownerKey;
  });

  const cloud = useCloudSettled(ownerKey, enabled, () => isCreationSettled(progressRef.current));
  const pushSettled = cloud.pushSettled;

  const setPanel = useCallback((next: Panel) => {
    setStore((s) => ({ ...s, panel: next }));
  }, []);

  const commit = useCallback((after: CreationProgress) => {
    progressRef.current = after;
    writeCreationProgress(ownerRef.current, after);
    setStore((s) => (s.ownerKey === ownerRef.current ? { ...s, progress: after } : s));
    if (isCreationSettled(after)) void pushSettled();
  }, [pushSettled]);

  const dispatch = useCallback((event: CreationEvent): CreationProgress => {
    const before = progressRef.current;
    const after = reduceCreation(before, event);
    if (after === before) return before;
    commit(after);
    const stage = STAGE_FOR_EVENT[event.type];
    if (stage) track(stage, event.type === 'delivered' ? `turn-${event.turn}` : event.type === 'skip' ? before.step : undefined);
    return after;
  }, [commit]);

  const cancelInFlight = useCallback(() => {
    generationRef.current += 1;
    deliveryRef.current?.abort();
    deliveryRef.current = null;
  }, []);

  // A change of account, or the guide going away, calls off a turn still
  // playing out: a late message must not land on the next account.
  useEffect(() => cancelInFlight, [ownerKey, cancelInFlight]);

  const practiceId = progress.status === 'active' ? progress.sessionId : null;
  const isPracticeCurrent = practiceId !== null && practiceId === currentId;

  const view: CreationView = useMemo(() => {
    if (!enabled || !studioActive) return 'hidden';
    switch (panel) {
      case 'dismissed':
        return 'hidden';
      case 'invite':
      case 'manual-invite':
        return 'invite';
      case 'resume':
      case 'cannot-resume':
        return panel;
      case 'step':
        if (progress.status !== 'active') return 'hidden';
        return isPracticeCurrent ? 'step' : 'resume';
      case 'auto':
        if (!canAutoInvite) return 'hidden';
        if (isCreationSettled(progress) || cloud.status !== 'clear') return 'hidden';
        if (progress.status === 'active') return 'resume';
        return shouldAutoInviteCreation(progress, { eligible, now: Date.now() }) ? 'invite' : 'hidden';
    }
  }, [enabled, studioActive, panel, progress, isPracticeCurrent, canAutoInvite, eligible, cloud.status]);

  useEffect(() => {
    if (view !== 'invite' || inviteTrackedRef.current) return;
    inviteTrackedRef.current = true;
    track('invite_shown');
  }, [view]);

  // ── Invitation ──────────────────────────────────────────────────────────

  const start = useCallback(async () => {
    if (startingRef.current) return;
    startingRef.current = true;
    setExitHintVisible(false);
    setStarting(true);
    setStartError(false);
    // Hold the invitation until the practice is ready, so the resume card does
    // not flash up while its session is still being written.
    setPanel('invite');
    const generation = generationRef.current;
    try {
      const lang = readerCreationLang();
      const id = crypto.randomUUID();
      await optionsRef.current.leaveCurrentSession();
      if (generation !== generationRef.current) return;
      // Recorded before the session is written, so a second press or a
      // refresh finds this practice instead of making another one.
      dispatch({ type: 'start', sessionId: id, caseId: FIRST_CREATION_CASE_ID, contentHash: firstCreationContentHash(lang) });
      await optionsRef.current.importSession(makeCreationSessionPayload({ id }), { activate: true });
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
  }, [dispatch, setPanel]);

  /** Declining the first invitation is an answer; the menu entry is pointed out once. */
  const postpone = useCallback(() => {
    dispatch({ type: 'skip' });
    setPanel('dismissed');
    setExitHintVisible(panel !== 'manual-invite');
  }, [dispatch, panel, setPanel]);

  /** "Later" on a practice under way: out of the way for now, offered again next visit. */
  const dismiss = useCallback(() => setPanel('dismissed'), [setPanel]);

  // ── Resume ──────────────────────────────────────────────────────────────

  const resume = useCallback(async () => {
    setExitHintVisible(false);
    const p = progressRef.current;
    const session = optionsRef.current.sessions.find((s) => s.id === p.sessionId);
    const lang = langOf(p);
    const check = checkCreationResume(session, p, lang);
    if (!session || check.kind !== 'ok' || p.contentHash !== firstCreationContentHash(lang)) {
      setPanel('cannot-resume');
      return;
    }
    if (optionsRef.current.currentId !== session.id) {
      await optionsRef.current.switchToSession(session.id);
    }
    // A turn cut short leaves its instruction behind; it is sent again from clean.
    const trimmed = withoutUnfinishedTurn(session);
    if (trimmed) await optionsRef.current.importSession(trimmed, { activate: true });
    // The page went away after a turn was written but before that was recorded.
    if (check.delivered > p.delivered) commit(reconcileDelivered(p, check.delivered, optionsRef.current.layout));
    setDeliveryError(false);
    setPanel('step');
  }, [commit, setPanel]);

  const restart = useCallback(async () => {
    cancelInFlight();
    optionsRef.current.studio.stop();
    dispatch({ type: 'reset' });
    await start();
  }, [cancelInFlight, dispatch, start]);

  /** "More → Getting started": resume a practice under way, or offer a new one. */
  const openFromMenu = useCallback(() => {
    setExitHintVisible(false);
    setPanel(progressRef.current.status === 'active' ? 'resume' : 'manual-invite');
  }, [setPanel]);

  const dismissExitHint = useCallback(() => setExitHintVisible(false), []);

  // ── A turn ──────────────────────────────────────────────────────────────

  /**
   * Play one preset turn out in the conversation: the instruction, a short
   * stretch of streamed thinking, "arranging", then the code — played, made
   * the session's code, and given its reply and revision as a real turn is.
   */
  const sendTurn = useCallback(async () => {
    const p = progressRef.current;
    const turnNumber = composeTurnOf(p.step);
    if (deliveryRef.current || p.status !== 'active' || turnNumber === null || p.delivered >= turnNumber) return;
    const sessionId = p.sessionId;
    if (!sessionId || optionsRef.current.currentId !== sessionId) return;
    const turn = creationTurn(turnNumber, langOf(p));
    const generation = generationRef.current;
    const { writer, studio } = optionsRef.current;

    setDeliveryError(false);
    setSending(true);
    studio.stop();
    let controller: AbortController | null = null;
    let delivered = false;

    try {
      // Anything an earlier, interrupted try of this turn left behind goes first.
      const session = optionsRef.current.sessions.find((s) => s.id === sessionId);
      const trimmed = session ? withoutUnfinishedTurn(session) : null;
      if (trimmed) await optionsRef.current.importSession(trimmed, { activate: true });
      if (generation !== generationRef.current || optionsRef.current.currentId !== sessionId) return;

      controller = writer.beginGenerating(sessionId);
      deliveryRef.current = controller;
      const { signal } = controller;
      const alive = () => !signal.aborted
        && generation === generationRef.current
        && optionsRef.current.currentId === sessionId;

      writer.addUserMessage(turn.instruction, sessionId);
      if (!(await wait(TIMING.beforeThinking, signal)) || !alive()) return;
      for (const chunk of streamChunks(turn.reasoning)) {
        writer.appendReasoning(chunk, sessionId);
        if (!(await wait(TIMING.thinkingTick, signal)) || !alive()) return;
      }
      if (!(await wait(TIMING.beforeArranging, signal)) || !alive()) return;
      writer.addProgress('tool_call', t('arrangeMusic'), { toolName: 'setCode', sessionId });
      if (!(await wait(TIMING.arranging, signal)) || !alive()) return;
      writer.addProgress('commit', t('preparingToPlay'), { sessionId });

      const played = await studio.play(turn.code);
      if (!alive()) return;
      writer.setCurrentCode(turn.code, sessionId);
      writer.addAssistantMessage(turn.reply, turn.code, sessionId, {
        beforeCode: turn.beforeCode,
        afterCode: turn.code,
        playbackStatus: played ? 'played' : 'failed',
      });
      dispatch({ type: 'delivered', turn: turnNumber, layout: optionsRef.current.layout });
      delivered = true;
    } catch {
      if (generation !== generationRef.current) return;
      setDeliveryError(true);
      track('error', p.step);
    } finally {
      if (controller) {
        if (deliveryRef.current === controller) deliveryRef.current = null;
        writer.endGenerating(sessionId, controller);
        void writer.checkpoint(sessionId);
      }
      // On a phone the guide stays out of the way a moment longer, so the
      // reply and its widget — playing the new code — are seen before the
      // next card covers them.
      if (delivered && optionsRef.current.layout === 'mobile') {
        await new Promise((resolve) => setTimeout(resolve, TIMING.mobileLinger));
      }
      if (generation === generationRef.current) setSending(false);
    }
  }, [dispatch]);

  // Walking off the practice session calls off a turn still playing out.
  useEffect(() => {
    if (isPracticeCurrent || !deliveryRef.current) return;
    deliveryRef.current.abort();
    deliveryRef.current = null;
  }, [isPracticeCurrent]);

  /** From an explanation on to the next turn, or (phone) from the code to the close. */
  const next = useCallback(() => {
    dispatch({ type: 'next' });
  }, [dispatch]);

  /** The phone's code window opened while the guide pointed at its key. */
  const codeOpened = useCallback(() => {
    dispatch({ type: 'code-opened' });
  }, [dispatch]);

  // A practice carried across the phone breakpoint (a rotation, a resized
  // window) continues on the layout now showing.
  useEffect(() => {
    if (!enabled || progress.status !== 'active') return;
    dispatch({ type: 'layout', layout });
  }, [enabled, layout, progress.status, progress.step, dispatch]);

  // ── Hand-off ────────────────────────────────────────────────────────────

  /** Either way out of the close ends the guide's playback: the studio is the reader's again. */
  const keepEditing = useCallback(() => {
    optionsRef.current.studio.stop();
    dispatch({ type: 'finish' });
    setPanel('dismissed');
    optionsRef.current.focusInput();
  }, [dispatch, setPanel]);

  const createNew = useCallback(async () => {
    optionsRef.current.studio.stop();
    dispatch({ type: 'finish' });
    setPanel('dismissed');
    await optionsRef.current.startNewSession();
  }, [dispatch, setPanel]);

  /**
   * Called for every genuine instruction. One sent into the finished practice
   * is carrying on for real — the same as "keep working on this" — so it
   * settles the guide; then the first one is counted.
   */
  const noteRealInstruction = useCallback(() => {
    const p = progressRef.current;
    if (p.status === 'active' && p.delivered >= FIRST_CREATION_TURN_COUNT && optionsRef.current.currentId === p.sessionId) {
      dispatch({ type: 'finish' });
      setPanel('dismissed');
    }
    dispatch({ type: 'real-instruction' });
  }, [dispatch, setPanel]);

  const step = progress.step;
  const composeTurn = composeTurnOf(step);
  const explainTurn = explainTurnOf(step);
  const lang = langOf(progress);

  return {
    view,
    progress,
    step,
    stepNumber: creationStepNumber(step),
    stepCount: creationStepCount(layout),
    /** The turn whose instruction is in the message box, on a compose step. */
    composeTurn,
    /** The turn being explained over the code panel, on an explain step. */
    explainTurn,
    presetText: composeTurn !== null ? creationTurn(composeTurn, lang).instruction : null,
    /** The layers the explained turn added, by `@layer` name. */
    addedLayers: explainTurn !== null ? creationTurn(explainTurn, lang).addedLayers : [],
    sending,
    deliveryError,
    startError,
    starting,
    exitHintVisible,
    /** Whether "saved in your history" is true of this device's storage. */
    persistent: isPersistent,
    start,
    postpone,
    dismiss,
    resume,
    restart,
    openFromMenu,
    dismissExitHint,
    sendTurn,
    next,
    codeOpened,
    keepEditing,
    createNew,
    noteRealInstruction,
  };
}

export type FirstCreation = ReturnType<typeof useFirstCreation>;
