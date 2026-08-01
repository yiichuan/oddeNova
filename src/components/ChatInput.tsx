import { useEffect, useRef, useState } from 'react';
import { ArrowUpIcon, StopIcon } from './icons';
import type { TokenStats } from '../hooks/useSessions';
import { t } from '../lib/i18n';
import { checkAirJellyAvailable } from '../services/airjelly';
import { isDemoMode } from '../demo/demo-config';
import { useIsMobile } from '../hooks/useIsMobile';

// Split text into typewriter units: CJK (and fullwidth punctuation) reveal
// character by character, latin script word by word (a run of non-CJK,
// non-space characters plus its trailing whitespace is one unit).
function tokenizeForTyping(s: string): string[] {
  return s.match(/[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]|[^\u3000-\u303f\u4e00-\u9fff\uff00-\uffef\s]+\s*|\s+/g) ?? [];
}

// Cap on the auto-grow height (px) of the textarea itself (excludes the
// card's top padding and the footer row below it) before it switches to an
// internal scrollbar instead of pushing the layout further down.
const MAX_TEXTAREA_HEIGHT = 180;

function resizeTextarea(el: HTMLTextAreaElement) {
  el.style.height = 'auto';
  const next = Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT);
  el.style.height = `${next}px`;
  el.style.overflowY = el.scrollHeight > MAX_TEXTAREA_HEIGHT ? 'auto' : 'hidden';
}

interface ChatInputProps {
  isLoading: boolean;
  engineReady: boolean;
  engineStatus?: 'initializing' | 'ready' | 'failed';
  onSendText: (text: string) => void;
  onReinitEngine: () => void;
  onStop?: () => void;
  prefill?: string;
  focusTrigger?: number;
  replayValue?: string;
  isVideoMode?: boolean;
  tokenStats?: TokenStats;
  onFocusChange?: (focused: boolean) => void;
  /** Guidance suggestions, rotated as placeholder text; Tab adopts the current one. */
  suggestions?: string[];
  /**
   * Triggers mood-based generation (fetches AirJelly context, then runs a
   * no-history turn). When provided, a "mood generate" suggestion is appended
   * to the rotation — but only once AirJelly is confirmed reachable (or in
   * demo mode), same gating as the button this replaced. Adopting that one
   * specific suggestion and sending it calls this instead of onSendText.
   */
  onMoodGenerate?: () => Promise<void> | void;
}

