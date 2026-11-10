import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { t } from '../lib/i18n';
import { ArrowUpIcon } from '../components/icons';
import { expandRect, placeCard, sameRect, scrimPath, type CardPlacement, type Rect, type Size } from './tour-geometry';
import type { FirstCreation } from './useFirstCreation';

/**
 * The desktop first-run guide as a spotlight over the studio.
 *
 * Everything but the control a step teaches is dimmed and made unreachable:
 * the dimming is one even-odd path with a hole cut round the target, and only
 * painted area takes pointer events. While a turn is playing out the dimming
 * lifts, so the conversation can be watched as it fills in. The card sits
 * beside whatever it points at and follows it every frame.
 */

export interface TourTarget {
  /** Changes when the thing pointed at changes; the tour reveals it once per key. */
  key: string;
  resolve: () => Rect | null;
  /** Whether the reader may press what is inside the hole. */
  interactive: boolean;
  /** Bring the target on screen when the step opens. */
  reveal?: () => void;
  /** How long after the step opens the overlay waits before fading in (e.g. for the reveal's scroll). */
  settleMs?: number;
  /** Hold the hole where it is once the overlay is up: what scrolls after that moves under it. */
  freezeHole?: boolean;
  /** Called once the overlay has finished fading in. */
  afterShown?: () => void;
  padding?: number;
  placement?: CardPlacement;
  /** Make the card exactly as wide as the hole, so the two read as one column. */
  matchWidth?: boolean;
}

const PRIMARY =
  'inline-flex min-h-8 items-center justify-center rounded-region bg-brand-accent px-3.5 py-1.5 text-sm text-on-accent transition-colors hover:bg-brand-accent-hover disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent motion-reduce:transition-none';
const SECONDARY =
  'inline-flex min-h-8 items-center justify-center rounded-region border border-border px-3.5 py-1.5 text-sm text-text-primary transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent motion-reduce:transition-none';
const QUIET =
  '-ml-1.5 inline-flex min-h-8 items-center rounded-region px-1.5 text-sm text-text-muted transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent motion-reduce:transition-none';

const CARD_WIDTH = 356;
/** The overlay's fade-in; matches `duration-500` on its container. */
const OVERLAY_FADE_MS = 500;

function viewportSize(): Size {
  return { width: window.innerWidth, height: window.innerHeight };
}

interface FirstCreationTourProps {
  guide: FirstCreation;
  target: TourTarget | null;
  /** The step whose card has finished fading in, or null while none is shown. */
  onCardShown?: (step: FirstCreation['step'] | null) => void;
}

