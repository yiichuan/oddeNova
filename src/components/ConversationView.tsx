import { useEffect, useMemo, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import type { ChatMessage } from '../hooks/useChat';
import { useIsMobile } from '../hooks/useIsMobile';
import { CheckIcon, CopyIcon, GitBranchIcon, RetryIcon, RollbackIcon } from './icons';
import { t } from '../lib/i18n';

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
  default: 'text-[#B9D7FF]',
  muted: 'text-text-secondary/80',
};

const blockCodeToneClass: Record<MarkdownTone, string> = {
  default: 'text-[#B9D7FF]',
  muted: 'text-text-secondary/75',
};

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
        <code key={`${keyPrefix}-code-${key++}`} className={`rounded bg-white/10 px-1 py-0.5 font-mono text-[0.92em] ${inlineCodeToneClass[tone]}`}>
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
            className="text-[#93C2FF] underline decoration-[#93C2FF]/40 underline-offset-2 hover:decoration-[#93C2FF]"
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
        <div key={`md-heading-${key++}`} className="mt-1 font-semibold text-text-primary">
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
            <li key={`md-ul-${key}-${idx}`}>{parseInlineMarkdown(item, `md-ul-${key}-${idx}`, tone)}</li>
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
            <li key={`md-ol-${key}-${idx}`}>{parseInlineMarkdown(item, `md-ol-${key}-${idx}`, tone)}</li>
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
        <blockquote key={`md-quote-${key++}`} className="my-1 border-l border-[#93C2FF]/30 pl-3 text-text-secondary">
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

  return <div className="space-y-2 break-words">{blocks}</div>;
}

interface ConversationViewProps {
  messages: ChatMessage[];
  isLoading: boolean;
  showThinkingIndicator?: boolean;
  isVideoMode?: boolean;
  scrollBottom?: boolean;
  onRollback: (messageId: string) => void;
  onBranch: (messageId: string) => void;
  onRetry: (messageId: string) => void;
}

