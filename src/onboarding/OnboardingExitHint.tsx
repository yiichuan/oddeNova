import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ChevronRightIcon, CompassIcon } from '../components/icons';
import { t } from '../lib/i18n';
import { visibleRectOf } from './tour-geometry';

interface OnboardingExitHintProps {
  open: boolean;
  mobile: boolean;
  onClose: () => void;
}

interface Position {
  left: number;
  top: number;
}

const CARD_WIDTH = 336;
const DESKTOP_ENTRY = '[data-onboarding-entry="more"]';
const DESKTOP_HIGHLIGHT = '[data-onboarding-entry="onboarding"]';

function desktopPosition(): Position | null {
  // Once the More popover has opened, its highlighted row is the visual
  // anchor. Falling back to More keeps the first paint stable while Popover
  // API promotion catches up.
  const target = visibleRectOf(DESKTOP_HIGHLIGHT) ?? visibleRectOf(DESKTOP_ENTRY);
  if (!target) return null;
  const margin = 16;
  const height = 190;
  const left = target.left + target.width + margin;
  if (left + CARD_WIDTH > window.innerWidth - margin) return null;
  return {
    left,
    top: Math.min(Math.max(target.top, margin), window.innerHeight - height - margin),
  };
}

function Path({ mobile }: { mobile: boolean }) {
  const labels = mobile
    ? [t('onboardingExitHintMenu'), t('navMore'), t('navOnboarding')]
    : [t('navMore'), t('navOnboarding')];
  return (
    <div className="mt-5 flex flex-wrap items-center gap-x-1.5 gap-y-2 text-xs font-medium text-text-primary" aria-label={labels.join(' › ')}>
      {labels.map((label, index) => (
        <span key={label} className="contents">
          {index > 0 && <ChevronRightIcon size={14} className="text-current" />}
          <span className="inline-flex min-h-8 items-center rounded-region border border-border bg-surface-hover px-2.5">
            {index === labels.length - 1 && <CompassIcon size={14} className="mr-1.5 text-current" />}
            {label}
          </span>
        </span>
      ))}
    </div>
  );
}

/** A short, post-exit reminder of where the guide can be reopened. */
export default function OnboardingExitHint({ open, mobile, onClose }: OnboardingExitHintProps) {
  const titleId = useId();
  const dismissRef = useRef<HTMLButtonElement>(null);
  const [position, setPosition] = useState<Position | null>(null);

  useLayoutEffect(() => {
    if (!open || mobile) return;
    let frame = 0;
    let last: Position | null = null;
    const update = () => {
      // The More menu is promoted into the popover top layer after mount.
      // Follow the selected row's painted rounded rectangle rather than
      // keeping the More button's earlier fallback coordinate.
      const next = desktopPosition();
      if (!last || !next || last.left !== next.left || last.top !== next.top) {
        last = next;
        setPosition(next);
      }
      frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', update);
    };
  }, [open, mobile]);

  useEffect(() => {
    if (!open) return;
    dismissRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const anchored = !mobile && position;
  const dismissClass = mobile
    ? '-mr-2 inline-flex min-h-11 items-center justify-center rounded-region px-2 text-sm text-brand-accent transition-colors hover:text-brand-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent motion-reduce:transition-none'
    : 'inline-flex min-h-11 items-center justify-center rounded-region bg-brand-accent px-4 text-sm text-on-accent transition-colors hover:bg-brand-accent-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent motion-reduce:transition-none';
  const dismissRowClass = mobile ? 'mt-2 -mb-3 flex justify-end' : 'mt-5 flex justify-end';
  return (
    <div className="fixed inset-0 z-[85]">
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-black/20 motion-reduce:transition-none"
        aria-label={t('onboardingExitHintDismiss')}
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`absolute w-[min(21rem,calc(100vw-2rem))] rounded-2xl border border-border bg-conversation-surface px-5 py-5 text-text-secondary shadow-dialog-overlay ${anchored ? '' : 'left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'}`}
        style={anchored ? { left: position.left, top: position.top } : undefined}
      >
        <h2 id={titleId} className="text-[15px] font-semibold text-text-primary">{t('onboardingExitHintTitle')}</h2>
        <p className="mt-2 text-sm leading-relaxed">
          {t(mobile ? 'onboardingExitHintMobileBody' : 'onboardingExitHintDesktopBody')}
        </p>
        <Path mobile={mobile} />
        <div className={dismissRowClass}>
          <button
            ref={dismissRef}
            type="button"
            className={dismissClass}
            onClick={onClose}
          >
            {t('onboardingExitHintDismiss')}
          </button>
        </div>
      </section>
    </div>
  );
}