export default function FirstCreationTour({ guide, target, onCardShown }: FirstCreationTourProps) {
  const { view } = guide;
  /** The hole, tagged with the target it was measured for. */
  const [hole, setHole] = useState<{ key: string; rect: Rect } | null>(null);
  const [viewport, setViewport] = useState<Size>(viewportSize);
  const [cardSize, setCardSize] = useState<Size>({ width: CARD_WIDTH, height: 180 });
  const cardRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // While a sent turn plays out the tour steps aside entirely — no card, no
  // dimming — so the conversation can be watched as it fills in. It comes
  // back on the turn's explanation (or its close) once the code is in.
  const visible = view !== 'hidden' && !(view === 'step' && guide.sending);

  // Layout here moves for many reasons no single event covers (panel drags,
  // streaming text, the code scrolling), so the hole is re-read every frame.
  const targetRef = useRef(target);
  /** The key whose hole is held still (see `freezeHole`). */
  const frozenKeyRef = useRef<string | null>(null);
  useEffect(() => {
    targetRef.current = target;
  });
  useEffect(() => {
    if (!visible) return;
    let frame = 0;
    let lastHole: Rect | null = null;
    let lastKey: string | undefined;
    // Null so the first frame always reports the size: the window may have
    // been resized while the tour was away (a turn playing out, DevTools
    // docked or shut), and the stored size would otherwise stay stale.
    let lastViewport: Size | null = null;
    const tick = () => {
      const current = targetRef.current;
      const size = viewportSize();
      // A held hole is let go once when the window changes size, so it is
      // measured again against the new layout.
      const resized = !!lastViewport && (size.width !== lastViewport.width || size.height !== lastViewport.height);
      const frozen = current?.freezeHole && frozenKeyRef.current === current.key && current.key === lastKey && !resized;
      const found = frozen ? null : current?.resolve() ?? null;
      const next = frozen ? lastHole : found ? expandRect(found, current?.padding ?? 6, size) : null;
      if (current?.key !== lastKey || !sameRect(next, lastHole)) {
        lastHole = next;
        lastKey = current?.key;
        setHole(next && current ? { key: current.key, rect: next } : null);
      }
      if (!lastViewport || size.width !== lastViewport.width || size.height !== lastViewport.height) {
        lastViewport = size;
        setViewport(size);
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [visible]);

  const revealKey = visible ? target?.key : undefined;
  useEffect(() => {
    if (!revealKey) return;
    targetRef.current?.reveal?.();
  }, [revealKey]);

  // Each new step's overlay — dimming, frame and card together — fades in
  // rather than snapping on, after its target has settled.
  const overlayKey = visible ? `${view}:${target?.key ?? guide.step}` : null;
  const [shownKey, setShownKey] = useState<string | null>(null);
  useEffect(() => {
    if (!overlayKey) return;
    const settle = targetRef.current?.settleMs ?? 0;
    frozenKeyRef.current = null;
    const shown = setTimeout(() => {
      frozenKeyRef.current = targetRef.current?.key ?? null;
      setShownKey(overlayKey);
    }, settle);
    const after = setTimeout(() => targetRef.current?.afterShown?.(), settle + OVERLAY_FADE_MS);
    return () => {
      clearTimeout(shown);
      clearTimeout(after);
    };
  }, [overlayKey]);

  // Reported once the card has faded all the way in, so what it introduces
  // (the preset typing itself into the field) starts after it is seen.
  const cardShown = visible && shownKey === overlayKey
    && !(view === 'step' && guide.step !== 'done' && target !== null && !(hole && hole.key === target.key));
  const shownStep = cardShown ? guide.step : null;
  const onCardShownRef = useRef(onCardShown);
  useEffect(() => {
    onCardShownRef.current = onCardShown;
  });
  useEffect(() => {
    if (shownStep === null) {
      onCardShownRef.current?.(null);
      return;
    }
    const id = setTimeout(() => onCardShownRef.current?.(shownStep), OVERLAY_FADE_MS);
    return () => clearTimeout(id);
  }, [shownStep]);

  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const measure = () => {
      const next = { width: card.offsetWidth, height: card.offsetHeight };
      setCardSize((prev) => (prev.width === next.width && prev.height === next.height ? prev : next));
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(card);
    return () => observer.disconnect();
  }, [visible]);

  // Keyboard and screen-reader users land on the card each time it changes.
  const focusKey = visible ? `${view}:${guide.step}` : null;
  useEffect(() => {
    if (!focusKey) return;
    cardRef.current?.focus({ preventScroll: true });
  }, [focusKey]);

  if (!visible) return null;

  // The close is a dialog in the middle of the page, like the invitation.
  const floating = view !== 'step' || guide.step === 'done';
  // A hole still measured for the previous step is not shown: the card waits,
  // hidden, for this step's target and then appears where it belongs.
  const ownHole = hole && target && hole.key === target.key ? hole.rect : null;
  const shownHole = floating ? null : ownHole;
  const waiting = !floating && target !== null && ownHole === null;
  const cardWidth = target?.matchWidth && shownHole ? shownHole.width : CARD_WIDTH;
  const position = placeCard(shownHole, { width: cardWidth, height: cardSize.height }, viewport, {
    placement: floating ? undefined : target?.placement,
  });

  return (
    <div
      // Fades in only: a step on its way out goes at once, so the next one
      // never shows through the old one fading away (a blink).
      className={`fixed inset-0 z-[80] pointer-events-none ${
        shownKey === overlayKey ? 'opacity-100 transition-opacity duration-500 ease-out motion-reduce:transition-none' : 'opacity-0'
      }`}
    >
      <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
        <path
          d={scrimPath(viewport, shownHole)}
          fillRule="evenodd"
          style={{ fill: 'var(--color-overlay-backdrop)', pointerEvents: 'auto' }}
        />
      </svg>
      {shownHole && (
        <div
          aria-hidden="true"
          className="absolute rounded-region ring-1 ring-inset ring-brand-accent"
          style={{
            left: shownHole.left,
            top: shownHole.top,
            width: shownHole.width,
            height: shownHole.height,
            pointerEvents: target?.interactive ? 'none' : 'auto',
          }}
        />
      )}
      <div
        ref={cardRef}
        role="dialog"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`pointer-events-auto absolute flex flex-col rounded-dialog border border-border bg-conversation-surface px-5 pb-6 pt-6 text-sm text-text-secondary outline-none${
          floating ? ' shadow-dialog-overlay' : ''
        }`}
        style={{ left: position.left, top: position.top, width: cardWidth, visibility: waiting ? 'hidden' : undefined }}
      >
        {view === 'invite' && <Invite guide={guide} titleId={titleId} />}
        {view === 'resume' && <Resume guide={guide} titleId={titleId} />}
        {view === 'cannot-resume' && <CannotResume guide={guide} titleId={titleId} />}
        {view === 'step' && <Step guide={guide} titleId={titleId} />}
      </div>
    </div>
  );
}

function StepCounter({ current, total }: { current: number; total: number }) {
  return (
    <div className="mb-3 text-xs tabular-nums text-text-muted" aria-label={`${current}/${total}`}>
      {current}/{total}
    </div>
  );
}

function Title({ id, children }: { id: string; children: ReactNode }) {
  return <h2 id={id} className="mb-3 text-[15px] font-semibold text-text-primary">{children}</h2>;
}

function Footer({ left, right, gap = 'mt-6' }: { left?: ReactNode; right: ReactNode; gap?: string }) {
  return (
    <div className={`${gap} flex items-center justify-between gap-3`}>
      <div className="flex items-center">{left}</div>
      <div className="flex items-center gap-3">{right}</div>
    </div>
  );
}

/**
 * Copy with `{send}` in it gets a working copy of the send key in that place —
 * the accent disc with its arrow, centred on the line box so it sits right
 * against both Chinese and Latin text.
 */
function withSendKey(text: string, send: { disabled: boolean; onPress: () => void }): ReactNode {
  const parts = text.split('{send}');
  if (parts.length === 1) return text;
  return parts.flatMap((part, index): ReactNode[] => {
    const nodes: ReactNode[] = part.trim() ? [part.trim()] : [];
    if (index < parts.length - 1) {
      nodes.push(
        <span key={index} className="mx-1 inline-flex h-[1.625em] items-center align-top">
          <button
            type="button"
            onClick={send.onPress}
            disabled={send.disabled}
            aria-label={t('send')}
            className="inline-flex h-[18px] w-[18px] cursor-pointer items-center justify-center rounded-full bg-brand-accent text-on-accent transition-opacity disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent motion-reduce:transition-none"
          >
            <ArrowUpIcon size={12} />
          </button>
        </span>,
      );
    }
    return nodes;
  });
}

function Invite({ guide, titleId }: { guide: FirstCreation; titleId: string }) {
  return (
    <>
      <StepCounter current={0} total={guide.stepCount} />
      <Title id={titleId}>{t('onboardingInviteTitle')}</Title>
      <p className="leading-relaxed">{t('firstCreationInviteBody')}</p>
      {guide.startError && <p className="mt-3 text-xs text-error">{t('requestFailed')}</p>}
      <Footer
        left={
          <button type="button" className={QUIET} disabled={guide.starting} onClick={guide.postpone}>
            {t('onboardingLater')}
          </button>
        }
        right={
          <button type="button" className={PRIMARY} disabled={guide.starting} onClick={() => void guide.start()}>
            {guide.starting ? t('loading') : t('onboardingStart')}
          </button>
        }
      />
    </>
  );
}

function Resume({ guide, titleId }: { guide: FirstCreation; titleId: string }) {
  return (
    <>
      <Title id={titleId}>{t('onboardingResumeTitle')}</Title>
      <p className="leading-relaxed">{t('onboardingResumeBody')}</p>
      {guide.startError && <p className="mt-3 text-xs text-error">{t('requestFailed')}</p>}
      <Footer
        left={
          <button type="button" className={QUIET} onClick={guide.dismiss}>
            {t('onboardingLater')}
          </button>
        }
        right={
          <>
            <button type="button" className={SECONDARY} disabled={guide.starting} onClick={() => void guide.restart()}>
              {t('onboardingRestart')}
            </button>
            <button type="button" className={PRIMARY} disabled={guide.starting} onClick={() => void guide.resume()}>
              {t('onboardingResume')}
            </button>
          </>
        }
      />
    </>
  );
}

function CannotResume({ guide, titleId }: { guide: FirstCreation; titleId: string }) {
  return (
    <>
      <Title id={titleId}>{t('onboardingResumeTitle')}</Title>
      <p className="leading-relaxed">{t('onboardingCannotResume')}</p>
      {guide.startError && <p className="mt-3 text-xs text-error">{t('requestFailed')}</p>}
      <Footer
        left={
          <button type="button" className={QUIET} onClick={guide.dismiss}>
            {t('onboardingLater')}
          </button>
        }
        right={
          <button type="button" className={PRIMARY} disabled={guide.starting} onClick={() => void guide.restart()}>
            {guide.starting ? t('loading') : t('onboardingRestart')}
          </button>
        }
      />
    </>
  );
}

function Step({ guide, titleId }: { guide: FirstCreation; titleId: string }) {
  if (guide.step === 'done') return <Done guide={guide} titleId={titleId} />;
  const { composeTurn, explainTurn } = guide;
  return (
    <>
      <StepCounter current={guide.stepNumber} total={guide.stepCount} />
      {composeTurn !== null && (
        <>
          <Title id={titleId}>{t(`firstCreationCompose${composeTurn}Title`)}</Title>
          <p className="leading-relaxed">
            {withSendKey(t(`firstCreationCompose${composeTurn}Body`), {
              disabled: guide.sending,
              onPress: () => void guide.sendTurn(),
            })}
          </p>
          <div role="status" aria-live="polite">
            {guide.deliveryError && <p className="mt-3 text-xs text-error">{t('firstCreationDeliveryFailed')}</p>}
          </div>
        </>
      )}
      {explainTurn !== null && (
        <>
          <Title id={titleId}>{t(`firstCreationExplain${explainTurn}Title`)}</Title>
          <p className="leading-relaxed">{t(`firstCreationExplain${explainTurn}Body`)}</p>
          <Footer
            right={
              <button type="button" className={PRIMARY} onClick={guide.next}>
                {t('onboardingNext')}
              </button>
            }
          />
        </>
      )}
    </>
  );
}

function Done({ guide, titleId }: { guide: FirstCreation; titleId: string }) {
  return (
    <>
      <h2 id={titleId} className="mb-3 text-[17px] font-semibold text-text-primary">{t('firstCreationDoneTitle')}</h2>
      <p className="leading-relaxed">
        <strong className="font-semibold text-text-primary">{t('firstCreationDoneNoCode')}</strong>
        {t('firstCreationDoneBody')} {guide.persistent ? t('onboardingDoneSaved') : t('onboardingDoneUnsaved')}
      </p>
      <div className="mt-6 flex items-center justify-between gap-3">
        <button type="button" className={SECONDARY} onClick={guide.keepEditing}>
          {t('onboardingKeepEditing')}
        </button>
        <button type="button" className={PRIMARY} onClick={() => void guide.createNew()}>
          {t('onboardingCreateNew')}
        </button>
      </div>
    </>
  );
}
