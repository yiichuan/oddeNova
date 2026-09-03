import { useEffect, useRef, useState } from 'react';
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
export default function ThinkingLevelControl({ disabled = false }: ThinkingLevelControlProps) {
  const [level, setLevel] = useState<ThinkingLevel>(() => getSelectedThinkingLevel());
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  // Re-read the active provider/model on every render (cheap localStorage lookups,
  // no context/event plumbing) so switching provider in ApiKeyModal is reflected
  // here without prop threading — see the file-level comment above.
  const provider = normalizeProvider(localStorage.getItem('vibe_provider'));
  const model = getSelectedModel(provider);
  const supportedLevels = getSupportedThinkingLevels(provider, model);
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
    setSelectedThinkingLevel(lvl);
    setLevel(lvl);
  };

  const levelLabel = t(LABEL_KEYS[effectiveLevel]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-[12px] text-text-muted transition duration-200 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-30"
        title={t('thinkingLevel')}
        aria-label={t('thinkingLevel')}
      >
        <span>{levelLabel}</span>
        <ChevronUpIcon size={14} />
      </button>

      {open && (
        <div
          data-testid="thinking-level-popover"
          role="group"
          aria-label={t('thinkingLevel')}
          className="absolute bottom-full right-0 mb-2 w-[208px] rounded-[10px] border border-border bg-popover-surface px-3 pb-3 pt-2 shadow-menu-overlay"
        >
          <div
            data-testid="thinking-level-heading"
            className="text-sm text-text-primary"
          >
            {zh ? `${t('thinkingLevel')}（${levelLabel}）` : `${t('thinkingLevel')} (${levelLabel})`}
          </div>

          <div className="relative mt-3" style={{ height: THUMB_SIZE }}>
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
                first dot's offset serves both edges. */}
            <input
              data-testid="thinking-level-slider"
              type="range"
              min={0}
              max={stops - 1}
              step={1}
              value={activeIndex}
              disabled={disabled}
              onChange={(event) => slide(Number(event.target.value))}
              className="absolute inset-y-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
              style={{
                left: track(dotPercent(0), dotOffset(0) - THUMB_SIZE / 2),
                right: track(dotPercent(0), dotOffset(0) - THUMB_SIZE / 2),
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
