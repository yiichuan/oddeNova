import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { ChatMessage } from '../../hooks/useChat';
import { useClippedEnds } from '../../hooks/useClippedEnds';
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
 * The window it stands in is glass over a moving light field rather than a
 * flat surface. The studio's stream is cut into a panel and can therefore fade
 * its own top and bottom edges out to that panel's colour; here that fade
 * would be a slab of the wrong colour laid over the field showing through. So
 * the reading runs to the window's two ends and what happens there is a mask
 * rather than a colour — the ink's own alpha taken down over the last stretch
 * of an end that is cutting something off, the way the script beside it does
 * it. `.favorites-window-fade` in index.css holds both. This component owns
 * none of the measures: how far the reading stands off the window's edges is
 * the window's own padding.
 *
 * The one thing that did come across is the studio's frozen 构思过程 header,
 * and it came across because the alternative was worse: a thought long enough
 * to scroll was a thought whose control had scrolled away, so there was no way
 * to shut it without first finding it again. Its band is the one place a flat
 * colour can be stated on this glass — see `.favorites-reasoning-sticky` in
 * index.css for why the value is not the studio's.
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
  /* What the pin answers to is the stream's own shape, not the array carrying
     it. `messages` is derived above this component, and a page that rebuilds
     the same conversation into a new array — because the object it was read
     out of was rebuilt, because anything at all re-rendered — hands this an
     arrival that never happened. Keyed on the array, the effect would take the
     reading back to its end in the middle of someone reading it, which is
     exactly what it feels like: scroll up, and the window pulls you back down.

     Length and last id, because that is what changes when there is genuinely
     something new to be at the end of. */
  const streamShape = `${visibleMessages.length}:${visibleMessages.at(-1)?.id ?? ''}`;
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || !active) return;
    scroller.scrollTop = scroller.scrollHeight;
    /* `scrollRef` is in the list for the linter's sake and is stable in
       practice: it is either this component's own ref or one a page holds
       across its lifetime. A caller that made a new one each render would
       send the reading back to its end on every render, which is exactly
       what the dependency is there to say. */
  }, [streamShape, active, scrollRef]);

  /* Which thoughts' headers are frozen at the top of the reading right now.
     The band a frozen header is drawn on is a flat colour standing in for
     glass — see `.favorites-reasoning-sticky` in index.css — and it is only
     that colour in the one place the header ever freezes. Painted while the
     header is still standing in the stream it is a rectangle laid on the
     window, a few levels off whatever the field resolves to down there and
     wide enough to be read as a shape. So the fill is asked for by position,
     not by existence.

     Two markers per thought answer it: one on the line the header freezes at
     and one at the end of what it holds. Once the first has passed out above
     the header is pinned; once the second has, the whole row is gone and the
     header went up with it. Frozen is the state between the two — which is
     what it has to mean, since the window's top fade steps aside for a frozen
     band and would otherwise stay away long after the band had left.

     An observer rather than a scroll handler: the answer changes twice per
     thought, not once per frame. */
  const [stuckReasoningIds, setStuckReasoningIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const reasoningShape = visibleMessages
    .filter((message) => message.role === 'progress')
    .map((message) => message.id)
    .join(',');
  const passedAboveRef = useRef(new Map<string, { head: boolean; foot: boolean }>());
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller || typeof IntersectionObserver === 'undefined') return undefined;
    const passed = passedAboveRef.current;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const mark = entry.target as HTMLElement;
        const head = mark.dataset.reasoningMark;
        const id = head ?? mark.dataset.reasoningMarkEnd;
        if (!id) continue;
        /* A page that is hidden rather than unmounted — which is what leaving
           this one does — reports every rect as zero, and a zero marker reads
           as one that has gone out the top. Nothing is on screen to be wrong
           about, so the answer stands until the page is laid out again. */
        const bounds = entry.rootBounds;
        if (!bounds || bounds.height === 0) continue;
        const above = !entry.isIntersecting && entry.boundingClientRect.top <= bounds.top;
        const state = passed.get(id) ?? { head: false, foot: false };
        passed.set(id, head ? { ...state, head: above } : { ...state, foot: above });
      }
      setStuckReasoningIds((current) => {
        const next = new Set<string>();
        for (const [id, state] of passed) if (state.head && !state.foot) next.add(id);
        // Rebuilt rather than diffed, so a thought that has left the stream
        // leaves the set with it — and handed back unchanged when it says the
        // same thing, so a scroll that crosses nothing costs no render.
        const same = next.size === current.size && [...next].every((id) => current.has(id));
        return same ? current : next;
      });
    }, { root: scroller });
    scroller
      .querySelectorAll('[data-reasoning-mark], [data-reasoning-mark-end]')
      .forEach((mark) => observer.observe(mark));
    return () => {
      observer.disconnect();
      passed.clear();
    };
    /* `reasoningShape` is what the markers are: the effect re-reads them when
       the stream's thoughts change, and not when anything else does. */
  }, [reasoningShape, scrollRef]);

  /* Which of the reading's two ends is cutting something off, for the fade
     that says so — see `.favorites-window-fade` in index.css. Below the pin
     above, so a reading that has just been sent to its end is measured where
     it landed rather than where it was. */
  useClippedEnds(scrollRef);

  const toggleReasoning = (id: string) => {
    setExpandedReasoning((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    /* Collapsing a thought read from deep inside it takes thousands of pixels
       out of the stream under a header that was frozen at the top of the
       window. What the browser does with the scroll offset then is clamp it to
       whatever is left, which can leave the header — the thing just pressed —
       somewhere off screen. `block: 'nearest'` puts it back, and is a no-op in
       the case that matters more: opening a thought grows the stream *below*
       the header, the header is already in view, and the reading must not
       move. See the archive's own test, which holds the scrollport to zero
       writes across an expand. */
    requestAnimationFrame(() => {
      scrollRef.current
        ?.querySelector(`[data-reasoning-header="${CSS.escape(id)}"]`)
        ?.scrollIntoView({ block: 'nearest' });
    });
  };

  return (
    // The scroll window stays local to the archive: it fills the window it is
    // given and holds nothing back from either end.
    <div className="conversation-archive">
      <div className="conversation-scroll-shell">
      {/* No padding of its own at either end. The first message stands on the
          top of the window's reading area and the last reply on the foot of
          it, which is where the script beside it starts and stops too — and
          neither is faded while it is standing there, since a fade is what an
          end says when it is holding something back.

          The bar stands rather than hides. This reading is held in a window
          with edges now, the same as the script beside it, and a window that
          clips what it is holding has to say how much more of it there is —
          the two say it the same way. Its gutter is reserved whether or not
          there is anything to scroll, so the message column never shifts.
          Where the bar stands is `.favorites-reading` in index.css.

          The arrival is not here either: it is on the window that holds this,
          so the glass and the reading in it come up as one thing. */}
      <div
        ref={scrollRef}
        className="conversation-scroll favorites-window-fade isolate h-full overflow-y-auto space-y-[40px] relative"
        style={{ scrollbarGutter: 'stable' }}
      >
        {visibleMessages.map((message, index) => {
          /* The two ends of the reading stand on the window's own two edges,
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
                /* `relative z-20` puts the whole block above the messages that
                   follow it in the stream. Without it the header's own z-10 is
                   scoped to this row and cannot outrank a later sibling, so a
                   frozen header would be painted over by the reply scrolling
                   up under it — which looks like the text passing through. */
                className="relative z-20 flex justify-start animate-fade-in"
                style={isLast
                  ? undefined
                  : { marginBlockEnd: 'var(--spacing-action-divider-to-body)' }}
              >
                <div className="w-full px-2">
                  {/* The line the header freezes at, kept as a thing of its
                      own so an observer can watch it: the header itself stops
                      moving once it is pinned and can no longer say where it
                      would have been. A pixel tall and taken straight back
                      out again, so the reading is laid out as though it were
                      not here. */}
                  <div
                    data-reasoning-mark={message.id}
                    aria-hidden="true"
                    className="h-px -mb-px"
                  />
                  <button
                    type="button"
                    data-reasoning-header={message.id}
                    onClick={() => toggleReasoning(message.id)}
                    data-expanded={expanded || undefined}
                    data-stuck={stuckReasoningIds.has(message.id) || undefined}
                    /* Frozen at the top of the window once it would otherwise
                       have scrolled out above it, the way the studio's is, so
                       a thought long enough to need scrolling can still be
                       shut from anywhere inside it. Before this the only way
                       back to the control was to scroll all the way up to
                       where it had gone.

                       `-mx-2` and the matching width take the band out to the
                       stream's full measure and `px-2` puts the label back
                       where it was: what freezes has to cover the whole line
                       under it, and the row's own padding would leave two
                       strips of reasoning showing either side.

                       What it is filled with is `.favorites-reasoning-sticky`
                       in index.css — not the studio's `bg-conversation-surface`,
                       which is that stream's flat panel and would be a slab of
                       the wrong colour here; this window is glass over a
                       moving field, so the band is the colour that glass
                       actually resolves to at the one place the band ever
                       appears, and `data-stuck` is what says the header is in
                       that place. Standing in the stream it carries no fill:
                       there the same value is a rectangle drawn on the glass,
                       which is the one thing the band must never look like. */
                    className={`favorites-reasoning-sticky sticky top-0 z-10 -mx-2 flex w-[calc(100%+1rem)] items-center gap-1.5 px-2 pb-0.5 text-sm text-text-secondary/60 transition-colors hover:text-text-secondary ${
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
                  {/* The far end of what the header holds. A sticky header
                      lets go when its own row runs out, and this is where
                      that is. */}
                  <div
                    data-reasoning-mark-end={message.id}
                    aria-hidden="true"
                    className="h-px -mt-px"
                  />
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
                <div className="relative max-w-[85%] rounded-[6px] px-3 py-2 text-sm bg-message-user text-text-primary">
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
                  /* The widget that points at a take used to be cut from the
                     window that shows it — the Featured detail's glass fill
                     and its tenth-of-white edge — so that a take read as the
                     same object named here and opened there. Which was true
                     of the object and wrong about the thing: this is a control
                     inside the reading, not a second window laid on it, and a
                     translucent fill needing a drawn edge to be found at all
                     is a surface that has not decided whether it is there.

                     So the edge goes and the fill does the whole job: one flat
                     colour, stated against the glass rather than borrowed from
                     it, far enough off the window to be found by its own shape.
                     Both palettes are in index.css under `.favorites-code-chip`
                     — near-white on paper, a mid grey in the dark room, each
                     the value that reads as a key raised off the window it sits
                     in. No backdrop blur either way: the scrollport above is
                     `isolate`, which is a backdrop root, so a filter in here
                     would have nothing behind it to sample and would cost a
                     compositing layer per turn to say so.

                     Hover is that fill and nothing else — the orange holds
                     still. One thing moving is enough to say the widget is
                     live, and it is the one thing that can move without the
                     widget looking like it changed state, which the page
                     already has its own meaning for. Which direction it moves
                     is the room's: the dark room lights its controls to answer
                     the pointer and paper shades them, the same way the
                     Featured transport's play button is drawn. */
                  <div className="mt-4 -ml-1 flex gap-0.5 animate-fade-in">
                    <button
                      type="button"
                      data-favorites-chip={message.id}
                      aria-pressed={selectedCodeMessageId === message.id}
                      onClick={() => onSelectCode(message.id)}
                      className="favorites-code-chip flex flex-1 items-center gap-1.5 rounded-l-md rounded-r-none px-2 py-1.5 text-left text-[11px] text-brand-accent transition-colors"
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
                      className="favorites-code-chip grid w-7 self-stretch place-items-center rounded-l-none rounded-r-md text-brand-accent transition-colors"
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
