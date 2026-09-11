import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { createPortal } from 'react-dom';
import type { SessionSummary } from '../../../shared/session-api';
import type { Session } from '../../hooks/useSessions';
import { EditIcon, SearchIcon, StarIcon, TrashIcon, XIcon } from '../icons';
import { t } from '../../lib/i18n';
import InfiniteScrollSentinel from '../common/InfiniteScrollSentinel';

/**
 * How long a kept entry stays on the list after its star fills in.
 *
 * The star is the answer to the click, and the row leaving is the consequence
 * of it. Fire both in the same frame and the row is gone before the fill can
 * be seen, which reads as the entry having been deleted rather than moved. So
 * the star fills, the row fades out under it, and only then does the entry
 * leave — long enough to read as one movement and short enough not to be a
 * wait.
 */
const KEEPING_MS = 380;

/**
 * How long a row has to be held before it offers what can be done to it.
 *
 * The floor is the platform's own: hold a link in mobile Safari and its menu
 * arrives at about half a second, so anything much shorter turns a slow tap
 * into a menu and anything much longer reads as the row not answering. 450ms
 * sits just inside that, where the press is deliberate but the wait is not
 * something you notice having done.
 */
const LONG_PRESS_MS = 450;

/**
 * How far the finger may travel before the press is read as a scroll instead.
 *
 * This list is the scrolling part of the drawer, so nearly every press on it
 * is the start of a scroll. A few pixels of drift is a thumb resting; past
 * that the intent is to move the list, and the menu must not arrive on top of
 * it.
 */
const LONG_PRESS_SLOP = 10;

/* The plate's own box, stated here because the menu is placed before it is
   measured: it opens at the finger and has to be turned back from the edges of
   the window in the same frame. Kept in step with the markup below by hand —
   three rows of 40 and the plate's 4 top and bottom. */
const ROW_MENU_WIDTH = 176;
const ROW_MENU_HEIGHT = 3 * 40 + 8;
/** How far the plate stands off the window's edges when it is turned back. */
const ROW_MENU_MARGIN = 8;

interface HistoryPanelProps {
  sessions: readonly (Session | SessionSummary)[];
  currentId: string | null;
  isLoading?: boolean;
  initialError?: Error | null;
  onRetryInitial?: () => void;
  onSwitch: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  /** Keep this conversation: it leaves the list and turns up in Favorites. */
  onFavorite?: (id: string) => void;
  loadingSessions?: Set<string>;
  unreadSessions?: Set<string>;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  loadMoreError?: Error | null;
  onRetryLoadMore?: () => void;
  /**
   * Whether a press held on a row opens the three moves as a menu.
   *
   * The controls in the row are revealed by the pointer resting on it, which
   * is a gesture a touch screen does not have: there, a row has one gesture,
   * the tap that opens the conversation, and anything else has to be asked for
   * by holding it. So the surfaces built for a finger — the mobile drawer —
   * turn this on and get the same three moves as a small plate under the
   * thumb; the row's own marks stay where they are for the pointer that can
   * reach them.
   */
  longPressMenu?: boolean;
  /**
   * Whether the list carries its own filter field. Off where the list is one
   * section of a larger panel that has a search of its own — the mobile
   * navigation drawer — so the reader is not offered two fields for the same
   * question a few rows apart.
   */
  showSearch?: boolean;
  /**
   * The filter to apply, when the field the reader types it into belongs to
   * the host rather than to this panel. Given one, the list is filtered from
   * outside and its own field (if it has one) stops being the source — the two
   * are alternatives, which is why the drawer that supplies this also turns
   * `showSearch` off.
   */
  query?: string;
}

type HistoryItem = Session | SessionSummary;

function isCompleteSession(item: HistoryItem): item is Session {
  return 'messages' in item;
}

function compareByUpdatedAt(a: HistoryItem, b: HistoryItem): number {
  const updatedAtDifference = b.updatedAt - a.updatedAt;
  if (updatedAtDifference !== 0) return updatedAtDifference;
  if (a.id === b.id) return 0;
  return a.id < b.id ? 1 : -1;
}

