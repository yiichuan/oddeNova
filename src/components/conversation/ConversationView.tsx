import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import type { ChatMessage } from '../../hooks/useChat';
import type { CodeRevision } from '../../hooks/useSessions';
import { useIsMobile } from '../../hooks/useIsMobile';
import { Undo2 } from 'lucide-react';
import { CheckIcon, ChevronRightIcon, CopyIcon, GitBranchIcon, RetryIcon } from '../icons';
import { ThinkingLottie } from './ThinkingLottie';
import { t, zh } from '../../lib/i18n';
import { CodeDiffView } from './CodeDiffView';

type MobileNoSelectStyle = CSSProperties & {
  WebkitTouchCallout?: 'none';
};

type MarkdownTone = 'default' | 'muted';

const mobileRollbackBubbleStyle: MobileNoSelectStyle = {
  userSelect: 'none',
  WebkitUserSelect: 'none',
  WebkitTouchCallout: 'none',
};

const inlineCodeToneClass: Record<MarkdownTone, string> = {
  default: 'text-text-secondary',
  muted: 'text-text-secondary/80',
};

const blockCodeToneClass: Record<MarkdownTone, string> = {
  default: 'text-[#B9D7FF]',
  muted: 'text-text-secondary/75',
};

// Muted headings add no color class so they inherit the surrounding gray.
const headingToneClass: Record<MarkdownTone, string> = {
  default: 'text-text-primary',
  muted: '',
};

// Thinking duration: "45s" under a minute, "2m 5s" above; whole minutes drop
// the seconds ("5m" not "5m 0s").
function formatThinkDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, '')          // headings
    .replace(/\*\*(.+?)\*\*/g, '$1')    // bold
    .replace(/\*(.+?)\*/g, '$1')        // italic
    .replace(/__(.+?)__/g, '$1')        // bold (underscore)
    .replace(/_(.+?)_/g, '$1')          // italic (underscore)
    .replace(/`{1,3}[^`]*`{1,3}/g, (m) => m.replace(/`/g, '').trim()) // code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/^[-*+]\s+/gm, '')         // unordered lists
    .replace(/^\d+\.\s+/gm, '')         // ordered lists
    .replace(/^>\s+/gm, '')             // blockquotes
    .replace(/~~(.+?)~~/g, '$1')        // strikethrough
    .trim();
}

function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.href);
    return ['http:', 'https:', 'mailto:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function parseInlineMarkdown(text: string, keyPrefix: string, tone: MarkdownTone = 'default'): ReactNode[] {
  const nodes: ReactNode[] = [];
  let i = 0;
  let key = 0;

  const pushText = (value: string) => {
    if (value) nodes.push(value);
  };

  while (i < text.length) {
    const codeStart = text.indexOf('`', i);
    const boldStarStart = text.indexOf('**', i);
    const boldUnderscoreStart = text.indexOf('__', i);
    const italicStarStart = text.indexOf('*', i);
    const italicUnderscoreStart = text.indexOf('_', i);
    const linkStart = text.indexOf('[', i);

    const candidates = [
      codeStart,
      boldStarStart,
      boldUnderscoreStart,
      italicStarStart,
      italicUnderscoreStart,
      linkStart,
    ].filter((idx) => idx >= 0);

    const next = candidates.length > 0 ? Math.min(...candidates) : -1;
    if (next === -1) {
      pushText(text.slice(i));
      break;
    }

    pushText(text.slice(i, next));

    if (next === codeStart) {
      const end = text.indexOf('`', next + 1);
      if (end === -1) {
        pushText(text.slice(next));
        break;
      }
      nodes.push(
        <code key={`${keyPrefix}-code-${key++}`} className={`rounded bg-white/10 px-1 py-0.5 font-mono text-[0.92em] [overflow-wrap:anywhere] ${inlineCodeToneClass[tone]}`}>
          {text.slice(next + 1, end)}
        </code>,
      );
      i = end + 1;
      continue;
    }

    if (next === linkStart) {
      const labelEnd = text.indexOf(']', next + 1);
      const hrefStart = labelEnd >= 0 ? text.indexOf('(', labelEnd + 1) : -1;
      const hrefEnd = hrefStart >= 0 ? text.indexOf(')', hrefStart + 1) : -1;
      if (labelEnd === -1 || hrefStart !== labelEnd + 1 || hrefEnd === -1) {
        pushText(text[next]);
        i = next + 1;
        continue;
      }
      const label = text.slice(next + 1, labelEnd);
      const href = text.slice(hrefStart + 1, hrefEnd).trim();
      if (!isSafeUrl(href)) {
        pushText(label);
      } else {
        nodes.push(
          <a
            key={`${keyPrefix}-link-${key++}`}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-diff-accent underline decoration-diff-accent/40 underline-offset-2 hover:decoration-diff-accent"
          >
            {parseInlineMarkdown(label, `${keyPrefix}-link-${key}`, tone)}
          </a>,
        );
      }
      i = hrefEnd + 1;
      continue;
    }

    const marker = text.startsWith('**', next) || text.startsWith('__', next)
      ? text.slice(next, next + 2)
      : text[next];
    const end = text.indexOf(marker, next + marker.length);
    if (end === -1) {
      pushText(marker);
      i = next + marker.length;
      continue;
    }

    const inner = text.slice(next + marker.length, end);
    if (marker === '**' || marker === '__') {
      nodes.push(
        <strong key={`${keyPrefix}-strong-${key++}`} className="font-semibold">
          {parseInlineMarkdown(inner, `${keyPrefix}-strong-${key}`, tone)}
        </strong>,
      );
    } else {
      nodes.push(
        <em key={`${keyPrefix}-em-${key++}`} className="italic">
          {parseInlineMarkdown(inner, `${keyPrefix}-em-${key}`, tone)}
        </em>,
      );
    }
    i = end + marker.length;
  }

  return nodes;
}

// ChatInput.doSubmit() always .trim()s before a user message is stored, so a
// stored user message's content can never legitimately start or end with a
// newline. Confirmed live (checked the actual DOM text of a reported bubble):
// the stored content has zero embedded `\n`, yet a native double-click +
// Ctrl+C from the rendered bubble still pastes with trailing blank lines —
// browsers serialize a copied Selection to plain text by walking block-level
// element boundaries, not by reading the text node verbatim, and add a
// trailing break past the end of the last block. Strip only leading/trailing
// newline runs (never interior ones — a Shift+Enter multi-line message must
// still copy with its real line breaks intact).
function handleUserBubbleCopy(e: ClipboardEvent<HTMLElement>) {
  const selected = window.getSelection()?.toString();
  if (!selected) return;
  const trimmed = selected.replace(/^\n+/, '').replace(/\n+$/, '');
  if (trimmed === selected) return;
  e.preventDefault();
  e.clipboardData.setData('text/plain', trimmed);
}

