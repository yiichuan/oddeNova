import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { t, zh } from '../../lib/i18n';
import {
  conversationTitle,
  favoriteConversationMessages,
  favoriteScripts,
  favoritedTimeLabel,
  type FavoriteConversation,
  type FavoriteScript,
} from '../../lib/favorite-conversations';
import { CheckIcon, CopyIcon } from '../icons';
import ArchivedConversationView from '../conversation/ArchivedConversationView';
import ConversationBlurBands from '../conversation/ConversationBlurBands';
import ConversationTurnRail from '../conversation/ConversationTurnRail';
import FeaturedWebglLightField from '../featured/FeaturedWebglLightField';
import FavoritesList, { LIST_COLUMN } from './FavoritesList';
import { NAV_COLLAPSED_WIDTH } from '../nav/PrimaryNav';

/**
 * The reading's own inset: the window's 60px of horizontal overhang handed
 * straight back as padding leaves 1rem, and the message row adds its own half
 * of that before the first character.
 */
const READING_INSET = '1.5rem';

/**
 * What the left has to step back by that the right does not, because the two
 * are not counted from the same place. This page begins where the primary
 * nav's column ends, and on a page whose nav is always in lobes that column is
 * still holding 60px of the page's left edge plus the app's region inset — 70px
 * the right edge has nothing to answer — and then the reading insets itself
 * again. Take both off the left and the conversation's first character stands
 * as far from the page's left edge as the code window's edge does from its
 * right.
 */
const GALLERY_LEFT_STEP_BACK = `calc(${NAV_COLLAPSED_WIDTH}px + var(--spacing-region)`
  + ` + ${READING_INSET})`;

/**
 * The primary nav's own centre line, counted back from this page's left edge.
 *
 * The page begins where the nav's column ends, so the nav's middle is half that
 * column and the gap it keeps, the other way. The turn rail is centred on that
 * vertical rather than set against anything of this page's: what it indexes is
 * the reading, but where it *lives* is the app's left margin, standing in the
 * strip the nav's two lobes leave empty between them — so it belongs to the
 * nav's column, and a thing in a column stands down the middle of it. Which is
 * also what lets a line grow under the pointer without leaving that middle:
 * both ends move, and the axis they move about does not.
 */
const RAIL_CENTER = `calc(${NAV_COLLAPSED_WIDTH / -2}px - var(--spacing-region))`;

/**
 * The air between the two windows.
 *
 * Half again the 2rem the page keeps between any two things standing side by
 * side: these two are one spread rather than two neighbours, and the extra is
 * what says so — but only just, because a spread is read across.
 *
 * A knob for how far apart the two windows stand, and for nothing else — what
 * it gives up goes to the margins below rather than into the windows.
 */
const GALLERY_GUTTER = '3rem';

/**
 * The gutter that leaves the two windows exactly the width the page's own two
 * verticals gave them, before any of this was tuned: 2rem of air plus the whole
 * of the left's step back. Not what the gutter is — what it is measured
 * against.
 */
const WIDTH_HOLDING_GUTTER = `calc(2rem + ${GALLERY_LEFT_STEP_BACK})`;

/**
 * Half of whatever the gutter gives up against that, handed to each margin.
 *
 * Which is what keeps the windows' width out of the gutter's hands. The pair is
 * held between two margins and one gutter; narrow the gutter with the margins
 * pinned and the two columns take the whole difference and grow. Give it to the
 * margins instead — half each, so the spread stays centred on the page — and
 * the two windows keep their width whatever the middle is set to.
 */
const GUTTER_GIVEN_BACK = `calc((${WIDTH_HOLDING_GUTTER} - ${GALLERY_GUTTER}) / 2)`;

/**
 * How far in from either side of the page the gallery stands: the column the
 * list needs, the left's step back, and each margin's share of what the gutter
 * gave up.
 */
const GALLERY_INSET_RIGHT = `calc(${LIST_COLUMN} + ${GUTTER_GIVEN_BACK})`;
const GALLERY_INSET_LEFT = `calc(${LIST_COLUMN} - ${GALLERY_LEFT_STEP_BACK}`
  + ` + ${GUTTER_GIVEN_BACK})`;

