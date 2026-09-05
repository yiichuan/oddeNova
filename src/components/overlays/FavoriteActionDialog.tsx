import { useEffect, useRef, useState } from 'react';
import { t } from '../../lib/i18n';
import { StarIcon, TrashIcon, XIcon } from '../icons';

/**
 * Which of the three moves was just made. They are one notice rather than
 * three because they are one moment: a conversation has changed which list it
 * belongs to, and the only questions worth asking about that are "where did it
 * go" and "put it back".
 */
export type FavoriteActionKind = 'kept' | 'released' | 'deleted';

interface FavoriteActionDialogProps {
  kind: FavoriteActionKind;
  /** The conversation's own name — the notice is about this one and says so. */
  title: string;
  /**
   * Go to where the conversation now lives. Absent for a deletion, which is the
   * one move with nowhere to go.
   */
  onView?: () => void;
  onUndo: () => void;
  /**
   * Let the move stand. A deletion is only committed here, which is what makes
   * its undo an undo rather than a re-import.
   */
  onClose: () => void;
}

const HEADLINE: Record<FavoriteActionKind, string> = {
  kept: 'favoriteDoneTitle',
  released: 'unfavoriteDoneTitle',
  deleted: 'favoriteDeletedTitle',
};

/**
 * The colour the move is reported in — the star's orange for the two that keep
 * the conversation, the delete red for the one that does not. The mark and the
 * headline take the same one so the pair reads as a single phrase rather than
 * as an icon with a label beside it.
 */
const TONE: Record<FavoriteActionKind, string> = {
  kept: 'text-brand-accent',
  released: 'text-brand-accent',
  deleted: 'text-error',
};

/**
 * How long the notice waits before letting the move stand on its own.
 *
 * Long enough to read one line and reach for undo, short enough that a bar
 * across the top of the page is not something you have to put away. It is the
 * whole of the offer, not a courtesy on top of it: after this the deletion it
 * was holding is done, so the number is how long you have to change your mind.
 *
 * The wait is only spent while the notice is left alone — the pointer resting
 * on it or the focus landing in it is someone deciding, and nothing decides
 * for them while they are.
 */
export const LINGER_MS = 5000;

/**
 * How long the notice takes to go once it has been answered.
 *
 * Every way out runs through it — the cross, Escape, both buttons, and the
 * wait running out — because a bar that vanishes between two frames reads as a
 * glitch rather than as a thing that left, and because these four are the same
 * event from the notice's side: it is done. The delay it costs the two buttons
 * is under a fifth of a second, which is less than the eye takes to find where
 * the page went anyway.
 */
export const LEAVING_MS = 180;

/**
 * What happened after keeping a conversation, letting one go, or deleting one.
 *
 * A bar at the top of the page rather than a panel in the middle of it, and the
 * page underneath stays exactly as it was — unblurred, unwashed, and still
 * usable. That is the point: none of these three moves is a question. The
 * conversation has already gone where it was sent, the list you were reading
 * has already changed to show it, and stopping the page to say so would be
 * asking permission for something that already happened.
 *
 * So it reports and offers, in one line: what the move was, which conversation
 * it was, the way onward, the way back, and the way out. It leaves the focus
 * where it found it — you may well be mid-sentence somewhere on the page —
 * and it does not leave on its own, because the way back is only worth
 * offering for as long as it can still be taken.
 *
 * Both ways out are verbs on the conversation, not OK and Cancel: go and look
 * at where it went, or put it back. Dismissing without choosing means the move
 * stands, which is why the deletion is committed there.
 */
