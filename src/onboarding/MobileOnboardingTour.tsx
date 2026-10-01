import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { t } from '../lib/i18n';
import { useVisualViewport } from '../hooks/useVisualViewport';
import { PlayIcon, StopIcon } from '../components/icons';
import { INTRO_PIANO_CHANGE } from './intro-piano-case';
import { CompareLabel, ListenBar } from './OnboardingTour';
import {
  MOBILE_STAGE_COUNT,
  canFinishOnMobile,
  isWindowPhase,
  mobilePhaseOf,
  mobileStageOf,
  type MobilePhase,
} from './mobile-tour-model';
import { expandRect, placeCard, sameRect, scrimPath, visibleRectOf, type Rect, type Size } from './tour-geometry';
import type { CompareVersion, Onboarding } from './useOnboarding';

/**
 * The first-run guide on a phone.
 *
 * The same practice and the same six steps as the desktop tour, shown one
 * guide card at a time (each counted as a step) and laid out for a thumb. Each screen points at one real control —
 * the code window's key, its play key, its close key, the send key, the play
 * key under the reply — and says one short thing about it. Everything else is
 * dimmed and unreachable; the target sits in a hole in that dimming and is
 * pressed for real.
 *
 * Three placements, one shell:
 * - a dialog in the middle of the screen at the width of the phone's other
 *   alerts, where there is nothing on screen to point at: the invitation
 *   (0/7, the way the desktop's counts 0/6), resuming, the resume after the
 *   original was heard, and the close;
 * - a card hung under the control it points at: the code window's key and
 *   its close key and the reply's play key (right edges together), the
 *   window's play key (left edges together), the reply or its opened widget
 *   (its width). One hung low that would run off the screen goes above its
 *   target instead, or keeps to the screen;
 * - a card just above the composer, while the send key is.
 */

/*
 * Nothing here moves the page. The cards float over a page laid out as it is
 * without the guide, so moving between steps or leaving the guide never
 * reflows the conversation, the composer or the code window — only the card
 * and the dimming change.
 */

interface MobileOnboardingTourProps {
  onboarding: Onboarding;
  codeWindowOpen: boolean;
  /** Something else has the screen (the navigation drawer): the guide steps back. */
  suspended: boolean;
  /** The guided reply's code widget is opened out — one switch shared with the widget. */
  changeOpen: boolean;
  onChangeOpenChange: (open: boolean) => void;
}

interface MobileTarget {
  key: string;
  selector: string;
  /** Where to look: the page, or the code window. A shut window is `inert`, so never both. */
  scope: 'page' | 'window';
  /** Whether a press inside the hole reaches the page. */
  interactive: boolean;
  padding: number;
  /** Bring into view once per key. */
  reveal?: () => void;
}

const SECONDARY =
  'inline-flex min-h-11 items-center justify-center rounded-region border border-border px-4 text-sm text-text-primary transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent motion-reduce:transition-none';
const EXIT =
  '-mr-2 inline-flex min-h-11 items-center rounded-region px-2 text-sm text-text-muted transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent motion-reduce:transition-none';
/** The dialogs' full-width keys, at the region's 6px corners: the way on in the accent, the others on a quiet grey with full-strength text. */
const BLOCK_PRIMARY =
  'inline-flex h-11 items-center justify-center rounded-region bg-brand-accent px-4 text-sm text-on-accent transition-colors hover:bg-brand-accent-hover disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent motion-reduce:transition-none';
const BLOCK_QUIET =
  'inline-flex h-11 items-center justify-center rounded-region bg-surface-hover px-3 text-sm text-text-primary transition-colors active:bg-surface-selected disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent motion-reduce:transition-none';
/** A key that is only a word: 44px of reach round it, no fill, colour to be given. */
const TEXT_KEY =
  'inline-flex min-h-11 items-center rounded-region px-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent motion-reduce:transition-none';
const ACCENT_WORD = 'text-brand-accent hover:text-brand-accent-hover';
const PLAIN_WORD = 'text-text-secondary hover:text-text-primary';
/** A way on set as a word rather than a plate: accent text, no fill, on the card's left edge. */
const TEXT_ACTION = `-ml-2 ${TEXT_KEY} ${ACCENT_WORD}`;

