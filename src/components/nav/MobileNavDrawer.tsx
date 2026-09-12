import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronRight, Disc3, Star } from 'lucide-react';
import type { SessionSummary } from '../../../shared/session-api';
import type { Session } from '../../hooks/useSessions';
import { t } from '../../lib/i18n';
import { GITHUB_URL, LEARN_URL } from '../../lib/external-links';
import { isWideInitials } from '../../lib/account-identity';
import {
  BookOpenIcon,
  MessageCirclePlusIcon,
  MoonIcon,
  SearchIcon,
  SunIcon,
  UserIcon,
  XIcon,
} from '../icons';
import HistoryPanel from '../conversation/HistoryPanel';
import { useSwipeDismiss } from '../../hooks/useSwipeDismiss';
import { useResolvedTheme } from '../../hooks/useAppearance';
import { setThemePreference } from '../../lib/appearance-preferences';

/** How long the panel takes to travel in or out, in ms. */
const SLIDE_MS = 280;

/* Lucide's own icons and this project's wrappers around them are called the
   same way — both take a size and a class — so a row can hold either. */
type DrawerIcon = (props: { size?: number; className?: string }) => ReactNode;

/* Every row in the drawer is the same object: a mark in a fixed column and a
   label beside it, so the labels line up down the panel whatever their icons
   are. Stated once rather than repeated per row — the whole point of the drawer
   is that these read as one list. */
/* 16px, the platform's own reading size, rather than the 15 this was set at.
   A phone is held at arm's length and read in passing, and it is also where
   the browser will magnify the page out from under you the moment focus lands
   in anything smaller (see the field floor in index.css) — so the panel is set
   at the size the platform assumes and everything in it is sized from there. */
const ROW_CLASS =
  'flex w-full items-center gap-3 rounded-[6px] px-3 py-2.5 text-left text-base'
  + ' transition-colors hover:bg-surface-hover active:bg-surface-selected';

/* A row that goes somewhere. */
const ROW_TEXT = 'text-text-secondary hover:text-text-primary';

/* The row for the page you are already on. It is still a row and still
   pressable — pressing it is how you shut the drawer on the page you wanted —
   but it carries the list's own selected plate, so the drawer answers "where
   am I" before it is asked. */
const ROW_CURRENT = 'bg-surface-selected text-text-primary';

/* The rows inside a section. They are not destinations in the drawer's own
   list — they are the contents of one entry in it — so they are set the way the
   conversation list below is set rather than the way the rows above are: the
   list's small type, its row height, and its plate, inset by the same step, so
   everything that lives *under* a heading in this panel lines up down one edge
   whichever heading it is under. */
const SUB_ROW_CLASS =
  'flex w-full items-center gap-2 rounded-[4px] px-2 py-[8px] text-left text-base'
  + ' leading-5 transition-colors hover:bg-surface-hover active:bg-surface-selected';

/* A row that opens a section under it. Quieter, and carrying no mark of its
   own: it names the group below rather than standing in the list as another
   destination, and a heading that reads at the same weight as what it heads is
   just one more item. The chevron is the only thing on it that is not a word,
   so it takes the same step down.

   The space above is part of the same job. A heading has to be seen to belong
   to what follows it rather than to what it follows, and set at the list's own
   row spacing it just reads as the next entry after the row before it. */
const SECTION_ROW = 'mt-3 text-text-muted hover:text-text-secondary';

