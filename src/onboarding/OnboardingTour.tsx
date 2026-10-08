import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { t } from '../lib/i18n';
import { ArrowUpIcon, PauseIcon, PlayIcon, StopIcon } from '../components/icons';
import type { OnboardingStep } from './onboarding-state';
import { stepSmoothPlayhead, type SmoothPlayhead } from './smooth-playhead';
import { expandRect, placeCard, sameRect, scrimPath, type CardPlacement, type Rect, type Size } from './tour-geometry';
import type { CompareVersion, Onboarding } from './useOnboarding';

/**
 * The first-run guide as a spotlight over the studio.
 *
 * Everything but the control a step teaches is dimmed and made unreachable,
 * so the tour is walked through (or skipped) rather than wandered out of. The
 * dimming is one even-odd path with a hole cut round the target: only painted
 * area takes pointer events, so the hole is exactly where the page can still
 * be pressed. A step that is only there to be looked at covers its hole too.
 * Keyboard focus is left alone — nothing here traps it.
 *
 * The card sits beside whatever it points at and follows it every frame, so
 * a panel resizing or the conversation scrolling does not leave it pointing
 * at empty space.
 */

export interface TourTarget {
  /** Changes when the thing pointed at changes; the tour reveals it once per key. */
  key: string;
  resolve: () => Rect | null;
  /** Whether the reader may press what is inside the hole. */
  interactive: boolean;
  /** Scroll the target into view when the step opens. */
  reveal?: () => void;
  padding?: number;
  /** Where the card sits relative to the hole; by default, whichever side fits. */
  placement?: CardPlacement;
  /** Make the card exactly as wide as the hole, so the two read as one column. */
  matchWidth?: boolean;
}

interface OnboardingTourProps {
  onboarding: Onboarding;
  target: TourTarget | null;
}

const PRIMARY =
  'inline-flex min-h-8 items-center justify-center rounded-region bg-brand-accent px-3.5 py-1.5 text-sm text-on-accent transition-colors hover:bg-brand-accent-hover disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent motion-reduce:transition-none';
const SECONDARY =
  'inline-flex min-h-8 items-center justify-center rounded-region border border-border px-3.5 py-1.5 text-sm text-text-primary transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent motion-reduce:transition-none';
const QUIET =
  '-ml-1.5 inline-flex min-h-8 items-center rounded-region px-1.5 text-sm text-text-muted transition-colors hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent motion-reduce:transition-none';

const CARD_WIDTH = 356;

function viewportSize(): Size {
  return { width: window.innerWidth, height: window.innerHeight };
}