/**
 * Frames a target must hold still before the hole is cut round it: long
 * enough to wait out the code window scaling in or a reply scrolling into
 * view, short enough that a target already in place is pointed at at once.
 */
const SETTLE_FRAMES = 3;
/** How long a target may be missing before the reader is offered a way on. */
const LOST_MS = 1500;
const MARGIN = 12;
/** Between a hung card and the hole it hangs from. */
const ANCHOR_GAP = 8;
const ANCHOR_WIDTH = 280;

function layoutViewport(): Size {
  return { width: window.innerWidth, height: window.innerHeight };
}

function onScreen(rect: Rect, viewport: Size): boolean {
  return rect.left < viewport.width && rect.top < viewport.height
    && rect.left + rect.width > 0 && rect.top + rect.height > 0;
}

function scopeRoot(target: MobileTarget): ParentNode | null {
  return target.scope === 'window' ? document.querySelector('[data-testid="mobile-code-sheet"]') : document;
}

/** The first match on screen inside the target's scope: never a copy in a shut window. */
function resolveIn(root: ParentNode, selector: string, viewport: Size): Rect | null {
  const rect = visibleRectOf(selector, root);
  return rect && onScreen(rect, viewport) ? rect : null;
}

function scrollIntoView(selector: string, block: ScrollLogicalPosition = 'nearest') {
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  document.querySelector(selector)?.scrollIntoView({ block, behavior: reduce ? 'auto' : 'smooth' });
}

function targetFor(phase: MobilePhase | null, onboarding: Onboarding, changeOpen: boolean): MobileTarget | null {
  const replyId = onboarding.replyMessageId;
  const playable = onboarding.listen.status === 'ready' || onboarding.studioPlaying;
  switch (phase) {
    case 'open-window':
      return { key: 'code-key', selector: '[data-onboarding-target="code-key"]', scope: 'page', interactive: true, padding: 2 };
    case 'play-in-window':
      // Only the play key: the window's close stays dimmed with the rest, and
      // the card's own "exit" is the way out.
      return { key: 'window-play', selector: '[data-onboarding-target="play"]', scope: 'window', interactive: playable, padding: 8 };
    case 'close-window':
      return { key: 'window-close', selector: '[data-onboarding-target="code-close"]', scope: 'window', interactive: true, padding: 2 };
    case 'send':
      return {
        key: 'composer',
        selector: '[data-onboarding-target="composer"]',
        scope: 'page',
        interactive: !onboarding.sending,
        // The hole's corners are 8px round (see the scrim below) and the
        // composer's 6px: 2px out, the two curves run concentric, and the
        // dimming stays clear of the composer's outline at the corners.
        padding: 2,
      };
    case 'read-reply': {
      if (!replyId) return null;
      const selector = `[data-message-id="${replyId}"]`;
      // Open, so the reply can be scrolled and read in place.
      return { key: `reply:${replyId}`, selector, scope: 'page', interactive: true, padding: 4, reveal: () => scrollIntoView(selector) };
    }
    case 'listen-adapted': {
      if (!replyId) return null;
      const selector = `[data-code-diff-play="${replyId}"]`;
      // Mid-screen, so the card has room to hang beneath it.
      return { key: `reply-play:${replyId}`, selector, scope: 'page', interactive: playable, padding: 4, reveal: () => scrollIntoView(selector, 'center') };
    }
    case 'finish': {
      if (!replyId || !changeOpen) return null;
      const group = `[data-message-id="${replyId}"] [data-diff-group="${INTRO_PIANO_CHANGE.addedLayer}"]`;
      // The opened widget, not the whole reply round it.
      return {
        key: `change:${replyId}`,
        selector: `[data-code-diff="${replyId}"]`,
        scope: 'page',
        interactive: true,
        padding: 4,
        reveal: () => scrollIntoView(group, 'center'),
      };
    }
    default:
      return null;
  }
}

type Layout = 'dialog' | 'anchored' | 'card';

/**
 * Where a card hung from `hole` goes: below it if it fits, above it if that
 * fits instead, and otherwise as low as the screen allows.
 */
