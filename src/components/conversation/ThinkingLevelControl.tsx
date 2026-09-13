import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronUpIcon } from '../icons';
import { t, zh } from '../../lib/i18n';
import {
  getSelectedModel,
  getSelectedThinkingLevel,
  normalizeProvider,
  setSelectedThinkingLevel,
  type ThinkingLevel,
} from '../../services/llm-config';
import { clampThinkingLevel, getSupportedThinkingLevels } from '../../services/thinking-params';

const LABEL_KEYS: Record<ThinkingLevel, string> = {
  low: 'thinkingLevelLow',
  medium: 'thinkingLevelMedium',
  high: 'thinkingLevelHigh',
};

/** Dot diameter — and the segment height, so the two read as one stroke. */
const DOT_SIZE = 3;
/** The draggable knob. Bigger than a dot so it reads as sitting *on* the rail. */
const THUMB_SIZE = 12;
/** Space between two capsules. Wider than the thumb, so the knob always sits in
 *  clear air at a stop rather than overlapping the ends of its neighbours. */
const SEGMENT_GAP = 16;
/** Hit height of the slider row. The visible rail stays centred; the extra
 *  vertical air is what makes the touch target at least 44px tall. */
const TRACK_HIT_HEIGHT = 44;
/** Stable id wiring the trigger's aria-controls to the popover. */
const POPOVER_ID = 'thinking-level-popover';

/**
 * One track position as `calc(P% ± Npx)`. Kept flat (rather than the more
 * obvious `calc((… ) / n)`) because a nested division is beyond some CSS value
 * parsers, including happy-dom's in the tests.
 */
function track(percent: number, px: number): string {
  const round = (value: number) => Math.round(value * 100) / 100;
  return `calc(${round(percent)}% ${px < 0 ? '-' : '+'} ${round(Math.abs(px))}px)`;
}

interface ThinkingLevelControlProps {
  disabled?: boolean;
  /**
   * Read at press time (not render time): true when the surrounding input
   * field currently holds focus and that focus is worth protecting. When it
   * returns true the control cancels the press's default focus transfer and
   * drives the slider gesture itself, so the soft keyboard stays put. When
   * absent or false, native button/range behaviour (including focus) is kept.
   */
  shouldPreserveInputFocus?: () => boolean;
}

/** Bookkeeping for one active protected drag on the slider. */
interface SliderGesture {
  pointerId: number;
  onMove: (event: PointerEvent) => void;
  onUp: (event: PointerEvent) => void;
  onCancel: (event: PointerEvent) => void;
  onLostCapture: (event: PointerEvent) => void;
}