export default function ChatInput({
  isLoading,
  engineReady,
  engineStatus = engineReady ? 'ready' : 'initializing',
  onSendText,
  onReinitEngine,
  onStop,
  prefill,
  focusTrigger,
  replayValue,
  isVideoMode = false,
  tokenStats: _tokenStats,
  onFocusChange,
  suggestions,
  onMoodGenerate,
}: ChatInputProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Mobile has no Tab key, so the suggestion is adopted by focusing the field
  // instead, and the "press Tab" hint has nothing to point at.
  const isMobile = useIsMobile();

  // AirJelly reachability, checked once on mount — same gating the removed
  // mood button used: Windows is excluded (AirJelly Desktop doesn't support
  // it), demo mode always shows it regardless of a real connection. Runs
  // once regardless of onMoodGenerate's identity (a fresh useCallback most
  // renders) — only whether the caller passes one at all matters, and that's
  // fixed per call site (Sidebar always does, the mobile layout never does).
  const [airjellyAvailable, setAirjellyAvailable] = useState(false);
  useEffect(() => {
    if (!onMoodGenerate) return;
    checkAirJellyAvailable().then(setAirjellyAvailable);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const moodSuggestionActive =
    !!onMoodGenerate && !isVideoMode && !navigator.userAgent.includes('Windows') && (airjellyAvailable || isDemoMode());
  const moodSuggestion = t('moodGenerate');
  // Disables the input for the gap between adopting the mood suggestion and
  // `runTurn` actually starting (isLoading only flips true once the AirJelly
  // fetch inside onMoodGenerate resolves) — otherwise a fast double-Enter
  // could fire the fetch twice.
  const [moodPending, setMoodPending] = useState(false);

  // Placeholder carousel with a typewriter reveal: each suggestion types out
  // (CJK character by character, latin word by word), dwells, then the next
  // one starts. Tab adopts the full current suggestion. Typing by the user
  // hides it, like a native placeholder.
  const [suggestionIdx, setSuggestionIdx] = useState(0);
  // Typing progress, keyed to the suggestion it belongs to — a mismatch (the
  // suggestion rotated or the list changed) reads as progress 0, so resets
  // need no synchronous setState in the effect.
  const [typing, setTyping] = useState<{ sug: string | null; count: number }>({ sug: null, count: 0 });
  // Fade-out phase between dwell and the next suggestion (blur + opacity).
  const [suggestionFading, setSuggestionFading] = useState(false);
  const suggestionList = moodSuggestionActive ? [...(suggestions ?? []), moodSuggestion] : (suggestions ?? []);
  const currentSuggestion = suggestionList.length > 0 ? suggestionList[suggestionIdx % suggestionList.length] : null;
  const suggestionActive =
    currentSuggestion !== null && text === '' && replayValue === undefined && !isLoading && !isVideoMode && !moodPending;

  useEffect(() => {
    if (!currentSuggestion) return;
    if (suggestionFading) {
      // Sequential fade-out: blur first (200ms), then opacity fades starting
      // 100ms in (250ms, ending at 350ms) — matching the inline transition
      // below. When it ends, swap to the next suggestion and type it from
      // scratch.
      const id = setTimeout(() => {
        setSuggestionIdx((i) => i + 1);
        setTyping({ sug: null, count: 0 });
        setSuggestionFading(false);
      }, 350);
      return () => clearTimeout(id);
    }
    const tokens = tokenizeForTyping(currentSuggestion);
    const count = typing.sug === currentSuggestion ? typing.count : 0;
    if (count < tokens.length) {
      const id = setTimeout(
        () => setTyping({ sug: currentSuggestion, count: count + 1 }),
        count === 0 ? 400 : 80,
      );
      return () => clearTimeout(id);
    }
    if (suggestionList.length > 1) {
      // Fully typed: dwell, then fade out toward the next suggestion.
      const id = setTimeout(() => setSuggestionFading(true), 5500);
      return () => clearTimeout(id);
    }
  }, [currentSuggestion, typing, suggestionList.length, suggestionFading]);

  const typedPlaceholder =
    currentSuggestion !== null && typing.sug === currentSuggestion
      ? tokenizeForTyping(currentSuggestion).slice(0, typing.count).join('')
      : '';

  useEffect(() => {
    if (prefill) setText(prefill);
  }, [prefill, focusTrigger]);

  useEffect(() => {
    if (focusTrigger) textareaRef.current?.focus();
  }, [focusTrigger]);

  const prevReplayRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (replayValue !== undefined && prevReplayRef.current === undefined) {
      textareaRef.current?.focus();
    }
    prevReplayRef.current = replayValue;
  }, [replayValue]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    resizeTextarea(el);
  }, [text]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const recalc = () => resizeTextarea(el);
    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
  }, []);

  const doSubmit = () => {
    if (replayValue !== undefined) return;
    const value = text.trim();
    if (!value || isLoading || moodPending) return;
    setText('');
    if (moodSuggestionActive && value === moodSuggestion) {
      setMoodPending(true);
      Promise.resolve(onMoodGenerate!()).finally(() => setMoodPending(false));
      return;
    }
    onSendText(value);
  };

  const handleSubmit = (e: { preventDefault(): void }) => {
    e.preventDefault();
    doSubmit();
  };

  // What Tab does on desktop. Adopts the whole suggestion, not just the part
  // typed out so far, so a mid-reveal trigger doesn't yield half a sentence.
  const adoptSuggestion = () => {
    if (suggestionActive && currentSuggestion) setText(currentSuggestion);
  };

  const handleCardClick = (e: React.MouseEvent<HTMLFormElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;
    textareaRef.current?.focus();
    // Keyed to the tap on this card rather than to onFocus: focus also arrives
    // programmatically (mount's focusTrigger, rollback prefill, replay), and
    // those must not adopt the suggestion.
    if (isMobile) adoptSuggestion();
  };

  const inputDisabled = (isLoading || moodPending) && replayValue === undefined;

  return (
    <form onSubmit={handleSubmit} onClick={handleCardClick} className="w-full" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Card: textarea on top, footer (hint + send button) below it in normal
          flow — a real layout row, not an overlay, so it always reserves its
          own space regardless of how tall/scrolled the textarea gets. */}
      <div
        className={`rounded-[12px] bg-[#111111] pt-3 transition duration-200 focus-within:ring-1 focus-within:ring-[#323232] ${inputDisabled ? 'cursor-not-allowed opacity-50' : ''}`}
      >
        {/* Wraps just the textarea so the suggestion overlay below can be
            positioned absolute against its box, not the card as a whole
            (which also includes the footer). Top padding lives on the card
            above, not here — inside the textarea it would be scrolled out of
            view (and off the top of the visible box) once content overflows
            past MAX_TEXTAREA_HEIGHT, same reasoning as the footer below. */}
        {/* pr-2 insets the textarea's right edge (where the scrollbar rides)
            from the card edge, giving the scrollbar an 8px gap. The textarea's
            own pr below is reduced by the same 8px so the text position is
            unchanged. */}
        <div className="relative pr-3">
          <textarea
            ref={textareaRef}
            value={replayValue !== undefined ? replayValue : text}
            onChange={replayValue !== undefined ? undefined : (e) => setText(e.target.value)}
            readOnly={replayValue !== undefined}
            onFocus={() => onFocusChange?.(true)}
            onBlur={() => onFocusChange?.(false)}
            onKeyDown={(e) => {
              if (replayValue !== undefined) return;
              // Guarded so Tab still moves focus out when there's nothing to adopt.
              if (e.key === 'Tab' && !e.shiftKey && suggestionActive && currentSuggestion) {
                e.preventDefault();
                adoptSuggestion();
                return;
              }
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            placeholder={suggestionActive ? '' : t('inputPlaceholder')}
            rows={1}
            disabled={inputDisabled}
            className="w-full min-h-[54px] resize-none overflow-hidden bg-transparent pl-4 pr-3 pb-1 text-base md:text-sm text-[#cccccc] placeholder:text-[#888888] outline-none focus:text-white disabled:cursor-not-allowed"
            style={isVideoMode ? { caretColor: 'transparent' } : undefined}  // [video] Hide cursor blink during video rendering
          />

          {/* Rotating suggestion shown in place of the native placeholder
              (which can't animate or carry a styled hint). The text types
              out unit by unit. Mirrors the textarea's own padding exactly;
              pointer-events-none so clicks focus the input. Type scale tracks
              the textarea's, including its 16px on mobile — that size is there
              to stop iOS auto-zoom on focus and can't be lowered, so the
              overlay matches it to avoid a jump when a suggestion is adopted. */}
          {suggestionActive && (
            <div className="pointer-events-none absolute left-4 top-0 right-5 bottom-2 overflow-hidden line-clamp-3 text-base md:text-sm text-[#666666]">
              {/* Only the suggestion text blurs/fades between rotations — blur
                  runs first, then opacity fades in on its heels (sequential, not
                  simultaneous), via an explicit transition-delay on opacity.
                  Padding + matching negative margin gives the filter's own layer
                  room to blur into without being hard-clipped at the element's
                  box edge (a visible rectangle otherwise, since CSS filter
                  clips at the border box) — net zero visual displacement. */}
              <span
                className="inline-block -m-1.5 p-1.5"
                style={{
                  filter: suggestionFading ? 'blur(1.5px)' : 'blur(0px)',
                  opacity: suggestionFading ? 0 : 1,
                  transition: 'filter 200ms ease, opacity 250ms ease 100ms',
                }}
              >
                {typedPlaceholder}
              </span>
            </div>
          )}
        </div>

        {/* Footer row — hint/status on the left, send button on the right.
            Real layout, always visible regardless of textarea scroll state. */}
        <div className="flex items-center justify-between gap-2 pl-4 pr-2 pt-1 pb-2">
          <div className="min-w-0">
            {engineStatus !== 'ready' ? (
              <div className="flex items-center gap-2 text-[12px] text-[#888888]">
                <span className={`inline-flex h-2 w-2 rounded-full ${engineStatus === 'failed' ? 'bg-[#B2370C]' : 'bg-[#666666]'}`} />
                <span>{engineStatus === 'failed' ? t('engineFailed') : t('engineInitializing')}</span>
                {engineStatus === 'failed' && (
                  <button
                    type="button"
                    onClick={onReinitEngine}
                    className="text-[18px] font-thin text-[#e0e0e0]/60 hover:text-[#e0e0e0] transition-colors leading-none relative -top-[2px]"
                    title={t('restartEngine')}
                  >
                    ↺
                  </button>
                )}
              </div>
            ) : suggestionActive && !isMobile ? (
              <div className="pointer-events-none text-[12px] text-[#666666]">{t('tabToFill')}</div>
            ) : null}
          </div>

          {/* Context window indicator hidden for now — still far from the limit; kept for future prompt optimisation review*/
          /* {engineReady && tokenStats && <ContextWindowIndicator tokenStats={tokenStats} />} */}

          <div className="flex items-center gap-2 shrink-0">
            {replayValue !== undefined ? (
              <button
                type="button"
                disabled={!replayValue.trim()}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#d0d0d0] text-black transition duration-200 disabled:cursor-not-allowed disabled:opacity-30"
                title={t('send')}
              >
                <ArrowUpIcon size={18} />
              </button>
            ) : isLoading ? (
              <button
                type="button"
                onClick={onStop}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#d0d0d0] text-black transition duration-200 hover:bg-[#d0d0d0]/80"
                title={t('stop')}
              >
                <StopIcon size={18} />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!text.trim()}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#d0d0d0] text-black transition duration-200 hover:bg-[#d0d0d0]/80 disabled:cursor-not-allowed disabled:opacity-30"
                title={t('send')}
              >
                <ArrowUpIcon size={18} />
              </button>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
