import { uploadImage, supportsImages, SIGN_IN_REQUIRED_MESSAGE, type ImageAttachment } from '../../lib/image-attachments';
import { getActiveModelConfig } from '../../services/llm-config';
import MessageImages from './MessageImages';
import { rememberUploadedImagePreview } from '../../lib/image-preview-memory';
import { MAX_MESSAGE_IMAGES } from '../../lib/image-types';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpIcon, StopIcon } from '../icons';
import { ImagePlus, LoaderCircle, X } from 'lucide-react';
import ThinkingLevelControl from './ThinkingLevelControl';
import { t } from '../../lib/i18n';
import { checkAirJellyAvailable } from '../../services/airjelly';
import type { AgentEntryPoint } from '../../lib/analytics';
import type { InputMode } from '../../hooks/useChat';
import { useIsMobile } from '../../hooks/useIsMobile';

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

type ChatEntryPoint = Extract<AgentEntryPoint, 'text' | 'suggestion'>;

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
  onSendText: (text: string, entryPoint: ChatEntryPoint, images?: ImageAttachment[]) => void | Promise<void>;
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
  /** Images upload to the account's storage, so a guest is asked to sign in first. */
  signedIn?: boolean;
  /** Opens the sign-in window from the "sign in to add images" notice. */
  onRequestSignIn?: () => void;
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
  prefillImages,
  focusTrigger,
  replayValue,
  isVideoMode = false,
  onFocusChange,
  inputMode = 'normal',
  suggestions,
  onMoodGenerate,
  presetLock,
  signedIn = true,
  onRequestSignIn,
}: ChatInputProps) {
  // Settings saves re-render the composer; read both values each time so the
  // image entry point follows provider and model changes immediately.
  const modelConfig = getActiveModelConfig();
  const canAddImages = supportsImages(modelConfig.provider, modelConfig.model);
  const [text, setText] = useState('');
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
  const [sendingImages, setSendingImages] = useState(false);
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
  const imageCountRef = useRef(0);
  const addImages = async (files: File[]) => {
    if (sendingImages || isLoading || presetLock || isVideoMode || !files.length) return;
    if (!signedIn) { setImageError(''); setImageNeedsSignIn(true); return; }
    const config = getActiveModelConfig();
    if (!supportsImages(config.provider, config.model)) { setImageError('当前模型不支持图片，请切换视觉模型'); return; }
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
    if ((!value && !images.length) || isLoading || moodPending || imageBusy) return;
    const entryPoint: ChatEntryPoint =
      adoptedSuggestionRef.current === value ? 'suggestion' : 'text';
    adoptedSuggestionRef.current = null;
    setText('');
    if (moodSuggestionActive && value === moodSuggestion) {
      setMoodPending(true);
      Promise.resolve(onMoodGenerate!()).finally(() => setMoodPending(false));
      return;
    }
    const sentImages = images;
    imageCountRef.current = 0;
    setImages([]);
    setLocalPreviews({});
    setSendingImages(true);
    void (async () => {
      try {
        await (sentImages.length ? onSendText(value, entryPoint, sentImages) : onSendText(value, entryPoint));
      } catch (error) {
        setText(value);
        setImages(sentImages);
        imageCountRef.current = sentImages.length;
        setImageError(String(error));
      } finally {
        setSendingImages(false);
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

  const inputDisabled = (isLoading || moodPending) && replayValue === undefined;
  // The waiting fade, applied per part (see the card below): everything that
  // is genuinely out of reach while the agent answers, and nothing else.
  const waitingDim = `transition-opacity duration-200 ${inputDisabled ? 'opacity-50' : ''}`;

  return (
    <form onSubmit={handleSubmit} onPaste={e => { const files = Array.from(e.clipboardData.files).filter(file => file.type.startsWith('image/')); if (files.length) { e.preventDefault(); void addImages(files); } }} onDragEnter={e => { if (!e.dataTransfer.types.includes('Files')) return; fileDragDepth.current += 1; setFileDragActive(true); }} onDragLeave={e => { if (!e.dataTransfer.types.includes('Files')) return; fileDragDepth.current = Math.max(0, fileDragDepth.current - 1); if (!fileDragDepth.current) setFileDragActive(false); }} onDragOver={e => { if (e.dataTransfer.types.includes('Files')) e.preventDefault(); }} onDrop={e => { endFileDrag(); if (e.dataTransfer.files.length) { e.preventDefault(); void addImages(Array.from(e.dataTransfer.files)); } }} onClick={handleCardClick} data-onboarding-target="composer" className="w-full" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>


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
            {imageNeedsSignIn && (
              <p role="alert" className="px-4 pb-2 text-xs leading-relaxed text-error">
                请{' '}{onRequestSignIn ? (
                  <button type="button" onClick={onRequestSignIn} className="cursor-pointer font-bold underline underline-offset-2 hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent">登录</button>
                ) : <span className="font-bold underline underline-offset-2">登录</span>}{' '}后添加图片
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

          {/* Footer row — hint/status on the left, send button on the right.
              Real layout, always visible regardless of textarea scroll state. */}
          <div className="flex items-center justify-between gap-2 pl-4 pr-2 pt-1 pb-2">
            <div className={`flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 ${waitingDim}`}>
              {imageBusy && <span role="status" className="sr-only">{t('processingImages')}</span>}
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
              {canAddImages && !presetLock && !isVideoMode && replayValue === undefined && (
                <button
                  type="button"
                  title={t('addImage')}
                  aria-label={t('addImage')}
                  disabled={sendingImages || inputDisabled || images.length + pendingImages.length >= MAX_MESSAGE_IMAGES}
                  onClick={() => {
                    if (!signedIn) { setImageError(''); setImageNeedsSignIn(true); return; }
                    fileRef.current?.click();
                  }}
                  className={`mr-1.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent disabled:cursor-not-allowed disabled:opacity-50 ${
                    fileDragActive
                      ? 'bg-brand-accent text-on-accent'
                      : 'text-text-muted hover:bg-text-primary/10 hover:text-text-primary disabled:hover:bg-transparent disabled:hover:text-text-muted'
                  }`}
                >
                  <ImagePlus size={20} strokeWidth={1.8} aria-hidden="true" />
                </button>
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
                  disabled={presetLock ? presetLock.busy : imageBusy || (!text.trim() && !images.length)}
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
