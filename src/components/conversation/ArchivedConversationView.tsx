import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { ChatMessage } from '../../hooks/useChat';
import { t } from '../../lib/i18n';
import { takeLabel } from '../../lib/favorite-conversations';
import { ChevronRightIcon, PlayIcon, StopIcon } from '../icons';
import { MarkdownText, UserMessageBubble } from './ConversationView';

interface ArchivedConversationViewProps {
  messages: readonly ChatMessage[];
  onSelectCode: (messageId: string) => void;
  onPlayCode: (messageId: string, code: string) => void;
  onStopCode: () => void;
  playingCodeMessageId: string | null;
  selectedCodeMessageId: string | null;
  /**
   * Whether the takes are worth numbering. A conversation that wrote one script
   * has no first take — the widget names the code and stops there, because a
   * V01 with nothing after it reads as a promise of a V02. The count is the
   * page's to make, not the archive's: what is numbered is what the code window
   * lists, and that can hold a version this reading has no widget for.
   */
  numberTakes?: boolean;
  /**
   * Whether the page holding this is the one on screen. The archive comes back
   * to its end each time it is, which it cannot work out for itself: the pages
   * it lives on are hidden rather than unmounted when you leave them, so
   * arriving again is a prop changing and nothing else.
   */
  active?: boolean;
  /**
   * The archive's own scrollport, handed out. A page that puts something beside
   * the reading which moves it — the turn rail does — needs the element the
   * reading actually scrolls in, and that is this component's to own: where the
   * window's ends are and how deep its padding runs are decided in here and in
   * the stylesheet, not on the page.
   */
  scrollRef?: RefObject<HTMLDivElement | null>;
}

/**
 * The durable portion of the studio conversation stream. It deliberately
 * leaves out anything that exists only while an agent run is underway — live
 * thinking, tool status, commit status, and retry/rollback controls — while
 * retaining completed messages and, folded under them, the one thought per
 * reply that actually composed it (see `arrangeReasoningIds` below).
 *
 * It also stands on no surface of its own. The studio's stream is cut into a
 * panel and can therefore fade its own top and bottom edges out to that panel's
 * colour, and park a sticky heading on it; here the messages sit straight on
 * the page's light field, so every one of those — the edge fades, the heading's
 * backing, the gradient under it — would be a slab of the wrong colour laid
 * over the field. They are left out rather than recoloured: nothing behind this
 * is a flat colour to match.
 *
 * The two ends still have to say that the stream runs past them, and they say
 * it with blur alone — no scrim, no fade of the content's own alpha, both of
 * which would be a statement about a colour this page does not have. A message
 * on its way out simply goes soft until there is nothing left to read.
 *
 * The masked blur bands (see `.conversation-blur-fade` in index.css) read the
 * page behind this stream rather than the stream alone. FavoritesPage mounts
 * them above this archive so they can span that page without becoming fixed
 * viewport layers.
 */

