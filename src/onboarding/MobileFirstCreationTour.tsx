import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { t } from '../lib/i18n';
import { useVisualViewport } from '../hooks/useVisualViewport';
import { expandRect, sameRect, scrimPath, visibleRectOf, type Rect, type Size } from './tour-geometry';
import type { FirstCreation } from './useFirstCreation';

/**
 * The first-run guide on a phone: the same four turns as the desktop, laid
 * out for a thumb.
 *
 * - Each turn: a card just above the composer while its send key is the one
 *   to press. Once sent the guide steps aside entirely; the turn plays out in
 *   the conversation and its reply's widget plays the new code, and the next
 *   turn's card follows.
 * - After the fourth: a card hung under the code window's key (top right).
 *   Opened, the window's code is framed and scrolled while a card says what
 *   it is; "Got it" shuts the window.
 * - The invitation, resuming, and the close are dialogs in the middle.
 *
 * Nothing here moves the page: the cards float over it, and everything but
 * the target is dimmed and unreachable.
 */

interface MobileFirstCreationTourProps {
  guide: FirstCreation;
  codeWindowOpen: boolean;
  /** Something else has the screen (the navigation drawer): the guide steps back. */
  suspended: boolean;
  /** Scroll the window's code once it is framed. */
  onRevealCode: () => void;
}

interface MobileTarget {
  key: string;
  selector: string;
  /** Where to look: the page, or the code window (a shut window is `inert`). */
  scope: 'page' | 'window';
  interactive: boolean;
  padding: number;
}

const BLOCK_PRIMARY =
  'inline-flex h-11 items-center justify-center rounded-region bg-brand-accent px-4 text-sm text-on-accent transition-colors hover:bg-brand-accent-hover disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent motion-reduce:transition-none';
const BLOCK_QUIET =
  'inline-flex h-11 items-center justify-center rounded-region bg-surface-hover px-3 text-sm text-text-primary transition-colors active:bg-surface-selected disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent motion-reduce:transition-none';
const TEXT_KEY =
  'inline-flex min-h-11 items-center rounded-region px-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent motion-reduce:transition-none';
const TEXT_ACTION = `-mr-2 ${TEXT_KEY} text-brand-accent hover:text-brand-accent-hover`;
const CARD = 'rounded-2xl border border-border px-5 pb-5 pt-5 shadow-dialog-overlay';

/** Frames a target must hold still before the hole is cut: waits out the window scaling in. */
const SETTLE_FRAMES = 3;
/** How long a target may be missing before its card is shown anyway, in the middle. */
const LOST_MS = 1500;
const MARGIN = 12;
const GAP = 8;
const ANCHOR_WIDTH = 280;

function layoutViewport(layer?: HTMLElement | null): Size {
  if (layer && layer.clientWidth > 0 && layer.clientHeight > 0) {
    return { width: layer.clientWidth, height: layer.clientHeight };
  }
  return { width: window.innerWidth, height: window.innerHeight };
}

function resolve(target: MobileTarget): Rect | null {
  const root = target.scope === 'window' ? document.querySelector('[data-testid="mobile-code-sheet"]') : document;
  return root ? visibleRectOf(target.selector, root) : null;
}

function targetFor(guide: FirstCreation): MobileTarget | null {
  if (guide.view !== 'step') return null;
  if (guide.composeTurn !== null) {
    return {
      key: `compose-${guide.composeTurn}`,
      selector: '[data-onboarding-target="composer"]',
      scope: 'page',
      interactive: !guide.sending,
      // 2px out from the composer's 6px corners runs concentric with the hole's 8px.
      padding: 2,
    };
  }
  if (guide.step === 'open-code') {
    return { key: 'code-key', selector: '[data-onboarding-target="code-key"]', scope: 'page', interactive: true, padding: 2 };
  }
  if (guide.step === 'read-code') {
    return { key: 'code', selector: '[data-onboarding-target="code"]', scope: 'window', interactive: false, padding: 0 };
  }
  return null;
}