function hungTop(hole: Rect, height: number, screenTop: number, screenBottom: number): number {
  const below = hole.top + hole.height + ANCHOR_GAP;
  if (below + height <= screenBottom - MARGIN) return below;
  const above = hole.top - ANCHOR_GAP - height;
  if (above >= screenTop + MARGIN) return above;
  return Math.max(screenTop + MARGIN, screenBottom - MARGIN - height);
}

/**
 * A card with no hole to hang from yet. While its target is coming into place
 * it is not drawn at all — drawn somewhere else first, it would be seen to
 * jump. Only a target that cannot be found brings it out, in the middle of the
 * screen, to offer finding it again.
 */
function unplaced(lost: boolean, box: Size, viewport: Size, screenBottom: number): CSSProperties {
  if (!lost) return { visibility: 'hidden' };
  return {
    top: Math.max(MARGIN, (screenBottom - box.height) / 2),
    left: MARGIN,
    right: 'auto',
    width: viewport.width - MARGIN * 2,
    maxWidth: undefined,
  };
}

type AnchoredPhase = 'open-window' | 'play-in-window' | 'close-window' | 'read-reply' | 'listen-adapted';

const ANCHORED_PHASES: readonly MobilePhase[] = ['open-window', 'play-in-window', 'close-window', 'read-reply', 'listen-adapted'];

function isAnchoredPhase(phase: MobilePhase): phase is AnchoredPhase {
  return ANCHORED_PHASES.includes(phase);
}

function layoutFor(view: Onboarding['view'], phase: MobilePhase | null, changeOpen: boolean): Layout {
  if (view !== 'step' || phase === null) return 'dialog';
  if (phase === 'send') return 'card';
  if (isAnchoredPhase(phase)) return 'anchored';
  if (phase === 'finish') return changeOpen ? 'anchored' : 'dialog';
  // The resume after the original was heard, window already shut: nothing on
  // screen to hang a card from, so it asks in the middle like the close.
  return 'dialog';
}

