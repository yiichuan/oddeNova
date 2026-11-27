import RouterProgressView, { ActionProcessHeader, RouterProcessView } from './RouterProgressView';
import { groupRouterProcess, isCodeMaintenanceText, isCompletionTool, routerStageLabels, routerStrategySeconds } from './router-progress-display';
import type { LiveRouterProgress } from '../../agent/progress';
import MessageImages from './MessageImages';
import { Fragment, memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import type { ChatMessage } from '../../hooks/useChat';
import type { CodeRevision } from '../../hooks/useSessions';
import { useIsMobile } from '../../hooks/useIsMobile';
import { Undo2 } from 'lucide-react';
import { CheckIcon, ChevronDownIcon, ChevronRightIcon, CopyIcon, GitBranchIcon, PauseIcon, PlayIcon, PlayOutlineIcon, PlayStartingMark, RetryIcon, StopIcon } from '../icons';
import { t, zh } from '../../lib/i18n';
import { DRAFT_SEGMENT_ID, draftBaseCode } from '../../lib/draft-diff';
import { CodeDiffView } from './CodeDiffView';
import { parseStepwiseChoice } from '../../services/suggestions';
import { SampleSearchSummary } from './SampleSearchSummary';
import { useStreamBatch } from './useStreamBatch';
import { revealStreamBatch } from './reveal-stream-batch';
import { streamMarkdownBlocks } from './stream-markdown';
import { MusicText, rehypeMusicText } from './music-text';
import StepwiseChoices from './StepwiseChoices';
import AgentStageIndicator from './AgentStageIndicator';
import HummingAudioPlayer from './HummingAudioPlayer';
import { getHummingAsset } from '../../lib/humming-storage';
import { hummingTakes } from '../../lib/humming-transfer';
import { buildHummingWaveformReport } from '../../lib/humming-context';
import type { PendingHummingSubmission } from '../../hooks/useHummingInput';
import type { HummingAttachment } from '../../types/humming';

type MobileNoSelectStyle = CSSProperties & {
  WebkitTouchCallout?: 'none';
};

export type MarkdownTone = 'default' | 'muted';

/* How much text has to sit below the fold before the window says so. Wide
   enough to absorb the sub-pixel drift a fractional line height leaves behind,
   so a window scrolled to its end does not claim there is more to read. */
const REASONING_BOTTOM_EPS = 20;             // px
/* Used when the box cannot say what its own line height is (`normal`, or no
   stylesheet at all). The window is set in text-sm at leading-relaxed. */
const REASONING_FALLBACK_LINE = 23;          // px

/* Manual-scroll takeover, in px.
   A reader who puts a hand on the wheel or the screen means it, so while a
   gesture is live the smallest movement off the anchor hands the reading over
   (GESTURE). Reasoning streams in deltas, and each one re-runs the scroll
   effect: with a distance to clear first, a trackpad's few-px increments would
   be pinned back between one delta and the next and the reading would never
   move at all. Without a gesture behind it — a layout shift, the browser's own
   scroll anchoring — it still takes a real distance to count (IDLE), so nothing
   the page does to itself silently stops the stream from following.
   Following resumes only once the reading is back where the anchor holds it
   (RESUME). Without a turn anchor, that position is the scrollback's bottom. */
const TAKEOVER_GESTURE_EPS = 2;
const TAKEOVER_IDLE_EPS = 80;
const FOLLOW_RESUME_EPS = 4;
/* How long after a wheel/touch/press the reading is still considered to be
   under the reader's hand — one gesture spreads its scroll events over a good
   while (momentum, the browser's smooth-wheel interpolation, a scrollbar held
   mid-drag). */
const SCROLL_GESTURE_MS = 700;
const LIVE_FOLLOW_MS = 220;
const LIVE_FOLLOW_EASING = 'cubic-bezier(0.333333, 0, 0.666667, 1)';

/**
 * How far the streamed text runs past the bottom of its window, in px. Read
 * off the content element rather than the box's own scrollHeight: the box
 * carries a window-height of empty space after the text (see the spacer in the
 * window below), and that space is not something there is left to read.
 */
function reasoningTailBelowFold(box: HTMLElement): number {
  const content = box.firstElementChild;
  if (!content) return 0;
  return content.getBoundingClientRect().bottom - box.getBoundingClientRect().bottom;
}

const mobileRollbackBubbleStyle: MobileNoSelectStyle = {
  userSelect: 'none',
  WebkitUserSelect: 'none',
  WebkitTouchCallout: 'none',
};

// Thinking duration: "45s" under a minute, "2m 5s" above; whole minutes drop
// the seconds ("5m" not "5m 0s").
// eslint-disable-next-line react-refresh/only-export-components -- archive stream shares this formatter.
export function formatThinkDuration(sec: number): string {
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

function createMarkdownComponents(tone: MarkdownTone, footnotePrefix: string): Components {
  const headingColor = tone === 'default' ? 'text-text-primary' : '';
  const inlineCodeColor = tone === 'default' ? 'text-text-secondary' : 'text-text-secondary/80';
  const tableHeadingColor = tone === 'default' ? 'text-text-primary' : 'text-text-secondary';
  const footnoteLabelId = `${footnotePrefix}footnote-label`;

  return {
    a: ({ children, href, id, 'aria-describedby': describedBy, 'aria-label': label }) => {
      if (typeof href !== 'string' || !isSafeUrl(href)) return <>{children}</>;
      const isFragment = href.startsWith('#');
      return (
        <a
          href={href}
          id={id}
          aria-describedby={describedBy === 'footnote-label' ? footnoteLabelId : describedBy}
          aria-label={label}
          {...(isFragment ? {} : { target: '_blank', rel: 'noreferrer' })}
          className="text-diff-accent underline decoration-diff-accent/40 underline-offset-2 hover:decoration-diff-accent"
        >
          {children}
        </a>
      );
    },
    blockquote: ({ children }) => (
      <blockquote className="my-1 border-l border-diff-accent/30 pl-3 text-text-secondary">
        {children}
      </blockquote>
    ),
    code: ({ children, className }) => (
      <code className={`rounded bg-surface-selected px-1 py-0.5 font-mono text-[0.92em] [overflow-wrap:anywhere] has-[>[data-music-token]]:bg-transparent has-[>[data-music-token]]:p-0 ${inlineCodeColor} ${className ?? ''}`}>
        {children}
      </code>
    ),
    del: ({ children }) => <del className="opacity-75">{children}</del>,
    h1: ({ children }) => <h1 className={`mt-1 text-lg font-semibold leading-snug ${headingColor}`.trim()}>{children}</h1>,
    h2: ({ children, className, id }) => (
      <h2
        id={id === 'footnote-label' ? footnoteLabelId : id}
        className={`${className ?? ''} mt-1 text-base font-semibold leading-snug ${headingColor}`.trim()}
      >
        {children}
      </h2>
    ),
    h3: ({ children }) => <h3 className={`mt-1 text-sm font-semibold leading-snug ${headingColor}`.trim()}>{children}</h3>,
    h4: ({ children }) => <h4 className={`mt-1 text-sm font-semibold leading-snug ${headingColor}`.trim()}>{children}</h4>,
    h5: ({ children }) => <h5 className={`mt-1 text-sm font-semibold leading-snug ${headingColor}`.trim()}>{children}</h5>,
    h6: ({ children }) => <h6 className={`mt-1 text-sm font-semibold leading-snug ${headingColor}`.trim()}>{children}</h6>,
    hr: () => <hr className="my-3 border-0 border-t border-border" />,
    img: ({ alt }) => <span className="text-text-secondary">{alt ?? ''}</span>,
    input: ({ checked, type }) => type === 'checkbox'
      ? <input type="checkbox" checked={Boolean(checked)} disabled aria-label={checked ? 'Completed' : 'Not completed'} className="mr-1 align-middle accent-diff-accent" />
      : null,
    li: ({ children, className, node, ...props }) => {
      const classes = node?.properties.className;
      const isTask = Array.isArray(classes) && classes.includes('task-list-item');
      return (
        <li {...props} className={`${className ?? ''} ${isTask ? 'list-none [&>input]:mr-1' : 'list-item'}`}>
          {children}
        </li>
      );
    },
    ol: ({ children, start }) => (
      <ol start={start} className="my-1 list-decimal space-y-0.5 pl-4">
        {children}
      </ol>
    ),
    pre: ({ children }) => (
      <pre className="my-2 overflow-x-auto rounded-md bg-auth-field p-2 font-mono text-[11px] leading-relaxed text-code-block [&>code]:block [&>code]:rounded-none [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-inherit [&>code]:whitespace-pre">
        {children}
      </pre>
    ),
    section: ({ children, className, node: _node, ...props }) => <section {...props} className={`${className ?? ''} my-2 text-sm text-text-secondary`.trim()}>{children}</section>,
    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
    table: ({ children }) => (
      <div className="my-2 w-full max-w-full overflow-x-auto rounded-md border border-border">
        <table className="w-max min-w-full border-collapse text-left text-sm [overflow-wrap:anywhere]">
          {children}
        </table>
      </div>
    ),
    th: ({ children, align, style }) => (
      <th
        style={{ ...style, textAlign: style?.textAlign ?? (align as 'left' | 'center' | 'right' | undefined) }}
        className={`max-w-[min(24rem,70vw)] border-b border-border bg-surface-selected px-2 py-1.5 align-top font-semibold ${tableHeadingColor}`.trim()}
      >
        {children}
      </th>
    ),
    td: ({ children, align, style }) => (
      <td
        style={{ ...style, textAlign: style?.textAlign ?? (align as 'left' | 'center' | 'right' | undefined) }}
        className="max-w-[min(24rem,70vw)] border-b border-border/70 px-2 py-1.5 align-top last:border-b-0"
      >
        {children}
      </td>
    ),
    ul: ({ children, node }) => {
      const classes = node?.properties.className;
      const isTaskList = Array.isArray(classes) && classes.includes('contains-task-list');
      return (
        <ul className={`my-1 space-y-0.5 ${isTaskList ? 'list-none pl-0' : 'list-disc pl-4'}`}>
          {children}
        </ul>
      );
    },
  };
}

const markdownPlugins = [remarkGfm, remarkBreaks];
const markdownRehypePlugins = [rehypeMusicText];

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

/**
 * Memoized so completed messages skip parsing during each streamed token.
 */
export const MarkdownText = memo(function MarkdownText({ content, tone = 'default', liveBatch = false, completeBlocksOnly = false }: {
  content: string;
  tone?: MarkdownTone;
  liveBatch?: boolean;
  completeBlocksOnly?: boolean;
}) {
  const reactId = useId();
  const footnotePrefix = `oddenova-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}-`;
  const remarkRehypeOptions = useMemo(() => ({ clobberPrefix: footnotePrefix }), [footnotePrefix]);
  const components = useMemo(() => createMarkdownComponents(tone, footnotePrefix), [tone, footnotePrefix]);
  const markdown = completeBlocksOnly ? content.slice(0, content.lastIndexOf('\n') + 1) : content;
  const rehypePlugins = useMemo(() => completeBlocksOnly
    ? [streamMarkdownBlocks(markdown), ...markdownRehypePlugins]
    : markdownRehypePlugins, [completeBlocksOnly, markdown]);
  return (
    <div
      data-markdown-text
      data-live-batch-text={liveBatch || undefined}
      className="min-w-0 max-w-full space-y-2 whitespace-normal break-words [overflow-wrap:anywhere]"
    >
      <ReactMarkdown
        remarkPlugins={markdownPlugins}
        rehypePlugins={rehypePlugins}
        remarkRehypeOptions={remarkRehypeOptions}
        components={components}
        urlTransform={(url) => (isSafeUrl(url) ? url : undefined)}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
});

function MessageHummingTake({ humming, ownerKey, label }: {
  humming: HummingAttachment;
  ownerKey?: string;
  label: string;
}) {
  const [audioAsset, setAudioAsset] = useState<{
    key: string;
    url: string | null;
    unavailable: boolean;
    loading: boolean;
  } | null>(null);
  const hummingId = humming.id;
  const audioAssetKey = hummingId && ownerKey ? `${ownerKey}:${hummingId}` : null;

  useEffect(() => {
    let active = true;
    let createdUrl: string | null = null;
    if (!hummingId || !ownerKey) return () => { active = false; };

    void getHummingAsset(ownerKey, hummingId).then((asset) => {
      if (!active) return;
      if (!asset) {
        setAudioAsset({ key: `${ownerKey}:${hummingId}`, url: null, unavailable: true, loading: false });
        return;
      }
      createdUrl = URL.createObjectURL(asset.blob);
      setAudioAsset({ key: `${ownerKey}:${hummingId}`, url: createdUrl, unavailable: false, loading: false });
    }).catch(() => {
      if (active) {
        setAudioAsset({ key: `${ownerKey}:${hummingId}`, url: null, unavailable: true, loading: false });
      }
    });

    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [hummingId, ownerKey]);
  const currentAudioAsset = audioAsset?.key === audioAssetKey ? audioAsset : null;
  return (
    <div className="min-w-0">
      <HummingAudioPlayer
        compact
        src={currentAudioAsset?.url}
        durationSeconds={humming.recordingDurationSeconds}
        label={label}
        loading={Boolean(ownerKey && (!currentAudioAsset || currentAudioAsset.loading))}
        disabled={!ownerKey || Boolean(currentAudioAsset?.unavailable)}
      />
      {(!ownerKey || currentAudioAsset?.unavailable) && (
        <p className="mt-1 text-[11px] text-text-muted">{t('hummingAudioUnavailable')}</p>
      )}
    </div>
  );
}

export function MessageHummingCards({ humming, pending, ownerKey }: {
  humming?: HummingAttachment;
  pending?: PendingHummingSubmission;
  ownerKey?: string;
}) {
  const takes = hummingTakes(humming);
  if (!takes.length && !pending) return null;
  const label = (index: number) => `${zh ? '哼唱' : 'Humming'} ${String(index + 1).padStart(2, '0')}`;
  return (
    <div className="flex max-w-full flex-wrap justify-end gap-2">
      {pending ? pending.takes.map((take, index) => (
        <HummingAudioPlayer key={take.id} compact src={take.audioUrl} durationSeconds={take.durationSeconds} label={label(index)} />
      )) : takes.map((take, index) => (
        <MessageHummingTake key={take.id} humming={take} ownerKey={ownerKey} label={label(index)} />
      ))}
    </div>
  );
}

function HummingAnalysisSummary({ humming }: { humming: HummingAttachment }) {
  return (
    <section data-humming-analysis className="mb-3 w-full text-sm text-text-secondary" aria-label={t('hummingAnalysisSummary')}>
      <p className="font-medium text-text-primary">{t('hummingAnalysisSummary')}</p>
      <p className="mb-1 text-xs text-text-muted">
        {t('hummingWaveformReadComplete')}
      </p>
      {hummingTakes(humming).map((take, index) => {
        const { tempo, meter, notes } = buildHummingWaveformReport(take);
        const byPitch = [...notes].sort((a, b) => a.midi - b.midi);
        const low = byPitch[0]?.pitch;
        const high = byPitch.at(-1)?.pitch;
        const unknown = zh ? '未知' : 'Unknown';
        const pitches = notes.slice(0, 12).map(note => note.pitch).join(' · ');
        return (
          <div key={take.id} className="mt-2 space-y-0.5">
            <p>{zh ? '哼唱' : 'Humming'} {String(index + 1).padStart(2, '0')}</p>
            <p>{zh ? '估计速度' : 'Estimated tempo'} {tempo ? `${tempo.bpm} BPM` : unknown}
              {' · '}{zh ? '估计拍号' : 'Estimated meter'} {meter?.time_signature ?? unknown}</p>
            <p>{zh ? '音域' : 'Range'} <MusicText text={low && high ? (low === high ? low : `${low}–${high}`) : unknown} />
              {' · '}{notes.length}{zh ? ' 个音符' : ' notes'}</p>
            {pitches && <p>{zh ? '音高顺序' : 'Pitch sequence'} <MusicText text={pitches} />{notes.length > 12 ? ' …' : ''}</p>}
            <p>{take.understanding
              ? `${zh ? '听感' : 'Style'} ${take.understanding.melodyStyle}`
              : t('hummingStyleAnalysisFailed')}</p>
          </div>
        );
      })}
    </section>
  );
}

// User message text with a "show more / less" affordance. Long messages are
// clamped to five lines with the fifth faded into the bubble background; the
// "show more" control reveals on hover (and stays visible on touch, which has
// no hover), and once expanded a "show less" control collapses it again.
export function UserMessageBubble({
  content,
}: {
  content: string;
}) {
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
    if (!content.trim()) return;
    const el = textRef.current;
    if (!el) return;
    const measure = () => setOverflowing(el.scrollHeight - el.clientHeight > 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [content, expanded]);

  const clamped = Boolean(content.trim()) && !expanded && overflowing;

  return (
    <>
      {/* When clamped, extend the bubble's bottom (pb-5) so the fade region has
          extra room below the fifth line and the "show more" control can sit
          lower, clear of the text. Adjust this pb-* to grow/shrink that gap. */}
      {content.trim() && (
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
                background. Keyed to `--color-message-user`, the bubble's own
                fill, rather than to any page surface: the fade only ever runs
                inside the bubble, so anything else lands the clamp on a colour
                the bubble does not have. */}
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-message-user via-message-user/80 to-transparent" />
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
      )}
      {content.trim() && expanded && overflowing && (
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
  liveRouterProgress?: LiveRouterProgress;
  pendingHumming?: PendingHummingSubmission | null;
  hummingWaveformToolCalled?: boolean;
  ownerKey?: string;
  revisions?: CodeRevision[];
  initialExpandedActions?: readonly string[];
  isLoading: boolean;
  isVideoMode?: boolean;
  scrollBottom?: boolean;
  onRollback: (messageId: string) => void;
  onBranch: (messageId: string) => void;
  onRetry: (messageId: string) => void;
  onSelectChoice?: (text: string) => boolean | void | Promise<boolean | void>;
  /**
   * Sound the take a reply committed, from the widget in the reading that
   * reports it.
   *
   * Handed down by both shells. Whether the key is drawn at all is this prop's
   * question and no layout's: a widget in the stream names one *version*, and
   * the transport beside the desktop's editor plays whatever the editor is
   * holding — the latest take, not the one being read about. So where a take is
   * named is where it can be heard, on either layout.
   */
  onPlaySegment?: (segmentId: string, code: string) => void;
  onPlayCode?: (code: string) => void;
  onPauseCode?: () => void;
  engineReady?: boolean;
  isStarting?: boolean;
  onStopCode?: () => void;
  /** Whether anything is sounding, and what — together these say which widget,
   *  if any, is the one currently playing. */
  isPlaying?: boolean;
  playingCode?: string;
  /**
   * The working draft — what the studio's editor is holding, and what the next
   * turn will be asked to change.
   *
   * Where it has parted from the last committed take, a segment of its own
   * appears at the tail of the reading showing that difference. It is the one
   * version in the stream that nobody generated, so it carries no retry and no
   * branch: there is no turn to run again. Giving it a place is what makes an
   * edit survive reading an older take — the editor can go and show that older
   * take without the edit having anywhere to fall out of.
   */
  draftCode?: string;
  /**
   * The key that started what is sounding, and the code it put on — see App.
   * Which widget is sounding is a question of which key was pressed, not of
   * whose text matches: two versions in one reading are often identical, and
   * matching on text would light every one of them.
   */
  pressedSegmentId?: string | null;
  pressedSegmentCode?: string | null;
  /**
   * The widget whose play key was pressed while its take's opening is still
   * loading — see App. Its key turns into the code window's spinner meanwhile.
   */
  startingSegmentId?: string | null;
  /**
   * The reply the phone's first-run guide is walking through. Its code widget
   * opens and shuts from here rather than from this view's own state, so the
   * guide's "view the change" and the widget's own toggle are one switch; and
   * its keys take the guide's thumb-sized form.
   */
  guidedReply?: GuidedReply;
}

export interface GuidedReply {
  id: string;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  /** The play key reaches a thumb's 44px, without the widget changing size; off, it is as any other. */
  enlarged: boolean;
  playDisabled: boolean;
  /** A listen the guide is timing plays through: its stop cannot be pressed. */
  stopDisabled: boolean;
}

/**
 * A value that settles rather than tracks.
 *
 * The editor is never debounced — it is what the typist is looking at. This is
 * for the derived diff beside it: `lineDiff` is O(n·m) and allocates a fresh
 * table per call (`code-diff.ts`), and where `parser.ts` cannot find a
 * `stack(...)` the whole script lands in one group, so a long piece would
 * allocate a large table on every keystroke. Arriving a fraction of a second
 * later costs the reading nothing.
 */
function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

const DRAFT_DIFF_SETTLE_MS = 180;

export default function ConversationView({
  messages: sessionMessages,
  liveRouterProgress,
  pendingHumming,
  hummingWaveformToolCalled = false,
  ownerKey,
  revisions,
  initialExpandedActions,
  isLoading: agentLoading,
  isVideoMode = false,
  scrollBottom = false,
  onRollback,
  onBranch,
  onRetry,
  onSelectChoice,
  onPlaySegment,
  onPlayCode,
  onPauseCode,
  engineReady = false,
  isStarting = false,
  onStopCode,
  isPlaying = false,
  playingCode = '',
  draftCode = '',
  pressedSegmentId = null,
  pressedSegmentCode = null,
  guidedReply,
  startingSegmentId = null,
}: ConversationViewProps) {
  const revealUntil = useRef(0);
  const incomingReply = agentLoading ? liveRouterProgress?.reply : undefined;
  const turnId = sessionMessages.findLast(message => message.role === 'user')?.id;
  const incomingReplyComplete = liveRouterProgress?.replyComplete;
  const incomingStage = liveRouterProgress?.stage;
  const incomingOperation = liveRouterProgress?.operation;
  const stream = useMemo(() => ({
    messages: sessionMessages, reply: incomingReply, replyComplete: incomingReplyComplete,
    stage: incomingStage, operation: incomingOperation, isLoading: agentLoading,
  }), [sessionMessages, incomingReply, incomingReplyComplete, incomingStage, incomingOperation, agentLoading]);
  const routedStream = Boolean(liveRouterProgress || sessionMessages.at(-1)?.routerProgress);
  const batch = useStreamBatch(stream, agentLoading && routedStream && !isVideoMode, turnId, revealUntil);
  const { isLoading, reply: liveReply } = batch;
  const turnInProgress = isLoading || Boolean(pendingHumming);
  const onlyCompleteLiveBlocks = !batch.replyComplete && !isVideoMode;
  const messages = useMemo<ChatMessage[]>(() => pendingHumming
    ? [...batch.messages, { id: pendingHumming.id, role: 'user', content: pendingHumming.text, timestamp: pendingHumming.timestamp }]
    : batch.messages, [batch.messages, pendingHumming]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const liveRevealOverlayRef = useRef<HTMLDivElement>(null);
  const previousLiveText = useRef(new WeakMap<HTMLElement, string>());
  const liveStatusRef = useRef<HTMLDivElement>(null);
  const liveStatusContentRef = useRef<HTMLDivElement>(null);
  const liveStatusPosition = useRef<{ node: HTMLElement; top: number } | null>(null);
  const liveStatusAnimation = useRef<Animation | null>(null);
  const previousReplyLayout = useRef<{ receiptId?: string; body: 'waiting' | 'partial' | 'visible' } | null>(null);
  const completedReplyCodeId = useRef<string | undefined>(undefined);
  // Track programmatic moves so their scroll events never count as a gesture.
  const autoScrollRef = useRef<{ target: number; until: number } | null>(null);
  const liveScroll = useRef<{ frame: number; end: number } | null>(null);
  const cancelLiveScroll = useCallback(() => {
    if (liveScroll.current) cancelAnimationFrame(liveScroll.current.frame);
    liveScroll.current = null;
  }, []);
  const glideLiveScroll = useCallback((scroll: HTMLElement, target: number) => {
    const nativeGlide = autoScrollRef.current && !liveScroll.current;
    cancelLiveScroll();
    const from = scroll.scrollTop;
    if (nativeGlide) scroll.scrollTop = from;
    const start = performance.now();
    const end = start + LIVE_FOLLOW_MS;
    autoScrollRef.current = { target, until: end + 100 };
    function advance(now: number) {
      const fraction = Math.min(1, Math.max(0, (now - start) / LIVE_FOLLOW_MS));
      const eased = fraction * fraction * (3 - 2 * fraction);
      scroll.scrollTop = from + (target - from) * eased;
      liveScroll.current = fraction < 1 ? { frame: requestAnimationFrame(advance), end } : null;
    }
    liveScroll.current = { frame: requestAnimationFrame(advance), end };
  }, [cancelLiveScroll]);
  const [liveLayoutVersion, setLiveLayoutVersion] = useState(0);
  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    const status = liveStatusRef.current;
    if (!scroll || isVideoMode || typeof ResizeObserver === 'undefined') return;
    const rows = scroll.querySelectorAll<HTMLElement>('[data-live-router-progress], [data-sample-search-summary]');
    // Progress animations, wrapping and disclosure toggles can move the
    // status without changing the message array or the reply text.
    const elements = [scroll, ...(status ? [status] : []), ...rows];
    const size = (element: HTMLElement) => element === scroll
      ? `${element.clientWidth}:${element.clientHeight}`
      : `${element.offsetWidth}:${element.offsetHeight}`;
    let sizes = elements.map(size);
    const observer = new ResizeObserver(() => {
      const next = elements.map(size);
      if (next.every((size, index) => size === sizes[index])) return;
      sizes = next;
      setLiveLayoutVersion(version => version + 1);
    });
    for (const element of elements) observer.observe(element);
    return () => observer.disconnect();
  }, [isLoading, isVideoMode, messages]);
  const userScrolledRef = useRef(false);
  const prevIsLoadingRef = useRef(false);
  const prevHasDraftSegmentRef = useRef(false);
  // Turns started in this view can anchor their prompt while generating.
  // Idle conversations pin to the bottom when the reader is following.
  const [turnAnchorActive, setTurnAnchorActive] = useState(false);
  // Flips turnAnchorActive the same render isLoading first turns true — the
  // "adjust state during rendering" pattern (see React docs: storing
  // information from previous renders), not a setState inside an effect, so
  // the filler/anchor are already correct on the very commit that starts the
  // turn instead of lagging a frame behind. Uses state (not a ref) to track
  // the previous value: refs may not be read during render.
  const [prevIsLoadingSnapshot, setPrevIsLoadingSnapshot] = useState(turnInProgress);
  if (turnInProgress !== prevIsLoadingSnapshot) {
    setPrevIsLoadingSnapshot(turnInProgress);
    if (turnInProgress && !turnAnchorActive) setTurnAnchorActive(true);
  }
  // When the reader last touched the scroll themselves (wheel, touch, or a
  // press that may be a scrollbar drag). Programmatic scrolls never set it, so
  // it is what separates "the reader moved this" from "the page moved under
  // them" — see the two takeover thresholds above.
  const lastGestureRef = useRef(0);
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
  const reasoningFollowRef = useRef<{ box: HTMLDivElement; top: number; following: boolean } | null>(null);
  const [expandedCode, setExpandedCode] = useState<Set<string>>(new Set());
  const [expandedReasoning, setExpandedReasoning] = useState<Set<string>>(new Set());
  const [expandedActions, setExpandedActions] = useState(() => new Set(initialExpandedActions));
  const [copiedId, setCopiedId] = useState<string | null>(null);
  // User-collapsed state of the live streaming reasoning window.
  const [reasoningCollapsed, setReasoningCollapsed] = useState(false);
  // Whether the stream has written past the bottom of its window — what puts
  // the jump-to-latest button on screen. Nothing drags the window along as the
  // answer arrives, so this is the ordinary state of a reasoning chain of any
  // length, and the button is the way to the live end.
  const [reasoningOverflows, setReasoningOverflows] = useState(false);
  const [reasoningViewportSize, setReasoningViewportSize] = useState({ width: 0, height: 0 });
  const isMobile = useIsMobile();

  /**
   * Take the reasoning window to the live end of the stream — which is further
   * than the last line. Landing that line flush against the bottom edge would
   * put the next token below the fold again, so the jump brings the newest
   * line to the top and leaves the rest of the window open for what streams
   * in next.
   *
   * Instant rather than animated: the press is a request to be at the live end
   * now, and the text keeps arriving while any glide would still be travelling.
   */
  const jumpToLatestReasoning = useCallback((): void => {
    const el = reasoningScrollRef.current;
    const content = el?.firstElementChild;
    if (!el || !content) return;
    const parsedLine = Number.parseFloat(getComputedStyle(el).lineHeight);
    const line = Number.isFinite(parsedLine) && parsedLine > 0
      ? parsedLine
      : REASONING_FALLBACK_LINE;
    // Travel the distance that brings the text's last line to the window's top.
    const boxTop = el.getBoundingClientRect().top;
    el.scrollTop += content.getBoundingClientRect().bottom - boxTop - line;
    reasoningFollowRef.current = { box: el, top: el.scrollTop, following: true };
    setReasoningOverflows(reasoningTailBelowFold(el) > REASONING_BOTTOM_EPS);
  }, []);

  /* The stream's reading sizes.
   *
   * A phone is set at the platform's own 16px — the size every other app it
   * sits beside is read at, and the size below which the browser magnifies the
   * page out from under a focused field (see the floor in index.css). The
   * studio's column keeps its 14: there the stream is one panel of a workspace
   * being worked in, not the whole of what is on screen. */
  const bodyText = isMobile ? 'text-base' : 'text-sm';
  /* Marks set against `bodyText`: a glyph reads lighter than a letterform, so
     it runs a step over the type it stands beside rather than level with it. */
  const markSize = isMobile ? 16 : 14;
  // On mobile, long-pressing a message reveals the rollback button (no real hover state on touch screens)
  const [longPressedId, setLongPressedId] = useState<string | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lastUserIndex = useMemo(
    () => messages.findLastIndex((m) => m.role === 'user'),
    [messages],
  );
  const lastUserMsgId = messages[lastUserIndex]?.id;
  const liveReplyMessageId = liveReply && isLoading && lastUserIndex >= 0
    ? messages.findLast((message, index) => index > lastUserIndex && message.role === 'assistant')?.id
    : undefined;
  const replyCodeMessageId = lastUserIndex >= 0
    ? messages.findLast((message, index) => index > lastUserIndex && message.role === 'assistant' && message.code)?.id
    : undefined;
  // The greeting bubble only ever occupies a fresh session (one message, the
  // greeting itself) — once a real turn has happened it stays out of the
  // scrollback entirely rather than sitting inline as a normal reply.
  const greetingMsg = messages.find((m) => m.isGreeting);
  const hasConversationMessages = messages.some((m) => !m.isGreeting);
  const revisionsById = useMemo(
    () => new Map((revisions ?? []).map((revision) => [revision.id, revision])),
    [revisions],
  );

  const draftBase = useMemo(() => draftBaseCode(messages), [messages]);
  const settledDraft = useSettled(draftCode, DRAFT_DIFF_SETTLE_MS);
  /**
   * The manual edit, as a revision the widget beside a turn would recognise —
   * synthesised each render rather than stored, so it cannot fall out of step
   * with the editor.
   *
   * Absent when there is nothing to show: type a character and delete it again
   * and the segment goes rather than sitting there claiming +0/−0. Absent for
   * the length of a turn as well — the turn's own baseline was taken when it
   * started (`useAgentRunner`), and once it lands its take becomes the new base
   * and the difference closes on its own.
   */
  const draftRevision = useMemo<CodeRevision | null>(() => {
    if (isLoading) return null;
    if (draftBase === null) return null;
    // A commit updates the live draft and baseline together, while the
    // debounced draft can still hold the previous take for 180ms. Do not let
    // that stale value mount a phantom edit, move the filler, and scroll the
    // reading away only to scroll it back when the debounce catches up.
    if (draftCode === draftBase) return null;
    if (settledDraft === draftBase) return null;
    return {
      id: DRAFT_SEGMENT_ID,
      beforeCode: draftBase,
      afterCode: settledDraft,
      playbackStatus: 'not_attempted',
      createdAt: 0,
    };
  }, [isLoading, draftCode, settledDraft, draftBase]);
  /* Presence, deliberately not content: this is what the scroll effect watches,
     so the reading is brought to the segment once, when it appears, and then
     left alone for every keystroke that follows. */
  const hasDraftSegment = draftRevision !== null;

  /**
   * The one widget that is sounding, or none — resolved here so it cannot be
   * two.
   *
   * The pressed key wins while what it put on is still what sounds; its code is
   * the code that was *played*, so typing on past a draft that is still playing
   * does not hand the light to some older take that happens to match the text.
   *
   * Falling back to the text covers the takes nobody pressed: a turn plays
   * itself the moment it commits, and the studio's transport plays whatever the
   * editor holds. Where several match, the last one wins — the nearest to the
   * live end is the one a reader means.
   */
  const soundingSegmentId = useMemo(() => {
    if (!isPlaying) return null;
    if (pressedSegmentId && pressedSegmentCode === playingCode) return pressedSegmentId;
    const widgets: { id: string; code: string }[] = [];
    for (const message of messages) {
      if (message.role !== 'assistant' || message.code == null) continue;
      const revision = message.revisionId ? revisionsById.get(message.revisionId) : undefined;
      widgets.push({ id: message.id, code: revision ? revision.afterCode : message.code });
    }
    if (draftRevision) widgets.push({ id: DRAFT_SEGMENT_ID, code: draftRevision.afterCode });
    for (let index = widgets.length - 1; index >= 0; index--) {
      if (widgets[index].code === playingCode) return widgets[index].id;
    }
    return null;
  }, [isPlaying, pressedSegmentId, pressedSegmentCode, playingCode, messages, revisionsById, draftRevision]);

  // Detect manual user scroll relative to the current automatic target and
  // resume when scrolled back to it. Scroll events produced by our own
  // smooth turn-start animation must not count as manual — its intermediate
  // frames are >80px from the bottom and would cut the animation short — so
  // while a programmatic scroll is in flight, only a real user gesture
  // (wheel/touch) cancels it.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handleScroll = () => {
      if (liveScroll.current) return;
      const auto = autoScrollRef.current;
      if (auto) {
        if (Math.abs(el.scrollTop - auto.target) < 2) {
          autoScrollRef.current = null; // animation arrived; don't mark manual
          return;
        }
        if (performance.now() < auto.until) return;
        autoScrollRef.current = null; // stale flight (interrupted); fall through
      }
      const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
      // The anchor is where the scroll effect holds the reading — the top of
      // the live tail or user bubble in turn-anchor mode, the bottom pin
      // otherwise. Deviation is measured from it in *either* direction: with a
      // user bubble taller than the viewport the anchor sits near the top, so
      // scrolling down past it to reach the reasoning window is as much a
      // takeover as scrolling up, and a bottom-distance test misfires there.
      const anchorTarget = anchorTargetRef.current;
      const dist = anchorTarget != null
        ? Math.abs(el.scrollTop - anchorTarget)
        : distFromBottom;
      // Resume only at the automatic target. The outer scrollback's bottom
      // can sit below the turn anchor in filler space: resuming there would
      // pull the view back to the anchor on the next streamed delta.
      if (dist <= FOLLOW_RESUME_EPS) {
        userScrolledRef.current = false;
        return;
      }
      // Otherwise the takeover is sticky: anything short of the thresholds
      // leaves the current state alone rather than declaring the reader is
      // following again, which is what used to snap a part-scrolled reading
      // back on the next streamed delta.
      const gesturing = performance.now() - lastGestureRef.current < SCROLL_GESTURE_MS;
      if (dist > (gesturing ? TAKEOVER_GESTURE_EPS : TAKEOVER_IDLE_EPS)) {
        userScrolledRef.current = true;
      }
    };
    const handleUserScrollIntent = () => {
      lastGestureRef.current = performance.now();
      if (autoScrollRef.current || liveScroll.current) {
        cancelLiveScroll();
        autoScrollRef.current = null;
        userScrolledRef.current = true;
      }
    };
    // A press is only a *possible* scroll gesture (a scrollbar drag, which
    // fires no wheel or touch events of its own), so it lowers the takeover
    // threshold without cancelling an in-flight glide the way a wheel does —
    // clicking in the scrollback shouldn't abort the turn-start animation.
    const handlePointerDown = () => {
      lastGestureRef.current = performance.now();
      if (liveScroll.current) handleUserScrollIntent();
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    el.addEventListener('wheel', handleUserScrollIntent, { passive: true });
    el.addEventListener('touchmove', handleUserScrollIntent, { passive: true });
    el.addEventListener('pointerdown', handlePointerDown, { passive: true });
    return () => {
      cancelLiveScroll();
      liveStatusAnimation.current?.cancel();
      el.removeEventListener('scroll', handleScroll);
      el.removeEventListener('wheel', handleUserScrollIntent);
      el.removeEventListener('touchmove', handleUserScrollIntent);
      el.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [cancelLiveScroll]);

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
  // anchoring there until live output extends below the visible area. Then
  // follow the status at the end of the output. Before the first turn (e.g.
  // a freshly opened past session) it falls back to pinning the bottom.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const turnJustStarted = turnInProgress && !prevIsLoadingRef.current;
    const replyJustFinished = !turnInProgress && prevIsLoadingRef.current
      && messages.findLast(message => message.role !== 'progress')?.role === 'assistant';
    prevIsLoadingRef.current = turnInProgress;
    if (turnJustStarted) completedReplyCodeId.current = undefined;
    if (replyJustFinished) completedReplyCodeId.current = replyCodeMessageId;
    const replyContainer = liveReplyMessageId
      ? `[data-message-id="${CSS.escape(liveReplyMessageId)}"]`
      : '[data-live-router-reply]';
    const replyBody = !liveReply ? 'waiting'
      : el.querySelector(`${replyContainer} > [data-markdown-text]:not(:empty)`) ? 'visible' : 'partial';
    const receiptId = isLoading && routedStream ? replyCodeMessageId : undefined;
    const previous = previousReplyLayout.current;
    // The receipt text can appear before the streamed answer replaces it.
    // Settle both layout changes before painting, then reveal text.
    const replyLayoutChanged = isLoading && routedStream
      && (previous?.receiptId !== receiptId
        || ((previous?.body ?? 'waiting') !== replyBody && (Boolean(receiptId) || replyBody === 'visible')));
    previousReplyLayout.current = isLoading ? { receiptId, body: replyBody } : null;
    if (replyLayoutChanged) {
      liveStatusAnimation.current?.cancel();
      liveStatusAnimation.current = null;
      cancelLiveScroll();
      autoScrollRef.current = null;
    }
    const draftJustAppeared = hasDraftSegment && !prevHasDraftSegmentRef.current;
    prevHasDraftSegmentRef.current = hasDraftSegment;
    if (isVideoMode && !scrollBottom) {
      cancelLiveScroll();
      // [video] Video mode: display from the top; only scroll to bottom when scrollBottom=true
      el.scrollTop = 0;
      anchorTargetRef.current = null;
    } else {
      // Turn start overrides any manual scroll (the user just acted on this turn).
      if (turnJustStarted) userScrolledRef.current = false;
      const bottomPin = Math.max(0, el.scrollHeight - el.clientHeight);
      let target = bottomPin;
      if (turnInProgress && turnAnchorActive && lastUserMsgId) {
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
          // Rest the bubble on the scrollport's own top padding instead of
          // flush with its edge: that band is what holds the rollback key
          // hanging off the bubble's corner clear of the top veil. Measured
          // rather than repeated, so the two can't drift apart.
          const topInset = parseFloat(getComputedStyle(el).paddingTop) || 0;
          if (node === el) target = Math.min(bottomPin, top - topInset);
        }
      }
      const liveStatus = liveStatusRef.current;
      const allowMotion = !isVideoMode && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const statusHeight = liveStatus?.offsetHeight ?? 0;
      // Fit the reasoning window above the status. Keep enough space for the
      // badge when revealing the reasoning window at the bottom of the stream.
      const preEl = reasoningScrollRef.current;
      if (preEl) {
        let reasoningTop = 0;
        let walk: HTMLElement | null = preEl;
        while (walk && walk !== el) {
          reasoningTop += walk.offsetTop;
          walk = walk.offsetParent as HTMLElement | null;
        }
        if (walk === el) {
          const frame = preEl.parentElement;
          if (frame && !isVideoMode) {
            // Match the window's CSS min-height so long prompts still get a
            // readable window, revealed below only when it truly cannot fit.
            frame.style.maxHeight = `${Math.max(160, el.clientHeight - (reasoningTop - target) - statusHeight - 16)}px`;
          }
          const rBottom = reasoningTop + preEl.offsetHeight + statusHeight;
          const revealTarget = rBottom - el.clientHeight + 16;
          if (revealTarget > target) target = Math.min(bottomPin, revealTarget);
        }
      }
      if (liveStatus) {
        const status = liveStatus.getBoundingClientRect();
        const viewportTop = el.getBoundingClientRect().top + el.clientTop;
        const revealTarget = Math.min(bottomPin, el.scrollTop + status.bottom - viewportTop - el.clientHeight + 16);
        // Keep the current position when the status gets shorter, provided
        // the last lines and the status can still share the viewport.
        const statusTop = el.scrollTop + status.top - viewportTop;
        const statusAlreadyAboveTarget = status.height > 0 && target > statusTop;
        target = statusAlreadyAboveTarget ? revealTarget : Math.max(target, revealTarget);
        if (!turnJustStarted && !preEl && status.height > 0 && status.top - viewportTop >= 48) {
          target = Math.max(target, Math.min(bottomPin, el.scrollTop));
        }
        const moving = liveStatusContentRef.current;
        if (moving) {
          const contentTop = statusTop + moving.offsetTop;
          const previous = liveStatusPosition.current;
          if (previous?.node === moving && Math.abs(previous.top - contentTop) > 1 && allowMotion && !replyLayoutChanged) {
            const offset = moving.getBoundingClientRect().top - status.top - moving.offsetTop;
            liveStatusAnimation.current?.cancel();
            liveStatusAnimation.current = moving.animate?.([
              { transform: `translateY(${previous.top - contentTop + offset}px)` },
              { transform: 'translateY(0)' },
            ], { duration: LIVE_FOLLOW_MS, easing: LIVE_FOLLOW_EASING }) ?? null;
          }
          liveStatusPosition.current = { node: moving, top: contentTop };
        }
      } else {
        liveStatusPosition.current = null;
        liveStatusAnimation.current?.cancel();
        liveStatusAnimation.current = null;
      }
      if (replyJustFinished) target = bottomPin;
      if (replyCodeMessageId && completedReplyCodeId.current === replyCodeMessageId) {
        const id = CSS.escape(replyCodeMessageId);
        const diff = el.querySelector<HTMLElement>(`[data-code-diff="${id}"]`);
        const bar = diff?.firstElementChild ?? el.querySelector(`[data-code-bar="${id}"]`);
        const widget = diff ?? bar?.parentElement;
        if (widget && bar && el.clientHeight > 0) {
          // Use the widget's layout edge: its sticky bar can measure at the
          // current scroll position rather than where it will end up.
          const bounds = el.getBoundingClientRect();
          const barTop = el.scrollTop + widget.getBoundingClientRect().top - bounds.top - el.clientTop;
          const barHeight = bar.getBoundingClientRect().height;
          if (barHeight > 0) {
            const inset = parseFloat(getComputedStyle(el).paddingTop) || 0;
            const earliest = barTop + barHeight + 16 - el.clientHeight;
            const latest = barTop - inset;
            // If the bottom pin would bury the widget above the viewport,
            // keep the current reading position when it still shows the bar.
            if (target > latest) target = el.scrollTop;
            target = Math.min(bottomPin, Math.max(earliest, Math.min(target, latest)));
          }
        }
      }
      target = Math.max(0, target);
      // Recorded on every commit, taken-over or not: it is what the takeover
      // test measures deviation from, and an anchor left stale under a growing
      // scrollback would never let a reader who scrolls back down resume
      // following (see handleScroll / anchorTargetRef).
      anchorTargetRef.current = target;
      if (replyJustFinished) {
        // The finished reply may add footer space below the code widget.
        // Keep the widget visible while settling the final layout.
        cancelLiveScroll();
        autoScrollRef.current = null;
        userScrolledRef.current = false;
        el.scrollTop = target;
      } else if (!userScrolledRef.current) {
        const auto = autoScrollRef.current;
        const hasLiveOutput = liveStatus && routedStream
          && el.querySelector('[data-live-router-progress], [data-live-batch-text]');
        const followsStreamingReply = !preEl && hasLiveOutput;
        if (replyLayoutChanged) {
          el.scrollTop = target;
        } else if (followsStreamingReply && allowMotion && Math.abs(el.scrollTop - target) > 1) {
          if (!liveScroll.current || Math.abs((auto?.target ?? -1) - target) > 1) glideLiveScroll(el, target);
        } else if ((turnJustStarted || draftJustAppeared) && !hasLiveOutput && allowMotion) {
          cancelLiveScroll();
          autoScrollRef.current = { target, until: performance.now() + 800 };
          el.scrollTo({ top: target, behavior: 'smooth' });
        } else if (!hasLiveOutput && auto && performance.now() < auto.until && Math.abs(auto.target - target) <= 1) {
          // Let an intentional reveal finish while its destination is stable.
        } else {
          // Layout changes are not navigation. In particular, the reasoning
          // window disappears before playback finishes and the final reply
          // arrives. Animating that correction leaves the new reply moving
          // through the old window's scroll position. Settle before paint and
          // cancel any flight whose destination no longer matches the layout.
          cancelLiveScroll();
          autoScrollRef.current = null;
          el.scrollTop = target;
        }
      }
    }
  }, [messages, isLoading, turnInProgress, isVideoMode, scrollBottom, lastUserMsgId, turnAnchorActive, hasDraftSegment, reasoningCollapsed, reasoningViewportSize, liveReply, batch.replyComplete, liveReplyMessageId, replyCodeMessageId, liveLayoutVersion, routedStream, cancelLiveScroll, glideLiveScroll]);

  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    const overlay = liveRevealOverlayRef.current;
    if (!isLoading || isVideoMode || !scroll || !overlay || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // The mask stays closed until the scroll glide reaches the new content.
    const delay = Math.max(0, (liveScroll.current?.end ?? 0) - performance.now());
    const reveal = revealStreamBatch(scroll, overlay, previousLiveText.current, delay);
    if (!reveal) return;
    revealUntil.current = performance.now() + delay + reveal.duration;
    return () => {
      reveal.cleanup();
      revealUntil.current = 0;
    };
  }, [batch, isLoading, isVideoMode]);

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
    if (!isLoading || lastUserIndex === -1) return ids;

    for (const msg of messages.slice(lastUserIndex + 1)) {
      if (msg.role === 'assistant') ids.add(msg.id);
    }
    return ids;
  }, [messages, isLoading, lastUserIndex]);

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
      if (messages[i].role !== 'progress' || messages[i].routerProgress) { i++; continue; }
      let j = i;
      const run: ChatMessage[] = [];
      while (j < messages.length && messages[j].role === 'progress' && !messages[j].routerProgress) run.push(messages[j++]);
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

  // Only the loading block reserves room to anchor the user's prompt.
  // It can grow for streamed text, while expanded reasoning needs a fixed
  // height to share the available space with the status.
  const turnFillerHeight = 'calc(100cqh - 68px)';

  // Whether the live streaming reasoning window has content to show right now.
  const reasoningWindowAvailable =
    isLoading && !!streamingReasoningMsg?.content && reasoningPhaseActive;
  const reasoningWindowExpanded = reasoningWindowAvailable && !reasoningCollapsed;

  // Watch the live reasoning window for text arriving below its fold. The box's
  // content can grow without resizing the window, so observe both, plus the
  // scrollport whose available height caps the window. Subscribing reports
  // once, and that first report is the initial measurement; a reader scrolling
  // the box re-measures through its own onScroll.
  // A layout effect, not a plain one: this reads layout, and measuring after
  // paint would show the window for a frame with the previous turn's answer.
  useLayoutEffect(() => {
    const measure = (): void => {
      const box = reasoningScrollRef.current;
      if (box) {
        const current = reasoningFollowRef.current;
        const follow = current?.box === box ? current : { box, top: box.scrollTop, following: true };
        if (follow.following) {
          const below = reasoningTailBelowFold(box);
          if (below > 0) box.scrollTop += below;
          follow.top = box.scrollTop;
        }
        reasoningFollowRef.current = follow;
      }
      setReasoningOverflows(box !== null && reasoningTailBelowFold(box) > REASONING_BOTTOM_EPS);
      const width = scrollRef.current?.clientWidth ?? 0;
      const height = scrollRef.current?.clientHeight ?? 0;
      setReasoningViewportSize((previous) => previous.width === width && previous.height === height
        ? previous
        : { width, height });
    };
    measure();
    const el = reasoningScrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (scrollRef.current) observer.observe(scrollRef.current);
    // MarkdownText's own root: the single child holding the streamed text.
    const content = el.firstElementChild;
    if (content) observer.observe(content);
    return () => observer.disconnect();
  }, [reasoningWindowExpanded, streamingReasoningMsg?.id]);

  // Live status shown in the loading indicator. Tool-call / commit labels
  // ("编排段落…", "准备播放…") aren't kept in the scrollback (they return null
  // above); instead the latest one surfaces here transiently while its tool
  // runs, falling back to the generic "thinking…" label otherwise. It vanishes
  // with the indicator when the turn ends. Only the current in-flight turn's
  // progress counts — completed turns keep their progress messages (for the
  // "思考过程" group) and always end with a stale commit ("准备播放").
  const lastMessage = messages.at(-1);
  const latestConversationMessage = messages.findLast(message => message.role !== 'progress');
  const liveStatus = lastMessage?.role === 'progress' &&
    (lastMessage.progressKind === 'tool_call' || lastMessage.progressKind === 'commit')
    ? lastMessage
    : undefined;
  const isSearchingSamples = liveStatus?.toolName === 'searchSamples';
  const stage = batch.stage;
  const liveStatusLabel = batch.operation
    ?? (stage ? t(routerStageLabels[stage])
      : isSearchingSamples ? t('searchingSamples') : liveStatus?.content ?? t('thinking'));
  const routerProcess = useMemo(
    () => groupRouterProcess(messages, isLoading ? lastUserIndex : undefined),
    [messages, isLoading, lastUserIndex],
  );
  const sampleSearchSummary = isSearchingSamples ? liveStatus?.sampleSearchSummary : undefined;

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
                the scrollport padding above the sticky row for the same reason,
                so both are the scrollport's own top inset.
                scroll-mt makes the onClick scrollIntoView land the header at
                that same inset frozen spot — without it, collapsing aligns the
                header flush to the scrollport edge (0px) and re-expanding snaps
                it back down to the inset, a visible jump. */}
            <button
              data-reasoning-header={msg.id}
              aria-expanded={isExpanded}
              onClick={() => {
                toggleReasoning(msg.id);
                requestAnimationFrame(() => {
                  scrollRef.current
                    ?.querySelector(`[data-reasoning-header="${CSS.escape(msg.id)}"]`)
                    ?.scrollIntoView({ block: 'nearest' });
                });
              }}
              className={`sticky top-0 z-10 -mx-2 scroll-mt-[var(--spacing-conversation-top-inset)] flex w-[calc(100%+1rem)] items-center gap-1.5 bg-conversation-surface px-2 py-0.5 text-sm text-text-secondary/60 transition-colors hover:text-text-secondary before:absolute before:inset-x-0 before:top-[calc(var(--spacing-conversation-top-inset)*-1)] before:h-[var(--spacing-conversation-top-inset)] before:bg-conversation-surface${
                isExpanded ? ' reasoning-header--expanded' : ''
              }`}
            >
              <ChevronRightIcon
                size={markSize}
                className={`flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              />
              <span className="font-bold text-text-primary">{t('reasoningTitle')}</span>
              {reasoningDurationSec.get(msg.id) != null && (
                <span>· {formatThinkDuration(reasoningDurationSec.get(msg.id)!)}</span>
              )}
            </button>
            {isExpanded && (
              <div className={`mt-1.5 ${bodyText} border-l border-border/60 pl-3 text-text-secondary font-mono break-words leading-relaxed animate-fade-in`}>
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
    if (msg.progressKind === 'tool_call' && msg.toolName === 'analyzeHummingWaveform') {
      return <div key={msg.id} data-progress-message={msg.id} className="px-2 text-sm text-text-muted">{t('hummingReadingWaveform')}</div>;
    }
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
        <div key={msg.id} data-progress-message={msg.id} className="flex justify-start animate-fade-in">
          <div className="w-full text-sm text-text-secondary px-2 flex items-start gap-1.5">
            <span className="flex w-3.5 justify-center flex-shrink-0 mt-[7px]">
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
            </span>
            <span><MusicText text={stripMarkdown(msg.content)} /></span>
          </div>
        </div>
      );
    }
    return (
      <div key={msg.id} data-progress-message={msg.id} className="flex justify-start animate-fade-in">
        <div className="w-full text-sm text-text-muted/70 px-2">
          <span>{msg.content}</span>
        </div>
      </div>
    );
  };

  const loadingStatus = isLoading ? (
    <div ref={liveStatusRef} data-live-reply-heading
      className={`relative shrink-0 px-1.5${reasoningWindowExpanded || sampleSearchSummary?.length ? ' pt-3' : ''}`}>
      <div ref={liveStatusContentRef} className="flex items-start gap-1.5">
        <AgentStageIndicator stage={stage} operation={batch.operation} status={liveStatus} />
        <div className="min-w-0">
          {reasoningWindowAvailable ? (
            <button
              data-live-reasoning-toggle
              onClick={() => setReasoningCollapsed((v) => !v)}
              aria-expanded={reasoningWindowExpanded}
              className={`flex min-w-0 items-center gap-1.5 text-left ${bodyText} text-text-primary transition-colors hover:text-text-secondary`}
              title={reasoningWindowExpanded ? t('collapseReasoning') : t('expandReasoning')}
            >
              <span data-live-reasoning-label className="min-w-0">{liveStatusLabel}</span>
              <ChevronRightIcon
                size={18}
                className={`flex-shrink-0 transition-transform ${reasoningWindowExpanded ? 'rotate-90' : ''}`}
              />
            </button>
          ) : (
            <div role="status" className={`min-w-0 ${bodyText} text-text-primary`}>
              {liveStatusLabel}
            </div>
          )}
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="conversation-scroll-shell">
      {/* isolate scopes the z-indexes used inside the stream (the reasoning
          row's z-20 / its sticky header's z-10) to this container, so they
          rank only against each other — without it they'd leak out and paint
          over outside overlays like the history panel (z-10 in Sidebar). */}
      <div
        ref={scrollRef}
        className={`conversation-scroll isolate h-full overflow-y-auto px-4 pt-[var(--spacing-conversation-top-inset)] pb-[10px] space-y-[40px] relative${
          reasoningWindowExpanded ? ' scrollbar-hidden' : ''
        }`}
        style={{ scrollbarGutter: 'stable' }}
      >
      {greetingMsg && !hasConversationMessages && !isLoading && (
        // The phone's guide centres its invitation on this frame, so the card
        // covers the greeting rather than leaving its ends showing.
        <div data-onboarding-target="greeting" className="absolute inset-0 flex flex-col items-center justify-center px-8">
          {/* Replay the invitation's entrance together with its playback
              control when an empty session receives a new greeting. */}
          <div
            key={greetingMsg.id}
            className="animate-blur-fade-in flex w-full flex-col items-center gap-3"
          >
            <p
              // A step larger on a phone: this is the one line on an empty
              // screen, read at arm's length on a display the width of a hand,
              // where the desktop's 14px reads as fine print rather than as an
              // opening.
              className={`text-center text-text-greeting leading-relaxed ${
                zh ? 'font-jinghua-laosongti tracking-wider' : 'font-eb-garamond'
              } ${isMobile ? 'text-base' : 'text-sm'}`}
            >
              {greetingMsg.content}
            </p>
            {isMobile && draftCode.trim() && (
              <button
                type="button"
                aria-label={isPlaying && playingCode === draftCode ? t('pause') : t('play')}
                title={isPlaying && playingCode === draftCode ? t('pause') : t('play')}
                disabled={!engineReady || isStarting}
                onClick={() => {
                  if (isPlaying && playingCode === draftCode) onPauseCode?.();
                  else onPlayCode?.(draftCode);
                }}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full transition-opacity duration-[1500ms] ease-out disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-accent"
              >
                <span aria-hidden="true" className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand-accent text-on-accent transition-colors hover:bg-brand-accent-hover">
                  {isPlaying && playingCode === draftCode
                    ? <PauseIcon size={16} />
                    : <PlayIcon size={16} />}
                </span>
              </button>
            )}
          </div>
        </div>
      )}

      {messages.map((msg, messageIndex) => {
        if (msg.isGreeting) return null;
        if (routerProcess.groupOf.has(msg.id)) {
          const process = routerProcess.groups.get(msg.id);
          return process ? <RouterProcessView key={msg.id} id={msg.id} process={process}
            expanded={expandedActions.has(msg.id)} onToggle={() => toggleActions(msg.id)}
            markSize={markSize} formatDuration={formatThinkDuration}
            renderNarration={content => <MarkdownText content={content} />} /> : null;
        }
        if (msg.role === 'progress') {
          if (msg.routerProgress) {
            const live = isLoading && messageIndex > lastUserIndex;
            if (live && (isCompletionTool(msg.routerProgress)
              || (msg.routerProgress.kind !== 'operation' && isCodeMaintenanceText(msg.routerProgress.title)))) return null;
            const duration = routerStrategySeconds(msg.routerProgress);
            return <RouterProgressView key={msg.id} entry={msg.routerProgress}
              live={live}
              durationLabel={duration === undefined ? undefined : formatThinkDuration(duration)} />;
          }
          if (isLoading && messageIndex > lastUserIndex && msg.progressKind !== 'reasoning'
            && isCodeMaintenanceText(msg.content)) return null;
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
                  <ActionProcessHeader id={gid} expanded={expanded} onToggle={() => toggleActions(gid)}
                    markSize={markSize} duration={formatThinkDuration(actionGroupDurationSec.get(gid)!)} />
                )}
                {content && <div className={isHeader ? 'mt-3' : ''}>{content}</div>}
              </div>
            );
          }
          return renderProgressContent(msg);
        }

        if (msg.role === 'user') {
          const pending = msg.id === pendingHumming?.id ? pendingHumming : undefined;
          const hasText = Boolean(msg.content.trim());
          const imageOnly = !hasText && Boolean(msg.images?.length);
          const rollbackButtonEnabled = !pending && (!isMobile || imageOnly || longPressedId === msg.id);
          const rollbackButton = (
            <div className={`absolute -top-2.5 -right-2.5 transition-opacity ${
              isMobile
                ? (rollbackButtonEnabled ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none')
                : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
            }`}>
              <button
                onClick={() => { onRollback(msg.id); setLongPressedId(null); }}
                disabled={!rollbackButtonEnabled}
                className="conversation-rollback-button w-6 h-6 rounded-full border border-border bg-bg-primary text-text-secondary hover:text-text-primary hover:border-accent/50 transition-colors flex items-center justify-center"
                title={t('rollbackHere')}
              >
                <Undo2 size={12} />
              </button>
            </div>
          );
          return (
            <Fragment key={msg.id}>
              <div
                data-selected-choice={msg.selectedChoice || undefined}
                className={`flex justify-end items-end gap-1.5 group ${msg.selectedChoice ? 'conversation-selected-choice' : 'animate-fade-in'}`}
              >
                <div
                  className={`relative flex min-w-0 max-w-[85%] flex-col items-end gap-2 ${bodyText} text-text-primary${
                    isMobile ? ' mobile-rollback-bubble-no-select' : ''
                  }`}
                  data-rollback-bubble={msg.id}
                  onCopy={handleUserBubbleCopy}
                  {...(!pending ? getMobileRollbackBubbleProps(msg.id) : {})}
                >
                  {Boolean(msg.images?.length) && <div className="relative max-w-full"><MessageImages images={msg.images} />{imageOnly && !pending && rollbackButton}</div>}
                  <MessageHummingCards humming={msg.humming} pending={pending} ownerKey={ownerKey} />
                  <div className={`relative max-w-full ${hasText ? 'rounded-[6px] bg-message-user px-3 py-2' : ''}`}>
                    {hasText && <UserMessageBubble content={msg.content} />}
                    {/* Rollback button — top-right of bubble. Desktop: visible on group-hover. Mobile: visible on long-press (no real hover state on touch). */}
                    {!pending && <div className={`absolute -right-2.5 transition-opacity ${hasText ? '-top-2.5' : 'bottom-2.5'} ${
                      isMobile
                        ? (rollbackButtonEnabled ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none')
                        : 'opacity-0 group-hover:opacity-100'
                    }`}>
                      <button
                        onClick={() => { onRollback(msg.id); setLongPressedId(null); }}
                        disabled={!rollbackButtonEnabled}
                        className="conversation-rollback-button w-6 h-6 rounded-full border border-border bg-bg-primary text-text-secondary hover:text-text-primary hover:border-accent/50 transition-colors flex items-center justify-center"
                        title={t('rollbackHere')}
                      >
                        <Undo2 size={12} />
                      </button>
                    </div>}
                  </div>
                </div>
              </div>
              {pending && (
                <div data-assistant-humming-progress role="status" className="flex min-w-0 items-start gap-1.5 px-2 text-sm text-text-secondary">
                  <AgentStageIndicator stage="humming" />
                  <div className="min-w-0">
                    {hummingWaveformToolCalled ? (
                      <>
                        {t('hummingReadingWaveform')}
                        {pending.takes.length > 1 && ` (${pending.takeNumber}/${pending.takes.length})`}
                      </>
                    ) : t('hummingTranscribing')}
                  </div>
                </div>
              )}
            </Fragment>
          );
        }

        if (loadingTurnAssistantIds.has(msg.id) && msg.id !== liveReplyMessageId
          && !msg.code && isCodeMaintenanceText(msg.content)) return null;

        // assistant message:
        // A turn can hold several assistant bubbles (mid-loop narration + the
        // final reply). Retry/branch actions — and the mb-16 that reserves the
        // hanging space below the bubble for them — only apply to the turn's
        // final bubble; on intermediate narration the margin would just read
        // as a dead gap between paragraphs.
        const isLiveAssistant = loadingTurnAssistantIds.has(msg.id);
        const showsTurnActions = turnFinalAssistantIds.has(msg.id) && !isLiveAssistant;
        const replyCode = isLiveAssistant ? undefined : msg.code;
        const choiceHandler = msg === latestConversationMessage && !turnInProgress && !isVideoMode ? onSelectChoice : undefined;
        const stepwiseChoice = msg.inputMode === 'choice' || choiceHandler ? parseStepwiseChoice(msg.content) : null;
        const analyzedHumming = showsTurnActions
          ? messages.slice(0, messageIndex).findLast(message => message.role === 'user')?.humming
          : undefined;
        const previousMessage = messages[messageIndex - 1];
        const previousActionGroupId = previousMessage
          ? routerProcess.groupOf.get(previousMessage.id) ?? actionGroupOf.get(previousMessage.id)
          : undefined;
        const followsCollapsedActionGroup =
          previousActionGroupId !== undefined && !expandedActions.has(previousActionGroupId);
        return (
          <div
            key={msg.id}
            // items-start keeps the bubble (and its hanging action buttons)
            // at content height when the turn filler stretches the row
            className={`flex justify-start items-start animate-fade-in group${showsTurnActions ? ' mb-16' : ''}`}
          >
            <div data-message-id={msg.id} className={`relative w-full rounded-xl px-2 pb-2 ${bodyText} bg-transparent text-text-primary ${
              followsCollapsedActionGroup ? 'pt-0' : 'pt-2'
            }`}>
              {analyzedHumming && <HummingAnalysisSummary humming={analyzedHumming} />}
              <MarkdownText liveBatch={isLiveAssistant}
                completeBlocksOnly={msg.id === liveReplyMessageId && onlyCompleteLiveBlocks}
                content={msg.id === liveReplyMessageId ? liveReply ?? '' : stepwiseChoice?.content ?? msg.content} />
              {stepwiseChoice && choiceHandler && (
                <StepwiseChoices options={stepwiseChoice.options} isMobile={isMobile} onSelect={choiceHandler} />
              )}
              {replyCode && msg.revisionId && revisionsById.has(msg.revisionId) && (
                <CodeDiffView
                  messageId={msg.id}
                  revision={revisionsById.get(msg.revisionId)!}
                  expanded={guidedReply?.id === msg.id ? guidedReply.expanded : expandedCode.has(msg.id)}
                  onToggle={guidedReply?.id === msg.id
                    ? () => guidedReply.onExpandedChange(!guidedReply.expanded)
                    : () => toggleCode(msg.id)}
                  guided={guidedReply?.id === msg.id && guidedReply.enlarged
                    ? { playDisabled: guidedReply.playDisabled, stopDisabled: guidedReply.stopDisabled }
                    : undefined}
                  playing={soundingSegmentId === msg.id}
                  starting={startingSegmentId === msg.id}
                  onPlay={onPlaySegment
                    ? () => onPlaySegment(msg.id, revisionsById.get(msg.revisionId!)!.afterCode)
                    : undefined}
                  onStop={onStopCode}
                />
              )}
              {replyCode && (!msg.revisionId || !revisionsById.has(msg.revisionId)) && (() => {
                const isExpanded = expandedCode.has(msg.id);
                const code = replyCode;
                const lineCount = code.split('\n').length;
                // Hoisted out of the play key below: the firmer edge is worn by
                // the whole widget, not just the key that started it.
                const sounding = soundingSegmentId === msg.id;
                const starting = startingSegmentId === msg.id;
                return (
                  <div
                    data-code-bar-sounding={sounding || undefined}
                    className={`conversation-code-bar mt-4 -ml-1 rounded-md overflow-clip animate-fade-in${
                      sounding ? ' conversation-code-bar--sounding' : ''
                    }`}
                  >
                    {/* The same split as the widget beside it (see
                        CodeDiffView): the fill sits on the keys, and the seam
                        between the reading half and the play key is the one
                        place the box shows through. Opened out it sticks to
                        the top of the stream as CodeDiffView's bar does. */}
                    <div
                      data-code-bar={msg.id}
                      className={`sticky top-0 z-10 w-full flex scroll-mt-[var(--spacing-conversation-top-inset)] items-stretch gap-0.5 bg-conversation-surface ${isMobile ? 'text-[12px]' : 'text-[11px]'} text-diff-accent/70 before:absolute before:inset-x-0 before:bottom-full before:h-[var(--spacing-conversation-top-inset)] before:bg-conversation-surface`}
                    >
                      <div className="conversation-code-bar-part flex min-w-0 flex-1 items-stretch bg-bg-primary/60">
                        <button
                          onClick={() => {
                            toggleCode(msg.id);
                            if (isExpanded) requestAnimationFrame(() => {
                              scrollRef.current
                                ?.querySelector(`[data-code-bar="${CSS.escape(msg.id)}"]`)
                                ?.scrollIntoView({ block: 'nearest' });
                            });
                          }}
                          className={`flex-1 flex items-center ${isMobile ? 'gap-1.5 px-2.5 py-2' : 'gap-1.5 px-2 py-1.5'} hover:text-diff-accent/90 hover:bg-bg-primary/80 transition-colors text-left`}
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
                          className={`${isMobile ? 'px-2.5 py-2' : 'px-2 py-1.5'} text-diff-accent/70 hover:text-diff-accent/90 hover:bg-bg-primary/80 transition-colors`}
                          title={t('copyCode')}
                        >
                          {copiedId === msg.id ? <CheckIcon size={isMobile ? 14 : 13} /> : <CopyIcon size={isMobile ? 14 : 13} />}
                        </button>
                      </div>
                      {onPlaySegment && (() => (
                          <button
                            type="button"
                            data-code-bar-play={msg.id}
                            aria-label={sounding ? t('stop') : starting ? t('playStarting') : t('play')}
                            aria-busy={starting || undefined}
                            disabled={starting}
                            onClick={() => (sounding ? onStopCode?.() : onPlaySegment(msg.id, code))}
                            className={`conversation-code-bar-part grid ${isMobile ? 'w-9' : 'w-7'} shrink-0 place-items-center bg-bg-primary/60 hover:text-diff-accent/90 hover:bg-bg-primary/80 transition-colors disabled:cursor-not-allowed`}
                          >
                            {sounding
                              ? <StopIcon size={isMobile ? 13 : 12} />
                              : starting
                                ? <PlayStartingMark size={12} />
                                : (isMobile ? <PlayIcon size={14} /> : <PlayOutlineIcon size={13} />)}
                          </button>
                      ))()}
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
                    className="flex h-[22px] w-[22px] items-center justify-center rounded-[6px] text-icon-idle transition-colors hover:bg-surface-hover"
                    title={t('retry')}
                  >
                    <RetryIcon size={markSize} />
                  </button>
                  <button
                    onClick={() => onBranch(msg.id)}
                    className="flex h-[22px] w-[22px] items-center justify-center rounded-[6px] text-icon-idle transition-colors hover:bg-surface-hover"
                    title={t('branchFrom')}
                  >
                    <GitBranchIcon size={markSize} />
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* The manual edit, standing on its own at the end of the reading.
          Derived from the draft rather than stored in `messages`, which is what
          keeps a keystroke from re-running the scroll layout effect below (its
          dependencies are the messages, not the code) — so the segment can
          appear and grow under a typist's hands without the reading moving. No
          bubble, no retry, no branch: nothing generated this, so there is no
          turn to run again. */}
      {draftRevision && (
        <div className="flex justify-start items-start animate-fade-in">
          {/* No top padding, and the widget inside drops its own top margin (see
              CodeDiffView's draft variant). Standing on its own, the segment is
              not a widget hung under a paragraph: it is a block of the reading,
              and it should sit off the reply above it by exactly what a user
              bubble sits off one — the collapsed margin between siblings, and
              nothing added on top. */}
          <div className="w-full rounded-xl px-2 pb-2">
            <CodeDiffView
              messageId={DRAFT_SEGMENT_ID}
              revision={draftRevision}
              variant="draft"
              expanded={expandedCode.has(DRAFT_SEGMENT_ID)}
              onToggle={() => toggleCode(DRAFT_SEGMENT_ID)}
              playing={soundingSegmentId === DRAFT_SEGMENT_ID}
              starting={startingSegmentId === DRAFT_SEGMENT_ID}
              onPlay={onPlaySegment
                ? () => onPlaySegment(DRAFT_SEGMENT_ID, draftRevision.afterCode)
                : undefined}
              onStop={onStopCode}
            />
          </div>
        </div>
      )}

      {/* Reserve space below the user while the turn is still running. */}
      {isLoading && (
        <div
          className="animate-fade-in flex flex-col"
          style={isVideoMode ? undefined : reasoningWindowExpanded ? { height: turnFillerHeight } : { minHeight: turnFillerHeight }}
        >
          {liveReply && !liveReplyMessageId && (
            <div className={`shrink-0 px-2 ${bodyText} text-text-primary`} data-live-router-reply data-live-batch-text>
              <MarkdownText content={liveReply} completeBlocksOnly={onlyCompleteLiveBlocks} />
            </div>
          )}
          {reasoningWindowExpanded && streamingReasoningMsg && (
            // flex-1 (rather than a calc'd height) fills exactly whatever
            // room the fixed height above leaves after the indicator row.
            // The scroll layout effect caps this frame to the visible room
            // below preceding messages; the outer filler keeps its height.
            // min-h-0 lets it size below its content's natural height, which
            // is what lets the scroll box's own h-full resolve to a real,
            // clipped value instead of just growing to fit the streamed text.
            <div className="relative w-full px-2 flex-1 min-h-0 animate-fade-in">
              <div
                // Keyed by the reasoning it shows, so each one opens at its own
                // beginning. A turn runs many of these, and two land back to
                // back whenever the iteration between them called only
                // `validate` or `commit` — neither of which puts a message in
                // the stream, so nothing breaks the reasoning run and the
                // window is never unmounted. Reused, it would carry the last
                // window's scroll and manual-follow state into the new one.
                key={streamingReasoningMsg.id}
                ref={reasoningScrollRef}
                onScroll={(e) => {
                  const box = e.currentTarget;
                  const behind = reasoningTailBelowFold(box) > REASONING_BOTTOM_EPS;
                  const follow = reasoningFollowRef.current;
                  if (follow?.box === box && Math.abs(follow.top - box.scrollTop) > FOLLOW_RESUME_EPS) {
                    follow.following = !behind;
                  }
                  setReasoningOverflows(behind);
                }}
                // Stop boundary gestures from moving the outer conversation,
                // whose next streamed update would otherwise snap it back.
                className="reasoning-scroll h-full min-h-[160px] text-sm text-text-reasoning font-mono break-words overflow-y-auto overflow-x-hidden overscroll-y-none leading-relaxed"
                // This nested scrollport needs its own opt-out: anchoring the
                // trailing spacer would follow new text after a manual jump.
                style={{ overflowAnchor: 'none' }}
              >
                <MarkdownText content={streamingReasoningMsg.content} tone="muted" />
                {/* Leave enough room after the text for the latest line to rest
                    at the top, but no more. Using one computed line-height
                    keeps the maximum scroll position aligned with the jump
                    target, so the reader cannot scroll into a blank window.
                    Nothing measures the box's scrollHeight for the button —
                    that reads the content element — so this spacer never
                    claims there is more to read. */}
                <div aria-hidden style={{ height: 'calc(100% - 1lh)' }} />
              </div>
              {/* Offered when the reader has scrolled back from the live end.
                  Opaque on the conversation surface so the line it overlays
                  stays hidden rather than showing through it. */}
              {reasoningOverflows && (
                <button
                  type="button"
                  data-reasoning-jump-latest
                  onClick={jumpToLatestReasoning}
                  aria-label={t('jumpToLatest')}
                  title={t('jumpToLatest')}
                  className="reasoning-jump-latest animate-fade-in absolute bottom-2 left-1/2 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border text-text-secondary shadow-[0_2px_8px_rgba(0,0,0,0.25)] transition-colors hover:text-text-primary"
                >
                  <ChevronDownIcon size={18} />
                </button>
              )}
            </div>
          )}
          {sampleSearchSummary && sampleSearchSummary.length > 0 && (
            <div data-live-batch-text className="shrink-0 px-2">
              <SampleSearchSummary key={liveStatus?.id} items={sampleSearchSummary} />
            </div>
          )}
          {loadingStatus}
        </div>
      )}

      <div ref={liveRevealOverlayRef} aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 !m-0" />
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
