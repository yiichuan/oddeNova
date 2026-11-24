import { uploadImage, SIGN_IN_REQUIRED_MESSAGE, type ImageAttachment } from '../../lib/image-attachments';
import MessageImages from './MessageImages';
import { rememberUploadedImagePreview } from '../../lib/image-preview-memory';
import { MAX_MESSAGE_IMAGES } from '../../lib/image-types';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ChevronUp, LoaderCircle, MessageCircleMore, Mic, MicVocal, Music2, X } from 'lucide-react';
import { ArrowUpIcon, StopIcon } from '../icons';
import { ImagePlus } from 'lucide-react';
import ThinkingLevelControl from './ThinkingLevelControl';
import HummingAudioPlayer from './HummingAudioPlayer';
import RecordingDots from './RecordingDots';
import { t } from '../../lib/i18n';
import { checkAirJellyAvailable } from '../../services/airjelly';
import { stepwiseOptionText } from '../../services/suggestions';
import type { ChatEntryPoint, InputMode } from '../../hooks/useChat';
import type { HummingInputController } from '../../hooks/useHummingInput';
import type { HummingAttachment } from '../../types/humming';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useTypewriter } from '../../hooks/useTypewriter';

const IMAGE_UPLOAD_CONCURRENCY = 3;
type ImageUploadQueue = { jobs: Array<() => Promise<void>>; active: number; disposed: boolean };

function drainImageUploads(queue: ImageUploadQueue): void {
  while (!queue.disposed && queue.active < IMAGE_UPLOAD_CONCURRENCY && queue.jobs.length) {
    const job = queue.jobs.shift()!;
    queue.active += 1;
    void job().finally(() => {
      queue.active -= 1;
      drainImageUploads(queue);
    });
  }
}
import { useDeepSeekSpeech } from '../../hooks/useDeepSeekSpeech';
import { zh } from '../../lib/i18n';

const RECORDING_ICON_SIZE = 14;

// Split text into typewriter units: CJK (and fullwidth punctuation) reveal
// character by character, latin script word by word (a run of non-CJK,
// non-space characters plus its trailing whitespace is one unit).
function tokenizeForTyping(s: string): string[] {
  return s.match(/[\u3000-\u303f\u4e00-\u9fff\uff00-\uffef]|[^\u3000-\u303f\u4e00-\u9fff\uff00-\uffef\s]+\s*|\s+/g) ?? [];
}

function formatRecordingTime(seconds: number): string {
  const elapsed = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(elapsed / 60);
  const remainingSeconds = (elapsed % 60).toString().padStart(2, '0');
  return `${minutes}:${remainingSeconds}`;
}

// Cap on the auto-grow height (px) of the textarea itself (excludes the
// card's top padding and the footer row below it) before it switches to an
// internal scrollbar instead of pushing the layout further down.
const MAX_TEXTAREA_HEIGHT = 180;
type PendingSend = 'message' | 'choice' | 'mood';

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
    images?: ImageAttachment[],
    humming?: HummingAttachment,
  ) => boolean | void | Promise<boolean | void>;
  onReinitEngine: () => void;
  onStop?: () => void;
  prefill?: string;
  prefillImages?: ImageAttachment[];
  focusTrigger?: number;
  replayValue?: string;
  isVideoMode?: boolean;
  onFocusChange?: (focused: boolean) => void;
  /** Normal suggestion carousel, or a stepwise numbered-choice response. */
  inputMode?: InputMode;
  /** Numbered options from the latest unanswered stepwise-composition reply. */
  choiceOptions?: string[];
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
  /** The first-run guide is running: no placeholder and no rotating suggestions. */
  guided?: boolean;
  /** Images upload to the account's storage, so a guest is asked to sign in first. */
  signedIn?: boolean;
  /** Opens the sign-in window from the "sign in to add images" notice. */
  onRequestSignIn?: () => void;
  humming?: HummingInputController;
  recordingScope?: string;
}

export interface PresetLock {
  text: string;
  /** The preset is loading; sending again does nothing. */
  busy: boolean;
  onSend: () => void;
  /**
   * When the text may begin typing itself into the field (default: at once).
   * Until then the field stays empty; once begun it finishes and stays.
   */
  startTyping?: boolean;
}