export default function MobileOnboardingTour({
  onboarding,
  codeWindowOpen,
  suspended,
  changeOpen,
  onChangeOpenChange,
}: MobileOnboardingTourProps) {
  const { view, progress } = onboarding;
  const phase = view === 'step' ? mobilePhaseOf(progress, { codeWindowOpen }) : null;
  // The code window is the first stage's own ground; anywhere else, a window
  // the reader opened is theirs to look at, and the guide waits for it to shut.
  const coveredByWindow = codeWindowOpen && !(phase !== null && isWindowPhase(phase));
  const visible = view !== 'hidden' && !suspended && !coveredByWindow;
  const layout = layoutFor(view, phase, changeOpen);
  const target = visible ? targetFor(phase, onboarding, changeOpen) : null;

  const visual = useVisualViewport(visible);
  const [viewport, setViewport] = useState<Size>(layoutViewport);
  const [hole, setHole] = useState<Rect | null>(null);
  const [lost, setLost] = useState(false);
  const [boxSize, setBoxSize] = useState<Size>({ width: 0, height: 0 });
  const boxRef = useRef<HTMLDivElement>(null);
  const labelId = useId();

  // Follow the target every frame: the window scales in, replies stream,
  // the conversation scrolls, the bar's own reserve moves the page.
  const targetRef = useRef(target);
  useEffect(() => {
    targetRef.current = target;
  });
  const targetKey = target?.key ?? null;
  const [relocateToken, setRelocateToken] = useState(0);
  useEffect(() => {
    if (!visible) return;
    let frame = 0;
    let raw: Rect | null = null;
    let stillFrames = 0;
    let settled = false;
    // Undefined until the first frame has said what it found, so a target
    // that changed since the last run starts from no hole rather than the old one.
    let shown: Rect | null | undefined;
    let missingSince = performance.now();
    let lostShown: boolean | undefined;
    let lastViewport = layoutViewport();
    const tick = () => {
      const now = performance.now();
      const size = layoutViewport();
      if (size.width !== lastViewport.width || size.height !== lastViewport.height) {
        lastViewport = size;
        setViewport(size);
      }
      const current = targetRef.current;
      const root = current ? scopeRoot(current) : null;
      const found = current && root ? resolveIn(root, current.selector, size) : null;
      const padded = found && current ? expandRect(found, current.padding, size) : null;
      if (sameRect(padded, raw)) stillFrames += 1;
      else {
        raw = padded;
        stillFrames = 0;
      }
      if (padded && !settled && stillFrames >= SETTLE_FRAMES) settled = true;
      const next = settled ? padded : null;
      if (shown === undefined || !sameRect(next, shown)) {
        shown = next;
        setHole(next);
      }
      if (padded || !current) missingSince = now;
      const isLost = current !== null && now - missingSince >= LOST_MS;
      if (lostShown === undefined || isLost !== lostShown) {
        lostShown = isLost;
        setLost(isLost);
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [visible, targetKey, relocateToken]);

  // Bring the target on screen once per key (and again on "find it again").
  useEffect(() => {
    if (!targetKey) return;
    targetRef.current?.reveal?.();
  }, [targetKey, relocateToken]);

  // The card's size, read after every commit and before paint: a step that
  // changes the card's words is placed by its new height in the same frame,
  // never drawn once where the old height would have put it. The observer
  // covers what changes it between commits (fonts, the viewport's width).
  const measureBox = useCallback(() => {
    const box = boxRef.current;
    if (!box) return;
    const next = { width: box.offsetWidth, height: box.offsetHeight };
    setBoxSize((prev) => (prev.width === next.width && prev.height === next.height ? prev : next));
  }, []);
  useLayoutEffect(measureBox);
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measureBox);
    observer.observe(box);
    return () => observer.disconnect();
  }, [visible, layout, measureBox]);


  // Screen readers and keyboards land on the guide each time it changes.
  const focusKey = visible ? `${view}:${phase}:${changeOpen}` : null;
  useEffect(() => {
    if (!focusKey) return;
    boxRef.current?.focus({ preventScroll: true });
  }, [focusKey]);

  if (!visible) return null;

  // Where the foot of the visible screen is: above a keyboard or a toolbar
  // that covers the layout viewport's bottom.
  const visibleBottom = visual ? Math.min(viewport.height, visual.top + visual.height) : viewport.height;
  const showHole = view === 'step' && target !== null && hole !== null;
  const scrimHole = showHole ? hole : null;
  // The closing panel over its summary keeps the whole page dimmed; opened out
  // to the change, the reply is read through a hole like any other step.
  const scrim = scrimPath(viewport, scrimHole, 8);

  let box: ReactNode;
  let boxStyle: CSSProperties;
  let boxClass: string;
  if (layout === 'dialog') {
    // Laid out by the centring frame round it (below), not placed here; it
    // scrolls inside itself on a screen too short to hold it.
    boxStyle = { maxHeight: visibleBottom - (visual?.top ?? 0) - MARGIN * 2 };
    // The alerts' width with the guide cards' padding. Every guide card takes
    // the sign-in window's 16px corners (`rounded-2xl`, AccountModal).
    // Foot as deep as head, 20px: to the words of a bottom row of bare
    // words, or to the edge of a full-width key.
    boxClass = 'relative w-full max-w-[320px] overflow-y-auto rounded-2xl border border-border px-5 pb-5 pt-5 shadow-dialog-overlay';
    box = view === 'invite' ? <Invite onboarding={onboarding} labelId={labelId} />
      : view !== 'step' ? <Resume onboarding={onboarding} labelId={labelId} />
      : phase === 'original-heard' ? <OriginalHeard onboarding={onboarding} labelId={labelId} />
      : <Finish onboarding={onboarding} labelId={labelId} onChangeOpenChange={onChangeOpenChange} />;
  } else if (layout === 'anchored') {
    const relocate = () => setRelocateToken((n) => n + 1);
    const hungPhase = phase as AnchoredPhase | 'finish';
    // Under the hole. Where it sits across depends on what it hangs from:
    // - the window's play key: left edges together;
    // - the reply itself, or its opened widget: its width, so the two read
    //   as one column;
    // - the code key, the close key and the reply's play key, all at the
    //   right-hand end of their rows: right edges together.
    // Where there is no room under the hole the card goes above it, and
    // where there is room on neither side it keeps to the screen.
    const top = hole ? hungTop(hole, boxSize.height, visual?.top ?? 0, visibleBottom) : 0;
    if (hungPhase === 'play-in-window') {
      const left = hole ? hole.left : MARGIN;
      boxStyle = { top, left, width: Math.min(ANCHOR_WIDTH, viewport.width - left - MARGIN) };
    } else if (hungPhase === 'read-reply' || hungPhase === 'finish') {
      const left = hole ? Math.max(MARGIN, hole.left) : MARGIN;
      const right = hole ? Math.min(viewport.width - MARGIN, hole.left + hole.width) : viewport.width - MARGIN;
      boxStyle = { top, left, width: right - left };
    } else {
      const right = hole ? Math.max(0, viewport.width - (hole.left + hole.width)) : MARGIN;
      boxStyle = { top, right, maxWidth: Math.min(ANCHOR_WIDTH, viewport.width - right - MARGIN) };
    }
    if (!hole) Object.assign(boxStyle, unplaced(lost, boxSize, viewport, visibleBottom));
    const fitsContent = hungPhase === 'open-window' || hungPhase === 'close-window';
    // Foot as deep as head: 20px, measured to the last words (or the words of
    // a bottom row) as the head is to the first line.
    boxClass = `${fitsContent ? 'w-max ' : ''}rounded-2xl border border-border px-5 pb-5 pt-5 shadow-dialog-overlay`;
    box = hungPhase === 'finish'
      ? <ChangeCard onboarding={onboarding} onHideChange={() => onChangeOpenChange(false)} />
      : <Anchored onboarding={onboarding} phase={hungPhase} lost={lost} onRelocate={relocate} />;
  } else {
    const width = hole ? hole.width : viewport.width - MARGIN * 2;
    const at = placeCard(hole, { width, height: boxSize.height }, { width: viewport.width, height: visibleBottom }, {
      placement: 'above-start',
      margin: MARGIN,
      gap: 10,
    });
    boxStyle = { left: at.left, top: at.top, width };
    if (!hole) Object.assign(boxStyle, unplaced(lost, boxSize, viewport, visibleBottom));
    boxClass = 'rounded-2xl border border-border px-5 pb-5 pt-5 shadow-dialog-overlay';
    box = <SendCard onboarding={onboarding} lost={lost} onRelocate={() => setRelocateToken((n) => n + 1)} />;
  }

  const dialog = (
    <div
      ref={boxRef}
      role="dialog"
      aria-modal="false"
      aria-label={layout === 'dialog' ? undefined : t('navOnboarding')}
      aria-labelledby={layout === 'dialog' ? labelId : undefined}
      tabIndex={-1}
      className={`pointer-events-auto ${layout === 'dialog' ? '' : 'absolute '}bg-conversation-surface text-sm text-text-secondary outline-none ${boxClass}`}
      style={boxStyle}
    >
      {box}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[80] pointer-events-none">
      <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
        <path d={scrim} fillRule="evenodd" style={{ fill: 'var(--color-overlay-backdrop)', pointerEvents: 'auto' }} />
      </svg>
      {scrimHole && (
        <div
          aria-hidden="true"
          data-onboarding-hole
          className="absolute rounded-region"
          style={{
            left: scrimHole.left,
            top: scrimHole.top,
            width: scrimHole.width,
            height: scrimHole.height,
            // A target that may not be pressed yet (sounds still loading, the
            // preset sending) is covered, not just dimmed.
            pointerEvents: target?.interactive ? 'none' : 'auto',
          }}
        />
      )}
      {layout === 'dialog' ? (
        // Centred in what is actually on screen, with the alerts' 32px sides.
        <div
          className="absolute inset-x-0 flex items-center justify-center px-8"
          style={{ top: visual?.top ?? 0, height: visibleBottom - (visual?.top ?? 0) }}
        >
          {dialog}
        </div>
      ) : dialog}
    </div>
  );
}