export default function FavoriteActionDialog({
  kind,
  title,
  onView,
  onUndo,
  onClose,
}: FavoriteActionDialogProps) {
  const [held, setHeld] = useState(false);
  const [leaving, setLeaving] = useState(false);
  /* Held in a ref rather than depended on: the page rebuilds this callback as
     it re-renders, and a timer keyed on its identity would start again every
     time — a countdown that never gets to the end of itself. */
  const closeRef = useRef(onClose);
  /* What to do once the notice has finished going. Captured when the answer is
     given rather than read at the end, so a click reports the notice it was
     actually given to. Its presence is also what makes every way out final:
     the first answer wins and the rest are the same door being pushed again. */
  const answerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  const answer = (taken: () => void) => {
    if (answerRef.current) return;
    answerRef.current = taken;
    setLeaving(true);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      answer(() => closeRef.current());
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // Bound once. `answer` is rebuilt each render but reads nothing that
    // changes — two refs and one setter, all stable.
  }, []);

  useEffect(() => {
    if (held || leaving) return undefined;
    const timer = window.setTimeout(() => answer(() => closeRef.current()), LINGER_MS);
    return () => window.clearTimeout(timer);
  }, [held, leaving]);

  useEffect(() => {
    if (!leaving) return undefined;
    const timer = window.setTimeout(() => answerRef.current?.(), LEAVING_MS);
    return () => window.clearTimeout(timer);
  }, [leaving]);

  const tone = TONE[kind];

  return (
    <div
      data-testid="favorite-action-dialog"
      data-favorite-action={kind}
      /* A strip across the top rather than a layer over everything: nothing
         here is waiting on an answer, so nothing here may stand between the
         pointer and the page. Only the bar itself takes clicks. */
      className="pointer-events-none fixed inset-x-0 top-6 z-[100] flex justify-center px-4"
    >
      <div
        role="status"
        aria-live="polite"
        /* Reaching for it stops the clock, and taking the hand away starts it
           over. Focus counts as reaching: the notice can be tabbed to, and
           nothing should be able to close under a key on its way to a button. */
        onPointerEnter={() => setHeld(true)}
        onPointerLeave={() => setHeld(false)}
        onFocusCapture={() => setHeld(true)}
        onBlurCapture={() => setHeld(false)}
        /* Lighter than the surfaces it passes over, and edged brighter than
           the app's panels are. Those are places the page settles into and can
           afford to sit at the page's own value; this one has to read as
           standing off it, over whatever happens to be underneath — the studio's
           near-black or the Favorites page's light field. */
        className={`flex w-max max-w-full items-center gap-2.5 rounded-[12px] border border-border bg-settings-surface/95 py-2 pl-3.5 pr-2 shadow-menu-overlay backdrop-blur-2xl ${
          leaving
            ? 'animate-favorite-dialog-out pointer-events-none'
            : 'animate-favorite-dialog-in pointer-events-auto'
        }`}
      >
        {/* The same glyph the move was made with, at rest, so the line reads
            at a glance as the answer to the star that was just clicked. */}
        <span aria-hidden="true" className={`flex shrink-0 items-center ${tone}`}>
          {kind === 'deleted' ? <TrashIcon size={15} /> : <StarIcon size={15} filled={kind === 'kept'} />}
        </span>
        <span className={`shrink-0 text-[13px] font-medium ${tone}`}>{t(HEADLINE[kind])}</span>
        {/* The name gives up its width first — everything else on this line is
            either a fixed mark or a word you have to be able to read. */}
        <span className="min-w-0 truncate text-[13px] text-text-secondary">{title}</span>

        <span className="ml-1 flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => answer(onUndo)}
            className="h-7 rounded-full border border-border px-3 text-[12px] text-text-secondary transition-colors hover:border-accent/50 hover:text-text-primary"
          >
            {t('favoriteActionUndo')}
          </button>
          {onView && (
            <button
              type="button"
              onClick={() => answer(onView)}
              className="h-7 rounded-full bg-accent px-3 text-[12px] font-medium text-on-accent transition-colors hover:bg-accent-light"
            >
              {t('favoriteActionView')}
            </button>
          )}
        </span>

        {/* A hairline before the cross: the two buttons are things to do to the
            conversation, and this is not one of them. */}
        <span aria-hidden="true" className="h-4 w-px shrink-0 bg-border" />
        <button
          type="button"
          onClick={() => answer(onClose)}
          title={t('close')}
          aria-label={t('close')}
          className="grid size-7 shrink-0 place-items-center rounded-full text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
        >
          <XIcon size={14} />
        </button>
      </div>
    </div>
  );
}