/**
 * How the row divides between the two columns.
 *
 * Equal grow, and the conversation carries the reading's own two insets as its
 * basis. So the free space halves, and the conversation takes its half plus the
 * 3rem it is about to give straight back to its own margins — which leaves the
 * block of text inside it exactly the width of the code window beside it.
 *
 * That is what makes the two mirror images about the page's centre rather than
 * merely equidistant from its edges. The outer pair already matched: the first
 * character of the reading stands as far from the left edge as the code
 * window's edge does from the right. Equal widths is what brings the inner pair
 * with them — and two blocks reflected in an axis have to be the same size, so
 * the 0.9-to-1.1 the row used to hold could not survive the ask.
 */
const CONVERSATION_SHARE = `1 1 calc(${READING_INSET} * 2)`;
const CODE_SHARE = '1 1 0%';

/**
 * How wide either block gets to be at its widest.
 *
 * A measure rather than a share: past about this, a line of prose or of code is
 * one the eye loses its place in on the way back to the next line, and a window
 * that keeps growing with the display only makes more of them. So beyond a
 * point the two blocks stop growing and the page grows around them instead.
 *
 * Which is why the row is centred. Both columns reach the cap at the same
 * width — their targets differ by the same 3rem their caps do — so neither can
 * take the other's leftover, and what is left over is air the row divides
 * evenly. That is what keeps the mirror: each block moves in from its own edge
 * of the page by exactly half of it.
 */
const READING_MEASURE = '390px';
const CONVERSATION_MAX = `calc(${READING_MEASURE} + ${READING_INSET} * 2)`;

/**
 * How much of the page's height the gallery leaves above and below itself, as
 * a divisor of that height: the two windows keep the middle two thirds, so
 * both of their edges stand one sixth of the page in from its own.
 *
 * One number, because the two columns say it in different ways and must not
 * drift. The code window has a panel and says it with a height. The
 * conversation has none — it runs the column's full height and lets its ends
 * blur out — so it says it with where the reading comes to rest instead: at
 * the top of the scroll the first message's top stands on the code window's
 * top edge, at the bottom the last reply's foot stands on its bottom edge.
 * Between those the stream carries on past both, which is what the blur is
 * for. Read as a spread rather than as two things floating independently.
 */
const GALLERY_BAND_DIVISOR = 6;

/** The code window's own height, as a share of the row it stands in. */
const GALLERY_BAND_HEIGHT = `calc(100% - 200% / ${GALLERY_BAND_DIVISOR})`;

/**
 * The same measure for the conversation, in cqh against `.conversation-archive`
 * — the one box that is the reading column's full height, which is also the
 * height the code window takes its share of. A percentage cannot say this:
 * padding resolves against width.
 */
const GALLERY_BAND_INSET = `calc(100cqh / ${GALLERY_BAND_DIVISOR})`;

/**
 * How far below the middle of the page the pair sits.
 *
 * The reading follows the code window down rather than staying put: the two
 * verticals below are one measure said twice, and the first message standing
 * on the code window's top edge is what the page's whole geometry has been
 * built around. Moving one of the pair and not the other would leave that off
 * by exactly this much.
 */
const GALLERY_DROP = '30px';

/**
 * How far below the code window's top edge the reading starts.
 *
 * Just off it rather than exactly on it. A first message on the same line as
 * the panel's border reads as having run into it — the border is a drawn edge
 * and the message is not, and the eye takes two things touching for one thing
 * clipped. This is the smallest offset that reads as clearance rather than as
 * an alignment someone missed.
 *
 * Only the head takes it. The foot still stands on the panel's own bottom
 * edge, where a script has no chrome of its own to answer to either.
 */
const READING_HEAD_CLEARANCE = '8px';

/**
 * The reading window and its content stops, handed to the archive stylesheet.
 *
 * The window keeps the page's own height, reaching back through the app's
 * region inset to the very edges of it — an end outside the column is an end
 * the blur never has to stop at.
 *
 * The two are independent on purpose: the stops are given in the column's own
 * coordinates, so where the stream stops being drawn and where the reading
 * comes to rest can be moved separately. index.css converts between the two
 * when it turns a stop into scrollport padding.
 */
const CONVERSATION_WINDOW = {
  '--spacing-conversation-window-top': 'calc(var(--spacing-region) * -1)',
  '--spacing-conversation-window-bottom': 'calc(var(--spacing-region) * -1)',
  '--spacing-conversation-content-top':
    `calc(${GALLERY_BAND_INSET} + ${GALLERY_DROP} + ${READING_HEAD_CLEARANCE})`,
  '--spacing-conversation-content-bottom': `calc(${GALLERY_BAND_INSET} - ${GALLERY_DROP})`,
} as CSSProperties;