export default function HistoryPanel({
  sessions,
  currentId,
  isLoading = false,
  initialError = null,
  onRetryInitial,
  onSwitch,
  onDelete,
  onRename,
  onFavorite,
  loadingSessions = new Set<string>(),
  unreadSessions = new Set<string>(),
  onLoadMore = () => {},
  hasMore = false,
  isLoadingMore = false,
  loadMoreError = null,
  onRetryLoadMore = () => {},
  longPressMenu = false,
  showSearch = true,
  query: hostQuery,
}: HistoryPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [ownQuery, setOwnQuery] = useState('');
  /* Whoever is asking the question owns it. */
  const query = hostQuery ?? ownQuery;
  const [keepingId, setKeepingId] = useState<string | null>(null);
  /* Which row's bin has been pressed, if any.
   *
   * The two other things that can be done to a row are answered by the row
   * itself — a title goes back if the rename is abandoned, a kept conversation
   * is one press away in Favorites — and neither needs asking about. Deleting
   * is the one that does: the conversation goes from this device and from the
   * account, there is no list it turns up on afterwards, and the bin sits a
   * few pixels from the pencil on a row that is one of many.
   *
   * Held as an id rather than a flag so the question is about a row, and dies
   * with it: a row that leaves the list while its question is up — deleted
   * from another window, kept, filtered away — simply stops being found, and
   * the question goes with it rather than standing over nothing.
   */
  const [askingDeleteId, setAskingDeleteId] = useState<string | null>(null);
  /* The row being held, and where it was held — the plate opens at the finger
     rather than at the row, which is the half of the row the thumb is not
     covering. Same reasoning as the id above: it names a row, and is resolved
     against the list every render. */
  const [rowMenu, setRowMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef(false);
  const keepingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmCancelRef = useRef<HTMLButtonElement>(null);
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressOriginRef = useRef<{ x: number; y: number } | null>(null);
  /* A press that became a menu must not also be the tap that opens the
     conversation — the click lands after the finger lifts, by which time the
     plate is already up. */
  const pressHandledRef = useRef(false);

  useEffect(() => {
    if (!editingId) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editingId]);

  useEffect(() => () => {
    if (keepingTimerRef.current !== null) clearTimeout(keepingTimerRef.current);
    if (pressTimerRef.current !== null) clearTimeout(pressTimerRef.current);
  }, []);

  const cancelPress = () => {
    if (pressTimerRef.current !== null) clearTimeout(pressTimerRef.current);
    pressTimerRef.current = null;
    pressOriginRef.current = null;
  };

  /* The list's own type size.
   *
   * `longPressMenu` is already the panel's "this is a finger, not a pointer"
   * flag — it is set by the mobile drawer and by nothing else — so it is what
   * sets the reading size too, rather than a second prop saying the same thing
   * twice. On a phone the rows are read at the platform's 16px like everything
   * else in that drawer; the studio's history overlay keeps its 12, where it
   * is one list among several in a window being worked in rather than the
   * whole of what is on screen. */
  const rowTextClass = longPressMenu ? 'text-base leading-5' : 'text-xs leading-none';

  /* The press, for the surfaces that have no pointer to reveal things with.
   *
   * Only a finger or a pen opens it: where there is a mouse the three marks in
   * the row are already visible under it, and a held mouse button that put a
   * menu up as well would be two answers to the same question.
   */
  const rowPressHandlers = (session: HistoryItem) => (longPressMenu ? {
    onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.pointerType === 'mouse') return;
      cancelPress();
      pressHandledRef.current = false;
      pressOriginRef.current = { x: event.clientX, y: event.clientY };
      const { clientX, clientY } = event;
      pressTimerRef.current = setTimeout(() => {
        pressTimerRef.current = null;
        pressHandledRef.current = true;
        setRowMenu({ id: session.id, x: clientX, y: clientY });
      }, LONG_PRESS_MS);
    },
    onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => {
      const origin = pressOriginRef.current;
      if (!origin) return;
      const travelled = Math.hypot(event.clientX - origin.x, event.clientY - origin.y);
      if (travelled > LONG_PRESS_SLOP) cancelPress();
    },
    onPointerUp: cancelPress,
    onPointerCancel: cancelPress,
    /* The platform's own menu would arrive on top of this one, offering to
       copy a row that is not text. */
    onContextMenu: (event: ReactMouseEvent<HTMLDivElement>) => event.preventDefault(),
  } : {});

  /* The star fills where it was clicked, the row goes with it, and the entry
     is handed over once both have been seen. */
  const keep = (session: HistoryItem) => {
    if (!onFavorite || keepingId) return;
    setKeepingId(session.id);
    keepingTimerRef.current = setTimeout(() => {
      keepingTimerRef.current = null;
      setKeepingId(null);
      onFavorite(session.id);
    }, KEEPING_MS);
  };

  const startEditing = (session: HistoryItem) => {
    cancelRef.current = false;
    setEditingId(session.id);
    setDraft(session.title || t('newSessionTitle'));
  };

  const save = (session: HistoryItem) => {
    const nextTitle = draft.trim();
    setEditingId(null);
    if (!nextTitle || nextTitle === session.title) return;
    onRename(session.id, nextTitle);
  };

  const cancel = (session: HistoryItem) => {
    cancelRef.current = true;
    setDraft(session.title || t('newSessionTitle'));
    setEditingId(null);
  };

  // Keep the presentation invariant even when a local session's updatedAt
  // changes in place after the initial load.
  const listed = [...sessions]
    .filter((session) => !isCompleteSession(session)
      || (session.messages.length > 0 && session.favoritedAt === undefined))
    .sort(compareByUpdatedAt);

  /* Titles, and the placeholder an untitled row is actually showing — the
     reader searches what is on the list, not what is behind it. Cloud rows
     arrive as summaries with no messages, so matching conversation text would
     find things in the sessions held locally and quietly miss the same words
     in the ones that are not, which is worse than a narrower search that is
     the same everywhere. */
  const needle = query.trim().toLowerCase();
  const ordered = needle
    ? listed.filter((s) => (s.title || t('newSessionTitle')).toLowerCase().includes(needle))
    : listed;
  const searchable = listed.length > 0 || needle !== '';
  /* Resolved against the list rather than taken on trust — see the id above. */
  const askingDelete = askingDeleteId
    ? listed.find((session) => session.id === askingDeleteId) ?? null
    : null;
  const heldRow = rowMenu
    ? listed.find((session) => session.id === rowMenu.id) ?? null
    : null;

  useEffect(() => {
    if (!askingDelete) return;
    /* The way out that costs nothing takes the focus, so the key already under
       the hand is the one that leaves the conversation alone. */
    confirmCancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAskingDeleteId(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [askingDelete]);

  return (
    <div className="flex flex-col">
      {/* The list's own head, and the one line here the reader writes rather
          than picks: a field set in the rows' 12px, on the rows' own left
          edge, sitting directly over the first of them so what is typed and
          what answers line up. Nothing is drawn around it: it is set apart by
          a fill instead, in a row's own 4px box and running a row's own width,
          so it reads as the list's first line rather than as a control parked
          on top of it. That fill is a wash over whatever ground the panel is
          standing on, and it is one value throughout — see
          `.history-search-field` in index.css. It stays put while the list
          scrolls under it — a short panel can hold a long history, and a
          filter that scrolls away stops saying why the list is short. The
          band it holds still on is opaque in the host panel's own ground: the
          sidebar overlay is drawn on the conversation surface, the top-bar
          dropdown on the page ground, and either sets --history-search-bg to
          say which. */}
      {showSearch && !isLoading && !initialError && searchable && (
        <div
          className="sticky top-0 z-20 px-2 pt-2.5 pb-1.5"
          style={{ background: 'var(--history-search-bg, var(--color-conversation-surface))' }}
        >
          <div className="history-search-field flex items-center gap-1.5 rounded-[4px] px-2 py-1.5">
            <SearchIcon size={12} className="shrink-0 text-text-muted" />
            <input
              type="text"
              value={query}
              aria-label={t('historySearch')}
              data-testid="history-search-input"
              placeholder={t('historySearchHint')}
              onChange={(e) => setOwnQuery(e.currentTarget.value)}
              onClick={(e) => e.stopPropagation()}
              /* Escape empties the field rather than reaching the panel that
                 listens for it — while there is something in it to clear. */
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Escape' && query !== '') {
                  e.preventDefault();
                  setOwnQuery('');
                }
              }}
              className="min-w-0 flex-1 bg-transparent text-xs leading-none text-text-primary outline-none placeholder:text-text-muted"
            />
            {query !== '' && (
              <button
                type="button"
                aria-label={t('historySearchClear')}
                data-testid="history-search-clear"
                onClick={(e) => {
                  e.stopPropagation();
                  setOwnQuery('');
                }}
                className="shrink-0 text-text-muted transition-colors hover:text-text-primary"
              >
                <XIcon size={12} />
              </button>
            )}
          </div>
        </div>
      )}
      <div>
        {isLoading ? (
          <div className={`px-4 py-6 text-center ${rowTextClass} text-text-muted`}>{t('loading')}</div>
        ) : initialError ? (
          <div className={`flex flex-col items-center gap-2 px-4 py-6 text-center ${rowTextClass} text-text-muted`}>
            <span>{t('sessionListNetworkError')}</span>
            {onRetryInitial && (
              <button
                type="button"
                onClick={onRetryInitial}
                className="text-text-secondary underline underline-offset-2 hover:text-text-primary"
              >
                {t('retry')}
              </button>
            )}
          </div>
        ) : ordered.length === 0 ? (
          <div className={`px-4 py-6 text-center ${rowTextClass} text-text-muted`}>
            {needle ? t('historySearchEmpty') : t('noSessions')}
          </div>
        ) : (
          <ul className="space-y-1 py-2">
            {ordered.map((s) => {
              const active = s.id === currentId;
              const isEditing = editingId === s.id;
              const keeping = keepingId === s.id;
              const displayTitle = s.title || t('newSessionTitle');
              return (
                <li
                  key={s.id}
                  /* Fades where it stands. Nothing here is going anywhere the
                     eye can follow — the Favorites page is a whole page away —
                     so a row sliding off to one side is a direction that leads
                     nowhere, and the star filling in has already said what
                     happened. */
                  className={`px-2 transition-opacity duration-[320ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none ${
                    keeping ? 'opacity-0' : ''
                  }`}
                  data-session-keeping={keeping || undefined}
                >
                  {/* Only the selected row carries a fill. An unselected one
                      used to paint `bg-conversation-surface`, which in the
                      sidebar overlay is the panel's own ground and so was
                      never visible — but the top-bar dropdown stands on the
                      page ground, and there the same fill drew a rounded
                      plate under every row and left the selected one with
                      nothing to stand out against. Nothing scrolls under
                      these rows (the search band above is sticky and opaque
                      in the host's ground, see --history-search-bg), so they
                      have no reason to be opaque at all. */}
                  <div
                    className={`group flex items-stretch gap-2 rounded-[4px] border px-2 cursor-pointer transition-colors ${
                      active
                        ? 'border-transparent bg-[var(--color-selected-item-bg)] text-on-accent'
                        : 'border-transparent text-text-secondary hover:text-text-primary'
                    } ${
                      /* A press held on a row of text is a text selection and
                         a copy callout, on every mobile browser, unless the row
                         says it is not text to be picked up. */
                      longPressMenu ? 'select-none [-webkit-touch-callout:none]' : ''
                    }`}
                    onClick={() => {
                      /* The tap that would have opened it was the press that
                         opened the menu. */
                      if (pressHandledRef.current) {
                        pressHandledRef.current = false;
                        return;
                      }
                      onSwitch(s.id);
                    }}
                    {...rowPressHandlers(s)}
                  >
                    {isEditing ? (
                      <input
                        ref={inputRef}
                        aria-label="Edit session title"
                        value={draft}
                        maxLength={60}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setDraft(e.currentTarget.value)}
                        onBlur={() => {
                          if (cancelRef.current) {
                            cancelRef.current = false;
                            return;
                          }
                          save(s);
                        }}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            save(s);
                          }
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            cancel(s);
                          }
                        }}
                        className={`my-[5px] min-w-0 flex-1 rounded-region border border-border bg-conversation-surface px-1 py-0.5 ${rowTextClass} text-text-primary outline-none focus:border-accent/60`}
                      />
                    ) : (
                      <button
                        type="button"
                        data-session-title-edit
                        className="flex-1 flex items-center py-[8px] text-left min-w-0"
                        title={displayTitle}
                      >
                        <span className={`block w-full ${rowTextClass} truncate`}>{displayTitle}</span>
                      </button>
                    )}
                    {/* While a row is still being answered it has nothing to
                        rename, keep or delete yet, so the spinner takes the
                        whole control strip on its own — same 14px box as the
                        pencil, in the colour the pencil takes under the
                        pointer, standing where the last of the three buttons
                        will stand once the answer lands. The unread dot keeps
                        its own place ahead of them. */}
                    <span className="flex items-center gap-1.5 shrink-0">
                      {loadingSessions.has(s.id) ? (
                        <span className="self-stretch flex items-center shrink-0">
                          <span
                            className="w-3.5 h-3.5 rounded-full animate-spin"
                            style={{
                              border: '1.5px solid transparent',
                              borderTopColor: active ? 'var(--color-on-accent)' : 'var(--color-text-primary)',
                              display: 'inline-block',
                            }}
                          />
                        </span>
                      ) : (
                        <>
                          {unreadSessions.has(s.id) && (
                            <span className="self-stretch flex items-center shrink-0">
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--color-success)' }} />
                            </span>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              startEditing(s);
                            }}
                            className={`self-stretch flex items-center opacity-0 group-hover:opacity-100 transition-[opacity,color] ${
                              active ? 'text-on-accent/75 hover:text-on-accent' : 'text-text-muted hover:text-text-primary'
                            }`}
                            title={t('edit')}
                          >
                            <EditIcon size={14} />
                          </button>
                          {onFavorite && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                keep(s);
                              }}
                              /* The one control here that stays put once used:
                                 the filled star is the entry saying where it
                                 has gone, so it has to outlast the pointer
                                 leaving. It fills in the orange the Favorites
                                 list marks its open entry with — the colour of
                                 the place it is on its way to — except on the
                                 open row, whose own fill is already that orange
                                 and would swallow it. */
                              className={`self-stretch flex items-center transition-[opacity,color] ${
                                keeping
                                  ? `opacity-100 ${active ? 'text-on-accent' : 'text-brand-accent'}`
                                  : `opacity-0 group-hover:opacity-100 ${
                                    active ? 'text-on-accent/75 hover:text-on-accent' : 'text-text-muted hover:text-brand-accent'
                                  }`
                              }`}
                              title={t('favorite')}
                              aria-label={t('favorite')}
                              aria-pressed={keeping}
                            >
                              {/* A point higher than the pencil beside it, and
                                  level with the bin: a star is a spiked outline
                                  where those two are solid shapes, so at the
                                  same nominal size it reads as the smaller
                                  mark. */}
                              <StarIcon size={16} filled={keeping} />
                            </button>
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setAskingDeleteId(s.id);
                            }}
                            /* A red apiece, because the two rows are not the
                               same ground. On the page's own dark the diff's own
                               #E01A1A carries — it is the red this app already
                               means "removed" with. On the open row, whose fill
                               is #BC4E2D, that red is a near neighbour of the
                               fill and stops reading as a warning, so it steps
                               down to the deeper #B42F2F to keep its
                               distance. */
                            className={`self-stretch flex items-center opacity-0 group-hover:opacity-100 transition-[opacity,color] ${
                              active ? 'text-on-accent/75 hover:text-danger-on-selected' : 'text-text-muted hover:text-diff-remove'
                            }`}
                            title={t('delete')}
                          >
                            <TrashIcon size={16} />
                          </button>
                        </>
                      )}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {!isLoading && !initialError && ordered.length > 0 && (
        <InfiniteScrollSentinel
          enabled
          hasMore={hasMore}
          isLoadingMore={isLoadingMore}
          loadMoreError={loadMoreError}
          onLoadMore={onLoadMore}
          onRetryLoadMore={onRetryLoadMore}
        />
      )}

      {/* ── What a held row offers ── */}
      {/* The same three moves the row carries for a pointer, as a plate under
          the thumb. Sent to the body for the reason the question below is: this
          list is clipped by its own scrollport and travels with a drawer that
          moves on a transform.

          It opens at the finger rather than on the row — a row is 30 pixels
          tall and the thumb is on top of it — and is turned back from the
          window's edges so a press near the bottom or the right does not put
          the plate half outside. Tapping the ground puts it away: this is a
          menu, not a question, and nothing has been done yet. */}
      {heldRow && rowMenu && typeof document !== 'undefined' && createPortal(
        <div
          data-testid="history-row-menu-layer"
          className="fixed inset-0 z-[150]"
          onPointerDown={() => setRowMenu(null)}
          onContextMenu={(event) => event.preventDefault()}
        >
          <div
            data-testid="history-row-menu"
            role="menu"
            aria-label={heldRow.title || t('newSessionTitle')}
            className="animate-fade-in absolute w-[176px] overflow-hidden rounded-[10px] border border-border bg-conversation-surface py-1 shadow-menu-overlay"
            style={{
              /* Off the fingertip by the width of one, so the first line is
                 not opening underneath the thumb that asked for it. */
              left: Math.min(
                Math.max(rowMenu.x + ROW_MENU_MARGIN, ROW_MENU_MARGIN),
                Math.max(ROW_MENU_MARGIN, window.innerWidth - ROW_MENU_WIDTH - ROW_MENU_MARGIN),
              ),
              top: Math.min(
                Math.max(rowMenu.y + ROW_MENU_MARGIN, ROW_MENU_MARGIN),
                Math.max(ROW_MENU_MARGIN, window.innerHeight - ROW_MENU_HEIGHT - ROW_MENU_MARGIN),
              ),
            }}
            /* The press that opens the plate is still down when it appears, so
               its lift lands here. Only what is pressed after that counts. */
            onPointerDown={(event) => event.stopPropagation()}
          >
            {/* Icon then word, one column of marks down the left so the three
                read as a list rather than as three labels of different
                lengths. The first two are the row's own two marks at the row's
                own size; the third says what it does in the red this app
                deletes in, mark and word together — the one of the three that
                does not come back. */}
            {[
              {
                key: 'rename',
                label: t('rename'),
                icon: <EditIcon size={16} />,
                onSelect: () => startEditing(heldRow),
              },
              ...(onFavorite ? [{
                key: 'favorite',
                label: t('favorite'),
                icon: <StarIcon size={16} />,
                onSelect: () => keep(heldRow),
              }] : []),
              {
                key: 'delete',
                label: t('delete'),
                icon: <TrashIcon size={16} />,
                onSelect: () => setAskingDeleteId(heldRow.id),
                danger: true,
              },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                data-history-row-menu={item.key}
                onClick={() => {
                  setRowMenu(null);
                  item.onSelect();
                }}
                /* Only a finger opens this menu, so it is set at the phone's
                   own reading size like the rows it was opened from. */
                className={`flex h-11 w-full items-center gap-2.5 px-3 text-left text-base transition-colors active:bg-surface-hover ${
                  item.danger ? 'text-diff-remove' : 'text-text-primary'
                }`}
              >
                <span className="flex w-5 shrink-0 justify-center">{item.icon}</span>
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}

      {/* ── The question the bin opens ── */}
      {/* Sent to the body rather than drawn where it is asked. This list is a
          third of a panel in the sidebar and a section of a drawer on a phone —
          it is scrolled, it is clipped, and the drawer that holds it travels on
          a transform, which would make even a `fixed` layer inside it measure
          itself against the drawer. A question this size has to stand on the
          window, so it is put there directly, the way the top bar's own
          popovers are.

          Above the sidebar's click-away sheet at z-9 and the favorites notice
          at z-100, under the account modal's z-300. The ground behind it does
          not dismiss it, for the reason the other delete question's does not: a
          question closed by a stray click on the page behind it is a question
          that was never answered. 「保留」 and Escape are the ways out. */}
      {askingDelete && typeof document !== 'undefined' && createPortal(
        <div
          data-testid="history-delete-confirm"
          className="animate-fade-in fixed inset-0 z-[200] flex items-center justify-center bg-[var(--color-overlay-backdrop)] px-8 backdrop-blur-[2px]"
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="history-delete-question"
            className="w-full max-w-[360px] rounded-2xl border border-border bg-conversation-surface p-5 shadow-dialog-overlay"
          >
            <p
              id="history-delete-question"
              className="text-[15px] leading-relaxed text-text-primary"
            >
              {t('deleteSessionAsk')}
            </p>
            {/* Which conversation — the row it was asked from is behind the
                backdrop now, and the bin sits on a list of near-identical
                lines. The placeholder an untitled row shows on the list is the
                name here too, so the two say the same thing. */}
            <p className="mt-1.5 truncate text-[12px] text-text-secondary">
              {askingDelete.title || t('newSessionTitle')}
            </p>

            <div className="mt-6 flex items-center justify-end gap-2.5">
              <button
                type="button"
                ref={confirmCancelRef}
                data-testid="history-delete-cancel"
                onClick={() => setAskingDeleteId(null)}
                className="h-9 rounded-full border border-border px-4 text-[13px] text-text-secondary transition-colors hover:bg-surface-hover"
              >
                {t('keepIt')}
              </button>
              <button
                type="button"
                data-testid="history-delete-accept"
                onClick={() => {
                  setAskingDeleteId(null);
                  onDelete(askingDelete.id);
                }}
                /* The red is in the word, not under it — the same weight the
                   two favorites panels give the answer that does not come
                   back. */
                className="h-9 rounded-full px-4 text-[13px] font-medium text-diff-remove transition-colors hover:bg-surface-hover"
              >
                {t('delete')}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