function MarkdownText({ content, tone = 'default' }: { content: string; tone?: MarkdownTone }) {
  const lines = content.split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  const isBlockStart = (value: string) => (
    /^```/.test(value.trim()) ||
    /^\s{0,3}#{1,6}\s+/.test(value) ||
    /^\s*([-*+])\s+/.test(value) ||
    /^\s*\d+\.\s+/.test(value) ||
    /^\s*>\s?/.test(value) ||
    /^\s{0,3}([-*_])\s*(?:\1\s*){2,}$/.test(value)
  );

  const collectParagraph = () => {
    const paragraph: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !isBlockStart(lines[i])
    ) {
      paragraph.push(lines[i]);
      i += 1;
    }
    return paragraph.join('\n');
  };

  const nextNonBlankLineIndex = (start: number) => {
    let next = start;
    while (next < lines.length && lines[next].trim() === '') {
      next += 1;
    }
    return next;
  };

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '') {
      i += 1;
      continue;
    }

    if (trimmed.startsWith('```')) {
      const code: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        code.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) i += 1;
      blocks.push(
        <pre key={`md-code-${key++}`} className={`my-2 overflow-x-auto rounded-md bg-white/5 p-2 font-mono text-[11px] leading-relaxed ${blockCodeToneClass[tone]}`}>
          <code>{code.join('\n')}</code>
        </pre>,
      );
      continue;
    }

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+)$/);
    if (heading) {
      blocks.push(
        <div key={`md-heading-${key++}`} className={`mt-1 font-semibold ${headingToneClass[tone]}`.trim()}>
          {parseInlineMarkdown(heading[2], `md-heading-${key}`, tone)}
        </div>,
      );
      i += 1;
      continue;
    }

    if (/^\s{0,3}([-*_])\s*(?:\1\s*){2,}$/.test(line)) {
      blocks.push(<hr key={`md-hr-${key++}`} className="my-3 border-0 border-t border-white/10" />);
      i += 1;
      continue;
    }

    const unordered = line.match(/^\s*([-*+])\s+(.+)$/);
    if (unordered) {
      const items: string[] = [];
      while (i < lines.length) {
        const item = lines[i].match(/^\s*([-*+])\s+(.+)$/);
        if (!item) break;
        const parts = [item[2]];
        i += 1;
        while (
          i < lines.length &&
          lines[i].trim() !== '' &&
          !isBlockStart(lines[i])
        ) {
          parts.push(lines[i].trim());
          i += 1;
        }
        items.push(parts.join('\n'));
        if (i < lines.length && lines[i].trim() === '') {
          const next = nextNonBlankLineIndex(i);
          if (next < lines.length && /^\s*([-*+])\s+(.+)$/.test(lines[next])) {
            i = next;
          }
        }
      }
      blocks.push(
        <ul key={`md-ul-${key++}`} className="my-1 list-disc space-y-0.5 pl-4">
          {items.map((item, idx) => (
            <li key={`md-ul-${key}-${idx}`} className="whitespace-pre-wrap break-words">
              {parseInlineMarkdown(item, `md-ul-${key}-${idx}`, tone)}
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    if (ordered) {
      const items: string[] = [];
      while (i < lines.length) {
        const item = lines[i].match(/^\s*\d+\.\s+(.+)$/);
        if (!item) break;
        const parts = [item[1]];
        i += 1;
        while (
          i < lines.length &&
          lines[i].trim() !== '' &&
          !isBlockStart(lines[i])
        ) {
          parts.push(lines[i].trim());
          i += 1;
        }
        items.push(parts.join('\n'));
        if (i < lines.length && lines[i].trim() === '') {
          const next = nextNonBlankLineIndex(i);
          if (next < lines.length && /^\s*\d+\.\s+(.+)$/.test(lines[next])) {
            i = next;
          }
        }
      }
      blocks.push(
        <ol key={`md-ol-${key++}`} className="my-1 list-decimal space-y-0.5 pl-4">
          {items.map((item, idx) => (
            <li key={`md-ol-${key}-${idx}`} className="whitespace-pre-wrap break-words">
              {parseInlineMarkdown(item, `md-ol-${key}-${idx}`, tone)}
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    const quote = line.match(/^\s*>\s?(.+)$/);
    if (quote) {
      const quoted: string[] = [];
      while (i < lines.length) {
        const current = lines[i].match(/^\s*>\s?(.*)$/);
        if (!current) break;
        quoted.push(current[1]);
        i += 1;
      }
      blocks.push(
        <blockquote key={`md-quote-${key++}`} className="my-1 whitespace-pre-wrap break-words border-l border-diff-accent/30 pl-3 text-text-secondary">
          {parseInlineMarkdown(quoted.join('\n'), `md-quote-${key}`, tone)}
        </blockquote>,
      );
      continue;
    }

    const paragraphStart = i;
    const paragraph = collectParagraph();
    if (i === paragraphStart) {
      // Streaming markdown can pause on an unfinished block marker like "> " or "- ".
      // Treat it as plain text so the renderer always makes progress.
      const fallbackKey = key++;
      blocks.push(
        <p key={`md-p-${fallbackKey}`} className="whitespace-pre-wrap break-words">
          {parseInlineMarkdown(line, `md-p-${fallbackKey}`, tone)}
        </p>,
      );
      i += 1;
      continue;
    }
    blocks.push(
      <p key={`md-p-${key++}`} className="whitespace-pre-wrap break-words">
        {parseInlineMarkdown(paragraph, `md-p-${key}`, tone)}
      </p>,
    );
  }

  return (
    <div
      data-markdown-text
      className="min-w-0 max-w-full space-y-2 break-words [overflow-wrap:anywhere]"
    >
      {blocks}
    </div>
  );
}

// User message text with a "show more / less" affordance. Long messages are
// clamped to five lines with the fifth faded into the bubble background; the
// "show more" control reveals on hover (and stays visible on touch, which has
// no hover), and once expanded a "show less" control collapses it again.
function UserMessageBubble({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const textRef = useRef<HTMLParagraphElement>(null);

  // Measure overflow while the <p> is clamped (line-clamp-5 is applied for the
  // whole collapsed state, a no-op for short text), so scrollHeight exceeding
  // the clamped clientHeight means there's a 6th+ line hidden. useLayoutEffect
  // + a synchronous state update means the clamp/fade are already correct on
  // first paint — no flash of the full text. Re-measures on width changes via
  // ResizeObserver. Skipped while expanded (the box is unclamped then, so the
  // check can't run); the last collapsed measurement stays valid.
  useLayoutEffect(() => {
    if (expanded) return;
    const el = textRef.current;
    if (!el) return;
    const measure = () => setOverflowing(el.scrollHeight - el.clientHeight > 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [content, expanded]);

  const clamped = !expanded && overflowing;

  return (
    <>
      {/* When clamped, extend the bubble's bottom (pb-5) so the fade region has
          extra room below the fifth line and the "show more" control can sit
          lower, clear of the text. Adjust this pb-* to grow/shrink that gap. */}
      <div className={`relative${clamped ? ' pb-6' : ''}`}>
        <p
          ref={textRef}
          className={`whitespace-pre-wrap break-words${expanded ? '' : ' line-clamp-5'}`}
        >
          {content}
        </p>
        {clamped && (
          <>
            {/* Taller fade of the fifth line + the added space into the bubble
                background (#1a1a1a). */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-[#1a1a1a] via-[#1a1a1a]/80 to-transparent" />
            {/* Sits low over the fade, always visible. Gray a shade dimmer
                than the bubble text (text-primary). */}
            <button
              onClick={() => setExpanded(true)}
              className="absolute inset-x-0 bottom-0 flex justify-start pb-0 text-[11px] font-medium text-text-muted transition-colors hover:text-text-secondary"
            >
              {t('showMore')}
            </button>
          </>
        )}
      </div>
      {expanded && overflowing && (
        <button
          onClick={() => setExpanded(false)}
          className="mt-1 flex w-full justify-start text-[11px] font-medium text-text-muted transition-colors hover:text-text-secondary"
        >
          {t('showLess')}
        </button>
      )}
    </>
  );
}

interface ConversationViewProps {
  messages: ChatMessage[];
  revisions?: CodeRevision[];
  isLoading: boolean;
  isVideoMode?: boolean;
  scrollBottom?: boolean;
  onRollback: (messageId: string) => void;
  onBranch: (messageId: string) => void;
  onRetry: (messageId: string) => void;
}

export default function ConversationView({
  messages,
  revisions,
  isLoading,
  isVideoMode = false,
  scrollBottom = false,
  onRollback,
  onBranch,
  onRetry,
}: ConversationViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolledRef = useRef(false);
  const prevIsLoadingRef = useRef(false);
  // Once the first turn starts (in this component's lifetime — it remounts
  // per session, see the `key` in App.tsx), stays true so the top-anchor and
  // the turn filler survive a turn ending — whether by completion or
  // interrupt — without falling back to pinning the bottom. Stays false for a
  // freshly opened past session (no turn has run yet here), so it opens
  // pinned to the bottom of its actual last message instead of reserving
  // filler space below it. State, not a ref: it also gates the filler's
  // inline style, so it must trigger a render.
  const [turnAnchorActive, setTurnAnchorActive] = useState(false);
  // Flips turnAnchorActive the same render isLoading first turns true — the
  // "adjust state during rendering" pattern (see React docs: storing
  // information from previous renders), not a setState inside an effect, so
  // the filler/anchor are already correct on the very commit that starts the
  // turn instead of lagging a frame behind. Uses state (not a ref) to track
  // the previous value: refs may not be read during render.
  const [prevIsLoadingSnapshot, setPrevIsLoadingSnapshot] = useState(isLoading);
  if (isLoading !== prevIsLoadingSnapshot) {
    setPrevIsLoadingSnapshot(isLoading);
    if (isLoading && !turnAnchorActive) setTurnAnchorActive(true);
  }
  // In-flight programmatic smooth scroll (turn-start anchoring): its target
  // and a deadline after which it's considered interrupted/finished.
  const autoScrollRef = useRef<{ target: number; until: number } | null>(null);
  // The scroll position the layout effect last anchored to — the top of the
  // current turn's user bubble in turn-anchor mode, or the bottom pin
  // otherwise. Manual-scroll detection measures deviation from THIS, not from
  // the bottom: with a user bubble taller than the viewport, the anchor sits
  // near the top while the streaming reasoning window sits below the fold, so
  // scrolling down to read it moves the view *toward* the bottom — a
  // bottom-distance test would read that as "still following" and the next
  // streamed delta would yank the bubble back to the top. null before the
  // first layout pass and in video mode (falls back to the bottom-distance
  // test).
  const anchorTargetRef = useRef<number | null>(null);
  const reasoningScrollRef = useRef<HTMLDivElement>(null);
  const reasoningUserScrolledRef = useRef(false);
  const [expandedCode, setExpandedCode] = useState<Set<string>>(new Set());
  const [expandedReasoning, setExpandedReasoning] = useState<Set<string>>(new Set());
  const [expandedActions, setExpandedActions] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // User-collapsed state of the live streaming reasoning window.
  const [reasoningCollapsed, setReasoningCollapsed] = useState(false);
  const isMobile = useIsMobile();
  // On mobile, long-pressing a message reveals the rollback button (no real hover state on touch screens)
  const [longPressedId, setLongPressedId] = useState<string | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lastUserMsgId = useMemo(
    () => messages.findLast((m) => m.role === 'user')?.id,
    [messages],
  );
  // The greeting bubble only ever occupies a fresh session (one message, the
  // greeting itself) — once a real turn has happened it stays out of the
  // scrollback entirely rather than sitting inline as a normal reply.
  const greetingMsg = messages.find((m) => m.isGreeting);
  const hasConversationMessages = messages.some((m) => !m.isGreeting);
  const revisionsById = useMemo(
    () => new Map((revisions ?? []).map((revision) => [revision.id, revision])),
    [revisions],
  );

  // Detect manual user scroll: stop auto-following when more than 80px from
  // the bottom, resume when scrolled back. Scroll events produced by our own
  // smooth turn-start animation must not count as manual — its intermediate
  // frames are >80px from the bottom and would cut the animation short — so
  // while a programmatic scroll is in flight, only a real user gesture
  // (wheel/touch) cancels it.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      const auto = autoScrollRef.current;
      if (auto) {
        if (Math.abs(el.scrollTop - auto.target) < 2) {
          autoScrollRef.current = null; // animation arrived; don't mark manual
          return;
        }
        if (performance.now() < auto.until) return;
        autoScrollRef.current = null; // stale flight (interrupted); fall through
      }
      const anchorTarget = anchorTargetRef.current;
      if (anchorTarget != null) {
        // Turn-anchor mode: the view is pinned near the top (bubble anchored),
        // so a real takeover is moving away from that anchor in *either*
        // direction — most importantly, scrolling down past it to reach the
        // reasoning window below the fold. A bottom-distance test misfires here.
        userScrolledRef.current = Math.abs(el.scrollTop - anchorTarget) > 80;
      } else {
        const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        userScrolledRef.current = distFromBottom > 80;
      }
    };
    const handleUserScrollIntent = () => {
      if (autoScrollRef.current) {
        autoScrollRef.current = null;
        userScrolledRef.current = true;
      }
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    el.addEventListener('wheel', handleUserScrollIntent, { passive: true });
    el.addEventListener('touchmove', handleUserScrollIntent, { passive: true });
    return () => {
      el.removeEventListener('scroll', handleScroll);
      el.removeEventListener('wheel', handleUserScrollIntent);
      el.removeEventListener('touchmove', handleUserScrollIntent);
    };
  }, []);

  const toggleCode = (id: string) => {
    setExpandedCode((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleReasoning = (id: string) => {
    setExpandedReasoning((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleActions = (id: string) => {
    setExpandedActions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const cancelLongPress = () => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };
  const startLongPress = (id: string) => {
    cancelLongPress();
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      setLongPressedId(id);
    }, 500);
  };
  const getMobileRollbackBubbleProps = (id: string): HTMLAttributes<HTMLDivElement> => (
    isMobile
      ? {
        onTouchStart: () => {
          window.getSelection()?.removeAllRanges();
          startLongPress(id);
        },
        onTouchEnd: cancelLongPress,
        onTouchMove: cancelLongPress,
        onContextMenu: (e) => e.preventDefault(),
        onSelect: (e) => {
          e.preventDefault();
          window.getSelection()?.removeAllRanges();
        },
        style: mobileRollbackBubbleStyle,
      }
      : {}
  );

  useEffect(() => () => {
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
    }
  }, []);

  // After long-press reveals the rollback button, tapping outside the bubble dismisses it
  useEffect(() => {
    if (!isMobile || !longPressedId) return;
    const container = scrollRef.current;
    if (!container) return;
    const handler = (e: TouchEvent) => {
      const bubble = (e.target as HTMLElement).closest('[data-rollback-bubble]') as HTMLElement | null;
      if (!bubble || bubble.dataset.rollbackBubble !== longPressedId) {
        setLongPressedId(null);
      }
    };
    container.addEventListener('touchstart', handler);
    return () => container.removeEventListener('touchstart', handler);
  }, [isMobile, longPressedId]);

  // Scroll management. useLayoutEffect (not useEffect): the scroll position is
  // set before the browser paints, so the user never sees an unadjusted frame
  // (no flicker). Once a turn starts, the view anchors that turn's user bubble
  // to the top of the viewport via its layout offset (the turn filler
  // guarantees enough room below from the very first commit) and keeps
  // anchoring there — through streaming, through the turn ending normally, and
  // through interrupts — so stopping/retrying never re-pins to the bottom and
  // yanks the bubble to a different position. Turn start animates there
  // smoothly — one continuous, natural glide; every commit after that keeps
  // the position without motion. Before the first turn (e.g. a freshly opened
  // past session) it falls back to pinning the bottom.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const turnJustStarted = isLoading && !prevIsLoadingRef.current;
    prevIsLoadingRef.current = isLoading;
    if (isVideoMode && !scrollBottom) {
      // [video] Video mode: display from the top; only scroll to bottom when scrollBottom=true
      el.scrollTop = 0;
      anchorTargetRef.current = null;
    } else {
      // Turn start overrides any manual scroll (the user just acted on this turn).
      if (turnJustStarted) userScrolledRef.current = false;
      if (!userScrolledRef.current) {
        const bottomPin = el.scrollHeight - el.clientHeight;
        let target = bottomPin;
        if (turnAnchorActive && lastUserMsgId) {
          const bubble = el.querySelector<HTMLElement>(
            `[data-rollback-bubble="${CSS.escape(lastUserMsgId)}"]`,
          );
          if (bubble) {
            // Walk the offsetParent chain up to the scroll container: a plain
            // bubble.offsetTop is unreliable because the fade-in-up animation's
            // transform makes the freshly mounted row itself the offsetParent.
            // offsetTop is pure layout geometry, so the summed chain is immune
            // to in-flight transforms.
            let top = 0;
            let node: HTMLElement | null = bubble;
            while (node && node !== el) {
              top += node.offsetTop;
              node = node.offsetParent as HTMLElement | null;
            }
            if (node === el) target = Math.min(bottomPin, top - 10);
          }
        }
        // Reveal the live reasoning window. A user bubble taller than the
        // viewport pushes the streaming reasoning box below the fold at the
        // top-anchor position above, so it would never be seen. Measure the
        // box's own bottom (it's mounted only while reasoning streams) and, if
        // it sits below the visible area, scroll down just enough to bring
        // that bottom — the last streamed line, which the box's own internal
        // scroll tracks — into view. Only ever scrolls further down than the
        // top anchor (revealTarget > target), so short bubbles that already
        // show the box keep it pinned at the top, untouched.
        const preEl = reasoningScrollRef.current;
        if (preEl) {
          let rBottom = preEl.offsetHeight;
          let walk: HTMLElement | null = preEl;
          while (walk && walk !== el) {
            rBottom += walk.offsetTop;
            walk = walk.offsetParent as HTMLElement | null;
          }
          if (walk === el) {
            const revealTarget = rBottom - el.clientHeight + 16;
            if (revealTarget > target) target = Math.min(bottomPin, revealTarget);
          }
        }
        target = Math.max(0, target);
        // Record where we're anchoring so manual-scroll detection can measure
        // deviation from it (see handleScroll / anchorTargetRef).
        anchorTargetRef.current = target;
        const auto = autoScrollRef.current;
        if (turnJustStarted) {
          autoScrollRef.current = { target, until: performance.now() + 800 };
          el.scrollTo({ top: target, behavior: 'smooth' });
        } else if (auto && performance.now() < auto.until) {
          // Smooth flight in progress: retarget only if layout shifted.
          if (Math.abs(auto.target - target) > 1) {
            auto.target = target;
            el.scrollTo({ top: target, behavior: 'smooth' });
          }
        } else if (Math.abs(el.scrollTop - target) > 8) {
          // Target moved without a fresh turn — the reasoning window just
          // appeared (or vanished) and the anchor needs to shift. Glide there
          // smoothly, marking the flight so the scroll handler doesn't read
          // its intermediate frames as a manual takeover.
          autoScrollRef.current = { target, until: performance.now() + 800 };
          el.scrollTo({ top: target, behavior: 'smooth' });
        } else {
          // Already in place (the common per-delta case): set exactly, no motion.
          autoScrollRef.current = null;
          el.scrollTop = target;
        }
      }
      // Auto-scroll the reasoning <pre> to the bottom (follow content during streaming output)
      const preEl = reasoningScrollRef.current;
      if (preEl && !reasoningUserScrolledRef.current) {
        preEl.scrollTop = preEl.scrollHeight;
      }
      // Reset the user-scrolled flag for the reasoning area when isLoading ends
      if (!isLoading) {
        reasoningUserScrolledRef.current = false;
      }
    }
  }, [messages, isLoading, isVideoMode, scrollBottom, lastUserMsgId, turnAnchorActive]);

  // Pre-process: attach each reasoning progress message to the next assistant message.
  const { absorbedReasoningIds } = useMemo(() => {
    const absorbedReasoningIds = new Set<string>();
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (m.role === 'progress' && m.progressKind === 'reasoning') {
        for (let j = i + 1; j < messages.length; j++) {
          if (messages[j].role === 'assistant') {
            absorbedReasoningIds.add(m.id);
            break;
          }
        }
      }
    }
    return { absorbedReasoningIds };
  }, [messages]);

  // Retry/branch are turn-level actions: they resend (or fork from) the user
  // message that opened the turn. A single turn can produce several assistant
  // bubbles — e.g. the model narrates mid-loop, then commits a final answer, and
  // interleaved progress messages keep the two texts from merging. Render the
  // actions once per turn, on the last assistant message before the next user
  // message, so they don't appear on intermediate narration.
  const turnFinalAssistantIds = useMemo(() => {
    const ids = new Set<string>();
    for (let i = 0; i < messages.length; i++) {
      if (messages[i].role !== 'assistant') continue;
      let isFinal = true;
      for (let j = i + 1; j < messages.length; j++) {
        if (messages[j].role === 'user') break;
        if (messages[j].role === 'assistant') { isFinal = false; break; }
      }
      if (isFinal) ids.add(messages[i].id);
    }
    return ids;
  }, [messages]);

  const loadingTurnAssistantIds = useMemo(() => {
    const ids = new Set<string>();
    if (!isLoading) return ids;

    const lastUserIndex = messages.findLastIndex((m) => m.role === 'user');
    if (lastUserIndex === -1) return ids;

    for (const msg of messages.slice(lastUserIndex + 1)) {
      if (msg.role === 'assistant') ids.add(msg.id);
    }
    return ids;
  }, [messages, isLoading]);

  // Which reasoning messages belong to the composition ("编曲") phase: those
  // whose next tool call is `setCode` (writing/replacing the Strudel script).
  // These are kept as a collapsed window in the stream after thinking ends;
  // reasoning from other phases (validate/commit/read-score) disappears.
  const { arrangeReasoningIds, reasoningDurationSec } = useMemo(() => {
    const ids = new Set<string>();
    // Thinking duration per reasoning message = time until the next message (the
    // reasoning message's timestamp is when its first token streamed in; the next
    // message is created once reasoning ends and the next phase begins).
    const durationSec = new Map<string, number>();
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (m.role !== 'progress' || m.progressKind !== 'reasoning') continue;
      if (i + 1 < messages.length) {
        durationSec.set(m.id, Math.max(1, Math.round((messages[i + 1].timestamp - m.timestamp) / 1000)));
      }
      for (let j = i + 1; j < messages.length; j++) {
        const n = messages[j];
        if (n.role === 'progress' && n.progressKind === 'tool_call') {
          if (n.toolName === 'setCode') ids.add(m.id);
          break;
        }
      }
    }
    return { arrangeReasoningIds: ids, reasoningDurationSec: durationSec };
  }, [messages]);

  // A "thinking" narration message immediately following a reasoning message
  // renders right away, but the reasoning message itself only starts
  // rendering (as the collapsed "构思" window above) once a tool_call has
  // appeared after it — arrangeReasoningIds can't know whether to show it
  // until then. Left alone, that means the narration visibly appears first
  // and "构思" pops in above it afterward. Hold the narration back too until
  // its preceding reasoning is resolved, so whichever of them ends up
  // visible always appears together, in the right order. Excludes the last
  // message: while the narration is still the newest one, it's actively
  // streaming deltas and must keep rendering live like before — there's
  // nothing yet to know whether it "jumped ahead" of, since no tool_call can
  // exist after the newest message anyway. Only once something else is
  // appended after it (streaming has actually finished) does the hold apply.
  // Only while the turn is still loading, too: if it ends (e.g. aborted)
  // before a tool_call ever follows the reasoning, `resolved` would never
  // become true and the narration would stay hidden forever — once the turn
  // is over there's nothing left to wait for, so just show it.
  const pendingThinkingIds = useMemo(() => {
    const ids = new Set<string>();
    if (!isLoading) return ids;
    for (let i = 1; i < messages.length - 1; i++) {
      const m = messages[i];
      if (m.role !== 'progress' || m.progressKind !== 'thinking') continue;
      const prev = messages[i - 1];
      if (prev.role !== 'progress' || prev.progressKind !== 'reasoning') continue;
      const resolved = messages
        .slice(i + 1)
        .some((n) => n.role === 'progress' && n.progressKind === 'tool_call');
      if (!resolved) ids.add(m.id);
    }
    return ids;
  }, [messages, isLoading]);

  // Group each completed turn's intermediate progress (thinking / reasoning /
  // warnings) that precedes the final assistant summary into a collapsible
  // "行动过程" section. A run of progress messages qualifies only if it is
  // followed by an assistant message (the turn is done) and has visibly
  // rendered content. actionGroupOf maps a progress message id → the group id
  // (the run's first message id); a message is the group header when its id
  // equals its group id.
  const { actionGroupOf, actionGroupDurationSec } = useMemo(() => {
    const isVisible = (m: ChatMessage) =>
      m.progressKind === 'thinking' ||
      m.progressKind === 'warn' ||
      (m.progressKind === 'reasoning' && arrangeReasoningIds.has(m.id));
    const groupOf = new Map<string, string>();
    // Processing time per group = from the first progress message to the
    // assistant summary that ends the turn.
    const durationSec = new Map<string, number>();
    for (let i = 0; i < messages.length; ) {
      if (messages[i].role !== 'progress') { i++; continue; }
      let j = i;
      const run: ChatMessage[] = [];
      while (j < messages.length && messages[j].role === 'progress') run.push(messages[j++]);
      const followedByAssistant = j < messages.length && messages[j].role === 'assistant';
      if (followedByAssistant && run.some(isVisible)) {
        const gid = run[0].id;
        for (const r of run) groupOf.set(r.id, gid);
        durationSec.set(gid, Math.max(1, Math.round((messages[j].timestamp - run[0].timestamp) / 1000)));
      }
      i = j;
    }
    return { actionGroupOf: groupOf, actionGroupDurationSec: durationSec };
  }, [messages, arrangeReasoningIds]);

  // The reasoning currently being streamed (not yet absorbed by an assistant message).
  // Use findLast to get the most recent one, preventing the previous round's reasoning from being
  // cut off by a tool_call message across multiple iterations and causing reasoningPhaseActive to malfunction.
  const streamingReasoningMsg = useMemo(
    () => messages.findLast(
      (m) => m.role === 'progress' && m.progressKind === 'reasoning' && !absorbedReasoningIds.has(m.id),
    ),
    [messages, absorbedReasoningIds],
  );

  // Determine whether the reasoning phase is still in progress: if there are non-reasoning messages
  // after the reasoning message (e.g. streaming text output), thinking is complete and
  // the reasoning content should no longer be displayed expanded.
  const streamingReasoningIdx = streamingReasoningMsg
    ? messages.findIndex((m) => m.id === streamingReasoningMsg.id)
    : -1;
  const reasoningPhaseActive =
    streamingReasoningMsg !== undefined &&
    messages
      .slice(streamingReasoningIdx + 1)
      .every((m) => m.role === 'progress' && m.progressKind === 'reasoning');

  // Turn filler: the in-flight loading block and the final assistant message
  // of the latest turn are stretched to (at least) the visible conversation
  // height, so the current user bubble can always anchor at the top of the
  // viewport and every swap during a turn (truncate on retry → loading
  // indicator → final reply) is height-neutral: nothing jumps. Both blocks
  // must reach the same OUTER height (margin included) for that to hold.
  // Expressed in cqh (see .conversation-scroll) instead of a JS-measured
  // height: the container resizes in the same commit a turn starts (the
  // suggestion chips row hides), and a one-frame-stale measurement here left
  // the filler short — visible as a two-step scroll with flicker.
  // 68 = stack gaps (22×2) + bottom spacer (24); cqh is content-box based, so
  // container paddings are already excluded. The assistant block additionally
  // subtracts its mb-16 (64px, room for its hanging action buttons).
  // The assistant block's filler only applies once turnAnchorActive (a turn
  // has actually run in this mount) — a freshly opened past session has no
  // in-progress turn to stay height-neutral for, and reserving this much
  // space below its last message would just leave a dead gap and pin the
  // scroll below the visible content instead of at it.
  //
  // The loading block uses a hard `height` (turnFillerHeight), not a
  // `minHeight`: it's a flex column, and its reasoning box is `flex-1` so it
  // fills exactly the remaining room and scrolls its own overflow. flex-grow
  // only has "extra" space to hand out when the container's own height is
  // definite — with a mere minHeight, the container would just keep growing
  // to fit the reasoning text (unbounded, no internal scroll, so it can
  // never actually catch up to new lines and any manual scroll inside it
  // gets fought on the next render). A fixed height sidesteps that: the
  // reasoning box is properly clipped and owns its own auto-scroll-to-bottom
  // and manual-scroll tracking, same as it always was meant to.
  const turnFillerHeight = 'calc(100cqh - 68px)';
  const assistantFillerMinHeight = 'calc(100cqh - 132px)';

  const lastMessageId = messages[messages.length - 1]?.id;

  // Whether the live streaming reasoning window has content to show right now.
  const reasoningWindowAvailable =
    isLoading && !!streamingReasoningMsg?.content && reasoningPhaseActive;
  const reasoningWindowExpanded = reasoningWindowAvailable && !reasoningCollapsed;

  // Live status shown in the loading indicator. Tool-call / commit labels
  // ("编排段落…", "准备播放…") aren't kept in the scrollback (they return null
  // above); instead the latest one surfaces here transiently while its tool
  // runs, falling back to the generic "thinking…" label otherwise. It vanishes
  // with the indicator when the turn ends. Only the current in-flight turn's
  // progress counts — completed turns keep their progress messages (for the
  // "思考过程" group) and always end with a stale commit ("准备播放").
  const liveStatusLabel = useMemo(() => {
    const lastAssistantIdx = messages.findLastIndex((m) => m.role === 'assistant');
    const last = messages.slice(lastAssistantIdx + 1).findLast((m) => m.role === 'progress');
    if (last && (last.progressKind === 'tool_call' || last.progressKind === 'commit')) {
      return last.content;
    }
    return t('thinking');
  }, [messages]);

  // Renders a single progress message's content (thinking narration, the
  // collapsed "思考" reasoning window, or a warning). Reused both inline while
  // a turn streams and inside the collapsed "思考过程" group once it completes.
  const renderProgressContent = (msg: ChatMessage): ReactNode => {
    if (msg.progressKind === 'reasoning') {
      // Still streaming live: shown below the thinking indicator, not here.
      if (msg.id === streamingReasoningMsg?.id && reasoningPhaseActive) {
        return null;
      }
      // Finished. Composition ("编曲") reasoning stays as a collapsed
      // window; reasoning from other phases disappears.
      if (!arrangeReasoningIds.has(msg.id)) {
        return null;
      }
      const isExpanded = expandedReasoning.has(msg.id);
      return (
        // relative z-20 lifts the whole reasoning block above its sibling
        // messages in the scroll container's stacking order. Without it the
        // sticky header's own z-10 is scoped to this row and can't outrank a
        // later sibling (the assistant reply text follows this in the DOM),
        // so once the header froze at the top, that text would scroll up and
        // paint over it — looking like it passed through. Positive z-index on
        // the row keeps the frozen 构思 occluding whatever scrolls beneath.
        <div key={msg.id} className="relative z-20 flex justify-start animate-fade-in">
          <div className="w-full px-2">
            {/* Sticky header: freezes at the top of the viewport once it
                would otherwise scroll out above, so long reasoning can always
                be collapsed mid-read — even scrolled to the very bottom. Its
                opaque surface matches the conversation area and masks the
                reasoning text that scrolls beneath it. The before cap covers
                the scrollport padding above the sticky row for the same reason.
                scroll-mt-2.5 makes the onClick scrollIntoView land the header
                at that same 10px-inset frozen spot — without it, collapsing
                aligns the header flush to the scrollport edge (0px) and
                re-expanding snaps it back down to 10px, a visible jump. */}
            <button
              data-reasoning-header={msg.id}
              onClick={() => {
                toggleReasoning(msg.id);
                requestAnimationFrame(() => {
                  scrollRef.current
                    ?.querySelector(`[data-reasoning-header="${CSS.escape(msg.id)}"]`)
                    ?.scrollIntoView({ block: 'nearest' });
                });
              }}
              className={`sticky top-0 z-10 -mx-2 scroll-mt-2.5 flex w-[calc(100%+1rem)] items-center gap-1.5 bg-conversation-surface px-2 py-0.5 text-sm text-text-secondary/60 transition-colors hover:text-text-secondary before:absolute before:inset-x-0 before:-top-2.5 before:h-2.5 before:bg-conversation-surface${
                isExpanded ? ' reasoning-header--expanded' : ''
              }`}
            >
              <ChevronRightIcon
                size={14}
                className={`flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              />
              <span>{t('reasoningTitle')}</span>
              {reasoningDurationSec.get(msg.id) != null && (
                <span>· {formatThinkDuration(reasoningDurationSec.get(msg.id)!)}</span>
              )}
            </button>
            {isExpanded && (
              <div className="mt-1.5 text-[12px] text-text-reasoning font-mono break-words leading-relaxed animate-fade-in">
                <MarkdownText content={msg.content} tone="muted" />
              </div>
            )}
          </div>
        </div>
      );
    }
    // Tool-call / commit labels ("编排段落…", "准备播放…") are transient
    // status — don't keep them in the conversation stream once the tool
    // call is done.
    if (msg.progressKind === 'tool_call' || msg.progressKind === 'commit') {
      return null;
    }
    if (msg.progressKind === 'thinking') {
      // Held back until the reasoning right before it is resolved (see
      // pendingThinkingIds) — otherwise this would render before "构思" does.
      if (pendingThinkingIds.has(msg.id)) {
        return null;
      }
      return (
        <div key={msg.id} className="flex justify-start animate-fade-in">
          <div className="w-full text-sm text-text-secondary px-2 flex items-start gap-1.5">
            <span className="flex w-3.5 justify-center flex-shrink-0 mt-[7px]">
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
            </span>
            <span>{stripMarkdown(msg.content)}</span>
          </div>
        </div>
      );
    }
    return (
      <div key={msg.id} className="flex justify-start animate-fade-in">
        <div className="w-full text-sm text-text-muted/70 px-2">
          <span>{msg.content}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="conversation-scroll-shell">
      {/* isolate scopes the z-indexes used inside the stream (the reasoning
          row's z-20 / its sticky header's z-10) to this container, so they
          rank only against each other — without it they'd leak out and paint
          over outside overlays like the history panel (z-10 in Sidebar). */}
      <div
        ref={scrollRef}
        className={`conversation-scroll isolate h-full overflow-y-auto px-4 py-[10px] space-y-[40px] relative${
          reasoningWindowExpanded ? ' scrollbar-hidden' : ''
        }`}
        style={{ scrollbarGutter: 'stable' }}
      >
      {greetingMsg && !hasConversationMessages && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center px-8">
          <p
            // Keyed by the greeting's own id (not just conditionally mounted):
            // reusing an empty session re-rolls the greeting into a new
            // message id without unmounting this block, so the key is what
            // forces a fresh node — and with it, the mount animation to replay.
            key={greetingMsg.id}
            className={`animate-blur-fade-in text-center text-[#969696] leading-relaxed ${
              zh ? 'font-jinghua-laosongti tracking-wider text-sm' : 'font-eb-garamond text-base'
            }`}
          >
            {greetingMsg.content}
          </p>
        </div>
      )}
      {!greetingMsg && messages.length === 0 && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center text-text-muted text-xs">
          <span>{t('startCreating')}</span>
        </div>
      )}

      {messages.map((msg, messageIndex) => {
        if (msg.isGreeting) return null;
        if (msg.role === 'progress') {
          const gid = actionGroupOf.get(msg.id);
          if (gid) {
            // Part of a completed turn's "行动过程" group.
            const expanded = expandedActions.has(gid);
            const isHeader = gid === msg.id;
            const content = expanded ? renderProgressContent(msg) : null;
            if (!isHeader && !content) return null;
            return (
              <div
                key={msg.id}
                className="animate-fade-in"
                style={{
                  marginBlockEnd: expanded
                    ? 'var(--spacing-action-expanded-content-gap)'
                    : 'var(--spacing-action-divider-to-body)',
                }}
              >
                {isHeader && (
                  <div className="px-2">
                    <button
                      data-action-process-toggle={gid}
                      onClick={() => toggleActions(gid)}
                      className="flex items-center gap-1.5 text-sm text-text-secondary/60 hover:text-text-secondary transition-colors"
                    >
                      <span>{t('actionsTitle')}</span>
                      {actionGroupDurationSec.get(gid) != null && (
                        <span>· {formatThinkDuration(actionGroupDurationSec.get(gid)!)}</span>
                      )}
                      <ChevronRightIcon
                        size={14}
                        className={`flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
                      />
                    </button>
                    <div className="mt-2 border-b border-border/60" />
                  </div>
                )}
                {content && <div className={isHeader ? 'mt-3' : ''}>{content}</div>}
              </div>
            );
          }
          return renderProgressContent(msg);
        }

        if (msg.role === 'user') {
          const rollbackButtonEnabled = !isMobile || longPressedId === msg.id;
          return (
            <div
              key={msg.id}
              className="flex justify-end items-end gap-1.5 animate-fade-in group"
            >
              <div
                className={`relative max-w-[85%] rounded-[6px] px-3 py-2 text-sm bg-[#242424] text-text-primary${
                  isMobile ? ' mobile-rollback-bubble-no-select' : ''
                }`}
                data-rollback-bubble={msg.id}
                onCopy={handleUserBubbleCopy}
                {...getMobileRollbackBubbleProps(msg.id)}
              >
                <UserMessageBubble content={msg.content} />
                {/* Rollback button — top-right of bubble. Desktop: visible on group-hover. Mobile: visible on long-press (no real hover state on touch). */}
                <div className={`absolute -top-2.5 -right-2.5 transition-opacity ${
                  isMobile
                    ? (rollbackButtonEnabled ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none')
                    : 'opacity-0 group-hover:opacity-100'
                }`}>
                  <button
                    onClick={() => { onRollback(msg.id); setLongPressedId(null); }}
                    disabled={!rollbackButtonEnabled}
                    className="w-6 h-6 rounded-full border border-border bg-bg-primary text-text-secondary hover:text-text-primary hover:border-accent/50 transition-colors flex items-center justify-center"
                    title={t('rollbackHere')}
                  >
                    <Undo2 size={12} />
                  </button>
                </div>
              </div>
            </div>
          );
        }

        // assistant message:
        // A turn can hold several assistant bubbles (mid-loop narration + the
        // final reply). Retry/branch actions — and the mb-16 that reserves the
        // hanging space below the bubble for them — only apply to the turn's
        // final bubble; on intermediate narration the margin would just read
        // as a dead gap between paragraphs.
        const showsTurnActions =
          turnFinalAssistantIds.has(msg.id) && !loadingTurnAssistantIds.has(msg.id);
        const previousMessage = messages[messageIndex - 1];
        const previousActionGroupId = previousMessage
          ? actionGroupOf.get(previousMessage.id)
          : undefined;
        const followsCollapsedActionGroup =
          previousActionGroupId !== undefined && !expandedActions.has(previousActionGroupId);
        const assistantStyle: CSSProperties = {
          ...(msg.id === lastMessageId && !isVideoMode && turnAnchorActive && !isLoading
            ? { minHeight: assistantFillerMinHeight }
            : {}),
        };
        return (
          <div
            key={msg.id}
            // items-start keeps the bubble (and its hanging action buttons)
            // at content height when the turn filler stretches the row
            className={`flex justify-start items-start animate-fade-in group${showsTurnActions ? ' mb-16' : ''}`}
            style={assistantStyle}
          >
            <div className={`relative w-full rounded-xl px-2 pb-2 text-sm bg-transparent text-text-primary ${
              followsCollapsedActionGroup ? 'pt-0' : 'pt-2'
            }`}>
              <MarkdownText content={msg.content} />
              {msg.code && msg.revisionId && revisionsById.has(msg.revisionId) && (
                <CodeDiffView
                  messageId={msg.id}
                  revision={revisionsById.get(msg.revisionId)!}
                  expanded={expandedCode.has(msg.id)}
                  onToggle={() => toggleCode(msg.id)}
                />
              )}
              {msg.code && (!msg.revisionId || !revisionsById.has(msg.revisionId)) && (() => {
                const isExpanded = expandedCode.has(msg.id);
                const code = msg.code;
                const lineCount = code.split('\n').length;
                return (
                  <div className="mt-4 -ml-1 rounded-md border border-diff-accent/70 overflow-hidden animate-fade-in">
                    <div className="w-full flex items-center bg-bg-primary/60 text-[11px] text-diff-accent/70">
                      <button
                        onClick={() => toggleCode(msg.id)}
                        className="flex-1 flex items-center gap-1.5 px-2 py-1.5 hover:text-diff-accent/90 hover:bg-bg-primary/80 transition-colors text-left"
                      >
                        <span>{t('strudelCode')}</span>
                        <span>· {lineCount} {t('lines')}</span>
                      </button>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(code).then(() => {
                            setCopiedId(msg.id);
                            setTimeout(() => setCopiedId(null), 2000);
                          });
                        }}
                        className="px-2 py-1.5 text-diff-accent/70 hover:text-diff-accent/90 hover:bg-bg-primary/80 transition-colors"
                        title={t('copyCode')}
                      >
                        {copiedId === msg.id ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
                      </button>
                    </div>
                    {isExpanded && (
                      <pre className="p-2 bg-bg-primary/60 text-[11px] text-text-secondary font-mono overflow-x-auto whitespace-pre-wrap animate-fade-in">
                        {code}
                      </pre>
                    )}
                  </div>
                );
              })()}

              {/* Action buttons — bottom-left, always visible. Hidden on
                  intermediate narration (shown once per turn, on the final
                  assistant message after the turn finishes). */}
              {showsTurnActions && (
                <div
                  data-assistant-turn-actions
                  className="absolute -bottom-6 left-1 flex items-center gap-1.5"
                >
                  <button
                    onClick={() => onRetry(msg.id)}
                    className="flex h-[22px] w-[22px] items-center justify-center rounded-[6px] text-[#9E9E9E] transition-colors hover:bg-[#242424]"
                    title={t('retry')}
                  >
                    <RetryIcon size={14} />
                  </button>
                  <button
                    onClick={() => onBranch(msg.id)}
                    className="flex h-[22px] w-[22px] items-center justify-center rounded-[6px] text-[#9E9E9E] transition-colors hover:bg-[#242424]"
                    title={t('branchFrom')}
                  >
                    <GitBranchIcon size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* No bottom margin here (unlike the assistant block): the full outer
          height goes to content, so the reasoning window can reach down —
          turnFillerHeight keeps the swap with the final reply neutral */}
      {isLoading && (
        <div
          className="animate-fade-in flex flex-col"
          style={!isVideoMode ? { height: turnFillerHeight } : undefined}
        >
          <div className="flex items-start gap-1.5 px-1.5 shrink-0">
            <ThinkingLottie className="w-5 h-5 flex-shrink-0" />
            {reasoningWindowAvailable ? (
              <button
                data-live-reasoning-toggle
                onClick={() => setReasoningCollapsed((v) => !v)}
                aria-expanded={reasoningWindowExpanded}
                className="flex min-w-0 items-center gap-1.5 text-left text-sm text-text-primary transition-colors hover:text-text-secondary"
                title={reasoningWindowExpanded ? t('collapseReasoning') : t('expandReasoning')}
              >
                <span data-live-reasoning-label className="min-w-0">{liveStatusLabel}</span>
                <ChevronRightIcon
                  size={18}
                  className={`flex-shrink-0 transition-transform ${reasoningWindowExpanded ? 'rotate-90' : ''}`}
                />
              </button>
            ) : (
              <div className="min-w-0 text-sm text-text-primary">{liveStatusLabel}</div>
            )}
          </div>
          {reasoningWindowExpanded && streamingReasoningMsg && (
            // flex-1 (rather than a calc'd height) fills exactly whatever
            // room the fixed height above leaves after the indicator row, so
            // the reasoning box always reaches the loading block's own
            // bottom — which, via turnFillerHeight, is the conversation's
            // bottom edge — with no magic-number arithmetic to keep in sync.
            // min-h-0 lets it size below its content's natural height, which
            // is what lets the scroll box's own h-full resolve to a real,
            // clipped value instead of just growing to fit the streamed text.
            <div className="mt-3 w-full px-2 flex-1 min-h-0 animate-fade-in">
              <div
                ref={reasoningScrollRef}
                onScroll={(e) => {
                  const el = e.currentTarget;
                  const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
                  reasoningUserScrolledRef.current = distFromBottom > 20;
                }}
                className="h-full min-h-[160px] text-sm text-text-reasoning font-mono break-words overflow-y-auto overflow-x-hidden leading-relaxed"
              >
                <MarkdownText content={streamingReasoningMsg.content} tone="muted" />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="h-6" />
      </div>
      <div
        data-conversation-edge-fade="top"
        className="conversation-edge-fade conversation-edge-fade--top"
      />
      <div
        data-conversation-edge-fade="bottom"
        className="conversation-edge-fade conversation-edge-fade--bottom"
      />
    </div>
  );
}