interface FavoritesPageProps {
  conversations: readonly FavoriteConversation[];
  /**
   * Whether this is the page on screen. The gallery pages are hidden rather
   * than unmounted when you leave them, so nothing below can tell an arrival
   * from a re-render without being told.
   */
  active?: boolean;
  isPlaying?: boolean;
  playingCode?: string;
  onPlayCode?: (code: string) => void;
  onStopCode?: () => void;
}

interface PanelProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}

function Panel({ title, action, className = '', children, ...rest }: PanelProps) {
  return (
    <section
      aria-label={title}
      // Glass rather than a surface, taken verbatim from the Featured
      // detail's panels: both stand on the same WebGL light field, and a
      // panel that keeps its own flat colour there reads as a card dropped on
      // the page instead of a window cut into it. The edge comes from the same
      // place — a solid grey rule around glass is a drawn border, where a
      // tenth of white is the light catching an edge.
      className={`flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[9px] border border-white/10 bg-[#0D0D0D]/55 p-5 backdrop-blur-2xl ${className}`}
      {...rest}
    >
      {/* No offset of its own: the title stands off the panel's top edge by
          exactly what the last line of the script stands off its bottom one,
          which is the panel's own padding and nothing else. The 42px that used
          to be added here made the window's two ends say different things —
          held at the top, cut at the foot — and a script is read from both. */}
      <div className="mb-5 flex h-9 shrink-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <h2 className="truncate text-lg font-medium uppercase tracking-[0.08em] text-text-primary">
            {title}
          </h2>
        </div>
        {action}
      </div>
      {/* The bar stands whenever the script is longer than the window, rather
          than waiting for the pointer. A conversation says how much more of it
          there is by fading out; a script has an edge and cannot, so the only
          thing here that can say "this is not all of it" is the bar. The
          negative margin puts it out at the panel's own padding, and `pr-3.5`
          keeps the code off it. */}
      <div className="-mr-3.5 min-h-0 flex-1 overflow-auto pr-3.5">
        {children}
      </div>
    </section>
  );
}

function CodePanel({ script }: { script: FavoriteScript | null }) {
  const [copied, setCopied] = useState(false);

  if (!script) {
    return (
      <Panel className="h-full w-full" title={t('featuredCode')}>
        <div className="flex h-full items-center justify-center px-6 text-center text-xs leading-5 text-text-muted">
          {t('favoritesNoCode')}
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      data-favorites-script={script.turnId}
      className="h-full w-full"
      title={t('favoritesCodeColumn').replace('{n}', String(script.take))}
      action={
        <button
          type="button"
          aria-label={t('copyCode')}
          title={t('copyCode')}
          onClick={() => {
            navigator.clipboard?.writeText(script.code).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2000);
            }).catch(() => { /* A refused clipboard is not worth a dialog. */ });
          }}
          className="grid size-8 shrink-0 place-items-center rounded-full text-text-secondary transition-colors hover:bg-white/10 hover:text-text-primary"
        >
          {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
        </button>
      }
    >
      <pre
        className="whitespace-pre text-[12px] text-text-secondary"
        style={{ fontFamily: "'ABeeZee', monospace", lineHeight: 1.7, letterSpacing: '0.04em' }}
      >
        <code>{script.code}</code>
      </pre>
    </Panel>
  );
}

/**
 * 收藏 — a gallery page, standing on the same light field the Featured shelf
 * does, because the two are the same kind of place: a small hand-held
 * collection you look across rather than a workspace you work in. The primary
 * nav breaks into its two lobes for both of them, which is what gives this page
 * its own top corners — the name in one, the list of favorites in the other.
 *
 * What is kept in the middle is one conversation, opened up: the exchange on
 * the left and the code take it is currently pointed at on the right. The two
 * are parallel reading surfaces, so neither replaces the other and comparing
 * what was asked with what was committed stays direct.
 *
 * The pair is held at two thirds of the page's height and centred on it rather
 * than filled to the edges. A gallery is something a page holds up, and the air
 * above and below is what does the holding — it is also what leaves the two
 * corners free for the name and the list without either of them crowding the
 * reading.
 */