export default function ChatInput({
  isLoading,
  engineReady,
  engineStatus = engineReady ? 'ready' : 'initializing',
  onSendText,
  onReinitEngine,
  onStop,
  prefill,
  prefillImages,
  focusTrigger,
  replayValue,
  isVideoMode = false,
  onFocusChange,
  inputMode = 'normal',
  choiceOptions,
  suggestions,
  onMoodGenerate,
  presetLock,
  guided = false,
  signedIn = true,
  onRequestSignIn,
  humming,
  recordingScope,
}: ChatInputProps) {
  const [text, setText] = useState('');
  const [choiceSendError, setChoiceSendError] = useState<{ optionsKey: string; message: string } | null>(null);
  const [pendingSend, setPendingSend] = useState<PendingSend | null>(null);
  const sendInProgressRef = useRef(false);
  const choiceOptionsKey = JSON.stringify(choiceOptions ?? []);
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [pendingImages, setPendingImages] = useState<{ id: string; url: string }[]>([]);
  const [localPreviews, setLocalPreviews] = useState<Record<string, string>>({});
  const previewUrls = useRef(new Set<string>());
  const uploadQueue = useRef<ImageUploadQueue>({ jobs: [], active: 0, disposed: false });
  const nextImageOrder = useRef(0);
  const imageOrder = useRef(new WeakMap<ImageAttachment, number>());
  useEffect(() => {
    const urls = previewUrls.current;
    // Effects can be replayed in StrictMode; each lifetime owns its queue.
    const queue: ImageUploadQueue = { jobs: [], active: 0, disposed: false };
    uploadQueue.current = queue;
    return () => {
      queue.disposed = true;
      queue.jobs.length = 0;
      urls.forEach(url => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);
  useEffect(() => {
    const retained = new Set([...images.map(image => localPreviews[image.id]), ...pendingImages.map(image => image.url)]);
    for (const url of previewUrls.current) {
      if (!retained.has(url)) { URL.revokeObjectURL(url); previewUrls.current.delete(url); }
    }
  }, [images, localPreviews, pendingImages]);
  const sendingImages = pendingSend === 'message';
  const imageBusy = sendingImages || pendingImages.length > 0;
  const [imageError, setImageError] = useState('');
  // Sign-in is one notice for the whole batch, not one per file.
  const [imageNeedsSignIn, setImageNeedsSignIn] = useState(false);
  // Files dragged over the composer light the add-image key. Enter/leave fire
  // for every child crossed, so a depth count tells when the drag truly left.
  const [fileDragActive, setFileDragActive] = useState(false);
  const fileDragDepth = useRef(0);
  const endFileDrag = () => { fileDragDepth.current = 0; setFileDragActive(false); };
  const fileRef = useRef<HTMLInputElement>(null);
  // The thumbnail strip eases to its new height instead of snapping the
  // composer taller or shorter. It clips only while moving: at rest the
  // remove keys stick out past its top edge.
  const stripRef = useRef<HTMLDivElement>(null);
  const [stripHeight, setStripHeight] = useState<number>();
  const [stripMoving, setStripMoving] = useState(false);
  useLayoutEffect(() => {
    const strip = stripRef.current;
    if (!strip || typeof ResizeObserver === 'undefined') return;
    let previous = strip.offsetHeight;
    setStripHeight(previous);
    const observer = new ResizeObserver(() => {
      const next = strip.offsetHeight;
      if (next === previous) return;
      previous = next;
      setStripMoving(!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
      setStripHeight(next);
    });
    observer.observe(strip);
    return () => observer.disconnect();
  }, []);
  const imageCountRef = useRef(0);
  const addImages = async (files: File[]) => {
    if (sendingImages || isLoading || presetLock || isVideoMode || !files.length) return;
    if (!signedIn) { setImageError(''); setImageNeedsSignIn(true); return; }
    if (files.length + imageCountRef.current > MAX_MESSAGE_IMAGES) { setImageError(`每条消息最多 ${MAX_MESSAGE_IMAGES} 张图片`); return; }
    setImageError('');
    setImageNeedsSignIn(false);
    const pending = files.map(file => {
      const url = URL.createObjectURL(file);
      previewUrls.current.add(url);
      return { id: crypto.randomUUID(), url, file, order: nextImageOrder.current++ };
    });
    imageCountRef.current += pending.length;
    setPendingImages(previous => [...previous, ...pending]);
    const queue = uploadQueue.current;
    for (const item of pending) {
      queue.jobs.push(async () => {
        try {
          const image = await uploadImage(item.file);
          if (queue.disposed) return;
          await rememberUploadedImagePreview(image, item.file);
          if (queue.disposed) return;
          imageOrder.current.set(image, item.order);
          setLocalPreviews(previous => ({ ...previous, [image.id]: item.url }));
          setImages(previous => [...previous, image].sort((a, b) =>
            (imageOrder.current.get(a) ?? -1) - (imageOrder.current.get(b) ?? -1)));
        } catch (error) {
          if (queue.disposed) return;
          imageCountRef.current -= 1;
          if (error instanceof Error && error.message === SIGN_IN_REQUIRED_MESSAGE) { setImageNeedsSignIn(true); return; }
          const reason = error instanceof Error ? error.message : '图片上传失败';
          setImageError(previous => [previous, `${item.file.name}: ${reason}`].filter(Boolean).join('；'));
        } finally {
          if (!queue.disposed) setPendingImages(previous => previous.filter(image => image.id !== item.id));
        }
      });
    }
    drainImageUploads(queue);
  };
  const [recordingMenuOpen, setRecordingMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const recordingActionRef = useRef<HTMLButtonElement>(null);
  const recordingCancelRef = useRef<HTMLButtonElement>(null);
  const wasVoiceBusyRef = useRef(false);
  const voiceSpeech = useDeepSeekSpeech((spoken) => {
    adoptedSuggestionRef.current = null;
    if (spoken.trim()) setText(current => current.trim() ? `${current.trimEnd()} ${spoken.trim()}` : spoken.trim());
  });
  const voiceBusy = voiceSpeech.isStarting || voiceSpeech.mode !== 'idle';
  const cancelVoice = voiceSpeech.cancel;
  useEffect(() => () => cancelVoice(), [recordingScope, cancelVoice]);
  useEffect(() => {
    if (!recordingMenuOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setRecordingMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setRecordingMenuOpen(false); };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape); };
  }, [recordingMenuOpen]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const adoptedSuggestionRef = useRef<string | null>(null);
  // Mobile has no Tab key, so the return key adopts the suggestion instead
  // (see onKeyDown), with a corresponding keycap beside the suggestion.
  const isMobile = useIsMobile();
  // The mobile keycap only appears once the on-screen keyboard is requested.
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const mode = voiceSpeech.mode;
    if (mode === 'recording') {
      recordingActionRef.current?.focus({ preventScroll: true });
    } else if (voiceBusy) {
      recordingCancelRef.current?.focus({ preventScroll: true });
    } else if (wasVoiceBusyRef.current) {
      (isMobile ? recordingActionRef.current : textareaRef.current)?.focus({ preventScroll: true });
    }
    wasVoiceBusyRef.current = voiceBusy;
  }, [voiceBusy, voiceSpeech.mode, isMobile]);

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
  const moodPending = pendingSend === 'mood';
  const showStepwiseChoices = Boolean(choiceOptions?.length)
    && !isLoading
    && replayValue === undefined
    && !isVideoMode
    && !presetLock
    && !guided;

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
  const [keyHintFor, setKeyHintFor] = useState<{ index: number; text: string } | null>(null);
  const [tabInteraction, setTabInteraction] = useState<(NonNullable<typeof keyHintFor> & { hovering: boolean }) | null>(null);
  const suggestionList = showStepwiseChoices || inputMode === 'choice' || presetLock || guided
    ? []
    : moodSuggestionActive
      ? [...(suggestions ?? []), moodSuggestion]
      : (suggestions ?? []);
  const currentSuggestion = suggestionList.length > 0 ? suggestionList[suggestionIdx % suggestionList.length] : null;
  const suggestionActive =
    currentSuggestion !== null && text === '' && !voiceBusy && replayValue === undefined && !isLoading && !isVideoMode && !moodPending;
  const tabHintInteracted = !isMobile && tabInteraction !== null
    && tabInteraction.index === suggestionIdx && tabInteraction.text === currentSuggestion;
  const tabHintHovered = suggestionActive && tabHintInteracted && tabInteraction.hovering;
  const tabHintTooltipRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const tooltip = tabHintTooltipRef.current;
    const key = tooltip?.parentElement;
    const composer = key?.closest('.chat-input-surface');
    if (!tabHintHovered || !tooltip || !key || !composer) return;

    const positionTooltip = () => {
      const inset = 8;
      const bounds = composer.getBoundingClientRect();
      const anchor = key.getBoundingClientRect();
      tooltip.style.maxWidth = `${Math.max(0, bounds.width - inset * 2)}px`;
      const width = tooltip.offsetWidth;
      const centered = anchor.left + (anchor.width - width) / 2;
      const left = Math.max(bounds.left + inset, Math.min(centered, bounds.right - inset - width));
      tooltip.style.left = `${left - anchor.left}px`;
    };
    positionTooltip();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(positionTooltip);
    observer.observe(composer);
    observer.observe(tooltip);
    return () => observer.disconnect();
  }, [tabHintHovered]);

  useEffect(() => {
    if (!currentSuggestion || tabHintHovered) return;
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
  }, [currentSuggestion, typing, suggestionList.length, suggestionFading, tabHintHovered]);

  const typedPlaceholder =
    currentSuggestion !== null && typing.sug === currentSuggestion
      ? tokenizeForTyping(currentSuggestion).slice(0, typing.count).join('')
      : '';
  const canRevealKeyHint = suggestionActive && (!isMobile || focused) && Boolean(typedPlaceholder)
    && typedPlaceholder === currentSuggestion;
  useEffect(() => {
    if (!canRevealKeyHint || currentSuggestion === null) return;
    const id = setTimeout(() => setKeyHintFor({ index: suggestionIdx, text: currentSuggestion }), 350);
    return () => clearTimeout(id);
  }, [canRevealKeyHint, currentSuggestion, suggestionIdx]);
  const showKeyHint = canRevealKeyHint && keyHintFor !== null
    && keyHintFor.index === suggestionIdx && keyHintFor.text === currentSuggestion;

  useEffect(() => {
    if (prefill || prefillImages) {
      adoptedSuggestionRef.current = null;
      setText(prefill ?? "");
      setImages(prefillImages ?? []);
      imageCountRef.current = (prefillImages ?? []).length;
      setLocalPreviews({});
    }
  }, [prefill, prefillImages, focusTrigger]);

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

  // The guide's preset request types itself into the field as it appears.
  const presetValue = useTypewriter(presetLock?.text, presetLock?.startTyping ?? true);
  const displayedText = replayValue ?? presetValue ?? (humming?.pendingSubmission ? '' : text);
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    resizeTextarea(el);
  }, [displayedText]);

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

  const beginSend = (kind: PendingSend) => {
    if (sendInProgressRef.current) return false;
    sendInProgressRef.current = true;
    setPendingSend(kind);
    return true;
  };

  const finishSend = () => {
    sendInProgressRef.current = false;
    setPendingSend(null);
  };

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
      || voiceSpeech.mode !== 'idle' || voiceSpeech.isStarting
      || humming?.isRecording
      || humming?.isStarting
      || humming?.isFinalizingRecording
      || humming?.isRerecording
      || humming?.isTranscribing
      || humming?.isSavingDraft
      || humming?.isSavingReplacement
      || humming?.replacementCandidate
    ) return;
    if (!value && !images.length && !humming?.draft) return;
    const hummingEntryPoint = adoptedSuggestionRef.current === value ? 'suggestion' : 'text';
    if (humming?.draft) {
      void humming.submit(value || t('hummingDefaultInstruction'), hummingEntryPoint).then((accepted) => {
        if (accepted) setText('');
      });
      return;
    }
    if ((!value && !images.length && !humming?.draft) || isLoading || pendingSend || imageBusy) return;
    const sendMood = moodSuggestionActive && value === moodSuggestion;
    if (!beginSend(sendMood ? 'mood' : 'message')) return;
    const entryPoint: ChatEntryPoint =
      adoptedSuggestionRef.current === value ? 'suggestion' : 'text';
    adoptedSuggestionRef.current = null;
    setText('');
    if (sendMood) {
      void Promise.resolve().then(() => onMoodGenerate!()).finally(finishSend);
      return;
    }
    const sentImages = images;
    imageCountRef.current = 0;
    setImages([]);
    setLocalPreviews({});
    void (async () => {
      try {
        await (sentImages.length ? onSendText(value, entryPoint, sentImages) : onSendText(value, entryPoint));
      } catch (error) {
        setText(value);
        setImages(sentImages);
        imageCountRef.current = sentImages.length;
        setImageError(String(error));
      } finally {
        finishSend();
      }
    })();
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
      setTabInteraction(null);
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
  const recordingAvailable = !isVideoMode && !presetLock && replayValue === undefined;
  const voiceEnabled = recordingAvailable && voiceSpeech.supported;
  const startVoiceInput = () => {
    setRecordingMenuOpen(false);
    let key = '';
    try {
      key = localStorage.getItem('vibe_api_key_deepseek')?.trim()
        || (localStorage.getItem('vibe_provider') === 'deepseek'
          ? localStorage.getItem('vibe_api_key')?.trim() ?? ''
          : '');
    } catch { /* use official proxy */ }
    void voiceSpeech.start(key);
  };
  const hummingEnabled = recordingAvailable && Boolean(humming) && inputMode !== 'choice';
  const activeHumming = hummingEnabled && humming
    && (humming.isStarting || humming.isRecording || humming.isFinalizingRecording)
    ? humming : null;
  const captureMode = activeHumming ? 'humming'
    : voiceBusy ? 'voice' : null;
  const captureActive = captureMode !== null;
  const showCaptureControl = voiceEnabled || hummingEnabled || captureActive;
  const takes = hummingEnabled && humming?.draft
    ? [...humming.earlierTakes, { draft: humming.draft, audioUrl: humming.audioUrl }]
    : [];
  const micRecording = activeHumming ? activeHumming.isRecording : voiceSpeech.mode === 'recording';
  const receivingRecording = activeHumming
    ? activeHumming.isFinalizingRecording
    : voiceSpeech.mode === 'transcribing';
  const capturePhase = receivingRecording ? 'receiving'
    : micRecording ? 'recording' : captureActive ? 'starting' : 'idle';
  const captureStatus = receivingRecording ? (zh ? '正在接收' : 'Receiving')
    : activeHumming
      ? t(micRecording
        ? (activeHumming.isRerecording ? 'hummingRerecordingNow' : 'hummingRecordingNow')
        : (activeHumming.isRerecording ? 'hummingRerecordStarting' : 'hummingStarting'))
      : micRecording ? (zh ? '语音录音中' : 'Recording voice') : t('hummingStarting');
  const canCancelCapture = !activeHumming?.isFinalizingRecording;
  const cancelCaptureLabel = voiceSpeech.mode === 'transcribing'
    ? t('hummingCancelRecognition')
    : t(activeHumming?.isRerecording ? 'hummingCancelRerecord' : 'hummingCancelRecording');
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
    timeout: 'hummingTimeout',
    sign_in_required: 'hummingUnderstandingSignIn',
    rate_limited: 'hummingUnderstandingRateLimited',
    attachment_too_large: 'hummingFailed',
    transcription_failed: 'hummingFailed',
  };
  const choiceOptionDisabled = inputDisabled || pendingSend !== null;
  // The waiting fade, applied per part (see the card below): everything that
  // is genuinely out of reach while the agent answers, and nothing else.
  const waitingDim = `transition-opacity duration-200 ${inputDisabled ? 'opacity-50' : ''}`;

  const sendChoice = async (option: string) => {
    if (
      !showStepwiseChoices
      || !choiceOptions?.includes(option)
      || choiceOptionDisabled
    ) return;
    if (!beginSend('choice')) return;
    setChoiceSendError(null);
    try {
      await onSendText(stepwiseOptionText(option), 'choice');
    } catch (error) {
      setChoiceSendError({
        optionsKey: choiceOptionsKey,
        message: error instanceof Error ? error.message : t('requestFailed'),
      });
    } finally {
      finishSend();
    }
  };

  return (
    <form onSubmit={handleSubmit} onPaste={e => { const files = Array.from(e.clipboardData.files).filter(file => file.type.startsWith('image/')); if (files.length) { e.preventDefault(); void addImages(files); } }} onDragEnter={e => { if (!e.dataTransfer.types.includes('Files')) return; fileDragDepth.current += 1; setFileDragActive(true); }} onDragLeave={e => { if (!e.dataTransfer.types.includes('Files')) return; fileDragDepth.current = Math.max(0, fileDragDepth.current - 1); if (!fileDragDepth.current) setFileDragActive(false); }} onDragOver={e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }} onDrop={e => { endFileDrag(); if (e.dataTransfer.files.length) { e.preventDefault(); void addImages(Array.from(e.dataTransfer.files)); } }} onClick={handleCardClick} data-onboarding-target="composer" className="w-full" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>


      {showStepwiseChoices && (
        <div
          role="group"
          aria-label={t('choiceOptionsLabel')}
          data-chat-choice-options
          className="grid min-w-0 justify-items-start gap-1.5 px-4 pt-2 pb-3"
        >
          {choiceOptions?.map((option, index) => (
            <button
              key={`${index}:${option}`}
              type="button"
              disabled={choiceOptionDisabled}
              onClick={() => { void sendChoice(option); }}
              className={`min-h-9 max-w-full rounded-[13px] border border-border bg-transparent px-3 py-1.5 text-left ${isMobile ? 'text-base' : 'text-[13px]'} leading-snug text-text-primary [overflow-wrap:anywhere] transition-colors enabled:cursor-pointer enabled:hover:border-text-muted enabled:hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent disabled:cursor-not-allowed disabled:opacity-50 pointer-coarse:min-h-11`}
            >
              {stepwiseOptionText(option)}
            </button>
          ))}
          {choiceSendError?.optionsKey === choiceOptionsKey && (
            <p role="alert" className="px-1 py-1 text-xs leading-relaxed text-error">{choiceSendError.message}</p>
          )}
        </div>
      )}
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
        {!presetLock && !isVideoMode && (
          <>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden onChange={e => { void addImages(Array.from(e.target.files ?? [])); e.target.value = ''; }} />
            <div
              style={{ height: stripHeight }}
              onTransitionEnd={event => { if (event.target === event.currentTarget) setStripMoving(false); }}
              className={`transition-[height] duration-200 ease-out motion-reduce:transition-none ${stripMoving ? 'overflow-hidden' : ''}`}
            >
              <div ref={stripRef}>
                {(images.length > 0 || pendingImages.length > 0) && (
                  <div data-chat-input-focus-ignore className="flex flex-wrap gap-2 px-3 pb-3 pt-0">
                    {images.map(image => (
                      <div key={image.id} className="group/attachment relative h-16 w-16 rounded-[6px] border border-border bg-surface-hover overflow-visible">
                        <div className="h-full overflow-hidden rounded-[5px] text-[10px] text-text-muted [&>div]:h-full [&>div]:p-0 [&_button]:flex [&_button]:rounded-none [&_button]:h-full [&_button]:w-full [&_button>div]:w-full [&_button>div]:min-w-0 [&_img]:h-full [&_img]:w-full [&_img]:rounded-none [&_img]:object-cover [&_img]:object-center [&_span]:block [&_span]:p-2">
                          <MessageImages images={[image]} previewUrls={localPreviews} />
                        </div>
                        <button
                          type="button"
                          title={`${t('removeImage')} ${image.name}`}
                          disabled={imageBusy || isLoading}
                          onClick={() => { imageCountRef.current -= 1; setImages(previous => previous.filter(item => item.id !== image.id)); }}
                          className="opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:pointer-events-none group-hover/attachment:opacity-100 group-hover/attachment:pointer-events-auto group-focus-within/attachment:opacity-100 group-focus-within/attachment:pointer-events-auto absolute -right-1.5 -top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-border bg-surface-hover text-text-secondary shadow-sm transition-[opacity,color,background-color] hover:bg-surface-hover hover:text-text-primary focus-visible:outline-2 focus-visible:outline-brand-accent disabled:cursor-not-allowed disabled:opacity-50 after:absolute after:-inset-1"
                        >
                          <X size={12} aria-hidden="true" />
                          <span className="sr-only">{t('removeImage')} {image.name}</span>
                        </button>
                      </div>
                    ))}
                    {pendingImages.map(image => (
                      <div key={image.id} role="status" aria-label={t('processingImages')}
                        className="relative h-16 w-16 overflow-hidden rounded-[6px] bg-surface-hover">
                        <img src={image.url} alt="" className="h-full w-full scale-110 object-cover blur-sm brightness-75" />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/15">
                          <LoaderCircle size={22} strokeWidth={2} className="animate-spin text-white motion-reduce:animate-none" aria-hidden="true" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {imageNeedsSignIn && (
              <p role="alert" className="px-4 pb-2 text-xs leading-relaxed text-error">
                请{' '}{onRequestSignIn ? (
                  <button type="button" onClick={onRequestSignIn} className="cursor-pointer text-[14px] font-bold underline underline-offset-2 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent">登录</button>
                ) : <span className="text-[14px] font-bold underline underline-offset-2">登录</span>}{' '}后添加图片
              </p>
            )}
            {imageError && <p role="alert" className="px-4 pb-2 text-xs leading-relaxed text-error">{imageError}</p>}
          </>
        )}
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
          {hummingEnabled && humming?.draft && !humming.pendingSubmission && (
            <div className="flex flex-wrap gap-2 px-3 pb-3" data-chat-input-focus-ignore>
              {takes.map(({ draft, audioUrl }, index) => (
                <HummingAudioPlayer
                  key={draft.id}
                  compact
                  label={`${zh ? '哼唱' : 'Humming'} ${String(index + 1).padStart(2, '0')}`}
                  src={audioUrl}
                  durationSeconds={draft.durationSeconds}
                  disabled={captureActive}
                  loading={humming.isTranscribing}
                  onRemove={humming.isTranscribing ? humming.cancelTranscription : () => humming.discard(draft.id)}
                  removeLabel={t(humming.isTranscribing ? 'hummingCancelRecognition' : 'hummingDelete')}
                  removeDisabled={captureActive || humming.isSavingDraft || humming.isSavingReplacement}
                />
              ))}
              {humming.replacementCandidate && (
                <HummingAudioPlayer
                  compact
                  label={`${zh ? '哼唱' : 'Humming'} ${String(takes.length + 1).padStart(2, '0')}`}
                  src={humming.replacementAudioUrl}
                  durationSeconds={humming.replacementCandidate.durationSeconds}
                  onRemove={humming.useOriginalRecording}
                  removeDisabled={humming.isSavingReplacement}
                />
              )}
            </div>
          )}
          {/* Wraps just the textarea so the suggestion overlay below can be
              laid over its box, not the card as a whole
              (which also includes the footer). Top padding lives on the card
              above, not here — inside the textarea it would be scrolled out of
              view (and off the top of the visible box) once content overflows
              past MAX_TEXTAREA_HEIGHT, same reasoning as the footer below. */}
          {/* pr-2 insets the textarea's right edge (where the scrollbar rides)
              from the card edge, giving the scrollbar an 8px gap. The textarea's
              own pr below is reduced by the same 8px so the text position is
              unchanged. */}
          <div className={`grid pr-3 ${waitingDim}`}>
            <textarea
              ref={textareaRef}
              data-chat-input-textarea
              value={displayedText}
              onChange={replayValue !== undefined || presetLock ? undefined : (e) => {
                adoptedSuggestionRef.current = null;
                setTabInteraction(null);
                setText(e.target.value);
              }}
              readOnly={replayValue !== undefined || presetLock !== undefined || voiceBusy}
              // A read-only field can still take focus from a tap; with no
              // keyboard asked for, a phone does not raise one over the preset.
              inputMode={presetLock ? 'none' : undefined}
              aria-busy={presetLock?.busy || undefined}
              aria-keyshortcuts={showKeyHint ? (isMobile ? 'Enter' : 'Tab') : undefined}
              onFocus={() => {
                setFocused(true);
                onFocusChange?.(true);
              }}
              onBlur={() => {
                setFocused(false);
                if (isMobile) setKeyHintFor(null);
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
              placeholder={suggestionActive || guided
                ? ''
                : t(showStepwiseChoices || inputMode === 'choice' ? 'choiceInputPlaceholder' : 'inputPlaceholder')}
              rows={1}
              disabled={inputDisabled}
              // The composer's resting height, and so the whole card's: the
              // floor holds the field open at more than the one line it starts
              // with. 20px shorter on a phone, where the card is standing on a
              // screen the conversation also has to fit on and that slack is
              // taken out of the reading. The auto-grow cap above is untouched,
              // so typing still opens it exactly as far as it ever did.
              className={`col-start-1 row-start-1 w-full ${isMobile ? 'min-h-[53px]' : 'min-h-[73px]'} pl-4 pr-3 pb-1 resize-none overflow-hidden bg-transparent text-base md:text-sm text-text-secondary placeholder:text-text-muted outline-none focus:text-text-primary disabled:cursor-not-allowed`}
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
              <div className="pointer-events-none z-10 col-start-1 row-start-1 min-w-0 break-words pl-4 pr-3 pb-1 text-base md:text-sm text-text-muted">
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
                  {showKeyHint && <>{' '}
                    <span
                      key={suggestionIdx}
                      className="chat-suggestion-key"
                      aria-hidden="true"
                      data-motion={tabHintHovered ? 'hover' : tabHintInteracted ? 'rest' : 'intro'}
                      onMouseEnter={isMobile ? undefined : () => {
                        setTabInteraction({ index: suggestionIdx, text: typedPlaceholder, hovering: true });
                        setSuggestionFading(false);
                      }}
                      onMouseLeave={isMobile ? undefined : () => {
                        setTabInteraction({ index: suggestionIdx, text: typedPlaceholder, hovering: false });
                      }}
                    >
                      <kbd className="chat-suggestion-key-cap">
                        <span className="text-text-primary">{isMobile ? '⏎' : 'Tab'}</span>
                      </kbd>
                      <span className="chat-suggestion-key-impact" />
                      {tabHintHovered && <span ref={tabHintTooltipRef} className="chat-suggestion-key-tooltip">{t('tabToFill')}</span>}
                    </span>
                  </>}
                </span>
              </div>
            )}
          </div>

          {voiceSpeech.error && (
            <p role="alert" className="mx-4 mb-2 text-xs text-error">
              {t(voiceSpeech.error === 'MIC_PERMISSION_DENIED' ? 'voiceMicPermissionDenied'
                : voiceSpeech.error === 'MIC_NOT_FOUND' ? 'voiceMicNotFound'
                  : voiceSpeech.error === 'EMPTY_RECORDING' ? 'voiceEmptyRecording'
                    : voiceSpeech.error === 'RECORDING_FAILED' || voiceSpeech.error === 'RECORDER_NOT_ACTIVE'
                      ? 'voiceRecordingFailed' : 'voiceTranscriptionFailed')}
            </p>
          )}
          {hummingEnabled && humming?.error && !humming.replacementCandidate && (
            <p role="status" className="mx-4 mb-2 text-[11px] text-error">
              {t(hummingErrorKey[humming.error] ?? 'hummingFailed')}
            </p>
          )}

          {/* Footer row — attachments and status on the left, send on the right.
              Real layout, always visible regardless of textarea scroll state. */}
          <div className="relative z-20 flex items-center gap-2 px-2 pt-1 pb-2">
            {!presetLock && !isVideoMode && replayValue === undefined && (
              <button
                type="button"
                title={t('addImage')}
                aria-label={t('addImage')}
                disabled={sendingImages || inputDisabled || images.length + pendingImages.length >= MAX_MESSAGE_IMAGES}
                onClick={() => {
                  if (!signedIn) { setImageError(''); setImageNeedsSignIn(true); return; }
                  fileRef.current?.click();
                }}
                className={`inline-flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent disabled:cursor-not-allowed disabled:opacity-50 ${
                  fileDragActive
                    ? 'bg-brand-accent text-on-accent'
                    : 'text-text-muted hover:bg-text-primary/10 hover:text-text-primary disabled:hover:bg-transparent disabled:hover:text-text-muted'
                }`}
              >
                <ImagePlus size={20} strokeWidth={1.8} aria-hidden="true" />
              </button>
            )}
            <div className={`relative flex min-w-0 flex-1 items-center ${showCaptureControl ? 'min-h-11' : ''}`}>
              {!captureActive && (
                <div className={`flex min-w-0 flex-1 items-center justify-between gap-2 ${showCaptureControl ? 'pr-11' : ''}`}>
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
                    ) : null}
                  </div>
                  {replayValue === undefined && !presetLock && (
                    <ThinkingLevelControl
                      disabled={inputDisabled}
                      shouldPreserveInputFocus={() => document.activeElement === textareaRef.current}
                    />
                  )}
                </div>
              )}
              {showCaptureControl && (
                <div ref={menuRef} className="chat-recording-pill absolute right-0 top-1/2 h-11 -translate-y-1/2" data-expanded={captureActive} data-capture-phase={capturePhase} data-chat-input-focus-ignore>
                  <div aria-hidden="true" className="chat-recording-pill-surface pointer-events-none absolute right-px top-1/2 h-[30px] -translate-y-1/2 rounded-full bg-conversation-surface" />
                  {captureActive && (
                    <div className="chat-recording-pill-content absolute inset-y-0 left-0 right-8 flex min-w-0 items-center gap-1 overflow-hidden pr-1">
                      {canCancelCapture && (
                        <button
                          ref={recordingCancelRef}
                          type="button"
                          onClick={activeHumming
                            ? (activeHumming.isRerecording ? activeHumming.cancelRerecord : activeHumming.cancelRecording)
                            : voiceSpeech.cancel}
                          aria-label={cancelCaptureLabel}
                          title={cancelCaptureLabel}
                          className="inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full text-text-primary"
                        >
                          <X size={RECORDING_ICON_SIZE} />
                        </button>
                      )}
                      <span
                        className={micRecording ? 'sr-only' : `truncate px-2 text-xs text-text-secondary ${
                          receivingRecording
                            ? 'absolute left-[30px] right-0 top-1/2 -translate-y-1/2 text-center'
                            : 'min-w-0 flex-1'
                        }`}
                        role="status"
                      >
                        {captureStatus}
                      </span>
                      {micRecording && (
                        <>
                          <RecordingDots stream={activeHumming ? activeHumming.recordingStream : voiceSpeech.streamRef.current} />
                          <span role="timer" className="shrink-0 text-xs tabular-nums text-text-secondary">
                            {formatRecordingTime(activeHumming?.recordingElapsedSeconds ?? voiceSpeech.elapsedSeconds)}
                          </span>
                        </>
                      )}
                    </div>
                  )}
                  <button
                    ref={recordingActionRef}
                    type="button"
                    aria-label={receivingRecording ? captureStatus : captureActive
                      ? t('hummingStop') : (zh ? '选择录音方式' : 'Choose recording mode')}
                    aria-expanded={captureActive ? undefined : recordingMenuOpen}
                    aria-haspopup={captureActive ? undefined : 'menu'}
                    disabled={captureActive ? !micRecording : isLoading || moodPending || humming?.isTranscribing}
                    onClick={captureActive
                      ? (activeHumming ? activeHumming.stopRecording : voiceSpeech.stop)
                      : () => setRecordingMenuOpen(open => !open)}
                    className="chat-recording-pill-action absolute right-0 top-1/2 grid h-11 w-8 -translate-y-1/2 place-items-center rounded-full"
                  >
                    <span aria-hidden="true" className="chat-recording-pill-mic absolute left-1/2 top-1/2">
                      <Mic size={17} />
                    </span>
                    <span aria-hidden="true" className="chat-recording-pill-chevron absolute right-0 top-1/2">
                      <ChevronUp size={13} />
                    </span>
                    <span aria-hidden="true" className="chat-recording-pill-stop col-start-1 row-start-1">
                      <StopIcon size={RECORDING_ICON_SIZE} />
                    </span>
                    <span aria-hidden="true" className="chat-recording-pill-progress col-start-1 row-start-1">
                      <LoaderCircle size={RECORDING_ICON_SIZE} className={receivingRecording ? 'animate-spin motion-reduce:animate-none' : undefined} />
                    </span>
                  </button>
                  {recordingMenuOpen && !captureActive && (voiceEnabled || hummingEnabled) && <div role="menu" className="absolute bottom-full right-0 z-30 mb-2 w-40 rounded-xl border border-border bg-conversation-surface p-1 shadow-lg">
                    <button type="button" role="menuitem"
                      className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-text-primary hover:bg-surface-hover disabled:opacity-50"
                      disabled={!voiceEnabled || inputDisabled || imageBusy} onClick={startVoiceInput}
                    ><Mic size={16} />{t('startVoiceInput')}</button>
                    {hummingEnabled && humming && <button type="button" role="menuitem" className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-text-primary hover:bg-surface-hover" disabled={!humming.canRecord} onClick={() => { setRecordingMenuOpen(false); humming.startRecording(); }}><Music2 size={16} />{zh ? '哼唱输入' : 'Humming input'}</button>}
                  </div>}
                </div>
              )}
            </div>
              {replayValue !== undefined ? (
                <button
                  type="button"
                  disabled={!replayValue.trim()}
                  className="inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-brand-accent text-on-accent transition duration-200 disabled:cursor-not-allowed disabled:opacity-50"
                  title={t('send')}
                >
                  <ArrowUpIcon size={18} />
                </button>
              ) : isLoading ? (
                <button
                  type="button"
                  onClick={onStop}
                  // A guided turn is preset and plays out on its own; it has no stopping.
                  disabled={guided}
                  className="inline-flex h-[30px] w-[30px] items-center justify-center rounded-full bg-brand-accent text-on-accent transition duration-200 hover:bg-brand-accent-hover disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-brand-accent"
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
                    (!text.trim() && !images.length && !humming?.draft)
                    || pendingSend !== null || imageBusy
                    || voiceSpeech.mode !== 'idle' || voiceSpeech.isStarting
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
                  className={`inline-flex items-center justify-center rounded-full bg-brand-accent text-on-accent transition duration-200 enabled:hover:bg-brand-accent-hover disabled:cursor-not-allowed size-[30px] disabled:opacity-50${
                    presetLock && isMobile ? " relative before:absolute before:-inset-[7px] before:content-['']" : ''
                  }`}
                  title={t('send')}
                  aria-label={t('send')}
                >
                  {captureMode === 'voice' ? <MessageCircleMore size={RECORDING_ICON_SIZE} aria-hidden="true" />
                    : captureMode === 'humming' ? <MicVocal size={RECORDING_ICON_SIZE} aria-hidden="true" />
                      : <ArrowUpIcon size={18} />}
                </button>
              )}
          </div>
        </div>
      </div>
    </form>
  );
}
