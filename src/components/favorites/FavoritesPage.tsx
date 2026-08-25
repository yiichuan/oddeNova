import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { t } from '../../lib/i18n';
import {
  conversationTitle,
  favoriteScripts,
  favoritedDateLabel,
  favoritedTimeLabel,
  turnText,
  type FavoriteConversation,
} from '../../lib/favorite-conversations';
import { CheckIcon, CopyIcon } from '../icons';
import FeaturedTitleWheel from '../featured/FeaturedTitleWheel';
import FeaturedWebglLightField from '../featured/FeaturedWebglLightField';
import { useWheelPosition } from '../featured/featured-wheel';

interface FavoritesPageProps {
  conversations: readonly FavoriteConversation[];
}

interface PanelProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  title: string;
  /** A quiet figure beside the title — here, how many lines the script runs. */
  meta?: string;
  action?: ReactNode;
  children: ReactNode;
}

/**
 * The same glass the Featured detail panels are cut from — this page stands on
 * the same light field, and a second kind of panel over it would read as a
 * different app. The header bar is a fixed 36px whether or not a panel carries
 * an action, so every column's body starts on one line however many there are.
 */
function Panel({ title, meta, action, className = '', children, ...rest }: PanelProps) {
  return (
    <section
      aria-label={title}
      className={`flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[10px] border border-white/10 bg-[#0D0D0D]/55 p-5 backdrop-blur-2xl transition-[border-color,box-shadow] duration-200 ${className}`}
      {...rest}
    >
      <div className="mb-5 flex h-9 shrink-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <h2 className="truncate text-xl font-medium uppercase tracking-[0.08em] text-text-primary">
            {title}
          </h2>
          {meta && <span className="shrink-0 text-xs tabular-nums text-text-muted">{meta}</span>}
        </div>
        {action}
      </div>

      {/* The body runs out past the panel's right padding so its scrollbar sits
          6px off the edge rather than 20px in; the matching pr keeps the text
          the same distance clear of the bar it scrolls with. */}
      <div className="-mr-3.5 min-h-0 flex-1 overflow-auto pr-3.5">{children}</div>
    </section>
  );
}