export default function FavoritesPage({
  conversations,
  active = true,
  isPlaying = false,
  playingCode = '',
  onPlayCode = () => {},
  onStopCode = () => {},
}: FavoritesPageProps) {
  const sortedConversations = useMemo(
    () => [...conversations].sort((left, right) => right.favoritedAt - left.favoritedAt),
    [conversations],
  );
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(
    () => sortedConversations[0]?.id ?? null,
  );
  const [selectedScriptTurnId, setSelectedScriptTurnId] = useState<string | null>(null);
  /* The archive's own scrollport, borrowed. The rail on the left moves the
     reading, and the element that scrolls is inside the archive. */
  const archiveScrollRef = useRef<HTMLDivElement>(null);

  const current = sortedConversations.find(
    (conversation) => conversation.id === selectedConversationId,
  ) ?? sortedConversations[0] ?? null;
  const scripts = useMemo(() => (current ? favoriteScripts(current) : []), [current]);
  const archiveMessages = useMemo(
    () => (current ? favoriteConversationMessages(current) : []),
    [current],
  );
  const selectedScript = scripts.find((script) => script.turnId === selectedScriptTurnId)
    ?? scripts.at(-1)
    ?? null;
  const playingCodeMessageId = isPlaying
    ? scripts.find((script) => script.code === playingCode)?.turnId ?? null
    : null;

  const selectConversation = (conversation: FavoriteConversation) => {
    const conversationScripts = favoriteScripts(conversation);
    setSelectedConversationId(conversation.id);
    setSelectedScriptTurnId(conversationScripts.at(-1)?.turnId ?? null);
  };

  return (
    <main
      data-testid="favorites-page"
      className="relative isolate flex h-full min-w-0 flex-1 overflow-visible"
    >
      <FeaturedWebglLightField active />

      {/* Inset to the same two verticals every other full-width page uses. */}
      <div
        className="relative z-10 h-full w-full overflow-visible px-4"
        style={CONVERSATION_WINDOW}
      >
        {/* Laid over the page rather than stacked above the gallery: the
            gallery is centred on the page's own height, and a heading in flow
            would push it off that centre. It stops where the list's column
            starts, the same vertical the gallery below it ends on. */}
        <header className="absolute left-4 top-2 z-40" style={{ right: LIST_COLUMN }}>
          <h1 className="text-2xl font-semibold leading-10 tracking-[-0.02em] text-text-primary">
            {t('navFavorites')}
          </h1>
        </header>

        <FavoritesList
          conversations={sortedConversations}
          selectedId={current?.id ?? null}
          onSelect={selectConversation}
        />

        {current && <ConversationBlurBands />}

        {/* Keyed like the gallery, so an arriving favorite brings its own index
            in rather than morphing the last one's into it. */}
        {current && (
          <ConversationTurnRail
            key={`${current.id}-rail`}
            center={RAIL_CENTER}
            messages={archiveMessages}
            scrollRef={archiveScrollRef}
          />
        )}

        {/* The full height of the page, inset to the two verticals the windows
            stand on — the list's column on the right and the same measure of
            air on the left. It stops short of the list rather than running
            under it, since the code window is the one that would otherwise meet
            the entries.

            Full height because the two columns no longer agree about it: the
            conversation is pinned to the nav's lobes and the code keeps the
            gallery's own two thirds. The row holds the widths; each column says
            where its own two ends are.

            Keyed on the conversation so an arriving favorite starts its
            reading where its own end is rather than where the last one was
            left, and so the fades below replay. Where that end is, is the
            archive's own business — see the layout effect in
            ArchivedConversationView.

            The fade itself is deliberately *not* here. `featured-content-in`
            animates opacity and fills, which keeps the element a compositing
            group for good — and an ancestor of that kind is where the blurred
            ends of the conversation stop being able to see the page behind
            them, which is what makes pale text glow instead of going soft. So
            each column carries its own fade, below the point where that
            matters. */}
        <div
          key={current?.id ?? 'favorites-empty'}
          data-testid="favorites-gallery"
          /* Air, not a divider. The app's 6px divider measure is a resize
             handle's width — two panes of one workspace butted together with
             just enough between them to grab. These two are not that: they are
             two reading surfaces held apart on the page's light field, and
             what separates them should read as the page showing through. */
          className="absolute inset-y-0 flex justify-center"
          /* The two verticals are named before they are used: each is four
             terms drawn from three modules, and `left`/`right` read better
             pointing at a name than carrying the arithmetic. */
          style={{
            '--gallery-inset-left': GALLERY_INSET_LEFT,
            '--gallery-inset-right': GALLERY_INSET_RIGHT,
            '--gallery-gutter': GALLERY_GUTTER,
            left: 'var(--gallery-inset-left)',
            right: 'var(--gallery-inset-right)',
            gap: 'var(--gallery-gutter)',
          } as CSSProperties}
        >
          {/* No surface of its own: the exchange is read straight off the
              page's light field. The code beside it keeps its panel because a
              script is a thing you look *at*, with edges; a conversation is
              something you look *through*, and a second frame around it only
              says that it is furniture.

              The reading runs the whole way to both ends of it: no padding at
              either edge, so the messages reach them and the blur is what says
              the stream carries on past. The bands reach past the reading
              window at both ends by design, and the outermost of them stops a
              few pixels above this column. Horizontal overflow stays visible
              so the reading window can extend 60px past either side while its
              compensated content remains on the same verticals. */}
          <section
            data-testid="favorites-conversation-panel"
            aria-label={t('favoritesConversation')}
            className="flex min-w-0 flex-col overflow-visible"
            style={{
              ...CONVERSATION_WINDOW,
              flex: CONVERSATION_SHARE,
              maxWidth: CONVERSATION_MAX,
            }}
          >
            <div className="min-h-0 flex-1">
              {current === null ? (
                <div className="featured-content-in flex h-full items-center justify-center text-base text-text-secondary">
                  {t('favoritesEmptyTitle')}
                </div>
              ) : (
                <ArchivedConversationView
                  active={active}
                  messages={archiveMessages}
                  scrollRef={archiveScrollRef}
                  selectedCodeMessageId={selectedScript?.turnId ?? null}
                  onSelectCode={setSelectedScriptTurnId}
                  playingCodeMessageId={playingCodeMessageId}
                  onPlayCode={(messageId, code) => {
                    setSelectedScriptTurnId(messageId);
                    onPlayCode(code);
                  }}
                  onStopCode={onStopCode}
                />
              )}
            </div>
          </section>

          {/* Its two edges are the verticals the conversation beside it comes
              to rest on, so the height is taken from the same measure. */}
          <div
            className="featured-content-in relative z-40 flex min-w-0 self-center"
            style={{
              height: GALLERY_BAND_HEIGHT,
              flex: CODE_SHARE,
              maxWidth: READING_MEASURE,
              // Offset rather than a margin: `self-center` centres the margin
              // box, so a margin here would move the panel half as far as it
              // says. The column is already `relative`.
              top: GALLERY_DROP,
            }}
          >
            <CodePanel
              key={selectedScript?.turnId ?? `${current?.id ?? 'favorites'}-empty`}
              script={selectedScript}
            />
          </div>
        </div>

        {/* The caption, in the corner opposite the page's own name. The list
            above it has to cut a long title to hold its column and shows only
            the day; this says the whole name and the moment it was kept, set
            large enough to be read rather than checked. Keyed like the gallery
            so it arrives with the favorite it names. */}
        {current && (
          <footer
            key={`${current.id}-caption`}
            data-testid="favorites-caption"
            className="featured-content-in absolute bottom-2 right-4 z-40 max-w-[min(34rem,55%)] text-right"
          >
            {/* Two ways of saying the same thing, because the two scripts do
                not have the same means. DM Serif Display carries Latin only —
                a Chinese name set in it is really Georgia or whatever the
                system falls back to, a different face from one favorite to the
                next — so English takes the serif at its single weight of 400,
                and 中文 stays in the page's own font and takes weight instead.
                Either way the name reads as the name, not as one more label. */}
            <h2
              data-favorites-caption-serif={!zh}
              className={`text-[12px] leading-tight text-text-primary ${zh ? 'font-bold' : 'font-dm-serif'}`}
            >
              {conversationTitle(current)}
            </h2>
            <time
              dateTime={new Date(current.favoritedAt).toISOString()}
              className="mt-1.5 block text-[12px] tabular-nums text-text-secondary"
            >
              {t('favoritesSavedAt').replace('{time}', favoritedTimeLabel(current.favoritedAt))}
            </time>
          </footer>
        )}
      </div>
    </main>
  );
}