function DrawerRow({
  icon: Icon,
  label,
  onClick,
  /** Set on rows that open a section below them rather than going somewhere. */
  section,
  expanded,
  /** Set on the row standing for the page that is up. */
  current,
}: {
  icon?: DrawerIcon;
  label: string;
  onClick: () => void;
  section?: boolean;
  expanded?: boolean;
  current?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${ROW_CLASS} ${section ? SECTION_ROW : current ? ROW_CURRENT : ROW_TEXT}`}
      aria-expanded={section ? expanded : undefined}
      aria-current={current ? 'page' : undefined}
    >
      {Icon && <Icon size={20} className="shrink-0" />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {/* Right for shut, down for open: the arrow points at where the section
          is, which is off to the side while it is folded away and directly
          below once it is out. Rotating one glyph rather than swapping two
          keeps the turn continuous. */}
      {section && (
        <ChevronRight
          size={17}
          aria-hidden="true"
          className={`shrink-0 transition-transform duration-200 motion-reduce:transition-none ${
            expanded ? 'rotate-90' : ''
          }`}
        />
      )}
    </button>
  );
}

/* A section's body: it grows out of the row above rather than appearing whole,
   so the row that opened it stays the thing the eye is following. Height is
   animated against a cap rather than a measured height — measuring would mean a
   layout pass every time a history row arrives, and a cap generous enough for
   the content costs nothing while the section is shut. */
function DrawerSection({
  open,
  maxHeight,
  children,
}: {
  open: boolean;
  maxHeight: number;
  children: ReactNode;
}) {
  return (
    <div
      className="overflow-hidden transition-[max-height,opacity] duration-[240ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
      style={{ maxHeight: open ? maxHeight : 0, opacity: open ? 1 : 0 }}
      // A shut section is clipped to nothing but still laid out, so its rows
      // stay in the tab order unless they are taken out of the page.
      inert={!open}
    >
      {children}
    </div>
  );
}

/* The same section, for the one that takes whatever room is left rather than
   as much as its content wants. It is the bottom of the panel, so its open
   height is not a number anyone can write down — it is the panel's height less
   everything above it.
   Which rules out the cap the plain section animates: a cap set high enough to
   never bind cannot animate the box shut, because the first few hundred
   milliseconds of the travel happen above the height the box actually has, and
   the collapse reads as a pause followed by a snap. `flex-grow` is the number
   that does mean the remaining space, and it interpolates — running it from 0
   to 1 against a zero basis grows the box out of nothing and back into it at
   the section's own pace, whatever that space turns out to be. */
function DrawerFillSection({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div
      className="min-h-0 basis-0 overflow-hidden transition-[flex-grow,opacity] duration-[240ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none"
      style={{ flexGrow: open ? 1 : 0, opacity: open ? 1 : 0 }}
      inert={!open}
    >
      {children}
    </div>
  );
}

export interface MobileNavDrawerHistory {
  sessions: readonly (Session | SessionSummary)[];
  currentId: string | null;
  isLoading?: boolean;
  initialError?: Error | null;
  onRetryInitial?: () => void;
  onSwitch: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  /**
   * Keep this conversation: it leaves the list and turns up in Favorites.
   *
   * The same three things can be done to a row here as in the studio's own
   * history — rename it, keep it, delete it — and the star is the one of them
   * this drawer was going without. The collection it moves the conversation
   * into is two rows up this very panel, which makes its absence read as the
   * drawer's history being a lesser copy of the list rather than the same list
   * shown somewhere else.
   */
  onFavorite?: (id: string) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  loadMoreError?: Error | null;
  onRetryLoadMore?: () => void;
  loadingSessions?: Set<string>;
  unreadSessions?: Set<string>;
}

interface MobileNavDrawerProps {
  open: boolean;
  onClose: () => void;
  accountLabel: string;
  /**
   * The letters the account plate wears once someone is signed in — the same
   * disc the desktop column's account row wears. Null while signed out, where
   * the outline figure is the honest mark for nobody in particular.
   */
  accountInitials?: string | null;
  onNewSession: () => void;
  onOpenAccount: () => void;
  /** Which of the shell's pages is up, so the drawer can say where you are. */
  current?: 'home' | 'favorites' | 'featured';
  /** Go to the collection. Absent while there is no page to go to. */
  onOpenFavorites?: () => void;
  /** Go to the shelf. Absent while there is no page to go to. */
  onOpenFeatured?: () => void;
  history: MobileNavDrawerHistory;
}

/** Whether a press landed on something the reader is meant to be able to edit. */
function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof Element
    && target.closest('input, textarea, select, [contenteditable="true"]') !== null;
}

/**
 * Drop a selection the browser made inside the drawer — and only one made there.
 *
 * A long press on a row is answered by the drawer's own menu, but a browser that
 * has already decided the press was a text selection leaves a blue band behind
 * under the menu. Clearing it has to be narrow: `removeAllRanges` is global, and
 * the reader may well have a line selected in the editor or a word in a field on
 * the page behind this panel. So both ends of every range have to be inside the
 * panel before anything is dropped.
 */
function clearSelectionInside(panel: HTMLElement | null): void {
  if (!panel || typeof window === 'undefined') return;
  const selection = window.getSelection?.();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;
  for (let index = 0; index < selection.rangeCount; index += 1) {
    const range = selection.getRangeAt(index);
    if (!panel.contains(range.startContainer) || !panel.contains(range.endContainer)) return;
  }
  selection.removeAllRanges();
}

/**
 * The mobile counterpart to the desktop's PrimaryNav column: everything that
 * column reaches, written out as one full-height list that slides in from the
 * left.
 *
 * None of the desktop column's liquid folding survives the trip to a phone —
 * there is no hover to reveal a label with, and no room to stand a column
 * beside the work. So this is the same destinations in the same order, each
 * saying what it is: the drawer is only up while it is being read, and it can
 * afford the words.
 */
export default function MobileNavDrawer({
  open,
  onClose,
  accountLabel,
  accountInitials = null,
  onNewSession,
  onOpenAccount,
  current = 'home',
  onOpenFavorites,
  onOpenFeatured,
  history,
}: MobileNavDrawerProps) {
  const theme = useResolvedTheme();
  const swipeDismiss = useSwipeDismiss('left', onClose);
  const panelRef = useRef<HTMLDivElement>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  /* Search is a mode the whole panel goes into rather than a field added to
     it. The conversation list is the only thing in the drawer there is any
     point searching, so while it is on, the destinations and the two headings
     step aside and the panel is the field and what it found. */
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  /* The one section that is worth arriving open: the drawer's main reason for
     being pulled out is to get back into a conversation, and More holds two
     links that are not going anywhere. */
  const [historyOpen, setHistoryOpen] = useState(true);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      /* Escape backs out one step at a time: out of the search, then out of
         the drawer. Closing both at once would take away the panel the reader
         was only trying to get back to. */
      if (searchOpen) {
        setSearchOpen(false);
        setQuery('');
      } else {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open, searchOpen]);

  /* A search that has to be tapped twice — once to open the field, once to
     get into it — is a search nobody uses. */
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  /* The drawer is somewhere you step into and back out of, so it opens the
     way it opens every time rather than holding the last thing that was asked
     of it. Deferred to the slide out, so the rows do not come back mid-travel
     behind a field that is still on screen. */
  useEffect(() => {
    if (open) return;
    const timer = setTimeout(() => {
      setSearchOpen(false);
      setQuery('');
    }, SLIDE_MS);
    return () => clearTimeout(timer);
  }, [open]);

  return (
    <div
      className="fixed inset-0 z-50"
      // Held on screen through the slide out, then taken off the page: a drawer
      // parked past the left edge is still somewhere the keyboard can walk
      // into, and `inert` is what says it is not.
      style={{
        visibility: open ? 'visible' : 'hidden',
        transition: open ? undefined : `visibility 0s linear ${SLIDE_MS}ms`,
      }}
      inert={!open}
    >
      <div
        className="absolute inset-0 bg-[var(--color-overlay-backdrop)] backdrop-blur-[6px] transition-opacity duration-[280ms] ease-out motion-reduce:transition-none"
        style={{ opacity: open ? 1 : 0 }}
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('primaryNavigation')}
        data-testid="mobile-nav-drawer"
        ref={panelRef}
        /* The panel's own answer to a long press, at its boundary rather than on
           each row: `mobile-nav-no-select` in index.css keeps the browser from
           starting a selection, and this keeps it from raising the callout that
           would have come with one — over the headings, over the gap below the
           last row, over an empty list, all of which the row-level rules left
           uncovered.

           Fields are let through untouched. Selecting, copying and pasting a
           search term or a name being typed is the one place in this panel where
           the platform's own menu is the right answer, so anything inside an
           input keeps it.

           Deliberately not a touchstart/touchmove handler: cancelling those
           would take the drawer's vertical scrolling and the swipe that shuts it
           with them. */
        onContextMenu={(event) => {
          if (isEditableTarget(event.target)) return;
          event.preventDefault();
          clearSelectionInside(panelRef.current);
        }}
        {...swipeDismiss}
        // Two thirds of the window at rest. It is a panel you step into and
        // back out of rather than somewhere to stay, so leaving a strip of the
        // page standing beside it says the way back is still there — but the
        // rows have to be readable first, and a half left the longer labels
        // running into their own truncation.
        //
        // Searching takes the whole window, because searching is no longer
        // stepping into the drawer — it is the thing being done, and what it
        // returns is a list that can be any length. The strip of page beside
        // the panel was there to say where you came from; while a question is
        // being answered, what matters is the answer having somewhere to be
        // read, and two thirds of a phone is not it. Tapping the strip was also
        // the way back out, which is why the field's own key takes that job
        // over the moment it is gone: it clears the words, then the mode, and
        // the strip is back.
        //
        // Width is in the transition alongside the transform so the panel opens
        // out rather than jumping, on the same curve and duration it slid in
        // on — the two are the same panel moving, and they should move alike.
        className={`mobile-nav-no-select absolute inset-y-0 left-0 flex flex-col border-r border-border bg-conversation-surface shadow-menu-overlay transition-[transform,width] duration-[280ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none ${
          searchOpen ? 'w-full' : 'w-2/3'
        }`}
        style={{
          transform: open ? 'translateX(0)' : 'translateX(-100%)',
          paddingTop: 'max(12px, env(safe-area-inset-top))',
          paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
        }}
      >
        {/* Head: the brand mark, and the one control that acts on the whole
            library rather than on a section of it — or, once that control has
            been pressed, the question itself, standing where the mark stood.
            The field takes the head rather than opening below it because it
            replaces what the head was for: while it is up, the panel is
            answering it. */}
        <div className={`flex shrink-0 items-center justify-between pb-2 ${searchOpen ? 'px-2' : 'pl-4 pr-2'}`}>
          {searchOpen ? (
            <div className="history-search-field flex h-10 w-full items-center gap-2 rounded-[6px] px-2.5">
              <SearchIcon size={16} className="shrink-0 text-text-muted" />
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                aria-label={t('historySearch')}
                data-testid="drawer-search-input"
                placeholder={t('historySearchHint')}
                onChange={(e) => setQuery(e.currentTarget.value)}
                /* Handled here so it never reaches the panel's own listener:
                   inside a field, Escape means "not that" about what was
                   typed, and only once there is nothing left to take back
                   does it mean "not this" about the search. */
                onKeyDown={(e) => {
                  if (e.key !== 'Escape') return;
                  e.preventDefault();
                  e.stopPropagation();
                  if (query !== '') setQuery('');
                  else setSearchOpen(false);
                }}
                /* 16px and no smaller. This is the field the page was being
                   magnified out from under: iOS zooms in on focus below that
                   size and never zooms back, so a search left the whole app
                   scaled up and needing a pinch to read. The floor in index.css
                   would catch it either way; it is stated here too because the
                   size is part of this field's design now, not a rescue. */
                className="h-6 min-w-0 flex-1 bg-transparent text-base leading-6 text-text-primary outline-none placeholder:text-text-muted"
              />
              {/* One key for both jobs, because from where the reader sits
                  they are one job: it takes back the search. With something
                  typed that means the words, and the field stays to be typed
                  in again; with nothing typed there is only the mode left to
                  take back. */}
              <button
                type="button"
                onClick={() => {
                  if (query !== '') {
                    setQuery('');
                    searchInputRef.current?.focus();
                  } else {
                    setSearchOpen(false);
                  }
                }}
                aria-label={query !== '' ? t('historySearchClear') : t('close')}
                title={query !== '' ? t('historySearchClear') : t('close')}
                className="shrink-0 text-text-muted transition-colors hover:text-text-primary"
              >
                <XIcon size={16} />
              </button>
            </div>
          ) : (
            <>
              <span
                aria-hidden="true"
                // A step under the search glyph across the row from it. The mark is
                // a solid shape where the glyph is a drawn outline, so matched by
                // the ruler it reads heavier than it; taking it down to 16px is what
                // makes the two ends of the head weigh the same.
                className="block w-4 select-none"
                style={{
                  aspectRatio: '119 / 126',
                  background: 'linear-gradient(to bottom, var(--color-nav-logo-top), var(--color-nav-logo-bottom))',
                  WebkitMaskImage: 'url(/logo/logo-o.svg)',
                  WebkitMaskPosition: 'center',
                  WebkitMaskRepeat: 'no-repeat',
                  WebkitMaskSize: 'contain',
                  maskImage: 'url(/logo/logo-o.svg)',
                  maskPosition: 'center',
                  maskRepeat: 'no-repeat',
                  maskSize: 'contain',
                }}
              />
              {/* Its plate sits on the same right edge as the list rows' plates
                  below (the head's `pr-2` against their `px-2`), so the column of
                  backgrounds runs straight down the panel instead of stepping in at
                  the top. */}
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="flex h-9 w-9 items-center justify-center rounded-[6px] text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
                aria-label={t('navSearch')}
                title={t('navSearch')}
                data-testid="drawer-search-open"
              >
                <SearchIcon size={20} />
              </button>
            </>
          )}
        </div>

        {/* Body. Two parts, only one of which moves: the destinations and the
            two section headings stand still, and the conversation list scrolls
            under them. The list is the only thing here without a length — one
            column carrying both would send four fixed rows off the top of the
            panel to reach a conversation, and put the History heading somewhere
            above the history.

            The relative box is the fade's frame. A fade has to be a sibling of
            the scroller rather than a child of it — put inside, it scrolls away
            with the first screenful and stops covering the thing it is there to
            cover. */}
        <div className="relative flex min-h-0 flex-1 flex-col">
          {/* Fixed above the fold. Everything down to and including the History
              heading is the panel's own furniture — a short, known list that
              should still be under the thumb after you have scrolled a hundred
              conversations past it, and a heading that scrolls away from the
              rows it heads stops being a heading. */}
          <div className="shrink-0 px-2" hidden={searchOpen}>
            <DrawerRow
              icon={MessageCirclePlusIcon}
              label={t('newSession')}
              onClick={() => { onNewSession(); onClose(); }}
            />
            {/* Both galleries have pages of their own on this layout; each row
                goes to one and takes the drawer down behind it. */}
            <DrawerRow
              icon={Star}
              label={t('navFavorites')}
              current={current === 'favorites'}
              onClick={() => { onOpenFavorites?.(); onClose(); }}
            />
            <DrawerRow
              icon={Disc3}
              label={t('navFeatured')}
              current={current === 'featured'}
              onClick={() => { onOpenFeatured?.(); onClose(); }}
            />

            <DrawerRow
              label={t('navMore')}
              onClick={() => setMoreOpen((v) => !v)}
              section
              expanded={moreOpen}
            />
            <DrawerSection open={moreOpen} maxHeight={128}>
              <div className="px-2">
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={onClose}
                  className={`${SUB_ROW_CLASS} ${ROW_TEXT}`}
                >
                  {/* The same cut-out invertocat the desktop column carries. A
                      branch glyph is a version-control mark, not GitHub's, and
                      the two navs should not be naming the same destination
                      with different marks. */}
                  <span className="primary-nav-github-logo size-4" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">GitHub</span>
                </a>
                <a
                  href={LEARN_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={onClose}
                  className={`${SUB_ROW_CLASS} ${ROW_TEXT}`}
                >
                  <BookOpenIcon size={16} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{t('navLearnStrudel')}</span>
                </a>
              </div>
            </DrawerSection>

            <DrawerRow
              label={t('sessionHistory')}
              onClick={() => setHistoryOpen((v) => !v)}
              section
              expanded={historyOpen}
            />
          </div>

          {/* The one part of the panel that scrolls, and the only part that can
              outrun it. No filter field of its own: the drawer's head carries
              the one search this panel offers.

              `no-scrollbar` because the list is already read as scrollable —
              it runs off the bottom of the panel under a fade — and a grey rule
              standing down the inside of a drawer that is itself only two
              thirds of the window is one edge too many in a narrow space. The
              bottom padding is that fade's height: without it the last
              conversation comes to rest inside the softened band and can never
              be scrolled clear of it. */}
          <DrawerFillSection open={searchOpen || historyOpen}>
            <div className="h-full overflow-y-auto px-2 pb-12 no-scrollbar">
              <HistoryPanel
                sessions={history.sessions}
                currentId={history.currentId}
                isLoading={history.isLoading}
                initialError={history.initialError}
                onRetryInitial={history.onRetryInitial}
                onSwitch={(id) => { history.onSwitch(id); onClose(); }}
                onDelete={history.onDelete}
                onRename={history.onRename}
                /* The drawer stays open behind the star, the way the studio's
                   history overlay does: keeping a conversation is reported by
                   a notice with an undo held open in it, and undoing puts the
                   row back — into a list that has to still be there to put it
                   back into. */
                onFavorite={history.onFavorite}
                onLoadMore={history.onLoadMore}
                hasMore={history.hasMore}
                isLoadingMore={history.isLoadingMore}
                loadMoreError={history.loadMoreError}
                onRetryLoadMore={history.onRetryLoadMore}
                loadingSessions={history.loadingSessions}
                unreadSessions={history.unreadSessions}
                /* Nothing hovers on a phone, so the row's own marks are out
                   of reach here. Holding a row is what asks for them. */
                longPressMenu
                showSearch={false}
                query={searchOpen ? query : undefined}
              />
            </div>
          </DrawerFillSection>

          {/* The history list runs off the bottom of the panel rather than
              ending, so the last row is dissolved into the panel's own ground
              instead of being cut across by its edge. Exactly as tall as the
              foot below it, so the softened band and the row of controls read
              as one closing gesture rather than as two bands of different
              heights stacked up. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-12"
            style={{
              background: 'linear-gradient(to bottom, transparent, var(--color-conversation-surface))',
            }}
          />
        </div>

        {/* Foot: who you are, and what the room looks like. Both are filled
            plates rather than list rows — they close the panel off, and a plate
            reads as a control that stays put while the list above it scrolls.
            No rule above them: the fade is that line's soft form, and drawing
            both would be saying it twice. */}
        <div className="flex shrink-0 items-center justify-between gap-2 pl-2.5 pr-2 pt-2">
          {/* Just the disc. The address it used to carry is the one thing in
              the foot nobody needs read back to them — you know whose account
              you are signed into — and spelled out across a plate it made the
              account the largest object in the panel's closing row. Drawn as a
              disc the size of the switch beside it, the foot is two marks of
              equal weight: who, and what the room looks like. */}
          <button
            type="button"
            onClick={() => { onOpenAccount(); onClose(); }}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-hover text-text-secondary transition-colors hover:text-text-primary active:bg-surface-selected"
            aria-label={accountLabel}
            title={accountLabel}
          >
            {/* The letters are the button's mark, not a disc set inside it —
                the plate is already the switch's plate, and a second filled
                circle within it would be a badge on a badge. So they are drawn
                the way the glyph beside them is drawn: in the row's own colour,
                and small enough that the two controls carry the same weight
                rather than one shouting the account at the foot of the panel. */}
            {accountInitials ? (
              <span
                aria-hidden="true"
                className={`font-semibold leading-none tracking-[0.01em] ${
                  isWideInitials(accountInitials) ? 'text-[16px]' : 'text-[13px]'
                }`}
              >
                {accountInitials}
              </span>
            ) : (
              <UserIcon size={20} className="shrink-0" />
            )}
          </button>
          {/* Flips straight between the two palettes rather than cycling
              through "match system": a one-press switch has two states, and the
              system option is a third thing that belongs in a settings list
              where it can say what it means. The glyph shows the palette the
              press would move to, so it always answers "what does this do"
              rather than "where am I" — the room itself already says that. */}
          <button
            type="button"
            onClick={() => setThemePreference(theme === 'dark' ? 'light' : 'dark')}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-hover text-text-secondary transition-colors hover:text-text-primary active:bg-surface-selected"
            aria-label={theme === 'dark' ? t('switchToLight') : t('switchToDark')}
            title={theme === 'dark' ? t('switchToLight') : t('switchToDark')}
          >
            {theme === 'dark' ? <SunIcon size={20} /> : <MoonIcon size={20} />}
          </button>
        </div>
      </div>
    </div>
  );
}