/**
 * "n/7" on its own line at the head of every guide card, 12px above the copy,
 * with the card's "exit guide" (`ExitGuide`) level with it at the top right.
 * A bottom row, where a card has one, stands 8px further off (`mt-2`): its
 * keys are 44px tall around a 20px line, so their labels already sit 12px
 * below whatever ends above them, and 20px sets the action apart.
 */
function StageCounter({ stage }: { stage: number }) {
  return (
    <div className="mb-3 text-xs tabular-nums text-brand-accent" aria-label={`${stage}/${MOBILE_STAGE_COUNT}`}>
      {stage}/{MOBILE_STAGE_COUNT}
    </div>
  );
}

/** The target is not on screen after a moment: look again, or (from the row below) leave. */
function LostRow({ onRelocate }: { onRelocate: () => void }) {
  return (
    <div className="mt-2 flex items-center gap-3 text-xs text-text-muted" role="status">
      <span className="min-w-0 flex-1">{t('onboardingMobileTargetLost')}</span>
      <button type="button" className="min-h-11 shrink-0 text-text-primary underline underline-offset-2" onClick={onRelocate}>
        {t('onboardingMobileRelocate')}
      </button>
    </div>
  );
}

const PHASE_COPY: Record<Exclude<MobilePhase, 'send' | 'finish'>, string> = {
  'open-window': 'onboardingMobileOpenWindow',
  'play-in-window': 'onboardingMobilePlayOriginal',
  'close-window': 'onboardingMobileCloseWindow',
  'original-heard': 'onboardingMobileOriginalHeard',
  'read-reply': 'onboardingMobileReadReply',
  'listen-adapted': 'onboardingMobileListenAdapted',
};