/** One script, in its own column. */
function ScriptColumn({
  code,
  take,
  highlighted,
  turnId,
}: {
  code: string;
  take: number;
  highlighted: boolean;
  turnId: string;
}) {
  const [copied, setCopied] = useState(false);
  const lineCount = code.split('\n').length;

  return (
    <Panel
      data-favorites-script={turnId}
      data-highlighted={highlighted}
      className={`w-[340px] shrink-0 ${highlighted ? 'border-white/30 shadow-[0_0_0_1px_rgba(255,255,255,0.12)]' : ''}`}
      title={t('favoritesCodeColumn').replace('{n}', String(take))}
      meta={`${lineCount}`}
      action={
        <button
          type="button"
          aria-label={t('copyCode')}
          title={t('copyCode')}
          onClick={() => {
            navigator.clipboard?.writeText(code).then(() => {
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
      {/* Read-only, and never wrapped: a wrapped Strudel chain stops looking
          like the chain it is, so a long line scrolls this column instead. */}
      <pre
        className="whitespace-pre text-[12px] text-text-secondary"
        style={{ fontFamily: "'ABeeZee', monospace", lineHeight: 1.7, letterSpacing: '0.04em' }}
      >
        <code>{code}</code>
      </pre>
    </Panel>
  );
}

/**
 * 收藏 — a favorited conversation, opened up.
 *
 * Two halves, because a favorite is two things at once. On the left the
 * exchange, read top to bottom the way it happened. On the right every script
 * that exchange committed, each in a column of its own rather than stacked:
 * the takes are versions of one another, and standing them side by side is what
 * lets you read across them. The columns keep their gap and run off the right
 * edge when there are more than fit, which is the honest shape of "however many
 * takes this conversation took".
 *
 * The list of favorites is the Featured page's own title column — same rows,
 * same marker, same drag — because it is the same act: picking one of a short
 * hand-held list without leaving the page you are on. Each row carries the
 * conversation's name and the day it was kept.
 *
 * Nothing here is wired to a store yet; the conversations are handed in, and
 * today they come from the mock in `favorite-conversations.ts`.
 */
export default function FavoritesPage({ conversations }: FavoritesPageProps) {
  const { position, index, snapTo, scrubTo, settleScrub } = useWheelPosition(conversations.length);
  const columnsRef = useRef<HTMLDivElement>(null);
  /* Which take the reader has aimed at from the conversation, and which one
     they are only pointing at — the same "shown before you commit" preview the
     title column runs on hover. */
  const [pinnedTurnId, setPinnedTurnId] = useState<string | null>(null);
  const [hoveredTurnId, setHoveredTurnId] = useState<string | null>(null);

  const current = conversations[index] ?? null;
  const scripts = useMemo(() => (current ? favoriteScripts(current) : []), [current]);

  const labels = useMemo(
    () => conversations.map((conversation) => (
      `${conversationTitle(conversation)} · ${favoritedDateLabel(conversation.favoritedAt)}`
    )),
    [conversations],
  );

  const showScript = useCallback((turnId: string) => {
    setPinnedTurnId(turnId);
    const column = columnsRef.current?.querySelector(`[data-favorites-script="${turnId}"]`);
    if (column && typeof column.scrollIntoView === 'function') {
      column.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  }, []);

  const takeOf = (turnId: string) => scripts.find((script) => script.turnId === turnId)?.take ?? 0;

  return (
    <main
      data-testid="favorites-page"
      className="relative isolate flex h-full min-w-0 flex-1 overflow-hidden"
    >
      <FeaturedWebglLightField active />

      {/* Inset to the same two verticals every other full-width page uses. */}
      <div className="relative z-10 flex h-full w-full flex-col overflow-hidden px-4">
        {/* The page's own name, then what is currently open under it. The right
            of this band belongs to the list, so the text is held clear of it. */}
        <header className="relative z-10 shrink-0 pr-[17rem] pt-2">
          <h1 className="text-2xl font-semibold leading-10 tracking-[-0.02em] text-text-primary">
            {t('navFavorites')}
          </h1>

          {current && (
            <div key={current.id} className="featured-content-in mt-6">
              <h2 className="truncate font-dm-serif text-[24px] leading-tight text-text-primary">
                {conversationTitle(current)}
              </h2>
              <p className="mt-2 truncate text-xs text-text-muted">
                {[
                  t('favoritesSavedAt').replace('{time}', favoritedTimeLabel(current.favoritedAt)),
                  t('favoritesTurnCount').replace('{n}', String(current.turns.length)),
                  t('favoritesCodeCount').replace('{n}', String(scripts.length)),
                ].join(' · ')}
              </p>
            </div>
          )}
        </header>

        {conversations.length > 0 && (
          <FeaturedTitleWheel
            labels={labels}
            position={position}
            onSelect={snapTo}
            onScrub={scrubTo}
            onScrubEnd={settleScrub}
            ariaLabel={t('favoritesList')}
            testId="favorites-title-wheel"
          />
        )}

        {current === null ? (
          <div className="flex flex-1 flex-col items-center justify-center pb-16 text-center">
            <p className="text-base text-text-secondary">{t('favoritesEmptyTitle')}</p>
            <p className="mt-2 max-w-sm text-xs leading-5 text-text-muted">
              {t('favoritesEmptyHint')}
            </p>
          </div>
        ) : (
          /* mt-12 clears the title column, which is fixed to the top right and
             runs seven rows deep; the panels start below its last row so the
             two never meet however wide the window is. */
          <div key={current.id} className="featured-content-in mt-12 flex min-h-0 flex-1 gap-6 pb-4">
            {/* The conversation takes whatever the takes leave: two columns of
                code on a wide window should widen the reading, not leave a hole
                at the end of the row. */}
            <Panel className="min-w-[300px] flex-1" title={t('favoritesConversation')}>
              <div className="flex flex-col gap-5">
                {current.turns.map((turn) => (
                  <div
                    key={turn.id}
                    data-favorites-turn={turn.id}
                    className={turn.role === 'user' ? 'flex justify-end' : ''}
                  >
                    {turn.role === 'user' ? (
                      <p className="max-w-[85%] rounded-[10px] bg-white/[0.08] px-3 py-2 text-sm leading-6 text-text-primary">
                        {turnText(turn)}
                      </p>
                    ) : (
                      <>
                        <p className="text-sm leading-6 text-text-secondary">{turnText(turn)}</p>
                        {turn.code && (
                          /* Where the widget stood in the conversation. The code
                             itself is already on the page, in its own column —
                             so this points at it rather than repeating it. */
                          <button
                            type="button"
                            onClick={() => showScript(turn.id)}
                            onPointerEnter={() => setHoveredTurnId(turn.id)}
                            onPointerLeave={() => setHoveredTurnId(
                              (id) => (id === turn.id ? null : id),
                            )}
                            onFocus={() => setHoveredTurnId(turn.id)}
                            onBlur={() => setHoveredTurnId((id) => (id === turn.id ? null : id))}
                            data-favorites-chip={turn.id}
                            aria-label={t('favoritesJumpToCode').replace('{n}', String(takeOf(turn.id)))}
                            className={`mt-3 inline-flex h-8 items-center gap-2 rounded-full border px-3 text-xs transition-colors ${
                              pinnedTurnId === turn.id
                                ? 'border-white/30 text-text-primary'
                                : 'border-white/10 text-text-secondary hover:border-white/25 hover:text-text-primary'
                            }`}
                          >
                            <span
                              aria-hidden="true"
                              className="size-1.5 rounded-full bg-[#f05a28]"
                            />
                            {t('favoritesCodeColumn').replace('{n}', String(takeOf(turn.id)))}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </Panel>

            {/* One column per take, with the gap kept between them; more takes
                than fit run off the right edge rather than shrinking. */}
            {scripts.length > 0 ? (
              <div
                ref={columnsRef}
                data-testid="favorites-script-columns"
                /* Sized by how many takes there are, up to the point where the
                   conversation beside it would start to suffer — past that the
                   row itself scrolls. */
                className="flex min-h-0 max-w-[70%] shrink-0 gap-6 overflow-x-auto pb-1"
              >
                {scripts.map((script) => (
                  <ScriptColumn
                    key={script.turnId}
                    turnId={script.turnId}
                    take={script.take}
                    code={script.code}
                    highlighted={
                      hoveredTurnId === script.turnId
                      || (hoveredTurnId === null && pinnedTurnId === script.turnId)
                    }
                  />
                ))}
              </div>
            ) : (
              <div className="flex min-h-0 w-[340px] shrink-0 items-center justify-center rounded-[10px] border border-dashed border-white/10 px-6 text-center text-xs leading-5 text-text-muted">
                {t('favoritesNoCode')}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
