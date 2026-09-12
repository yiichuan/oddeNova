import { useEffect, useState, type ReactNode } from 'react';
import type { ChatMessage } from '../../hooks/useChat';
import { t, zh } from '../../lib/i18n';
import type { FavoriteSummary } from '../../../shared/session-api';
import {
  conversationTitle,
  favoritedDateLabel,
  takeLabel,
  type FavoriteConversation,
  type FavoriteScript,
} from '../../lib/favorite-conversations';
import {
  CheckIcon,
  CopyIcon,
  EllipsisIcon,
  ListIcon,
  PlayOutlineIcon,
  StarIcon,
  StopIcon,
  TrashIcon,
  XIcon,
} from '../icons';
import ArchivedConversationView, { ArchiveCodeChip } from '../conversation/ArchivedConversationView';
import InfiniteScrollSentinel from '../common/InfiniteScrollSentinel';
import ScrollingTitle from '../common/ScrollingTitle';
import ReadOnlyCodeView from '../common/ReadOnlyCodeView';
import { useSwipeDismiss } from '../../hooks/useSwipeDismiss';

/** How long the code window takes to arrive and to leave, in ms. */
const WINDOW_MS = 240;
/** How long the list takes to travel in or out — MobileNavDrawer's own. */
const SLIDE_MS = 280;

/**
 * What the page is showing, decided upstream where the account's requests are.
 * One value rather than five booleans: the states are exclusive, and a page
 * that has to work out which of several flags wins is a page that can be asked
 * to draw two of them at once.
 */
export type MobileFavoritesState =
  | 'loading'
  | 'list-error'
  | 'empty'
  | 'detail-loading'
  | 'detail-error'
  | 'ready';

export interface MobileFavoritesPageProps {
  state: MobileFavoritesState;
  onRetry?: () => void;
  onRetryDetail?: () => void;
  /** Newest first; the page draws the order it is given. */
  summaries: readonly FavoriteSummary[];
  selectedSummaryId: string | null;
  onSelectSummary: (summary: FavoriteSummary) => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  loadMoreError?: Error | null;
  onLoadMore?: () => void;
  onRetryLoadMore?: () => void;
  /** The favorite that is open, once its detail has landed. */
  conversation: FavoriteConversation | null;
  messages: readonly ChatMessage[];
  scripts: readonly FavoriteScript[];
  selectedScript: FavoriteScript | null;
  /**
   * Whether the favorite has an exchange to read at all. Some are only a
   * script — code typed straight into the studio, or arriving with an imported
   * session — and those have no stream, not an empty one.
   */
  hasReading: boolean;
  onSelectScript: (turnId: string) => void;
  /** Whether this is the page on screen — the archive opens at its end on it. */
  active: boolean;
  /** The take that is sounding, if the sound came from one of these. */
  playingCodeMessageId: string | null;
  onPlayCode: (code: string) => void;
  onStopCode: () => void;
  onUnfavorite?: () => void;
  onDelete?: () => void;
  /** Opens the shell's navigation drawer — the page has no column of its own. */
  onOpenNav?: () => void;
}

/* Both of the page's overlays are laid over the whole window rather than over
   the page, so a phone's top bar and home indicator have to be kept off their
   contents by hand. */
const SAFE_TOP = 'max(12px, env(safe-area-inset-top))';
const SAFE_BOTTOM = 'max(12px, env(safe-area-inset-bottom))';

/* The two keys in the top bar, cut to the studio's: a 36px hit area holding a
   20px glyph, grey at rest and full strength under the thumb. A phone reads
   the two pages as one place, so the marks either side of a title should not
   be drawn twice. */
const BAR_KEY = 'flex h-9 w-9 items-center justify-center text-text-secondary'
  + ' transition-colors hover:text-text-primary';

/* The two marks in the foot, which are not that: they act on the favorite
   rather than opening something, and a bare glyph at the bottom of a reading
   is a mark you can miss with a thumb. So they carry the drawer foot's own
   plate — a filled disc, no ring — at the size a finger is drawn to. */
const FOOT_KEY = 'grid h-11 w-11 place-items-center rounded-full bg-surface-hover'
  + ' transition-colors active:bg-surface-selected';

/* One line, centred, for whatever the page is doing instead of showing a
   favorite. All five of them are the same shape — a sentence in the middle of
   the reading area — so the shape is written once. */