/** The one way on a screen offers besides pressing its target, if any. */
function phaseActionLabel(onboarding: Onboarding, phase: MobilePhase): string | null {
  if (phase === 'read-reply') return 'onboardingMobileHearChange';
  if (phase === 'listen-adapted' && onboarding.listen.heard) return 'onboardingMobileHeardContinue';
  return null;
}

/**
 * That way on, as an accent word in a row of its own at the foot of the card.
 * The row is drawn down by the 12px its 44px reach leaves under the label, so
 * the card ends as far below that word as below any last line.
 */
function PhaseActionRow({ onboarding, phase }: { onboarding: Onboarding; phase: MobilePhase }) {
  const label = phaseActionLabel(onboarding, phase);
  if (!label) return null;
  return (
    <div className="mt-2 -mb-3 flex items-center">
      <button type="button" className={TEXT_ACTION} disabled={!onboarding.canNext} onClick={onboarding.next}>
        {t(label)}
      </button>
    </div>
  );
}

/**
 * Leaving the guide: "exit guide" in every guide card's top-right corner, on
 * the stage number's line. The cards stand their first line 20px from the top
 * (`pt-5`); the key is 44px tall, so 6px down centres its label on that
 * line's 16px box. The label keeps to the card's 20px inset from the right.
 */
function ExitGuide({ onboarding }: { onboarding: Onboarding }) {
  return (
    <button
      type="button"
      className="absolute right-0 top-1.5 flex h-11 items-center rounded-region px-5 text-xs text-text-muted transition-colors hover:text-text-primary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand-accent motion-reduce:transition-none"
      onClick={onboarding.skip}
    >
      {t('onboardingMobileExit')}
    </button>
  );
}

/**
 * The resume after the original was heard with the window already shut —
 * nothing on screen to point at, so a dialog like the close: the stage, one
 * sentence, and the way on as a full-width key.
 */
function OriginalHeard({ onboarding, labelId }: { onboarding: Onboarding; labelId: string }) {
  return (
    <>
      <ExitGuide onboarding={onboarding} />
      <StageCounter stage={mobileStageOf('original-heard')} />
      <p id={labelId} className="leading-relaxed text-text-primary">{t(PHASE_COPY['original-heard'])}</p>
      <button type="button" className={`${BLOCK_PRIMARY} mt-5 w-full`} disabled={!onboarding.canNext} onClick={onboarding.next}>
        {t('onboardingMobileContinueSend')}
      </button>
    </>
  );
}

/**
 * Hung under the opened widget at the close: what changed, then back to the
 * summary at the left and carrying on — in the accent — at the right, both as
 * bare words.
 */
function ChangeCard({ onboarding, onHideChange }: { onboarding: Onboarding; onHideChange: () => void }) {
  return (
    <>
      <p className="leading-relaxed text-text-primary">{t('onboardingMobileChangeNote')}</p>
      <div className="mt-2 -mb-3 flex items-center justify-between gap-3">
        <button type="button" className={`-ml-2 ${TEXT_KEY} ${PLAIN_WORD}`} onClick={onHideChange}>
          {t('onboardingMobileHideChange')}
        </button>
        <button
          type="button"
          className={`-mr-2 ${TEXT_KEY} ${ACCENT_WORD}`}
          disabled={!canFinishOnMobile(onboarding.progress)}
          onClick={onboarding.keepEditing}
        >
          {t('onboardingKeepEditing')}
        </button>
      </div>
    </>
  );
}