// Text-label trigger + popover next to the send button (see CONTEXT.md:
// Thinking level) — shows the current level directly (e.g. "中") rather
// than behind an icon, so it's readable at a glance. Reads/writes the
// global localStorage preference directly — no prop threading through
// ChatInput/App, matching how provider/model are resolved directly from
// llm-config.ts wherever they're needed. Renders nothing at all when the
// active model has no effort dial (getSupportedThinkingLevels returns []).
//
// The popover is a slider rather than a list: the levels are one ordered dial,
// so a rail with a dot per stop shows the whole range and the current position
// at once. The heading carries the value in parentheses, which is what makes
// the unlabelled dots readable while dragging.
//
// Interaction contract (see CONTEXT.md: Thinking level): pointer interaction
// with this control never changes the input field's focus and never drives the
// soft keyboard. The root carries [data-chat-input-focus-ignore] so the chat
// card's click-to-focus skips it, and — while shouldPreserveInputFocus reads
// true — presses are preventDefault'ed at the root in capture phase and the
// slider drag is handled by this component instead of the native range drag.
// Keyboard interaction (Tab, arrows, Escape) is left fully native.
export default function ThinkingLevelControl({
  disabled = false,
  shouldPreserveInputFocus,
}: ThinkingLevelControlProps) {
  const [level, setLevel] = useState<ThinkingLevel>(() => getSelectedThinkingLevel());
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLInputElement>(null);
  const gestureRef = useRef<SliderGesture | null>(null);
  // Mirrors `level` so the dedup in slide() never races a stale closure.
  const levelRef = useRef<ThinkingLevel>(level);

  // Ends the active gesture and releases capture. Ref-only, so it is stable
  // and safe to call from effects and event handlers alike.
  const endGesture = useCallback(() => {
    const gesture = gestureRef.current;
    if (!gesture) return;
    gestureRef.current = null;
    document.removeEventListener('pointermove', gesture.onMove, true);
    document.removeEventListener('pointerup', gesture.onUp, true);
    document.removeEventListener('pointercancel', gesture.onCancel, true);
    try {
      const slider = sliderRef.current;
      // lostpointercapture does not bubble, so its listener lives on the
      // slider element itself (added at gesture start) rather than on document.
      slider?.removeEventListener('lostpointercapture', gesture.onLostCapture);
      if (slider && slider.hasPointerCapture(gesture.pointerId)) {
        slider.releasePointerCapture(gesture.pointerId);
      }
    } catch {
      // The slider may already be gone; capture dies with the element.
    }
  }, []);

  // Re-read the active provider/model on every render (cheap localStorage lookups,
  // no context/event plumbing) so switching provider in ApiKeyModal is reflected
  // here without prop threading — see the file-level comment above.
  const provider = normalizeProvider(localStorage.getItem('vibe_provider'));
  const model = getSelectedModel(provider);
  const supportedLevels = getSupportedThinkingLevels(provider, model);
  const levelsKey = supportedLevels.join('|');

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    // Capture phase, and pointerdown rather than mousedown, so touch, mouse
    // and pen all close the popover; the outside press keeps its defaults.
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open]);

  // Escape closes from wherever focus is. If focus sits inside the popover
  // (the range), hand it back to the trigger first; if it is elsewhere (e.g.
  // the textarea) it stays put — no refocusing either way.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const active = document.activeElement;
      if (popoverRef.current && active && popoverRef.current.contains(active)) {
        triggerRef.current?.focus();
      }
      setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  // A gesture must not outlive the popover, the disabled state, the model's
  // supported levels, or the component itself — stale handlers must never
  // keep writing the preference.
  useEffect(() => {
    endGesture();
  }, [disabled, levelsKey, open, endGesture]);
  useEffect(() => () => endGesture(), [endGesture]);

  // Disabling closes the popover immediately. Done as a guarded render-time
  // state adjustment (the pattern React recommends over an effect) so the
  // popover never paints in a disabled state.
  const [prevDisabled, setPrevDisabled] = useState(disabled);
  if (disabled !== prevDisabled) {
    setPrevDisabled(disabled);
    if (disabled) setOpen(false);
  }

  if (supportedLevels.length === 0) return null;

  const effectiveLevel = clampThinkingLevel(level, supportedLevels);
  const stops = supportedLevels.length;
  const activeIndex = Math.max(0, supportedLevels.indexOf(effectiveLevel));

  // One more capsule than there are stops, so a segment bookends each end of
  // the row: line·dot·line·dot·line·dot·line. The gaps are a fixed pixel size
  // and the capsules split whatever percentage is left over, so every position
  // here is one percentage plus one pixel offset.
  const segmentCount = stops + 1;
  const segmentWidth = track(100 / segmentCount, (-stops * SEGMENT_GAP) / segmentCount);
  const segmentLeft = (index: number) =>
    track((index * 100) / segmentCount, (index * SEGMENT_GAP) / segmentCount);
  /** Dot `index` is centred in the gap that follows capsule `index`. */
  const dotPercent = (index: number) => ((index + 1) * 100) / segmentCount;
  const dotOffset = (index: number) => ((index + 0.5 - stops / 2) * SEGMENT_GAP) / segmentCount;
  const dotLeft = (index: number) => track(dotPercent(index), dotOffset(index));

  const slide = (next: number) => {
    const lvl = supportedLevels[Math.min(Math.max(next, 0), stops - 1)];
    if (lvl === undefined || levelRef.current === lvl) return;
    levelRef.current = lvl;
    setSelectedThinkingLevel(lvl);
    setLevel(lvl);
  };

  // The dots span less than the row (the transparent range extends half a
  // thumb past each end), so map pointer X onto the dot centres' span, not
  // the row's width — clicking a visible dot must yield that dot's stop.
  const indexFromClientX = (clientX: number): number | null => {
    const row = rowRef.current;
    if (!row) return null;
    if (!Number.isFinite(clientX)) return null;
    if (stops === 1) return 0;
    const rect = row.getBoundingClientRect();
    // An unmeasurable row (not laid out, hidden, or detached) gives garbage
    // geometry — ignore the selection rather than guess a stop.
    if (rect.width === 0) return null;
    const firstX = rect.left + (rect.width * dotPercent(0)) / 100 + dotOffset(0);
    const lastX = rect.left + (rect.width * dotPercent(stops - 1)) / 100 + dotOffset(stops - 1);
    const span = lastX - firstX;
    if (span === 0) return null;
    const ratio = Math.min(Math.max((clientX - firstX) / span, 0), 1);
    return Math.round(ratio * (stops - 1));
  };

  const protectFocus = () => shouldPreserveInputFocus?.() ?? false;

  // While the input focus is worth protecting, a press anywhere on the control
  // (trigger, slider, heading, popover padding) must not move focus — that is
  // what would collapse the soft keyboard. Primary pointer / left button only;
  // anything else keeps native behaviour. click still fires, so the trigger's
  // toggle and every other click path are untouched.
  const onRootPointerDownCapture = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!protectFocus()) return;
    if (!e.isPrimary) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
  };

  // Belt to the pointerdown braces: some engines run default focus transfer
  // from the compatibility mousedown even when pointerdown was cancelled.
  const onRootMouseDownCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!protectFocus()) return;
    if (e.button !== 0) return;
    e.preventDefault();
  };

  // With focus protected the cancelled pointerdown also cancels the native
  // range drag, so this component drives the gesture itself: select the
  // nearest stop on down, track moves by pointerId, finish on up, and keep
  // the last selection on cancel. The native range stays for semantics and
  // keyboard use; without protection it behaves exactly as before.
  const onSliderPointerDown = (e: React.PointerEvent<HTMLInputElement>) => {
    if (!protectFocus()) return;
    if (!e.isPrimary) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (disabled || gestureRef.current) return;
    const index = indexFromClientX(e.clientX);
    if (index == null) return;
    e.preventDefault();
    const pointerId = e.pointerId;
    const onMove = (event: PointerEvent) => {
      if (gestureRef.current?.pointerId !== pointerId || event.pointerId !== pointerId) return;
      const next = indexFromClientX(event.clientX);
      if (next != null) slide(next);
    };
    const onUp = (event: PointerEvent) => {
      if (gestureRef.current?.pointerId !== pointerId || event.pointerId !== pointerId) return;
      const next = indexFromClientX(event.clientX);
      if (next != null) slide(next);
      endGesture();
    };
    const onCancel = (event: PointerEvent) => {
      if (gestureRef.current?.pointerId !== pointerId || event.pointerId !== pointerId) return;
      endGesture();
    };
    const onLostCapture = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      endGesture();
    };
    gestureRef.current = { pointerId, onMove, onUp, onCancel, onLostCapture };
    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', onCancel, true);
    const slider = sliderRef.current;
    slider?.addEventListener('lostpointercapture', onLostCapture);
    try {
      slider?.setPointerCapture(pointerId);
    } catch {
      // Capture is best-effort; the document listeners above already track
      // the gesture even if it fails.
    }
    slide(index);
  };

  const levelLabel = t(LABEL_KEYS[effectiveLevel]);

  return (
    <div
      ref={rootRef}
      className="relative"
      // Parent-child contract with ChatInput's card click: everything inside
      // this subtree (trigger, slider, heading, popover padding) is outside
      // the card's click-to-focus area.
      data-chat-input-focus-ignore=""
      onPointerDownCapture={onRootPointerDownCapture}
      onMouseDownCapture={onRootMouseDownCapture}
    >
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={POPOVER_ID}
        className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-[12px] text-text-muted transition duration-200 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-30"
        title={t('thinkingLevel')}
        aria-label={t('thinkingLevel')}
      >
        <span>{levelLabel}</span>
        <ChevronUpIcon size={14} />
      </button>

      {open && (
        <div
          ref={popoverRef}
          id={POPOVER_ID}
          data-testid="thinking-level-popover"
          data-thinking-level-popover
          role="group"
          aria-label={t('thinkingLevel')}
          className="z-10 absolute bottom-full right-0 mb-2 w-[208px] rounded-[10px] border border-border bg-popover-surface px-3 pb-3 pt-2 shadow-menu-overlay"
        >
          <div
            data-testid="thinking-level-heading"
            className="text-sm text-text-primary"
          >
            {zh ? `${t('thinkingLevel')}（${levelLabel}）` : `${t('thinkingLevel')} (${levelLabel})`}
          </div>

          {/* Tall enough to be a real touch target; the rail itself stays
              visually centred and unchanged. The ring shows keyboard users
              where the (transparent) range's focus-visible position is. */}
          <div
            ref={rowRef}
            className="relative mt-3 rounded-full has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-accent"
            style={{ height: TRACK_HIT_HEIGHT }}
          >
            {Array.from({ length: segmentCount }, (_, index) => (
              <span
                key={index}
                data-testid="thinking-level-segment"
                aria-hidden="true"
                className="absolute top-1/2 -translate-y-1/2 rounded-full bg-track-idle"
                style={{ left: segmentLeft(index), width: segmentWidth, height: DOT_SIZE }}
              />
            ))}

            {supportedLevels.map((lvl, index) => (
              <span
                key={lvl}
                data-testid="thinking-level-dot"
                aria-hidden="true"
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-track-idle"
                style={{ left: dotLeft(index), width: DOT_SIZE, height: DOT_SIZE }}
              />
            ))}

            <span
              data-testid="thinking-level-thumb"
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-accent transition-[left] duration-[160ms] ease-out motion-reduce:transition-none"
              style={{ left: dotLeft(activeIndex), width: THUMB_SIZE, height: THUMB_SIZE }}
            />

            {/* Inset to the dot span (widened by half a thumb at each end so the
                knob stays grabbable at the extremes) — otherwise the input would
                map the full row onto the shorter run the dots occupy, and the
                thumb would outrun the pointer. The row is symmetric, so the
                first dot's offset serves both edges. touch-action: none lives
                only here — the slider's own hit area — never on the card or
                page, so scrolling elsewhere is untouched. */}
            <input
              ref={sliderRef}
              data-testid="thinking-level-slider"
              type="range"
              min={0}
              max={stops - 1}
              step={1}
              value={activeIndex}
              disabled={disabled}
              onChange={(event) => {
                // During a protected drag this component owns selection;
                // a native change here would double-commit it.
                if (gestureRef.current) return;
                slide(Number(event.target.value));
              }}
              onPointerDown={onSliderPointerDown}
              className="absolute inset-y-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
              style={{
                left: track(dotPercent(0), dotOffset(0) - THUMB_SIZE / 2),
                right: track(dotPercent(0), dotOffset(0) - THUMB_SIZE / 2),
                touchAction: 'none',
              }}
              aria-label={t('thinkingLevel')}
              aria-valuetext={levelLabel}
            />
          </div>
        </div>
      )}
    </div>
  );
}