function PageNote({ testId, children }: { testId: string; children: ReactNode }) {
  return (
    <div
      data-testid={testId}
      className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-8 text-center text-sm text-text-muted"
    >
      {children}
    </div>
  );
}

/**
 * 收藏 on a phone.
 *
 * The desktop page is a gallery: a light field with the reading and the script
 * held up side by side on it, the collection listed in one corner and the name
 * of what is open in the other. None of that survives a screen this narrow —
 * two windows side by side is two columns of about twenty characters each, and
 * a list standing in a corner is a list covering the reading.
 *
 * So the page is folded down to what a phone can hold: the reading, whole and
 * on the page's own surface, with everything else moved behind a key. The
 * collection is a drawer that comes in from the right, the way the shell's
 * navigation comes in from the left. The script is not beside the reading but
 * under it — every take is already named in the reading by the widget that
 * points at it, and here that widget opens the take rather than swapping the
 * panel next door.
 *
 * What is left standing are the two things that are about the favorite itself:
 * letting it go, and deleting it. They are the page's foot, at opposite ends
 * of it, because they are the two acts here that cannot be undone by pressing
 * the same key again.
 */
export default function MobileFavoritesPage({
  state,
  onRetry,
  onRetryDetail,
  summaries,
  selectedSummaryId,
  onSelectSummary,
  hasMore = false,
  isLoadingMore = false,
  loadMoreError = null,
  onLoadMore = () => {},
  onRetryLoadMore = () => {},
  conversation,
  messages,
  scripts,
  selectedScript,
  hasReading,
  onSelectScript,
  active,
  playingCodeMessageId,
  onPlayCode,
  onStopCode,
  onUnfavorite,
  onDelete,
  onOpenNav,
}: MobileFavoritesPageProps) {
  const [listOpen, setListOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const swipeDismiss = useSwipeDismiss('right', () => setListOpen(false));
  const [copied, setCopied] = useState(false);
  /* Which of the two acts at the foot of the page is waiting on an answer. */
  const [asking, setAsking] = useState<'unfavorite' | 'delete' | null>(null);

  /* A window onto a take belongs to the favorite it was opened from. Moving to
     another entry leaves it holding a script the reading behind it no longer
     has a widget for, so it closes with the entry it was opened on. */
  const conversationId = conversation?.id ?? null;
  useEffect(() => {
    // Closing on a change of entry is the point; the initial run is a no-op.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCodeOpen(false);
  }, [conversationId]);

  /* Escape shuts whichever one is up, innermost first: the code window is
     opened from the reading the list drawer covers, so a press meant for it
     must not take the drawer with it. */
  useEffect(() => {
    if (!asking && !codeOpen && !listOpen) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      /* On the question, Escape is the 取消 option pressed with a key rather
         than a third way out: it answers, and answering is what closes it. */
      if (asking) setAsking(null);
      else if (codeOpen) setCodeOpen(false);
      else setListOpen(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [asking, codeOpen, listOpen]);

  /* A question about a favorite cannot outlive the favorite being open. */
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAsking(null);
  }, [conversationId]);

  const scriptPlaying = selectedScript !== null
    && playingCodeMessageId === selectedScript.turnId;

  /* The snapshot the conversation ended on, when no reply committed it —
     `favoriteScripts` only puts one in the list when it differs from the last
     take, so its being here is the whole of the question of whether to draw a
     widget for it. */
  const finalScript = scripts.find((script) => script.kind === 'final') ?? null;

  const copyScript = () => {
    if (!selectedScript) return;
    navigator.clipboard?.writeText(selectedScript.code).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }).catch(() => { /* A refused clipboard is not worth a dialog. */ });
  };

  return (
    <main
      data-testid="favorites-page-mobile"
      /* The conversation surface, not the desktop page's light field. The
         reading is the page here rather than something held up on one, and a
         shader running behind a phone's whole screen is a battery spent on
         ground nobody is looking at. */
      className="relative flex h-full w-full min-w-0 flex-col overflow-hidden bg-conversation-surface"
    >
      {/* ── Top bar ── */}
      {/* The studio's bar, with this page's name where the wordmark stands and
          this page's two doors either side of it: the shell's navigation on the
          left, where it is on every mobile page, and the collection on the
          right, where the desktop page keeps it too. */}
      <div
        className="relative flex shrink-0 items-center justify-between px-2"
        style={{ paddingTop: SAFE_TOP, paddingBottom: '12px' }}
      >
        <button
          type="button"
          onClick={onOpenNav}
          className={BAR_KEY}
          aria-label={t('navMore')}
          aria-haspopup="dialog"
          title={t('navMore')}
        >
          <EllipsisIcon size={20} />
        </button>
        {/* Set to the row rather than to the page: the desktop heading has a
            whole page to be the largest thing on, and at that size here it
            would be a banner the two keys are parked under. */}
        <h1
          data-testid="favorites-mobile-title"
          className="absolute left-1/2 -translate-x-1/2 text-[17px] font-semibold tracking-[-0.01em] text-text-primary"
        >
          {t('navFavorites')}
        </h1>
        <button
          type="button"
          onClick={() => setListOpen(true)}
          className={BAR_KEY}
          aria-label={t('favoritesList')}
          aria-expanded={listOpen}
          aria-haspopup="dialog"
          title={t('favoritesList')}
        >
          <ListIcon size={20} />
        </button>
      </div>

      {/* ── Reading ── */}
      {state === 'loading' ? (
        <PageNote testId="favorites-loading">{t('loading')}</PageNote>
      ) : state === 'list-error' ? (
        <PageNote testId="favorites-error">
          <span>{t('sessionListNetworkError')}</span>
          {onRetry && (
            <button type="button" onClick={onRetry} className="underline underline-offset-2">
              {t('retry')}
            </button>
          )}
        </PageNote>
      ) : state === 'empty' ? (
        /* The same line the desktop page opens on when nothing has been kept,
           set the way the studio sets its own opening line — the same face, the
           same grey, the same arrival out of a blur. */
        <PageNote testId="favorites-empty">
          <p
            className={`animate-blur-fade-in text-center leading-relaxed text-text-greeting ${
              zh ? 'font-jinghua-laosongti text-base tracking-wider' : 'font-eb-garamond text-lg'
            }`}
          >
            {t('favoritesEmptyTitle')}
          </p>
        </PageNote>
      ) : state === 'detail-loading' ? (
        <PageNote testId="favorites-detail-loading">{t('loading')}</PageNote>
      ) : state === 'detail-error' ? (
        <PageNote testId="favorites-detail-error">
          <span>{t('sessionDetailNetworkError')}</span>
          {onRetryDetail && (
            <button
              type="button"
              data-testid="favorites-detail-retry"
              onClick={onRetryDetail}
              className="underline underline-offset-2"
            >
              {t('retry')}
            </button>
          )}
        </PageNote>
      ) : !hasReading && selectedScript ? (
        /* A favorite that is only a script. There is no reading to hang the
           widget off the end of, and an empty stream with one key under it
           would be a page of nothing above the only thing on it — so the key
           takes the middle of the page, which is where the eye goes on a page
           with one thing on it.

           Named the way the window that opens it is named: 最新 for the
           snapshot a session came to rest on, which is what a favorite kept
           without a conversation almost always is. */
        <div
          data-testid="favorites-mobile-solo-script"
          className="flex min-h-0 flex-1 items-center justify-center px-6"
        >
          <div className="w-full max-w-[260px]">
            <ArchiveCodeChip
              id={selectedScript.turnId}
              label={selectedScript.kind === 'final'
                ? t('favoritesLatestScript')
                : selectedScript.take !== null && scripts.length > 1
                  ? takeLabel(selectedScript.take)
                  : t('favoritesCodeTitle')}
              code={selectedScript.code}
              selected={codeOpen}
              playing={playingCodeMessageId === selectedScript.turnId}
              onSelect={() => setCodeOpen(true)}
              onPlay={() => onPlayCode(selectedScript.code)}
              onStop={onStopCode}
              className="mt-0"
            />
          </div>
        </div>
      ) : (
        /* Keyed on the entry so an arriving favorite brings its own reading in
           rather than morphing the last one's into it — and so the archive
           opens at its end, which is where a favorite is read from. */
        /* Held off the bar above it as well as off the foot below. The bar is
           a row of controls the reading scrolls under, and text arriving with
           its ascenders on the underside of a key reads as the two touching. */
        <div
          key={conversationId ?? 'none'}
          className="favorites-reading-mobile min-h-0 flex-1 px-3 pb-4 pt-3"
        >
          <ArchivedConversationView
            active={active}
            messages={messages}
            numberTakes={scripts.length > 1}
            selectedCodeMessageId={selectedScript?.turnId ?? null}
            /* The widget is the way into the take on this layout. On desktop it
               points the window next door at a take; here there is no window
               next door until the widget makes one. */
            onSelectCode={(messageId) => {
              onSelectScript(messageId);
              setCodeOpen(true);
            }}
            playingCodeMessageId={playingCodeMessageId}
            onPlayCode={(messageId, code) => {
              onSelectScript(messageId);
              onPlayCode(code);
            }}
            onStopCode={onStopCode}
            /* The bar behaves as the code window's does on this layout: up
               while the reading is being moved, gone a couple of seconds after
               it stops. At rest what says there is more to read is the
               reading's own ends dissolving. */
            autoHideScrollbar
            /* The take the conversation came to rest on, where that is not the
               one the last reply committed — code carried on with in the studio
               after the talking stopped, or typed straight in. No turn wrote
               it, so no reply has a widget for it, and without one the reading
               would end on a version the page is no longer showing.

               Set well clear of the last reply. Every other widget belongs to
               the message above it and is read as part of it; this one belongs
               to the conversation as a whole, and the air is what says so. */
            footer={finalScript && (
              <div className="px-2">
                <ArchiveCodeChip
                  id={finalScript.turnId}
                  label={t('favoritesLatestScript')}
                  code={finalScript.code}
                  selected={selectedScript?.turnId === finalScript.turnId}
                  playing={playingCodeMessageId === finalScript.turnId}
                  onSelect={() => {
                    onSelectScript(finalScript.turnId);
                    setCodeOpen(true);
                  }}
                  onPlay={() => {
                    onSelectScript(finalScript.turnId);
                    onPlayCode(finalScript.code);
                  }}
                  onStop={onStopCode}
                  className="mt-6 -ml-1"
                />
              </div>
            )}
          />
        </div>
      )}

      {/* ── Foot ── */}
      {/* What can be done to the favorite as a whole, at the two ends of the
          page. Between them, the name of what is open: the bar at the top says
          which page this is, and this says which entry — which is the one thing
          the desktop caption carried that a phone still has nowhere else to
          read. The two acts stand as far apart as the page allows, because
          neither is one to press by accident. */}
      {conversation && (onUnfavorite || onDelete) && state === 'ready' && (
        <div
          data-testid="favorites-mobile-actions"
          className="flex shrink-0 items-center justify-between gap-4 px-4 pt-3"
          style={{ paddingBottom: SAFE_BOTTOM }}
        >
          {onUnfavorite ? (
            <button
              type="button"
              data-favorites-unfavorite
              onClick={() => setAsking('unfavorite')}
              className={`${FOOT_KEY} text-brand-accent`}
              aria-label={t('unfavorite')}
              title={t('unfavorite')}
            >
              {/* Filled, as on desktop: keeping and letting go are one act read
                  in two directions, so the mark that says this is kept is also
                  the one you press to stop keeping it. */}
              <StarIcon size={18} filled />
            </button>
          ) : <span className="h-11 w-11" />}

          {/* Capped rather than let run to the width between the two keys: a
              name that reaches for both of them turns the foot into one packed
              line, and the marks at either end stop reading as marks. Held to
              half the row, it is a caption with air around it, and the two acts
              are the two ends of the page again. Centred all the same — the
              gaps either side are equal, so the middle stays the middle. */}
          <h2
            data-testid="favorites-mobile-caption"
            /* Centred by the row rather than by the text: the name inside is
               a box of its own now, and one that is running has to start at
               its first letter — a centred line centres its overflow, which
               would cut the beginning off before it had moved at all. */
            /* The page's reading size, like the stream above it. It is the
               only place the name of what is open is written on this layout —
               the desktop caption's job — and a caption nobody can read at a
               glance is not doing that job. */
            className="flex min-w-0 max-w-[50%] flex-1 justify-center text-base text-text-secondary"
          >
            {/* Always the one being read — it is the caption, there is nothing
                else it could be naming — so it always runs when it has to.
                Half a row is not much to give a name, and this is where the
                other half of one gets said. */}
            <ScrollingTitle title={conversationTitle(conversation)} className="min-w-0" />
          </h2>

          {onDelete ? (
            <button
              type="button"
              data-favorites-delete
              onClick={() => setAsking('delete')}
              /* The red the studio's code widget counts its deleted lines in
                 — `--color-diff-remove`, so the one colour that means "this
                 goes away" is the same colour wherever the app says it. Drawn,
                 not filled: it is a mark you press, not a state the page is
                 in. */
              className={`${FOOT_KEY} text-diff-remove`}
              aria-label={t('deleteFavorite')}
              title={t('deleteFavorite')}
            >
              <TrashIcon size={17} />
            </button>
          ) : <span className="h-11 w-11" />}
        </div>
      )}

      {/* ── The question at the foot ── */}
      {/* Both keys down there ask before they act, and ask here: a panel in the
          middle of the page, over a page that has been put out of reach.

          Not the notice the desktop shows. That is a strip across the top
          reporting a move that has already happened, with an undo held open for
          five seconds — which works on a display where the strip is nowhere
          near what you were doing and there is room to leave it standing. On a
          phone it appears at the far end of the screen from the thumb that
          pressed the key, over the reading, and it takes the one decision that
          cannot be taken back and puts it on a timer. So the order is reversed:
          the question comes first, nothing happens until it is answered, and
          the answer is the whole of the interaction — there is no undo to
          offer afterwards because nothing was done unasked.

          Which is also why the ground behind it does not dismiss it. Every
          other layer on this page is a drawer you step out of by pressing the
          page; this one is a question, and a question closed by a stray tap on
          the page behind it is a question that was never answered. The two
          options are the only ways out, and one of them is 取消. */}
      {asking && conversation && (
        <div
          data-testid="favorites-mobile-confirm"
          data-favorites-confirm={asking}
          className="animate-fade-in fixed inset-0 z-[60] flex items-center justify-center bg-[var(--color-overlay-backdrop)] px-8 backdrop-blur-[2px]"
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="favorites-confirm-question"
            className="w-full max-w-[320px] rounded-2xl border border-border bg-conversation-surface p-5 shadow-dialog-overlay"
          >
            {/* The question, first thing and in words. No mark above it: the
                two acts are already told apart by what the question says and by
                the colour of the key that answers it, and a glyph at the head
                of a panel this small is a picture standing in for a sentence
                that is right underneath it. */}
            <p
              id="favorites-confirm-question"
              className="text-[15px] leading-relaxed text-text-primary"
            >
              {t(asking === 'delete' ? 'deleteFavoriteAsk' : 'unfavoriteAsk')}
            </p>
            {/* Which conversation, quietly, under the question. The page's own
                foot says it too, but the panel covers the page — a question
                about "this conversation" has to carry which one it means. */}
            <p className="mt-1.5 truncate text-[12px] text-text-secondary">
              {conversationTitle(conversation)}
            </p>

            {/* Standing back, then the verb. Both full-height keys rather than
                the desktop notice's pills: this is the one panel on the layout
                where a mis-hit costs something. */}
            <div className="mt-6 flex items-center gap-2.5">
              <button
                type="button"
                data-testid="favorites-mobile-confirm-cancel"
                onClick={() => setAsking(null)}
                className="h-10 flex-1 rounded-full border border-border text-[14px] text-text-secondary transition-colors active:bg-surface-hover"
              >
                {t('keepIt')}
              </button>
              <button
                type="button"
                data-testid="favorites-mobile-confirm-accept"
                onClick={() => {
                  const act = asking === 'delete' ? onDelete : onUnfavorite;
                  setAsking(null);
                  act?.();
                }}
                /* One plate for both answers, and the colour is in the word.
                   A key filled red is a warning painted across the whole
                   answer; the same key as the one beside it, with the delete's
                   own red carrying the verb, says the same thing at the weight
                   it deserves — this is what you asked for, and it is the one
                   that does not come back. */
                className={`h-10 flex-1 rounded-full text-[14px] font-medium transition-opacity active:opacity-80 ${
                  asking === 'delete'
                    ? 'favorites-confirm-delete text-[color:var(--color-diff-remove)]'
                    : 'bg-brand-accent text-on-accent'
                }`}
              >
                {t(asking === 'delete' ? 'deleteFavorite' : 'unfavorite')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Code window ── */}
      {/* The studio's own: a window standing in the middle of a dimmed page,
          with what can be done to what is in it hung above it on the backdrop
          rather than set on a bar inside. Bare glyphs up there, because they
          stand on the page rather than on a surface — `.code-window-action`
          holds both palettes.

          Held on screen through the fade out and then taken off the page, so a
          shut window is not somewhere the keyboard can walk into. */}
      <div
        data-testid="favorites-code-window"
        className="fixed inset-0 z-50 flex items-center justify-center px-3 pt-14 pb-4"
        style={{
          visibility: codeOpen ? 'visible' : 'hidden',
          transition: codeOpen ? undefined : `visibility 0s linear ${WINDOW_MS}ms`,
        }}
        inert={!codeOpen}
      >
        <div
          className="code-window-scrim absolute inset-0 backdrop-blur-[6px] transition-opacity duration-[240ms] ease-out motion-reduce:transition-none"
          style={{ opacity: codeOpen ? 1 : 0 }}
          onClick={() => setCodeOpen(false)}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('favoritesCodeTitle')}
          className="relative z-10 flex w-full max-w-[520px] flex-col transition-[opacity,transform] duration-[240ms] ease-out motion-reduce:transition-none"
          /* The studio's own code window's measure: the two are the same window
             showing the same kind of thing, and a shorter one here made the
             archive look like a lesser view of a script rather than another way
             into it. Height from the room the overlay has rather than from the
             viewport, because the row of actions hangs in the overlay's top
             padding and the window may not be centred in ground that row needs. */
          style={{
            height: '88%',
            maxHeight: 700,
            opacity: codeOpen ? 1 : 0,
            transform: codeOpen ? 'scale(1)' : 'scale(0.97)',
          }}
        >
          {/* What the window can do goes left, the way out goes right — the
              studio's own mobile code sheet reads the same way, so the two
              windows are one pattern rather than two. A thumb reaching for
              either end is nowhere near the other, and the backdrop still
              closes the window besides. */}
          <div className="absolute -top-11 left-0 right-0 flex items-center justify-between">
            <div className="flex items-center gap-1">
              <button
                type="button"
                data-testid="favorites-mobile-script-play"
                onClick={() => {
                  if (!selectedScript) return;
                  if (scriptPlaying) onStopCode();
                  else onPlayCode(selectedScript.code);
                }}
                className="code-window-action flex h-9 w-9 items-center justify-center"
                aria-label={scriptPlaying ? t('stop') : t('play')}
                title={scriptPlaying ? t('stop') : t('play')}
              >
                {scriptPlaying ? <StopIcon size={15} /> : <PlayOutlineIcon size={19} />}
              </button>
              <button
                type="button"
                data-testid="favorites-mobile-script-copy"
                onClick={copyScript}
                className="code-window-action flex h-9 w-9 items-center justify-center"
                aria-label={t('copyCode')}
                title={t('copyCode')}
              >
                {copied ? <CheckIcon size={17} /> : <CopyIcon size={17} />}
              </button>
            </div>
            {/* The same act the backdrop already answers, given a target for a
                reach that does not want to find the one strip of page the
                window is not covering. */}
            <button
              type="button"
              data-testid="favorites-mobile-script-close"
              onClick={() => setCodeOpen(false)}
              className="code-window-action flex h-9 w-9 items-center justify-center"
              aria-label={t('close')}
              title={t('close')}
            >
              <XIcon size={19} />
            </button>
          </div>

          {/* The window itself holds the script and nothing else. It is an
              archive — there is no editing it here — so it is set as the studio's
              own code window sets it, by being the same kind of editor with
              nothing to type into: the same face, measure, gutter, wrap indent,
              fades and only-while-moving scrollbar, wrapped in nothing but the
              window's own edge.

              Told when it is the window being looked at: the box is hidden rather
              than unmounted between openings, and a code view built against a
              hidden box has no width to wrap a line to. */}
          <div className="min-h-0 flex-1 overflow-hidden rounded-region border border-border bg-conversation-surface">
            <ReadOnlyCodeView code={selectedScript?.code ?? ''} active={codeOpen} />
          </div>
        </div>
      </div>

      {/* ── Collection ── */}
      {/* The desktop page's corner list, given the room a phone has for it: the
          navigation drawer's own construction, mirrored, so the two panels a
          mobile page can pull out read as one pair — the app on the left, what
          you have kept on the right. */}
      <div
        className="fixed inset-0 z-50"
        style={{
          visibility: listOpen ? 'visible' : 'hidden',
          transition: listOpen ? undefined : `visibility 0s linear ${SLIDE_MS}ms`,
        }}
        inert={!listOpen}
      >
        <div
          className="absolute inset-0 bg-[var(--color-overlay-backdrop)] backdrop-blur-[6px] transition-opacity duration-[280ms] ease-out motion-reduce:transition-none"
          style={{ opacity: listOpen ? 1 : 0 }}
          onClick={() => setListOpen(false)}
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t('favoritesList')}
          data-testid="favorites-list-drawer"
          {...swipeDismiss}
          className="absolute inset-y-0 right-0 flex w-2/3 flex-col border-l border-border bg-conversation-surface shadow-menu-overlay transition-transform duration-[280ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
          style={{
            transform: listOpen ? 'translateX(0)' : 'translateX(100%)',
            paddingTop: SAFE_TOP,
            paddingBottom: SAFE_BOTTOM,
          }}
        >
          {/* Set exactly as the navigation drawer's own rows are — the face's
              own weight, no tracking of its own — because the two panels are
              one pair seen from opposite edges of the screen, and a heading
              that is a hair heavier or tighter than the list opposite reads as
              a near-miss rather than as a decision. It follows that drawer's
              size wherever it goes, which is why this is the same `text-base`
              its rows are now set at rather than the 15px they were.

              What makes it a heading is not its type but its place: it is the
              only line in the panel that is not an entry, and the air below it
              is a row and a half deep. */}
          <h2 className="shrink-0 px-4 pb-5 pt-1 text-base text-text-primary">
            {t('favoritesList')}
          </h2>
          {/* The rows are the session history's rows, down to the numbers: the
              same line at rest — 16px on this layout, the platform's own
              reading size, the same as the navigation drawer opposite — the
              same 4px plate, and the same fill on the one that is open. A
              collection and a history are the same object — a list of
              conversations you pick one out of — and reading as two different
              lists inside one app is the one thing they must not do. What is
              added is the day it was kept, at the end of the line, which is
              what tells two similar names apart. */}
          <div
            role="listbox"
            aria-label={t('favoritesList')}
            data-testid="favorites-list-mobile"
            className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 py-2 no-scrollbar"
          >
            {summaries.map((summary) => {
              const selected = summary.id === selectedSummaryId;
              return (
                <button
                  key={summary.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  data-favorite-id={summary.id}
                  data-favorite-selected={selected}
                  onClick={() => {
                    onSelectSummary(summary);
                    setListOpen(false);
                  }}
                  className={`flex w-full items-center gap-2 rounded-[4px] px-2 py-[8px] text-left transition-colors ${
                    selected
                      ? 'bg-[var(--color-selected-item-bg)] text-on-accent'
                      : 'text-text-secondary hover:text-text-primary active:bg-surface-hover'
                  }`}
                >
                  {/* Run round on the row that is open, ellipsis on the rest
                      — the same answer the desktop column gives, for the same
                      reason: the open one is the only row whose whole name is
                      the point. */}
                  <ScrollingTitle
                    title={summary.title}
                    active={selected}
                    className="min-w-0 flex-1 text-base leading-5"
                  />
                  {/* Held a step under whatever the row is set in rather than
                      given a grey of its own: on the open row that grey would
                      be standing on the accent fill, where it is the one value
                      that cannot be read. */}
                  <time
                    dateTime={new Date(summary.favoritedAt).toISOString()}
                    className="shrink-0 text-base leading-5 tabular-nums opacity-60"
                  >
                    {favoritedDateLabel(summary.favoritedAt)}
                  </time>
                </button>
              );
            })}
            <InfiniteScrollSentinel
              enabled={listOpen}
              hasMore={hasMore}
              isLoadingMore={isLoadingMore}
              loadMoreError={loadMoreError}
              onLoadMore={onLoadMore}
              onRetryLoadMore={onRetryLoadMore}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
