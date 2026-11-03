import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, Mic, Square, Trash2, X } from 'lucide-react';
import { ArrowUpIcon, StopIcon } from '../icons';
import ThinkingLevelControl from './ThinkingLevelControl';
import HummingAudioPlayer from './HummingAudioPlayer';
import { t } from '../../lib/i18n';
import { checkAirJellyAvailable } from '../../services/airjelly';
import type { AgentEntryPoint } from '../../lib/analytics';
import type { InputMode } from '../../hooks/useChat';
import type { HummingInputController } from '../../hooks/useHummingInput';
import type { HummingAttachment } from '../../types/humming';
import { useIsMobile } from '../../hooks/useIsMobile';

type ChatEntryPoint = Extract<AgentEntryPoint, 'text' | 'suggestion'>;

// Split text into typewriter units: CJK (and fullwidth punctuation) reveal
// character by character, latin script word by word (a run of non-CJK,
// non-space characters plus its trailing whitespace is one unit).
function tokenizeForTyping(s: string): string[] {
  return s.match(/[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]|[^\u3000-\u303f\u4e00-\u9fff\uff00-\uffef\s]+\s*|\s+/g) ?? [];
}

function formatRecordingTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.min(30, Math.floor(seconds)));
  return `0:${safeSeconds.toString().padStart(2, '0')}`;
}

// Cap on the auto-grow height (px) of the textarea itself (excludes the
// card's top padding and the footer row below it) before it switches to an
// internal scrollbar instead of pushing the layout further down.
const MAX_TEXTAREA_HEIGHT = 180;

/**
 * Grow the field to fit its text, up to the cap.
 *
 * Bails when the field has no width to be measured against — the studio's
 * conversation column dragged shut (width 0), or `display: none`'d by a
 * full-width page. `scrollHeight` there is not a smaller answer, it is a
 * meaningless one: with no content width every word wraps onto its own line,
 * so any text at all saturates the cap. And the answer is written back as an
 * inline pixel height, which is not a measurement the layout takes again —
 * it is a value that stays until something re-measures. A reading taken while
 * the column is shut therefore comes back with it, as a composer standing at
 * its full 180px over one line of text.
 *
 * Leaving the last good height in place costs nothing while the field is not
 * on screen to be wrong, and the observer below re-measures the moment it has
 * a box again.
 */
function resizeTextarea(el: HTMLTextAreaElement) {
  if (el.clientWidth === 0) return;
  el.style.height = 'auto';
  const next = Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT);
  el.style.height = `${next}px`;
  el.style.overflowY = el.scrollHeight > MAX_TEXTAREA_HEIGHT ? 'auto' : 'hidden';
}

interface ChatInputProps {
  isLoading: boolean;
  engineReady: boolean;
  engineStatus?: 'initializing' | 'ready' | 'failed';
  onSendText: (
    text: string,
    entryPoint: ChatEntryPoint,
    humming?: HummingAttachment,
  ) => boolean | void | Promise<boolean | void>;
  onReinitEngine: () => void;
  onStop?: () => void;
  prefill?: string;
  focusTrigger?: number;
  replayValue?: string;
  isVideoMode?: boolean;
  onFocusChange?: (focused: boolean) => void;
  /** Normal suggestion carousel, or a stepwise numbered-choice response. */
  inputMode?: InputMode;
  /** Guidance suggestions, rotated as placeholder text; Tab adopts the current one. */
  suggestions?: string[];
  /**
   * Triggers mood-based generation (fetches AirJelly context, then runs a
   * no-history turn). When provided, a "mood generate" suggestion is appended
   * to the rotation — but only once AirJelly is confirmed reachable. Adopting
   * that one specific suggestion and sending it calls this instead of
   * onSendText.
   */
  onMoodGenerate?: () => Promise<void> | void;
  /**
   * The first-run guide's practice turn. The field holds the one preset
   * sentence and cannot be typed into — the reply it gets is prepared, so any
   * other text would be answered as if it were this one. The footer says so;
   * the guide's own "skip" is the way out to the real model.
   */
  presetLock?: PresetLock;
  humming?: HummingInputController;
}