export default function ConversationView({
  messages,
  isLoading,
  showThinkingIndicator = true,
  isVideoMode = false,
  scrollBottom = false,
  onRollback,
  onBranch,
  onRetry,
}: ConversationViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const userScrolledRef = useRef(false);
  const reasoningPanelRef = useRef<HTMLDivElement>(null);
  const reasoningUserScrolledRef = useRef(false);
  const [expandedCode, setExpandedCode] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const isMobile = useIsMobile();
  // On mobile, long-pressing a message reveals the rollback button (no real hover state on touch screens)
  const [longPressedId, setLongPressedId] = useState<string | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Detect manual user scroll: stop auto-following when more than 80px from the bottom, resume when scrolled back
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      userScrolledRef.current = distFromBottom > 80;
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    return () => el.removeEventListener('scroll', handleScroll);
  }, []);

  const toggleCode = (id: string) => {
    setExpandedCode((prev) => {
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

  useEffect(() => {
    if (isVideoMode && !scrollBottom) {
      // [video] Video mode: display from the top; only scroll to bottom when scrollBottom=true
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    } else {
      if (!userScrolledRef.current) {
        bottomRef.current?.scrollIntoView({ behavior: 'instant' });
      }
      // Auto-scroll the reasoning panel to the bottom (follow content during streaming output)
      const reasoningEl = reasoningPanelRef.current;
      if (reasoningEl && !reasoningUserScrolledRef.current) {
        reasoningEl.scrollTop = reasoningEl.scrollHeight;
      }
      // Reset the user-scrolled flag for the reasoning area when isLoading ends
      if (!isLoading) {
        reasoningUserScrolledRef.current = false;
      }
    }
  }, [messages, isLoading, isVideoMode, scrollBottom]);

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

  return (
    <div ref={scrollRef} className="conversation-scroll h-full overflow-y-auto px-4 py-[10px] space-y-[22px] relative" style={{ scrollbarGutter: 'stable' }}>
      {messages.length === 0 && !isLoading && (
        <div className="absolute inset-0 flex items-center justify-center text-text-muted text-xs">
          <span>{t('startCreating')}</span>
        </div>
      )}

      {messages.map((msg) => {
        if (msg.role === 'progress') {
          // All progress messages always stay in the list — never suppress
          // them, to avoid the flash of disappearing from indicator then
          // reappearing in the list.
          // Reasoning messages: hide from list (shown below blue dot during streaming,
          // or in assistant bubble after completion).
          if (msg.progressKind === 'reasoning') {
            return null;
          }
          if (msg.progressKind === 'thinking') {
            return (
              <div key={msg.id} className="flex justify-start animate-fade-in-up">
                <div className="text-xs text-text-secondary px-1 flex items-start gap-1.5">
                  <span className="opacity-70 mt-0.5">{progressIcon(msg)}</span>
                  <span>{stripMarkdown(msg.content)}</span>
                </div>
              </div>
            );
          }
          return (
            <div key={msg.id} className="flex justify-start animate-fade-in-up">
              <div className="text-[11px] text-text-muted/70 px-1 flex items-center gap-1.5">
                <span className="opacity-60">{progressIcon(msg)}</span>
                <span>{msg.content}</span>
              </div>
            </div>
          );
        }

        if (msg.role === 'user') {
          const rollbackButtonEnabled = !isMobile || longPressedId === msg.id;
          return (
            <div key={msg.id} className="flex justify-end items-end gap-1.5 animate-fade-in-up group">
              <div
                className={`relative max-w-[85%] rounded-xl px-3 py-2 text-sm bg-[#1a1a1a] text-text-primary${
                  isMobile ? ' mobile-rollback-bubble-no-select' : ''
                }`}
                data-rollback-bubble={msg.id}
                {...getMobileRollbackBubbleProps(msg.id)}
              >
                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
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
                    <RollbackIcon size={12} />
                  </button>
                </div>
              </div>
            </div>
          );
        }

        // assistant message:
        return (
          <div
            key={msg.id}
            className="flex justify-start animate-fade-in-up group mb-6"
          >
            <div className="relative max-w-[85%] rounded-xl px-3 py-2 text-xs bg-transparent text-text-primary">
              <MarkdownText content={msg.content} />
              {msg.code && (() => {
                const isExpanded = expandedCode.has(msg.id);
                const code = msg.code;
                const lineCount = code.split('\n').length;
                return (
                  <div className="mt-2 rounded-md border border-[#93C2FF]/10 overflow-hidden">
                    <div className="w-full flex items-center bg-bg-primary/60 text-[11px] text-[#93C2FF]/70">
                      <button
                        onClick={() => toggleCode(msg.id)}
                        className="flex-1 flex items-center gap-1.5 px-2 py-1.5 hover:text-[#93C2FF]/90 hover:bg-bg-primary/80 transition-colors text-left"
                      >
                        <span className="transition-transform duration-200" style={{ display: 'inline-block', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                        <span>{t('strudelCode')}</span>
                        <span className="text-text-muted/50">· {lineCount} {t('lines')}</span>
                      </button>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(code).then(() => {
                            setCopiedId(msg.id);
                            setTimeout(() => setCopiedId(null), 2000);
                          });
                        }}
                        className="px-2 py-1.5 text-white/60 hover:text-white hover:bg-bg-primary/80 transition-colors"
                        title={t('copyCode')}
                      >
                        {copiedId === msg.id ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
                      </button>
                    </div>
                    {isExpanded && (
                      <pre className="p-2 bg-bg-primary/60 text-[11px] text-[#93C2FF]/90 font-mono overflow-x-auto whitespace-pre-wrap">
                        {code}
                      </pre>
                    )}
                  </div>
                );
              })()}

              {/* Action buttons — bottom-left, always visible. Hidden on greeting
                  bubbles (no prior user turn to retry/branch from) and on
                  intermediate narration (shown once per turn, on the final
                  assistant message after the turn finishes). */}
              {!msg.isGreeting && turnFinalAssistantIds.has(msg.id) && !loadingTurnAssistantIds.has(msg.id) && (
                <div className="absolute -bottom-5 left-0 flex items-center">
                  <button
                    onClick={() => onRetry(msg.id)}
                    className="text-white/60 hover:text-white p-1"
                    title={t('retry')}
                  >
                    <RetryIcon size={13} />
                  </button>
                  <button
                    onClick={() => onBranch(msg.id)}
                    className="text-white/60 hover:text-white p-1"
                    title={t('branchFrom')}
                  >
                    <GitBranchIcon size={13} />
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {isLoading && showThinkingIndicator && (
        <div className="flex justify-start animate-fade-in-up">
          <div className="flex items-start gap-1.5 px-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#93C2FF] mt-2 animate-pulse flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-sm text-text-primary">{t('thinking')}</div>
              {streamingReasoningMsg && streamingReasoningMsg.content && reasoningPhaseActive && (
                <div
                  ref={reasoningPanelRef}
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
                    reasoningUserScrolledRef.current = distFromBottom > 20;
                  }}
                  className="mt-1.5 max-h-40 overflow-y-auto text-[11px] leading-relaxed text-text-muted/60"
                >
                  <MarkdownText content={streamingReasoningMsg.content} tone="muted" />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div ref={bottomRef} className="h-6" />
    </div>
  );
}

function progressIcon(msg: ChatMessage): string {
  switch (msg.progressKind) {
    case 'thinking':
      return '💭';
    case 'tool_call':
      return '⚙';
    case 'tool_result':
      return msg.ok === false ? '✗' : '✓';
    case 'commit':
      return '▶';
    case 'warn':
      return '⚠';
    default:
      return '·';
  }
}