export default function MobileFirstCreationTour({ guide, codeWindowOpen, suspended, onRevealCode }: MobileFirstCreationTourProps) {
  const { view, step } = guide;
  // The code window belongs to the last steps; anywhere else a window the
  // reader opened is theirs, and the guide waits for it to shut. A turn being
  // sent and played out is watched in the conversation, with the guide away.
  const windowStep = step === 'open-code' || step === 'read-code';
  const coveredByWindow = codeWindowOpen && !(view === 'step' && windowStep);
  const visible = view !== 'hidden' && !suspended && !coveredByWindow && !(view === 'step' && guide.sending);
  const target = visible ? targetFor(guide) : null;
  const targetKey = target?.key ?? null;
  const dialog = view !== 'step' || step === 'done';

  const visual = useVisualViewport(visible);
  const [viewport, setViewport] = useState<Size>(layoutViewport);
  const [found, setFound] = useState<{ key: string | null; hole: Rect | null }>({ key: null, hole: null });
  const [lostKey, setLostKey] = useState<string | null>(null);
  const hole = targetKey !== null && found.key === targetKey ? found.hole : null;
  const lost = targetKey !== null && lostKey === targetKey;
  const [boxSize, setBoxSize] = useState<Size>({ width: 0, height: 0 });
  const boxRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const labelId = useId();

  const targetRef = useRef(target);
  useEffect(() => {
    targetRef.current = target;
  });
  useEffect(() => {
    if (!visible) return;
    let frame = 0;
    let raw: Rect | null = null;
    let stillFrames = 0;
    let settled = false;
    let shown: Rect | null | undefined;
    let missingSince = performance.now();
    let lostShown: boolean | undefined;
    let lastViewport: Size | null = null;
    const tick = () => {
      const size = layoutViewport(layerRef.current);
      if (!lastViewport || size.width !== lastViewport.width || size.height !== lastViewport.height) {
        lastViewport = size;
        setViewport((prev) => (prev.width === size.width && prev.height === size.height ? prev : size));
      }
      const current = targetRef.current;
      const rect = current ? resolve(current) : null;
      const padded = rect && current ? expandRect(rect, current.padding, size) : null;
      if (sameRect(padded, raw)) stillFrames += 1;
      else {
        raw = padded;
        stillFrames = 0;
      }
      if (padded && !settled && stillFrames >= SETTLE_FRAMES) settled = true;
      const next = settled ? padded : null;
      if (shown === undefined || !sameRect(next, shown)) {
        shown = next;
        setFound({ key: targetKey, hole: next });
      }
      const now = performance.now();
      if (padded || !current) missingSince = now;
      const isLost = current !== null && now - missingSince >= LOST_MS;
      if (lostShown === undefined || isLost !== lostShown) {
        lostShown = isLost;
        setLostKey(isLost ? targetKey : null);
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [visible, targetKey]);

  // The window's code scrolls once it is framed — once, per arrival.
  const codeFramed = targetKey === 'code' && hole !== null;
  const revealRef = useRef(onRevealCode);
  useEffect(() => {
    revealRef.current = onRevealCode;
  });
  useEffect(() => {
    if (codeFramed) revealRef.current();
  }, [codeFramed]);

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
  }, [visible, dialog, measureBox]);

  // Each step fades in once it is in place — a dialog once measured, a card
  // once its target is found — and goes at once when it is left, so one step
  // never blinks through another.
  const ready = dialog ? boxSize.height > 0 : hole !== null || lost;
  const fadeKey = visible && ready ? `${view}:${step}` : null;
  const [shownKey, setShownKey] = useState<string | null>(null);
  useEffect(() => {
    if (!fadeKey) return;
    const frame = requestAnimationFrame(() => setShownKey(fadeKey));
    return () => cancelAnimationFrame(frame);
  }, [fadeKey]);
  const shown = fadeKey !== null && shownKey === fadeKey;

  const focusKey = visible ? `${view}:${step}` : null;
  useEffect(() => {
    if (!focusKey) return;
    boxRef.current?.focus({ preventScroll: true });
  }, [focusKey]);

  if (!visible) return null;

  const screenTop = visual?.top ?? 0;
  const screenBottom = visual ? Math.min(viewport.height, visual.top + visual.height) : viewport.height;
  const scrimHole = !dialog ? hole : null;

  let box: ReactNode;
  let boxStyle: CSSProperties = {};
  if (dialog) {
    boxStyle = { maxHeight: screenBottom - screenTop - MARGIN * 2 };
    box = view === 'invite' ? <Invite guide={guide} labelId={labelId} />
      : view === 'step' ? <Done guide={guide} labelId={labelId} />
      : <Resume guide={guide} labelId={labelId} />;
  } else {
    const unplaced = !hole;
    if (step === 'open-code') {
      // Hung under the key, right edges together.
      const right = hole ? Math.max(0, viewport.width - (hole.left + hole.width)) : MARGIN;
      boxStyle = { top: hole ? hole.top + hole.height + GAP : 0, right, maxWidth: Math.min(ANCHOR_WIDTH, viewport.width - right - MARGIN) };
    } else if (step === 'read-code') {
      // Below the framed code where it fits, else above it, else over its foot.
      const left = hole ? Math.max(MARGIN, hole.left) : MARGIN;
      const right = hole ? Math.min(viewport.width - MARGIN, hole.left + hole.width) : viewport.width - MARGIN;
      let top = screenBottom - MARGIN - boxSize.height;
      if (hole) {
        const below = hole.top + hole.height + GAP;
        const above = hole.top - GAP - boxSize.height;
        top = below + boxSize.height <= screenBottom - MARGIN ? below
          : above >= screenTop + MARGIN ? above
          : Math.max(screenTop + MARGIN, hole.top + hole.height - MARGIN - boxSize.height);
      }
      boxStyle = { top, left, width: right - left };
    } else {
      // Just above the composer, as wide as it.
      const width = hole ? hole.width : viewport.width - MARGIN * 2;
      const left = hole ? hole.left : MARGIN;
      const top = hole ? Math.max(screenTop + MARGIN, hole.top - 10 - boxSize.height) : 0;
      boxStyle = { top, left, width };
    }
    if (unplaced) {
      // Drawn somewhere else first, it would be seen to jump: hidden until its
      // target is in place, unless that target cannot be found at all.
      boxStyle = lost
        ? { top: Math.max(MARGIN, (screenBottom - boxSize.height) / 2), left: MARGIN, width: viewport.width - MARGIN * 2 }
        : { ...boxStyle, visibility: 'hidden' };
    }
    box = guide.composeTurn !== null ? <ComposeCard guide={guide} />
      : step === 'open-code' ? <OpenCodeCard guide={guide} />
      : <ReadCodeCard guide={guide} />;
  }

  const card = (
    <div
      ref={boxRef}
      role="dialog"
      aria-modal="false"
      aria-label={dialog ? undefined : t('navOnboarding')}
      aria-labelledby={dialog ? labelId : undefined}
      tabIndex={-1}
      className={`pointer-events-auto ${dialog ? 'relative w-full max-w-[320px] overflow-y-auto ' : 'absolute '}bg-conversation-surface text-sm text-text-secondary outline-none ${CARD}`}
      style={boxStyle}
    >
      {box}
    </div>
  );

  return (
    <div
      ref={layerRef}
      className={`fixed inset-0 z-[80] pointer-events-none ${
        shown ? 'opacity-100 transition-opacity duration-300 ease-out motion-reduce:transition-none' : 'opacity-0'
      }`}
    >
      <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
        <path d={scrimPath(viewport, scrimHole, 8)} fillRule="evenodd" style={{ fill: 'var(--color-overlay-backdrop)', pointerEvents: 'auto' }} />
      </svg>
      {scrimHole && (
        <div
          aria-hidden="true"
          className="absolute rounded-region"
          style={{
            left: scrimHole.left,
            top: scrimHole.top,
            width: scrimHole.width,
            height: scrimHole.height,
            pointerEvents: target?.interactive ? 'none' : 'auto',
          }}
        />
      )}
      {dialog ? (
        <div
          className="absolute inset-x-0 flex items-center justify-center px-8"
          style={{ top: screenTop, height: screenBottom - screenTop }}
        >
          {card}
        </div>
      ) : card}
    </div>
  );
}

function Counter({ guide }: { guide: FirstCreation }) {
  const current = guide.view === 'step' ? guide.stepNumber : 0;
  return (
    <div className="mb-3 text-xs tabular-nums text-brand-accent" aria-label={`${current}/${guide.stepCount}`}>
      {current}/{guide.stepCount}
    </div>
  );
}

function ComposeCard({ guide }: { guide: FirstCreation }) {
  return (
    <>
      <Counter guide={guide} />
      <p className="leading-relaxed text-text-primary">{t(`firstCreationMobileCompose${guide.composeTurn}`)}</p>
      <div role="status" aria-live="polite">
        {guide.deliveryError && <p className="mt-2 text-xs text-error">{t('firstCreationDeliveryFailed')}</p>}
      </div>
    </>
  );
}

function OpenCodeCard({ guide }: { guide: FirstCreation }) {
  return (
    <>
      <Counter guide={guide} />
      <p className="leading-relaxed text-text-primary">{t('firstCreationMobileOpenCode')}</p>
    </>
  );
}

function ReadCodeCard({ guide }: { guide: FirstCreation }) {
  return (
    <>
      <Counter guide={guide} />
      <p className="leading-relaxed text-text-primary">{t('firstCreationMobileReadCode')}</p>
      <div className="mt-2 -mb-3 flex items-center justify-end">
        <button type="button" className={TEXT_ACTION} onClick={guide.next}>
          {t('firstCreationGotIt')}
        </button>
      </div>
    </>
  );
}

function Invite({ guide, labelId }: { guide: FirstCreation; labelId: string }) {
  return (
    <>
      <Counter guide={guide} />
      <h2 id={labelId} className="mb-1.5 text-[15px] font-semibold text-text-primary">{t('onboardingInviteTitle')}</h2>
      <p className="leading-relaxed text-text-primary">{t('firstCreationMobileInviteBody')}</p>
      {guide.startError && <p className="mt-3 text-xs text-error">{t('requestFailed')}</p>}
      <div className="mt-2 -mb-3 flex items-center justify-between gap-3">
        <button type="button" className={`-ml-2 ${TEXT_KEY} text-text-muted hover:text-text-primary`} disabled={guide.starting} onClick={guide.postpone}>
          {t('onboardingLater')}
        </button>
        <button type="button" className={TEXT_ACTION} disabled={guide.starting} onClick={() => void guide.start()}>
          {guide.starting ? t('loading') : t('onboardingStart')}
        </button>
      </div>
    </>
  );
}

function Resume({ guide, labelId }: { guide: FirstCreation; labelId: string }) {
  const canResume = guide.view === 'resume';
  return (
    <>
      <h2 id={labelId} className="mb-3 text-[15px] font-semibold text-text-primary">{t('onboardingResumeTitle')}</h2>
      <p className="leading-relaxed">{t(canResume ? 'onboardingResumeBody' : 'onboardingCannotResume')}</p>
      {guide.startError && <p className="mt-3 text-xs text-error">{t('requestFailed')}</p>}
      <button
        type="button"
        className={`${BLOCK_PRIMARY} mt-5 w-full`}
        disabled={guide.starting}
        onClick={() => void (canResume ? guide.resume() : guide.restart())}
      >
        {canResume ? t('onboardingResume') : guide.starting ? t('loading') : t('onboardingRestart')}
      </button>
      {canResume && (
        <button type="button" className={`${BLOCK_QUIET} mt-2 w-full`} disabled={guide.starting} onClick={() => void guide.restart()}>
          {t('onboardingRestart')}
        </button>
      )}
      <button type="button" className={`${BLOCK_QUIET} mt-2 w-full`} onClick={guide.dismiss}>
        {t('onboardingLater')}
      </button>
    </>
  );
}

/** The close: the same words and the same two ways on as the desktop's. */
function Done({ guide, labelId }: { guide: FirstCreation; labelId: string }) {
  return (
    <>
      <h2 id={labelId} className="mb-1.5 text-[15px] font-semibold text-text-primary">{t('firstCreationDoneTitle')}</h2>
      <p className="leading-relaxed text-text-primary">
        <strong className="font-semibold text-text-primary">{t('firstCreationDoneNoCode')}</strong>
        {t('firstCreationDoneBody')} {guide.persistent ? t('onboardingDoneSaved') : t('onboardingDoneUnsaved')}
      </p>
      {/* Stacked full-width keys, as in the sign-in window (AccountModal):
          the way on in the accent, the other on the field's ground. */}
      <div className="mt-5 flex flex-col gap-3">
        <button
          type="button"
          className="w-full rounded-lg bg-accent py-2.5 text-sm text-on-accent transition-colors hover:bg-accent-light disabled:cursor-not-allowed disabled:opacity-40"
          onClick={() => void guide.createNew()}
        >
          {t('onboardingCreateNew')}
        </button>
        <button
          type="button"
          className="w-full rounded-lg border border-border bg-auth-field py-2.5 text-sm text-text-primary transition-colors hover:border-accent/35 hover:bg-surface-hover disabled:opacity-40"
          onClick={guide.keepEditing}
        >
          {t('onboardingKeepEditing')}
        </button>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-text-muted">{t('onboardingDoneRealAi')}</p>
    </>
  );
}