export interface PresetLock {
  text: string;
  /** The preset is loading; sending again does nothing. */
  busy: boolean;
  onSend: () => void;
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
  onFocusChange,
  inputMode = 'normal',
  suggestions,
  onMoodGenerate,
  presetLock,
  humming,
}: ChatInputProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const adoptedSuggestionRef = useRef<string | null>(null);
  // Mobile has no Tab key, so the return key adopts the suggestion instead
  // (see onKeyDown), and the footer hint points at that key rather than Tab.
  const isMobile = useIsMobile();
  // Drives the mobile "return to fill" hint, which is only actionable once the
  // on-screen keyboard is up.
  const [focused, setFocused] = useState(false);

  // AirJelly reachability, checked once on mount — Windows is excluded
  // (AirJelly Desktop doesn't support it). Runs once regardless of
  // onMoodGenerate's identity (a fresh useCallback most renders) — only
  // whether the caller passes one at all matters, and that's fixed per call
  // site (Sidebar owns the desktop entry point, the mobile layout never does).
  const [airjellyAvailable, setAirjellyAvailable] = useState(false);
  useEffect(() => {
    if (!onMoodGenerate) return;
    checkAirJellyAvailable().then(setAirjellyAvailable);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const moodSuggestionActive =
    !!onMoodGenerate && !isVideoMode && !navigator.userAgent.includes('Windows') && airjellyAvailable;
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
  const suggestionList = inputMode === 'choice' || presetLock
    ? []
    : moodSuggestionActive
      ? [...(suggestions ?? []), moodSuggestion]
      : (suggestions ?? []);
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
    if (prefill) {
      adoptedSuggestionRef.current = null;
      setText(prefill);
    }
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

  const presetValue = presetLock?.text;
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    resizeTextarea(el);
  }, [text, presetValue]);

  // How tall the field has to be is a question about how wide it is, and in the
  // studio almost nothing that changes its width is a window resize: the
  // sidebar divider is dragged, the column is shut and pulled back open, the
  // nav column expands, a full-width page takes the column away and hands it
  // back. None of those fired this, so the height stayed at whatever the last
  // window resize or keystroke had worked out for a column of a different
  // width — text clipped in a field too short for it, or a field standing tall
  // over one line.
  //
  // Watching the element itself answers all of them, the window included.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    const recalc = () => resizeTextarea(el);
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', recalc);
      return () => window.removeEventListener('resize', recalc);
    }
    // Width only. The callback's whole job is to write this element's *height*,
    // and reacting to that would be the observer answering itself.
    let lastWidth = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === lastWidth) return;
      lastWidth = el.clientWidth;
      recalc();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const doSubmit = () => {
    if (replayValue !== undefined) return;
    if (presetLock) {
      if (!presetLock.busy) presetLock.onSend();
      return;
    }
    const value = text.trim();
    if (
      isLoading
      || moodPending
      || humming?.isRecording
      || humming?.isStarting
      || humming?.isFinalizingRecording
      || humming?.isRerecording
      || humming?.isTranscribing
      || humming?.isSavingDraft
      || humming?.isSavingReplacement
      || humming?.replacementCandidate
    ) return;
    if (!value && !humming?.draft) return;
    const entryPoint: ChatEntryPoint =
      adoptedSuggestionRef.current === value ? 'suggestion' : 'text';
    adoptedSuggestionRef.current = null;
    if (humming?.draft) {
      void humming.submit(value, entryPoint).then((accepted) => {
        if (accepted) setText('');
      });
      return;
    }
    if (moodSuggestionActive && value === moodSuggestion) {
      setText('');
      setMoodPending(true);
      Promise.resolve(onMoodGenerate!()).finally(() => setMoodPending(false));
      return;
    }
    setText('');
    void onSendText(value, entryPoint);
  };

  const handleSubmit = (e: { preventDefault(): void }) => {
    e.preventDefault();
    doSubmit();
  };

  // What Tab does on desktop / the return key on mobile. Adopts the whole
  // suggestion, not just the part typed out so far, so a mid-reveal trigger
  // doesn't yield half a sentence.
  const adoptSuggestion = () => {
    if (suggestionActive && currentSuggestion) {
      adoptedSuggestionRef.current = currentSuggestion;
      setText(currentSuggestion);
    }
  };

  // Where the phone's return key is actually caught.
  //
  // `keydown` is not reliable for it: with an IME in the loop a phone reports a
  // bare `keyCode: 229` and no `key`, so the handler below never recognises the
  // press and the field takes a blank line instead of the suggestion. Every
  // mobile keyboard does agree on the *edit* the key is asking for, and this is
  // it — `insertLineBreak`, identical however the keydown came out.
  //
  // A native listener rather than React's `onBeforeInput`, which is still the
  // `textInput` polyfill: it only dispatches when the event carries character
  // data, and a line break carries none, so it never fires here at all.
  //
  // Narrowly gated. The moment there is anything typed `suggestionActive` is
  // false and the newline goes in exactly as it always did.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el || !isMobile || replayValue !== undefined) return;
    if (!suggestionActive || !currentSuggestion) return;

    const onBeforeInput = (e: Event) => {
      if ((e as InputEvent).inputType !== 'insertLineBreak') return;
      e.preventDefault();
      adoptedSuggestionRef.current = currentSuggestion;
      setText(currentSuggestion);
    };
    el.addEventListener('beforeinput', onBeforeInput);
    return () => el.removeEventListener('beforeinput', onBeforeInput);
  }, [isMobile, replayValue, suggestionActive, currentSuggestion]);

  // Only the card's non-interactive blank space pulls focus back to the
  // textarea. The thinking level control opts itself out via
  // [data-chat-input-focus-ignore] (see ThinkingLevelControl) so opening,
  // adjusting or closing it never re-focuses the textarea — and never yanks
  // the soft keyboard back up. defaultPrevented presses (the control's own
  // focus protection) are skipped for the same reason.
  //
  // Not while the field holds the guide's preset: it cannot be typed into, and
  // focusing it would only raise a phone's keyboard over the send key.
  const handleCardClick = (e: React.MouseEvent<HTMLFormElement>) => {
    if (e.defaultPrevented || presetLock) return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    if (target.closest('[data-chat-input-focus-ignore]')) return;
    if (target.closest('button, input, textarea, select, a[href], [contenteditable="true"]')) return;
    textareaRef.current?.focus();
  };

  const inputDisabled = (isLoading || moodPending || Boolean(humming?.isTranscribing))
    && replayValue === undefined;
  const hummingEnabled = Boolean(humming)
    && !isVideoMode
    && !presetLock
    && replayValue === undefined
    && inputMode !== 'choice';
  const hummingErrorKey: Record<string, Parameters<typeof t>[0]> = {
    microphone_unavailable: 'hummingMicUnavailable',
    microphone_denied: 'hummingMicDenied',
    microphone_failed: 'hummingMicFailed',
    recorder_unavailable: 'hummingMicUnavailable',
    recorder_failed: 'hummingMicFailed',
    empty_recording: 'hummingMicFailed',
    recording_interrupted: 'hummingMicFailed',
    recording_unavailable: 'hummingAudioUnavailable',
    rerecord_failed: 'hummingRerecordFailed',
    replacement_storage_unavailable: 'hummingReplacementStorageUnavailable',
    storage_unavailable: 'hummingStorageUnavailable',
    draft_load_failed: 'hummingStorageUnavailable',
    no_melody_detected: 'hummingNoMelody',
    too_many_notes: 'hummingNoMelody',
    too_many_candidates: 'hummingNoMelody',
    timeout: 'hummingTimeout',
    worker_unavailable: 'hummingFailed',
    worker_failed: 'hummingFailed',
    worker_message_failed: 'hummingFailed',
    attachment_too_large: 'hummingFailed',
    transcription_failed: 'hummingFailed',
  };
  // The waiting fade, applied per part (see the card below): everything that
  // is genuinely out of reach while the agent answers, and nothing else.
  const waitingDim = `transition-opacity duration-200 ${inputDisabled ? 'opacity-50' : ''}`;

  return (
    <form onSubmit={handleSubmit} onClick={handleCardClick} data-onboarding-target="composer" className="w-full" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Card: textarea on top, footer (hint + send button) below it in normal
          flow — a real layout row, not an overlay, so it always reserves its
          own space regardless of how tall/scrolled the textarea gets. */}
      {/* The square top is a joint, not a style: in the studio the composer is
          the foot of the sidebar and butts straight up against the stream
          above it, so rounding there would open a gap in a panel that is meant
          to read as one piece. On mobile it is a card of its own, standing off
          the rule the transport rides, and takes the radius on all four
          corners. The hairline ring inherits it (.chat-input-outline::before). */}
      <div
        className={`chat-input-surface chat-input-outline ${isMobile ? 'rounded-region' : 'rounded-t-none rounded-b-region'} pt-3 transition duration-200 ${inputDisabled ? 'cursor-not-allowed' : ''}`}
      >
        {/* The fade of the waiting state is taken on the card's contents, not
            on the card. Held on the card it also took the hairline with it,
            and on paper that ring is only a few levels off the fill it is
            drawn on — halve that difference and the composer loses its edge
            entirely for as long as the agent is answering. Dimming what is
            *inside* says the same thing and leaves the panel its outline.

            Taken on each dimmable part rather than on this wrapper, because
            the one thing in here that must not fade is the key on the right:
            while the agent answers it is the *stop* control, the only live
            action on the card, and a dimmed one reads as unavailable exactly
            when it is the only thing left to press. (Opacity is inherited by
            a subtree, so a child cannot win it back — the fade has to skip it
            on the way down.) */}
        <div>
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
          <div className={`relative pr-3 ${waitingDim}`}>
            <textarea
              ref={textareaRef}
              data-chat-input-textarea
              value={replayValue !== undefined ? replayValue : presetValue ?? text}
              onChange={replayValue !== undefined || presetLock ? undefined : (e) => {
                adoptedSuggestionRef.current = null;
                setText(e.target.value);
              }}
              readOnly={replayValue !== undefined || presetLock !== undefined}
              // A read-only field can still take focus from a tap; with no
              // keyboard asked for, a phone does not raise one over the preset.
              inputMode={presetLock ? 'none' : undefined}
              aria-busy={presetLock?.busy || undefined}
              onFocus={() => {
                setFocused(true);
                onFocusChange?.(true);
              }}
              onBlur={() => {
                setFocused(false);
                onFocusChange?.(false);
              }}
              onKeyDown={(e) => {
                if (replayValue !== undefined) return;
                // Guarded so Tab still moves focus out when there's nothing to adopt.
                if (e.key === 'Tab' && !e.shiftKey && suggestionActive && currentSuggestion) {
                  e.preventDefault();
                  adoptSuggestion();
                  return;
                }
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  // Mobile: the return key stands in for Tab, but only while the
                  // field is still empty (suggestionActive). Once the user is
                  // typing it falls through as a plain newline — sending is the
                  // send button's job there, not the keyboard's.
                  //
                  // The phone's own return key often does not arrive here at all
                  // (an IME in the loop reports a bare `keyCode: 229` with no
                  // `key`). The native `beforeinput` listener above is what
                  // actually catches it there; this stays as the plain-keyboard
                  // path and as the belt to its braces.
                  if (isMobile) {
                    if (suggestionActive && currentSuggestion) {
                      e.preventDefault();
                      adoptSuggestion();
                    }
                    return;
                  }
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
              placeholder={suggestionActive
                ? ''
                : t(inputMode === 'choice' ? 'choiceInputPlaceholder' : 'inputPlaceholder')}
              rows={1}
              disabled={inputDisabled}
              // The composer's resting height, and so the whole card's: the
              // floor holds the field open at more than the one line it starts
              // with. 20px shorter on a phone, where the card is standing on a
              // screen the conversation also has to fit on and that slack is
              // taken out of the reading. The auto-grow cap above is untouched,
              // so typing still opens it exactly as far as it ever did.
              className={`w-full ${isMobile ? 'min-h-[53px]' : 'min-h-[73px]'} resize-none overflow-hidden bg-transparent pl-4 pr-3 pb-1 text-base md:text-sm text-text-secondary placeholder:text-text-muted outline-none focus:text-text-primary disabled:cursor-not-allowed`}
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
              <div
                // Clamped to what the shorter mobile field can actually show,
                // so a long suggestion ends on a line rather than on one sliced
                // through the middle.
                className={`pointer-events-none absolute left-4 top-0 right-5 bottom-2 overflow-hidden ${isMobile ? 'line-clamp-2' : 'line-clamp-3'} text-base md:text-sm text-text-muted`}
              >
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

          {hummingEnabled && humming?.draft && (
            <div
              data-chat-input-focus-ignore
              className="mx-4 mb-2 flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-conversation-surface/60 p-2.5"
            >
              <div className="flex min-w-0 items-center justify-between gap-2">
                <span className="truncate text-xs text-text-secondary">{t('hummingRecording')}</span>
                <button
                  type="button"
                  onClick={humming.discard}
                  disabled={humming.isTranscribing || humming.isRerecording || humming.isFinalizingRecording || humming.isSavingDraft || humming.isSavingReplacement}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-surface-hover hover:text-text-primary disabled:opacity-50"
                  aria-label={t('hummingDelete')}
                  title={t('hummingDelete')}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <HummingAudioPlayer
                src={humming.audioUrl}
                durationSeconds={humming.draft.durationSeconds}
                disabled={humming.isTranscribing || humming.isRerecording || humming.isFinalizingRecording}
              />
              {!humming.isPersistent && (
                <div className="flex items-center justify-between gap-2 text-[11px] text-error">
                  <span>{t('hummingStorageUnavailable')}</span>
                  <button
                    type="button"
                    onClick={() => { void humming.retrySave(); }}
                    disabled={humming.isTranscribing || humming.isSavingDraft || humming.isRerecording || humming.isFinalizingRecording}
                    className="shrink-0 underline underline-offset-2 hover:text-text-primary disabled:opacity-50"
                  >
                    {t('hummingRetrySave')}
                  </button>
                </div>
              )}

              {humming.replacementCandidate && (
                <div className="flex min-w-0 flex-col gap-2 border-t border-border pt-2">
                  <div className="text-[11px] text-text-secondary">{t('hummingReplacementCandidate')}</div>
                  <HummingAudioPlayer
                    src={humming.replacementAudioUrl}
                    durationSeconds={humming.replacementCandidate.durationSeconds}
                  />
                  {humming.isSavingReplacement && (
                    <span className="flex items-center gap-2 text-[11px] text-text-secondary" role="status" aria-live="polite">
                      <LoaderCircle className="animate-spin motion-reduce:animate-none text-brand-accent" size={13} />
                      {t('hummingSavingReplacement')}
                    </span>
                  )}
                  <p className="text-[11px] text-error">{t('hummingReplacementStorageUnavailable')}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => { void humming.retrySaveReplacement(); }}
                      disabled={humming.isSavingReplacement}
                      className="min-h-11 rounded px-2 text-[11px] text-text-secondary underline underline-offset-2 hover:text-text-primary disabled:opacity-50"
                    >
                      {t('hummingRetrySaveReplacement')}
                    </button>
                    <button
                      type="button"
                      onClick={humming.useOriginalRecording}
                      disabled={humming.isSavingReplacement}
                      className="min-h-11 rounded px-2 text-[11px] text-text-secondary underline underline-offset-2 hover:text-text-primary disabled:opacity-50"
                    >
                      {t('hummingUseOriginalRecording')}
                    </button>
                  </div>
                </div>
              )}

              {humming.isTranscribing && (
                <div className="flex min-w-0 items-center gap-2" role="status" aria-live="polite">
                  <LoaderCircle className="animate-spin motion-reduce:animate-none text-brand-accent" size={14} />
                  <span className="min-w-0 flex-1 text-[11px] text-text-secondary">
                    {t(humming.progressStage === 'fallback'
                      ? 'hummingFallback'
                      : humming.progressStage === 'loading'
                        ? 'hummingRecognitionLoading'
                        : 'hummingTranscribing')}
                  </span>
                  {humming.progress > 0 && (
                    <div
                      className="h-1 w-14 shrink-0 overflow-hidden rounded-full bg-bg-primary"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(humming.progress * 100)}
                      aria-label={t('hummingStageProgress')}
                    >
                      <div
                        className="h-full rounded-full bg-brand-accent transition-[width]"
                        style={{ width: `${Math.round(humming.progress * 100)}%` }}
                      />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={humming.cancelTranscription}
                    className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-surface-hover hover:text-text-primary"
                    aria-label={t('hummingCancelRecognition')}
                    title={t('hummingCancelRecognition')}
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>
          )}

          {hummingEnabled && humming && (humming.isStarting || humming.isRecording || humming.isFinalizingRecording) && (
            <div className="mx-4 mb-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-secondary">
              {humming.isStarting && (
                <span className="flex min-w-0 flex-1 items-center gap-2" role="status" aria-live="polite">
                  <LoaderCircle className="shrink-0 animate-spin motion-reduce:animate-none text-brand-accent" size={14} />
                  <span>{t(humming.isRerecording ? 'hummingRerecordStarting' : 'hummingStarting')}</span>
                </span>
              )}
              {humming.isRecording && (
                <>
                  <span className="flex min-w-0 flex-1 items-center gap-2" role="status" aria-live="polite">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-error" aria-hidden="true" />
                    <span>{t(humming.isRerecording ? 'hummingRerecordingNow' : 'hummingRecordingNow')}</span>
                  </span>
                  <time className="shrink-0 tabular-nums text-text-muted" aria-live="off">
                    {formatRecordingTime(humming.recordingElapsedSeconds)} / 0:30
                  </time>
                  <button
                    type="button"
                    onClick={humming.stopRecording}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-error px-3 text-white"
                    aria-label={t('hummingStop')}
                    data-chat-input-focus-ignore
                  >
                    <Square size={12} fill="currentColor" />
                    {t('hummingStop')}
                  </button>
                </>
              )}
              {humming.isFinalizingRecording && (
                <span className="flex min-w-0 flex-1 items-center gap-2" role="status" aria-live="polite">
                  <LoaderCircle className="shrink-0 animate-spin motion-reduce:animate-none text-brand-accent" size={14} />
                  <span>{t(humming.isRerecording ? 'hummingRerecordFinalizing' : 'hummingFinalizing')}</span>
                </span>
              )}
              {(humming.isStarting || humming.isRecording) && (
                <button
                  type="button"
                  onClick={humming.isRerecording ? humming.cancelRerecord : humming.cancelRecording}
                  className="inline-flex min-h-11 shrink-0 items-center rounded-md px-2 text-text-muted hover:text-text-primary"
                  aria-label={t(humming.isRerecording ? 'hummingCancelRerecord' : 'hummingCancelRecording')}
                  data-chat-input-focus-ignore
                >
                  {t(humming.isRerecording ? 'hummingCancelRerecord' : 'hummingCancelRecording')}
                </button>
              )}
            </div>
          )}

          {hummingEnabled && humming?.draft && !humming.replacementCandidate && !humming.isRerecording && (
            <button
              type="button"
              onClick={humming.reRecord}
              disabled={isLoading || moodPending || humming.isTranscribing || humming.isFinalizingRecording || humming.isSavingDraft || humming.isSavingReplacement}
              className="mx-4 mb-2 inline-flex min-h-11 self-start items-center rounded-md px-2 text-[11px] text-text-secondary underline underline-offset-2 hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
              data-chat-input-focus-ignore
            >
              {t('hummingRerecord')}
            </button>
          )}

          {hummingEnabled && humming?.error && !humming.replacementCandidate
            && (humming.isPersistent || humming.error !== 'storage_unavailable') && (
            <p role="status" className="mx-4 mb-2 text-[11px] text-error">
              {t(hummingErrorKey[humming.error] ?? 'hummingFailed')}
            </p>
          )}

          {/* Footer row — hint/status on the left, send button on the right.
              Real layout, always visible regardless of textarea scroll state. */}
          <div className="flex items-center justify-between gap-2 pl-4 pr-2 pt-1 pb-2">
            <div className={`min-w-0 ${waitingDim}`}>
              {presetLock ? (
                <div className="truncate text-[12px] text-text-muted">{t('onboardingPresetBadge')}</div>
              ) : engineStatus !== 'ready' ? (
                <div className="flex items-center gap-2 text-[12px] text-text-muted">
                  <span className={`inline-flex h-2 w-2 rounded-full ${engineStatus === 'failed' ? 'bg-error' : 'bg-text-muted'}`} />
                  <span>{engineStatus === 'failed' ? t('engineFailed') : t('engineInitializing')}</span>
                  {engineStatus === 'failed' && (
                    <button
                      type="button"
                      onClick={onReinitEngine}
                      className="text-[18px] font-thin text-text-secondary/60 hover:text-text-primary transition-colors leading-none relative -top-[2px]"
                      title={t('restartEngine')}
                    >
                      ↺
                    </button>
                  )}
                </div>
               ) : suggestionActive && (!isMobile || focused) ? (
                <div className="pointer-events-none text-[12px] text-text-muted">
                  {isMobile ? t('enterToFill') : t('tabToFill')}
                </div>
              ) : null}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {hummingEnabled && humming && !humming.draft
                && !humming.isStarting && !humming.isRecording && !humming.isFinalizingRecording && (
                <button
                  type="button"
                  onClick={humming.startRecording}
                  disabled={
                    isLoading
                    || moodPending
                    || humming.isStarting
                    || humming.isRecording
                    || humming.isFinalizingRecording
                    || humming.isTranscribing
                    || !humming.canRecord
                  }
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
                  title={t(humming.isStarting ? 'hummingStarting' : 'hummingStart')}
                  aria-label={t(humming.isStarting ? 'hummingStarting' : 'hummingStart')}
                  data-chat-input-focus-ignore
                >
                  {humming.isStarting
                    ? <LoaderCircle className="animate-spin motion-reduce:animate-none" size={16} />
                    : <Mic size={17} />}
                </button>
              )}
              {replayValue === undefined && !presetLock && (
                <ThinkingLevelControl
                  disabled={inputDisabled}
                  // Read at press time from the DOM, not from React's `focused`
                  // state: the event handler needs the fact as it is right now,
                  // and only an actual textarea focus is worth protecting (see
                  // ThinkingLevelControl's pointerdown protection).
                  shouldPreserveInputFocus={() => document.activeElement === textareaRef.current}
                />
              )}
              {replayValue !== undefined ? (
                <button
                  type="button"
                  disabled={!replayValue.trim()}
                  className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-full bg-brand-accent text-on-accent transition duration-200 disabled:cursor-not-allowed disabled:opacity-50"
                  title={t('send')}
                >
                  <ArrowUpIcon size={18} />
                </button>
              ) : isLoading ? (
                <button
                  type="button"
                  onClick={onStop}
                  className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-full bg-brand-accent text-on-accent transition duration-200 hover:bg-brand-accent-hover"
                  title={t('stop')}
                >
                  {/* Well under the arrow it stands in for: a solid square
                      carries far more ink than an outlined glyph, so anywhere
                      near the arrow's nominal size the stop mark reads as the
                      larger of the two and the disc as crowded. */}
                  <StopIcon size={12} />
                </button>
              ) : (
                <button
                  type="submit"
                  data-onboarding-target="send"
                  disabled={presetLock ? presetLock.busy : (
                    (!text.trim() && !humming?.draft)
                    || Boolean(humming?.isStarting)
                    || Boolean(humming?.isRecording)
                    || Boolean(humming?.isFinalizingRecording)
                    || Boolean(humming?.isRerecording)
                    || Boolean(humming?.isTranscribing)
                    || Boolean(humming?.isSavingDraft)
                    || Boolean(humming?.isSavingReplacement)
                    || Boolean(humming?.replacementCandidate)
                  )}
                  /* The guide's send on a phone is pressed with a thumb, so
                     its reach grows to 44px round the 30px disc. Only then:
                     the thinking-level control that sits beside the key
                     otherwise is not drawn while the preset holds the field,
                     so the wider reach covers nothing else. */
                  className={`inline-flex h-[30px] w-[30px] items-center justify-center rounded-full bg-brand-accent text-on-accent transition duration-200 hover:bg-brand-accent-hover disabled:cursor-not-allowed disabled:opacity-50${
                    presetLock && isMobile ? " relative before:absolute before:-inset-[7px] before:content-['']" : ''
                  }`}
                  title={t('send')}
                  aria-label={t('send')}
                >
                  <ArrowUpIcon size={18} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