/**
 * The listen's progress. Neither guided key can stop a listen short — the
 * guide stops it at 5 seconds — so there is nothing to say about one that was.
 */
function ListenStatus({ onboarding }: { onboarding: Onboarding }) {
  const { listen } = onboarding;
  return (
    <div className="mt-3" role="status" aria-live="polite">
      {listen.status === 'failed' ? (
        <div className="flex items-center gap-3 text-xs text-error">
          <span className="min-w-0 flex-1">{t('onboardingSoundsFailed')}</span>
          <button type="button" className="min-h-11 shrink-0 underline underline-offset-2" onClick={onboarding.retrySounds}>
            {t('onboardingRetry')}
          </button>
        </div>
      ) : listen.status === 'preparing' ? (
        <p className="text-xs text-text-muted">{t('onboardingPreparingSounds')}</p>
      ) : (
        <ListenBar read={onboarding.readListenPlayhead} rate={onboarding.listenRate} resting={listen.progress} />
      )}
    </div>
  );
}

/**
 * Hung under the control it points at: the stage, one sentence, the listen's
 * progress where there is a listen, and the way on and the way out together
 * in the bottom-right corner.
 */
function Anchored({
  onboarding,
  phase,
  lost,
  onRelocate,
}: {
  onboarding: Onboarding;
  phase: AnchoredPhase;
  lost: boolean;
  onRelocate: () => void;
}) {
  const stage = mobileStageOf(phase);
  const listening = phase === 'play-in-window' || phase === 'listen-adapted';
  return (
    <>
      <ExitGuide onboarding={onboarding} />
      <StageCounter stage={stage} />
      <p className="leading-relaxed text-text-primary">{t(PHASE_COPY[phase])}</p>
      {listening && <ListenStatus onboarding={onboarding} />}
      {lost && <LostRow onRelocate={onRelocate} />}
      <PhaseActionRow onboarding={onboarding} phase={phase} />
    </>
  );
}

/** Above the composer: the preset is in the field, and its send key is the one to press. */
function SendCard({ onboarding, lost, onRelocate }: { onboarding: Onboarding; lost: boolean; onRelocate: () => void }) {
  return (
    <>
      <ExitGuide onboarding={onboarding} />
      <StageCounter stage={mobileStageOf('send')} />
      <p className="leading-relaxed text-text-primary">{t('onboardingMobileSend')}</p>
      <div role="status" aria-live="polite">
        {onboarding.sending && <p className="mt-2 text-xs text-text-primary">{t('onboardingLoadingPreset')}</p>}
        {onboarding.deliveryError && <p className="mt-2 text-xs text-error">{t('onboardingDeliveryFailed')}</p>}
      </div>
      {lost && <LostRow onRelocate={onRelocate} />}
    </>
  );
}

/** The invitation: the desktop's card, counted in the phone's own steps. */
function Invite({ onboarding, labelId }: { onboarding: Onboarding; labelId: string }) {
  return (
    <>
      <StageCounter stage={0} />
      <h2 id={labelId} className="mb-1.5 text-[15px] font-semibold text-text-primary">{t('onboardingInviteTitle')}</h2>
      <p className="leading-relaxed text-text-primary">{t('onboardingMobileInviteBody')}</p>
      {onboarding.startError && <p className="mt-3 text-xs text-error">{t('requestFailed')}</p>}
      {/* As on the steps that follow: the way on at the left, the way out at the right. */}
      <div className="mt-2 -mb-3 flex items-center gap-3">
        <button type="button" className={TEXT_ACTION} disabled={onboarding.starting} onClick={() => void onboarding.start()}>
          {onboarding.starting ? t('loading') : t('onboardingStart')}
        </button>
        <button type="button" className={`${EXIT} ml-auto`} disabled={onboarding.starting} onClick={onboarding.postpone}>
          {t('onboardingLater')}
        </button>
      </div>
    </>
  );
}