export default function ArchivedConversationView({
  messages,
  onSelectCode,
  onPlayCode,
  onStopCode,
  playingCodeMessageId,
  selectedCodeMessageId,
  numberTakes = true,
  active = true,
  scrollRef: externalScrollRef,
}: ArchivedConversationViewProps) {
  /* Thoughts begin folded. What a favorite is kept for is the conversation and
     the music it arrived at; how the piece was worked out is there for whoever
     wants it, one line down. Left open, a run's thinking is several screens of
     grey the reading has to be scrolled past to be read at all. Only entries
     the reader opens are held in this set. */
  const [expandedReasoning, setExpandedReasoning] = useState<Set<string>>(new Set());
  /* Which of a run's thinking blocks was about the music.
     The agent thinks before every tool call, so one reply leaves several: the
     one that worked out what to write, and then the short ones that read a
     validator's answer or decide it is done ("校验通过，commit 用检查点
     格式"). Only the first is composing — the rest are the machinery talking to
     itself, and an archive that shows them buries the thinking worth keeping
     under its own bookkeeping.

     The tell is what the thought was reaching for, as in the studio's own 构思
     window (`arrangeReasoningIds` in ConversationView) — but read strictly to
     the end of the step it belongs to, which is what the studio's forward scan
     does not do. `validate` and `commit` draw no progress line of their own
     (see agent-progress-handler), so a thought about either has no tool call
     after it at all, and a scan that runs to the end of the archive finds the
     *next reply's* `setCode` and keeps it. So the scan stops where the step
     does: the reply, the next instruction, the commit, or the next thought. */
  const arrangeReasoningIds = useMemo(() => {
    const ids = new Set<string>();
    messages.forEach((message, index) => {
      if (message.role !== 'progress' || message.progressKind !== 'reasoning') return;
      for (let next = index + 1; next < messages.length; next++) {
        const entry = messages[next];
        if (entry.role !== 'progress') break;
        if (entry.progressKind === 'reasoning' || entry.progressKind === 'commit') break;
        if (entry.progressKind === 'tool_call') {
          if (entry.toolName === 'setCode') ids.add(message.id);
          break;
        }
      }
    });
    return ids;
  }, [messages]);
  const visibleMessages = useMemo(
    () => messages.filter((message) => (
      message.role !== 'progress' || arrangeReasoningIds.has(message.id)
    )),
    [messages, arrangeReasoningIds],
  );

  /* A favorite opens at its end. What was kept is the take the exchange
     arrived at, and the reading that explains it runs backwards from there —
     so the last reply is what the entry is for, and starting at the first
     instruction would make you scroll past the whole of it to reach the point.

     Every arrival, not only the first. The gallery pages stay mounted when you
     leave them — they are hidden, so drafts and local state survive the trip —
     which means coming back is neither a mount nor a change of messages, and
     an archive keyed on those alone would hand you back whatever you had
     scrolled to before you left. Opening at the end is the entry's own
     behaviour, so it has to happen every time the entry is opened.

     useLayoutEffect, not useEffect: the archive would otherwise paint once
     where it was and jump. */
  const ownScrollRef = useRef<HTMLDivElement>(null);
  const scrollRef = externalScrollRef ?? ownScrollRef;
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || !active) return;
    scroller.scrollTop = scroller.scrollHeight;
    /* `scrollRef` is in the list for the linter's sake and is stable in
       practice: it is either this component's own ref or one a page holds
       across its lifetime. A caller that made a new one each render would
       send the reading back to its end on every render, which is exactly
       what the dependency is there to say. */
  }, [visibleMessages, active, scrollRef]);

  const toggleReasoning = (id: string) => {
    setExpandedReasoning((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    // The scroll window stays local to the archive. Its full-width blur bands
    // are mounted by FavoritesPage in a stable absolute layer above it.
    <div className="conversation-archive">
      <div className="conversation-scroll-shell conversation-scroll-shell--inset">
      {/* The padding is inside the scrollport rather than around it, so it is
          the *content* that is held clear of the two bands and not the window:
          at rest the first message and the last reply stand past where the blur
          begins, and scrolling still carries them out through it. One band's
          depth exactly, read from the same token, so the two cannot drift apart.
          The horizontal padding is in index.css instead: it has to answer to
          how far the window overhangs its column, which is decided there.

          The scrollbar remains transparent while its gutter stays reserved,
          so scrolling still works and the message column does not shift. */}
      <div
        ref={scrollRef}
        // `featured-content-in` rides here rather than on anything above the
        // shell: it animates opacity and fills, and an ancestor that does that
        // is where the bands below stop being able to see the page behind this
        // stream. A sibling of theirs can carry it safely.
        className="conversation-scroll scrollbar-hidden featured-content-in isolate h-full overflow-y-auto py-[var(--spacing-conversation-fade)] space-y-[40px] relative"
        style={{ scrollbarGutter: 'stable' }}
      >
        {visibleMessages.map((message, index) => {
          /* The two ends of the reading stand on the code window's two edges,
             and what has to land on them is the ink, not the box around it.
             Every row here carries a little padding of its own that is
             invisible in the middle of a stream and is a gap at its ends, so
             the first and last give theirs up. A user's bubble is the one
             exception: its padding is a surface you can see, and the edge that
             belongs on the vertical is the bubble's own. */
          const isFirst = index === 0;
          const isLast = index === visibleMessages.length - 1;
          if (message.role === 'progress') {
            const expanded = expandedReasoning.has(message.id);
            return (
              <div
                key={message.id}
                data-archive-process={message.id}
                className="flex justify-start animate-fade-in"
                style={isLast
                  ? undefined
                  : { marginBlockEnd: 'var(--spacing-action-divider-to-body)' }}
              >
                <div className="w-full px-2">
                  <button
                    type="button"
                    data-reasoning-header={message.id}
                    onClick={() => toggleReasoning(message.id)}
                    className={`flex w-full items-center gap-1.5 pb-0.5 text-sm text-text-secondary/60 transition-colors hover:text-text-secondary ${
                      isFirst ? 'pt-0' : 'pt-0.5'
                    }`}
                  >
                    <ChevronRightIcon
                      size={14}
                      className={`flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
                    />
                    <span>{t('favoritesReasoningTitle')}</span>
                  </button>
                  {expanded && (
                    <div className="mt-1.5 text-[12px] text-text-reasoning font-mono break-words leading-relaxed animate-fade-in">
                      <MarkdownText content={message.content} tone="muted" />
                    </div>
                  )}
                </div>
              </div>
            );
          }

          if (message.role === 'user') {
            return (
              <div
                key={message.id}
                data-favorites-turn={message.id}
                className="flex justify-end items-end gap-1.5 animate-fade-in"
              >
                <div className="relative max-w-[85%] rounded-[6px] px-3 py-2 text-sm bg-[#242424] text-text-primary">
                  <UserMessageBubble content={message.content} />
                </div>
              </div>
            );
          }

          const followsReasoning = visibleMessages[index - 1]?.role === 'progress';
          const codeVersion = visibleMessages
            .slice(0, index + 1)
            .filter((entry) => entry.role === 'assistant' && entry.code).length;
          const isPlaying = playingCodeMessageId === message.id;
          return (
            <div
              key={message.id}
              data-favorites-turn={message.id}
              className="flex justify-start items-start animate-fade-in"
            >
              <div className={`relative w-full rounded-xl px-2 text-sm bg-transparent text-text-primary ${
                followsReasoning || isFirst ? 'pt-0' : 'pt-2'
              } ${isLast ? 'pb-0' : 'pb-2'}`}>
                <MarkdownText content={message.content} />
                {message.code && (
                  /* The widget that points at a take is made of the same two
                     materials as the window that shows it — the Featured
                     detail's glass fill and its tenth-of-white edge — so a
                     take reads as the same object named here and opened
                     there. No backdrop blur to go with the fill, unlike the
                     window: the scrollport above is `isolate`, which is a
                     backdrop root, so a filter in here would have nothing
                     behind it to sample and would cost a compositing layer
                     per turn to say so. The fill alone does the work, because
                     the field it stands on is already soft.

                     Hover is the fill and nothing else: the glass lightens,
                     while the edge and the orange hold still. One thing moving
                     is enough to say the widget is live, and it is the one
                     thing that can move without the widget looking like it
                     changed state — a brighter rule or a hotter orange both
                     read as selection, which this already has its own
                     meaning for. The lit value is the opaque grey the widget
                     used to hover to, kept at the same alpha as its rest so
                     the material never changes, only its light. */
                  <div className="mt-4 -ml-1 flex gap-0.5 animate-fade-in">
                    <button
                      type="button"
                      data-favorites-chip={message.id}
                      aria-pressed={selectedCodeMessageId === message.id}
                      onClick={() => onSelectCode(message.id)}
                      className="flex flex-1 items-center gap-1.5 rounded-l-md rounded-r-none border border-white/10 bg-[#0D0D0D]/55 px-2 py-1.5 text-left text-[11px] text-[#f05a28] transition-colors hover:bg-[#242424]/55"
                    >
                      <span>{numberTakes ? takeLabel(codeVersion) : t('favoritesCodeTitle')}</span>
                      <span aria-hidden="true">·</span>
                      <span>{message.code.split('\n').length} {t('lines')}</span>
                    </button>
                    <button
                      type="button"
                      data-favorites-code-play={message.id}
                      aria-label={isPlaying ? t('stop') : t('play')}
                      onClick={() => {
                        if (isPlaying) onStopCode();
                        else onPlayCode(message.id, message.code!);
                      }}
                      // `self-stretch` rather than a second fixed size: the
                      // chip beside it is as tall as its own line, and two
                      // edges that stop at different heights would read as a
                      // misprint now that both are drawn.
                      className="grid w-7 self-stretch place-items-center rounded-l-none rounded-r-md border border-white/10 bg-[#0D0D0D]/55 text-[#f05a28] transition-colors hover:bg-[#242424]/55"
                    >
                      {isPlaying ? <StopIcon size={12} /> : <PlayIcon size={13} />}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      </div>

    </div>
  );
}