export default function OnboardingTour({ onboarding, target }: OnboardingTourProps) {
  const { view } = onboarding;
  const [hole, setHole] = useState<Rect | null>(null);
  const [viewport, setViewport] = useState<Size>(viewportSize);
  const [cardSize, setCardSize] = useState<Size>({ width: CARD_WIDTH, height: 180 });
  const cardRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const visible = view !== 'hidden';

  // Follow the target every frame while the tour is up: layout here moves for
  // many reasons no single event covers (panel drags, the keyboard, streaming
  // text, the code window sliding in).
  const targetRef = useRef(target);
  useEffect(() => {
    targetRef.current = target;
  });
  useEffect(() => {
    if (!visible) return;
    let frame = 0;
    let lastHole: Rect | null = null;
    let lastViewport = viewportSize();
    const tick = () => {
      const current = targetRef.current;
      const size = viewportSize();
      const found = current?.resolve() ?? null;
      const next = found ? expandRect(found, current?.padding ?? 6, size) : null;
      if (!sameRect(next, lastHole)) {
        lastHole = next;
        setHole(next);
      }
      if (size.width !== lastViewport.width || size.height !== lastViewport.height) {
        lastViewport = size;
        setViewport(size);
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [visible]);

  // Bring the target on screen once per step.
  const revealKey = visible ? target?.key : undefined;
  useEffect(() => {
    if (!revealKey) return;
    targetRef.current?.reveal?.();
  }, [revealKey]);

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
  const focusKey = visible ? `${view}:${onboarding.step}` : null;
  useEffect(() => {
    if (!focusKey) return;
    cardRef.current?.focus({ preventScroll: true });
  }, [focusKey]);

  if (!visible) return null;

  const onStep = view === 'step';
  const shownHole = onStep ? hole : null;
  const cardWidth = target?.matchWidth && shownHole ? shownHole.width : CARD_WIDTH;
  const position = placeCard(shownHole, { width: cardWidth, height: cardSize.height }, viewport, {
    placement: target?.placement,
  });

  return (
    <div className="fixed inset-0 z-[80] pointer-events-none">
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
        // Only the invitation floats as a dialog; the steps sit flat beside
        // what they point at.
        className={`pointer-events-auto absolute flex flex-col rounded-region border border-border bg-conversation-surface px-5 pb-4 pt-4 text-sm text-text-secondary outline-none transition-[left,top] duration-200 ease-out motion-reduce:transition-none${
          onStep ? '' : ' shadow-dialog-overlay'
        }`}
        style={{ left: position.left, top: position.top, width: cardWidth }}
      >
        {view === 'invite' && <Invite onboarding={onboarding} titleId={titleId} />}
        {view === 'resume' && <Resume onboarding={onboarding} titleId={titleId} />}
        {view === 'cannot-resume' && <CannotResume onboarding={onboarding} titleId={titleId} />}
        {onStep && <Step onboarding={onboarding} titleId={titleId} />}
      </div>
    </div>
  );
}

/** "n/6" in the card's top-left corner; the invitation reads 0/6, before the first step. */
function StepCounter({ current, total }: { current: number; total: number }) {
  return (
    <div className="mb-3 text-xs tabular-nums text-text-muted" aria-label={`${current}/${total}`}>
      {current}/{total}
    </div>
  );
}

/**
 * A control drawn as it is on screen, so the copy can point at it rather than
 * name it: the send key (the accent disc with its arrow) and the play key (the
 * code panel's cap with its filled triangle, coloured as the panel colours it
 * — see `.onboarding-play-glyph`).
 *
 * Centred on the line box, not on a baseline: an offset that looks right
 * against Chinese sits wrong against Latin (CJK glyphs fill the em box, Latin
 * sits on its baseline with room below), while the line box is the same for
 * both. The glyph is a line-tall inline box aligned to the line's top, with the
 * disc centred inside it — which stays true when the sentence wraps. The height
 * is the card's `leading-relaxed` (1.625) in em.
 */
const INLINE_KEYS = {
  send: {
    label: 'send',
    disc: 'bg-brand-accent text-on-accent',
    icon: <ArrowUpIcon size={12} />,
  },
  play: {
    label: 'play',
    disc: 'control-button-surface onboarding-play-glyph',
    icon: <PlayIcon size={10} />,
  },
} as const;

type InlineKeyName = keyof typeof INLINE_KEYS;

/**
 * What the inline keys do: each is a working copy of the real control. The
 * play key plays and pauses exactly as the real one does, showing pause while
 * the piece sounds; the send key sends the preset exactly as the real one does.
 */
export interface InlineKeyActions {
  play: { playing: boolean; disabled: boolean; onToggle: () => void };
  send: { disabled: boolean; onPress: () => void };
}

const LINE_BOX = 'mx-1 inline-flex h-[1.625em] items-center align-top';
const DISC = 'inline-flex h-[18px] w-[18px] items-center justify-center rounded-full';
const PRESSABLE = 'cursor-pointer transition-opacity disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent motion-reduce:transition-none';

function InlineKey({ name, actions }: { name: InlineKeyName; actions: InlineKeyActions }) {
  const key = INLINE_KEYS[name];
  const { label, icon, onClick, disabled } = name === 'play'
    ? {
        label: t(actions.play.playing ? 'pause' : 'play'),
        icon: actions.play.playing ? <PauseIcon size={10} /> : key.icon,
        onClick: actions.play.onToggle,
        disabled: actions.play.disabled,
      }
    : { label: t(key.label), icon: key.icon, onClick: actions.send.onPress, disabled: actions.send.disabled };
  return (
    <span className={LINE_BOX}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={label}
        className={`${DISC} ${key.disc} ${PRESSABLE}`}
      >
        {icon}
      </button>
    </span>
  );
}

/** Copy with `{send}` or `{play}` in it gets that control, working, in that place. */
function withInlineIcons(text: string, actions: InlineKeyActions): ReactNode {
  const parts = text.split(/\{(send|play)\}/);
  if (parts.length === 1) return text;
  // split() with a capture group interleaves the names: text, name, text, …
  return parts.flatMap((part, index): ReactNode[] => {
    if (index % 2 === 1) return [<InlineKey key={index} name={part as InlineKeyName} actions={actions} />];
    return part.trim() ? [part.trim()] : [];
  });
}

function Title({ id, children }: { id: string; children: ReactNode }) {
  return <h2 id={id} className="mb-3 text-[15px] font-semibold text-text-primary">{children}</h2>;
}

/** Skip on the left; back and next (or the step's own final action) on the right. */
function Footer({ left, right, gap = 'mt-6' }: { left?: ReactNode; right: ReactNode; gap?: string }) {
  return (
    <div className={`${gap} flex items-center justify-between gap-3`}>
      <div className="flex items-center">{left}</div>
      <div className="flex items-center gap-3">{right}</div>
    </div>
  );
}

function Invite({ onboarding, titleId }: { onboarding: Onboarding; titleId: string }) {
  return (
    <>
      <StepCounter current={0} total={onboarding.stepCount} />
      <Title id={titleId}>{t('onboardingInviteTitle')}</Title>
      <p className="leading-relaxed">{t('onboardingInviteBody')}</p>
      {onboarding.startError && <p className="mt-3 text-xs text-error">{t('requestFailed')}</p>}
      <Footer
        left={
          <button type="button" className={QUIET} disabled={onboarding.starting} onClick={onboarding.postpone}>
            {t('onboardingLater')}
          </button>
        }
        right={
          <button type="button" className={PRIMARY} disabled={onboarding.starting} onClick={() => void onboarding.start()}>
            {onboarding.starting ? t('loading') : t('onboardingStart')}
          </button>
        }
      />
    </>
  );
}

function Resume({ onboarding, titleId }: { onboarding: Onboarding; titleId: string }) {
  return (
    <>
      <Title id={titleId}>{t('onboardingResumeTitle')}</Title>
      <p className="leading-relaxed">{t('onboardingResumeBody')}</p>
      {onboarding.startError && <p className="mt-3 text-xs text-error">{t('requestFailed')}</p>}
      <Footer
        left={
          <button type="button" className={QUIET} onClick={onboarding.dismiss}>
            {t('onboardingLater')}
          </button>
        }
        right={
          <>
            <button type="button" className={SECONDARY} disabled={onboarding.starting} onClick={() => void onboarding.restart()}>
              {t('onboardingRestart')}
            </button>
            <button type="button" className={PRIMARY} disabled={onboarding.starting} onClick={() => void onboarding.resume()}>
              {t('onboardingResume')}
            </button>
          </>
        }
      />
    </>
  );
}

function CannotResume({ onboarding, titleId }: { onboarding: Onboarding; titleId: string }) {
  return (
    <>
      <Title id={titleId}>{t('onboardingResumeTitle')}</Title>
      <p className="leading-relaxed">{t('onboardingCannotResume')}</p>
      {onboarding.startError && <p className="mt-3 text-xs text-error">{t('requestFailed')}</p>}
      <Footer
        left={
          <button type="button" className={QUIET} onClick={onboarding.dismiss}>
            {t('onboardingLater')}
          </button>
        }
        right={
          <button type="button" className={PRIMARY} disabled={onboarding.starting} onClick={() => void onboarding.restart()}>
            {onboarding.starting ? t('loading') : t('onboardingRestart')}
          </button>
        }
      />
    </>
  );
}

const STEP_COPY: Record<OnboardingStep, { title: string; body: string }> = {
  'listen-original': { title: 'onboardingListenOriginalTitle', body: 'onboardingListenOriginalBody' },
  'send-instruction': { title: 'onboardingSendTitle', body: 'onboardingSendBody' },
  'read-reply': { title: 'onboardingReplyTitle', body: 'onboardingReplyBody' },
  'listen-adapted': { title: 'onboardingListenAdaptedTitle', body: 'onboardingListenAdaptedBody' },
  'view-change': { title: 'onboardingChangeTitle', body: 'onboardingChangeBody' },
  done: { title: 'onboardingDoneTitle', body: 'onboardingDoneBody' },
};

function Step({ onboarding, titleId }: { onboarding: Onboarding; titleId: string }) {
  const { step } = onboarding;
  const copy = STEP_COPY[step];
  const last = step === 'done';

  return (
    <>
      <StepCounter current={onboarding.stepNumber} total={onboarding.stepCount} />
      <Title id={titleId}>{t(copy.title)}</Title>
      <p className="leading-relaxed">
        {withInlineIcons(t(copy.body), {
          play: {
            playing: onboarding.studioPlaying,
            disabled: onboarding.listen.status !== 'ready',
            onToggle: onboarding.togglePlayback,
          },
          send: {
            disabled: onboarding.sending || onboarding.progress.delivered,
            onPress: () => void onboarding.sendPreset(),
          },
        })}
        {last && <> {onboarding.persistent ? t('onboardingDoneSaved') : t('onboardingDoneUnsaved')}</>}
      </p>
      {(step === 'listen-original' || step === 'listen-adapted') && <ListenStatus onboarding={onboarding} />}
      {step === 'send-instruction' && <SendStatus onboarding={onboarding} />}
      {last ? (
        <>
          <Compare onboarding={onboarding} />
          <button type="button" className={`${PRIMARY} mt-6`} onClick={() => void onboarding.createNew()}>
            {t('onboardingCreateNew')}
          </button>
          <Footer
            gap="mt-3"
            left={
              <button type="button" className={SECONDARY} disabled={!onboarding.canPrev} onClick={onboarding.prev}>
                {t('onboardingPrev')}
              </button>
            }
            right={
              <button type="button" className={SECONDARY} onClick={onboarding.keepEditing}>
                {t('onboardingKeepEditing')}
              </button>
            }
          />
          <p className="mt-4 text-xs leading-relaxed text-text-muted">{t('onboardingDoneRealAi')}</p>
        </>
      ) : (
        <Footer
          right={
            <>
              <button type="button" className={SECONDARY} disabled={!onboarding.canPrev} onClick={onboarding.prev}>
                {t('onboardingPrev')}
              </button>
              <button type="button" className={PRIMARY} disabled={!onboarding.canNext} onClick={onboarding.next}>
                {t('onboardingNext')}
              </button>
            </>
          }
        />
      )}
    </>
  );
}

/**
 * The first 5 seconds of each version, back to back if the reader likes, on
 * the guide's own transport. A key that is sounding stops it.
 */
function Compare({ onboarding }: { onboarding: Onboarding }) {
  const { compare } = onboarding;
  const key = (version: CompareVersion, label: string) => {
    const active = compare.version === version && compare.phase !== 'idle';
    return (
      <button
        type="button"
        aria-pressed={active}
        // min-w-0: a label longer than half the row truncates inside its key
        // rather than pushing the pair past the card's right edge.
        className={`${SECONDARY} min-w-0 flex-1 gap-1.5 px-2.5`}
        onClick={() => void onboarding.playCompare(version)}
      >
        {/* One fixed box for either glyph: the two differ in width, and the
            label must not shift when one replaces the other. */}
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

/**
 * "Original · 5s": the version, then the seconds of it left to hear. At rest
 * that is the whole window; while the version plays it counts down to 0 with
 * the playhead. The digit sits in a box one digit wide with figures of equal
 * width, so the "s" after it stays put as the number changes.
 */
export function CompareLabel({ onboarding, version, label }: { onboarding: Onboarding; version: CompareVersion; label: string }) {
  const { compare } = onboarding;
  const seconds = Math.round(1 / onboarding.listenRate);
  const playing = compare.version === version && compare.phase === 'playing';
  const left = playing ? Math.max(0, Math.ceil((1 - compare.progress) * seconds - 1e-6)) : seconds;
  return (
    <>
      <span className="min-w-0 truncate">{label}</span>
      <span className="-ml-1 shrink-0 whitespace-pre">
        {' · '}
        <span className="inline-block w-[1ch] text-right tabular-nums">{left}</span>s
      </span>
    </>
  );
}

/**
 * The listen's progress, redrawn every frame from the playhead while it plays
 * and resting at `resting` otherwise. Written straight to the element as a
 * transform: no render per frame, and no layout. The fill slides in from the
 * left rather than stretching, so its rounded end keeps its shape.
 */
const slide = (progress: number) => `translateX(${(progress - 1) * 100}%)`;

export function ListenBar({ read, rate, resting }: { read: () => number | null; rate: number; resting: number }) {
  const fillRef = useRef<HTMLSpanElement>(null);
  const restingRef = useRef(resting);
  useEffect(() => {
    restingRef.current = resting;
  });
  useEffect(() => {
    let frame = 0;
    let smooth: SmoothPlayhead | null = null;
    let drawn = '';
    const draw = (now: number) => {
      smooth = stepSmoothPlayhead(smooth, read(), now, rate);
      const transform = slide(smooth?.value ?? restingRef.current);
      const fill = fillRef.current;
      if (fill && transform !== drawn) {
        fill.style.transform = transform;
        drawn = transform;
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [read, rate]);
  return (
    <span className="block h-1 overflow-hidden rounded-full bg-divider" aria-hidden="true">
      <span
        ref={fillRef}
        className="block h-full w-full rounded-full bg-brand-accent will-change-transform"
        style={{ transform: slide(resting) }}
      />
    </span>
  );
}

function ListenStatus({ onboarding }: { onboarding: Onboarding }) {
  const { listen } = onboarding;
  return (
    <div className="mt-4" role="status" aria-live="polite">
      {listen.status === 'failed' ? (
        <div className="flex items-center gap-2 text-xs text-error">
          <span>{t('onboardingSoundsFailed')}</span>
          <button type="button" className="shrink-0 underline underline-offset-2" onClick={onboarding.retrySounds}>
            {t('onboardingRetry')}
          </button>
        </div>
      ) : listen.status === 'preparing' ? (
        <p className="text-xs text-text-muted">{t('onboardingPreparingSounds')}</p>
      ) : (
        <>
          <ListenBar read={onboarding.readListenPlayhead} rate={onboarding.listenRate} resting={listen.progress} />
          {listen.heard && <p className="mt-2 text-xs text-text-primary">{t('onboardingListenHeard')}</p>}
        </>
      )}
    </div>
  );
}

/** Says nothing until there is something to say: the preset loading, or failing. */
function SendStatus({ onboarding }: { onboarding: Onboarding }) {
  return (
    <div role="status" aria-live="polite">
      {onboarding.sending && <p className="mt-3 text-xs text-text-primary">{t('onboardingLoadingPreset')}</p>}
      {onboarding.deliveryError && <p className="mt-3 text-xs text-error">{t('onboardingDeliveryFailed')}</p>}
    </div>
  );
}