/** A practice under way, or one that can no longer be picked up: the same card as the invitation. */
function Resume({ onboarding, labelId }: { onboarding: Onboarding; labelId: string }) {
  const canResume = onboarding.view === 'resume';
  return (
    <>
      <h2 id={labelId} className="mb-3 text-[15px] font-semibold text-text-primary">{t('onboardingResumeTitle')}</h2>
      <p className="leading-relaxed">{t(canResume ? 'onboardingResumeBody' : 'onboardingCannotResume')}</p>
      {onboarding.startError && <p className="mt-3 text-xs text-error">{t('requestFailed')}</p>}
      {/* Full-width keys, one to a line as at the close: the way on in the accent,
          then starting over and "later" on the grey. */}
      <button
        type="button"
        className={`${BLOCK_PRIMARY} mt-5 w-full`}
        disabled={onboarding.starting}
        onClick={() => void (canResume ? onboarding.resume() : onboarding.restart())}
      >
        {canResume ? t('onboardingResume') : onboarding.starting ? t('loading') : t('onboardingRestart')}
      </button>
      {canResume && (
        <button type="button" className={`${BLOCK_QUIET} mt-2 w-full`} disabled={onboarding.starting} onClick={() => void onboarding.restart()}>
          {t('onboardingRestart')}
        </button>
      )}
      <button type="button" className={`${BLOCK_QUIET} mt-2 w-full`} onClick={onboarding.dismiss}>
        {t('onboardingLater')}
      </button>
    </>
  );
}

/**
 * The close: what was done, the two versions to compare, and where to go
 * next — three full-width keys, carrying on with this piece first and in
 * the accent, then a new one and a look at the change.
 */
function Finish({
  onboarding,
  labelId,
  onChangeOpenChange,
}: {
  onboarding: Onboarding;
  labelId: string;
  onChangeOpenChange: (open: boolean) => void;
}) {
  const ready = canFinishOnMobile(onboarding.progress);
  const viewChange = () => {
    onboarding.stopCompare();
    onChangeOpenChange(true);
  };
  return (
    <>
      <StageCounter stage={MOBILE_STAGE_COUNT} />
      <h2 id={labelId} className="mb-1.5 text-[15px] font-semibold text-text-primary">{t('onboardingDoneTitle')}</h2>
      <p className="leading-relaxed text-text-primary">
        {t('onboardingMobileFinishBody')} {onboarding.persistent ? t('onboardingDoneSaved') : t('onboardingDoneUnsaved')}
      </p>
      <Compare onboarding={onboarding} />
      <button type="button" className={`${BLOCK_PRIMARY} mt-5 w-full`} disabled={!ready} onClick={onboarding.keepEditing}>
        {t('onboardingKeepEditing')}
      </button>
      <button type="button" className={`${BLOCK_QUIET} mt-2 w-full`} disabled={!ready} onClick={() => void onboarding.createNew()}>
        {t('onboardingCreateNew')}
      </button>
      <button type="button" className={`${BLOCK_QUIET} mt-2 w-full`} disabled={!onboarding.replyMessageId} onClick={viewChange}>
        {t('onboardingMobileViewChange')}
      </button>
    </>
  );
}

/** Each version's first 5 seconds on the guide's own transport; a key that is sounding stops it. */
function Compare({ onboarding }: { onboarding: Onboarding }) {
  const { compare } = onboarding;
  const key = (version: CompareVersion, label: string) => {
    const active = compare.version === version && compare.phase !== 'idle';
    return (
      <button
        type="button"
        aria-pressed={active}
        className={`${SECONDARY} min-w-0 flex-1 gap-1.5 px-2.5`}
        onClick={() => void onboarding.playCompare(version)}
      >
        <span className="inline-flex size-3 shrink-0 items-center justify-center" aria-hidden="true">
          {active ? <StopIcon size={10} /> : <PlayIcon size={12} />}
        </span>
        <CompareLabel onboarding={onboarding} version={version} label={label} />
      </button>
    );
  };
  return (
    <div className="mt-4">
      <div className="flex items-center gap-3">
        {key('original', t('onboardingCompareOriginal'))}
        {key('adapted', t('onboardingCompareAdapted'))}
      </div>
      {compare.failed && <p className="mt-2 text-xs text-error">{t('onboardingSoundsFailed')}</p>}
    </div>
  );
}
