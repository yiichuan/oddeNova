import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { t, zh } from '../../lib/i18n';
import {
  countSamples,
  SAMPLE_CATALOG,
  type Bilingual,
  type SampleCategory,
  type SampleEntry,
  type SampleGroup,
} from '../../lib/sample-catalog';
import type { SoundInfo } from '../../lib/sample-preview';
import { NAV_COLLAPSED_WIDTH } from '../nav/PrimaryNav';
import { CheckIcon, CopyIcon, SearchIcon, XIcon } from '../icons';

const pick = ([zhText, enText]: Bilingual) => (zh ? zhText : enText);

/* The page's one ground, flat — no field behind it the way the galleries
   have one: what is looked at here is a field of names. */
const PAGE_GROUND = 'var(--audition-page-ground)';

/* The left edge every heading and shelf starts on — the same inset the
   Favorites heading uses, so the title lands in the same place on both. */
const PAGE_SIDE_INSET = '1rem';

/* The primary nav's left edge, counted back from this page's left edge: the
   page begins where the nav's column and the gap after it end. The category
   menu's words start on this vertical, flush with the nav above and below. */
const NAV_LEFT_EDGE = `calc(${-NAV_COLLAPSED_WIDTH}px - var(--spacing-region))`;

/* How far right of that edge the menu's words start. */
const RAIL_INDENT = '0.5rem';

/* How many groups stand side by side on one desktop page of the shelf. */
const GROUPS_PER_PAGE = 6;

/* How wide one group's column is, and the air between two of them. The six
   columns are held to this measure and centred in the strip between the
   title's left edge and the window's right edge, rather than stretched
   across it with every column's names hugging its left side. */
const GROUP_COLUMN = '12rem';
const GROUP_GAP = '1.5rem';
const SHELF_WIDTH = `calc(${GROUPS_PER_PAGE} * ${GROUP_COLUMN} + ${GROUPS_PER_PAGE - 1} * ${GROUP_GAP})`;

/* How far right of true centre the shelf stands. The category menu down the
   left margin is weight on that side already, so a shelf centred on the strip
   alone looks as if it leaves the right side empty. Added to the left padding
   twice over, since centring splits it. */
const SHELF_NUDGE = '2.5rem';

/* How deep the shelf's fades into the page run at its top and bottom. */
const SHELF_FADE_TOP = '2.5rem';
const SHELF_FADE_BOTTOM = '2.5rem';

/* The strip of page the shelf leaves clear under itself for the corner's
   刚刚试听 line (12px off the bottom, about 36px tall) and a little air above
   it — so a name is never read through or under that line. */
const HEARD_CLEARANCE = '4rem';

/* How close a take menu may run to the shelf's edge before it opens the
   other way instead. */
const MENU_EDGE = 8;

/* How long the pointer may rest inside a key's aim triangle before the
   triangle stands down and lets the key under it take over — so it bridges a
   move towards the menu, and never traps a pointer that has stopped. */
const AIM_REST_MS = 400;

/* How far past its drawn rectangle a lit key (and its menu) keeps the
   pointer. The menu's halo is the Tailwind `before:-inset-2` on it — the same
   8px. */
const HOVER_HALO = 8;

/* How many takes a menu column holds before the next ones start a column
   beside it. */
const MENU_ROWS = 12;

/* One floating key — the sound under the pointer, and the take menu fused
   to it. A drop-shadow on the pair rather than a box-shadow on each, so the
   two read as one raised shape with no shadow falling across the seam. */
const RAISED = 'drop-shadow(0 6px 12px rgba(20, 22, 40, 0.22))';

/* How long a pressed key shimmers once its sound starts. Superdough does not
   say when a sound has ended, so this is the length of a typical hit rather
   than of the recording: "that was the one", not a playhead. */
const SOUND_MS = 1200;

/* How long the sheen takes to spread out and fade once a key is done —
   the length of `audition-shimmer-out` in index.css. */
const FADE_MS = 600;

/** One sound in the code it would be written as — what the copy key copies. */
function soundCode(name: string, variant: number): string {
  return variant > 0 ? `s("${name}:${variant}")` : `s("${name}")`;
}

interface Heard {
  name: string;
  variant: number;
}

/** A key's press in flight: sounding (or still fetching), or fading out. */
interface Playback {
  phase: 'playing' | 'ending';
  /** Which press this is, so a stale timer never ends a newer one. */
  id: number;
}

interface AuditionPageProps {
  /** Hidden rather than unmounted when you leave, so it is told when it is up. */
  active: boolean;
  engineReady: boolean;
  previewSound: (name: string, options?: { variant?: number; note?: string }) => Promise<void>;
  describeSounds: (names: readonly string[]) => Promise<Record<string, SoundInfo>>;
}

/**
 * 试听 — every sound the studio can play, shelved by what it sounds like
 * (see sample-catalog.ts), each one a key: press it to hear it. Pointing at
 * a sound with several takes opens a menu of all of them beside it, each
 * written the way code would name it. Desktop only: the phone layout has no route to it.
 */
export default function AuditionPage({
  active,
  engineReady,
  previewSound,
  describeSounds,
}: AuditionPageProps) {
  const [categoryId, setCategoryId] = useState(SAMPLE_CATALOG[0].id);
  const [query, setQuery] = useState('');
  const [infos, setInfos] = useState<Record<string, SoundInfo> | null>(null);
  /* The take last pressed — what its key numbers itself with, and what the
     code in the corner writes out, so the two always agree. */
  const [heard, setHeard] = useState<Heard | null>(null);
  /* Per sound rather than one for the page: a key left behind for another
     one finishes its own fade instead of being cut off by the next press. */
  const [playbacks, setPlaybacks] = useState<Record<string, Playback>>({});
  const [failed, setFailed] = useState<string | null>(null);
  /* The one key under the pointer (or keyboard focus), held here rather
     than by each key: a key that missed its pointer-leave, or kept focus
     after a click, would otherwise stay lit beside the one now pointed at.
     Keyed by shelf as well as name, since a search can show a name twice. */
  const [pointedKey, setPointedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const playIdRef = useRef(0);
  const timersRef = useRef(new Map<string, number>());
  /* Each sound's newest press. Presses of one sound can finish out of order —
     an earlier one still waiting on the download behind a later one — and only
     the newest may schedule that key's fade: a stale one would clear the
     newest's timer and leave its sheen running for good. */
  const latestPressRef = useRef(new Map<string, number>());

  /* What is actually registered is only known once the engine has loaded its
     sample indexes, and it does not change after that — so it is asked once,
     the first time the page is looked at with an engine behind it. */
  useEffect(() => {
    if (!active || !engineReady || infos) return;
    let cancelled = false;
    const names = SAMPLE_CATALOG.flatMap((category) =>
      category.groups.flatMap((group) => group.samples.map((sample) => sample.name)));
    describeSounds(names).then((described) => {
      if (!cancelled) setInfos(described);
    }).catch(() => { /* Unknown counts just mean no take menus. */ });
    return () => { cancelled = true; };
  }, [active, describeSounds, engineReady, infos]);

  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);

  const category = SAMPLE_CATALOG.find((item) => item.id === categoryId) ?? SAMPLE_CATALOG[0];
  const trimmed = query.trim().toLowerCase();

  /* A search looks across every shelf at once: what you are looking for by
     name is not something you should first have to know the shelf of. */
  const results = useMemo(() => {
    if (!trimmed) return null;
    const matches = (text: string | undefined) => text?.toLowerCase().includes(trimmed) ?? false;
    return SAMPLE_CATALOG.map((cat) => ({
      category: cat,
      groups: cat.groups.map((group) => {
        const groupMatches = matches(group.title[0]) || matches(group.title[1]) || matches(group.subtitle);
        return {
          ...group,
          samples: groupMatches
            ? group.samples
            : group.samples.filter((sample) =>
              matches(sample.name) || matches(sample.label?.[0]) || matches(sample.label?.[1])),
        };
      }).filter((group) => group.samples.length > 0),
    })).filter((result) => result.groups.length > 0);
  }, [trimmed]);

  const resultCount = results?.reduce(
    (sum, result) => sum + result.groups.reduce((n, group) => n + group.samples.length, 0),
    0,
  ) ?? 0;

  const updateQuery = (value: string) => setQuery(value);

  const selectCategory = (id: string) => {
    setCategoryId(id);
    setQuery('');
    scrollRef.current?.scrollTo({ top: 0 });
  };

  /* Moves one sound's press on to its next phase, or clears it — unless a
     newer press of the same sound has taken over in the meantime. */
  const settle = useCallback((name: string, id: number, phase: Playback['phase'] | null) => {
    setPlaybacks((current) => {
      if (current[name]?.id !== id) return current;
      const next = { ...current };
      if (phase) next[name] = { id, phase };
      else delete next[name];
      return next;
    });
  }, []);

  const after = useCallback((name: string, ms: number, then: () => void) => {
    window.clearTimeout(timersRef.current.get(name));
    timersRef.current.set(name, window.setTimeout(then, ms));
  }, []);

  /* The sheen does not stop dead: it spreads out to both sides and fades,
     and only then is it taken off the key. */
  const fadeOut = useCallback((name: string, id: number) => {
    settle(name, id, 'ending');
    after(name, FADE_MS, () => settle(name, id, null));
  }, [after, settle]);

  const play = useCallback(async (name: string, group: SampleGroup, variant: number) => {
    if (!engineReady) return;
    const id = ++playIdRef.current;
    latestPressRef.current.set(name, id);
    window.clearTimeout(timersRef.current.get(name));
    setHeard({ name, variant });
    setFailed(null);
    setCopied(false);
    setPlaybacks((current) => ({ ...current, [name]: { id, phase: 'playing' } }));
    /* One try per press. The key shimmers from the press on, through the
       download and the sound alike, and a failure turns it red; pressing it
       again is the retry. */
    try {
      await previewSound(name, { variant, note: group.note });
    } catch (error) {
      /* Said out loud, not only shown: a red key tells you that a sound did
         not play, and the console is where to find out why. */
      console.warn(`[audition] could not play ${soundCode(name, variant)}`, error);
      if (latestPressRef.current.get(name) !== id) return;
      if (playIdRef.current === id) setFailed(name);
      fadeOut(name, id);
      return;
    }
    if (latestPressRef.current.get(name) !== id) return;
    after(name, SOUND_MS, () => fadeOut(name, id));
  }, [after, engineReady, fadeOut, previewSound]);

  const heardCode = heard ? soundCode(heard.name, heard.variant) : null;

  const copyHeard = () => {
    if (!heardCode) return;
    navigator.clipboard?.writeText(heardCode).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }).catch(() => { /* A refused clipboard is not worth a dialog. */ });
  };

  /* A group is a column: its name on top, its sounds stacked under it. */
  const renderGroup = (group: SampleGroup, keyPrefix = '') => (
    <section
      key={keyPrefix + group.id}
      aria-label={pick(group.title)}
      className="min-w-0"
    >
      <h3
        className="mb-2.5 flex min-w-0 items-baseline gap-2 text-[15px] font-semibold text-text-primary"
      >
        <span className="truncate">{pick(group.title)}</span>
        {group.subtitle && (
          <span className="min-w-0 truncate font-mono text-[11px] text-text-primary">
            {group.subtitle}
          </span>
        )}
      </h3>
      <ul className="flex flex-col items-start gap-1">
        {group.samples.map((sample) => {
          const keyId = `${keyPrefix}${group.id}:${sample.name}`;
          return (
            <SampleKey
              key={sample.name}
              pointed={pointedKey === keyId}
              onPoint={(pointing) => setPointedKey((current) => (
                pointing ? keyId : current === keyId ? null : current
              ))}
              sample={sample}
              info={infos?.[sample.name]}
              missing={infos !== null && !infos[sample.name]}
              heardTake={heard?.name === sample.name ? heard.variant : null}
              playback={playbacks[sample.name] ?? null}
              failed={failed === sample.name}
              disabled={!engineReady}
              boundsRef={scrollRef}
              onPressTake={(variant) => void play(sample.name, group, variant)}
            />
          );
        })}
      </ul>
    </section>
  );

  /* The groups are dealt out six to a row, and each row is a page:
     as tall as its longest column, and the scroll snaps from one to the next. */
  const renderGroups = (groups: readonly SampleGroup[], keyPrefix = '') => {
    const pages: SampleGroup[][] = [];
    for (let i = 0; i < groups.length; i += GROUPS_PER_PAGE) {
      pages.push(groups.slice(i, i + GROUPS_PER_PAGE));
    }
    return pages.map((page, index) => (
      <div
        key={`${keyPrefix}page-${index}`}
        data-testid="audition-shelf-page"
        /* Under a search result's category heading, the first page sits close
           to the heading it belongs to rather than a whole page's air below it. */
        className={`grid snap-start pb-10 ${keyPrefix && index === 0 ? 'pt-5' : 'pt-10'}`}
        style={{ gridTemplateColumns: `repeat(${GROUPS_PER_PAGE}, minmax(0, 1fr))`, columnGap: GROUP_GAP }}
      >
        {page.map((group) => renderGroup(group, keyPrefix))}
      </div>
    ));
  };

  /* The take you last heard, written the way you would write it — the bridge
     from "that one" to the line of code that plays it. */
  const heardStrip = heardCode && (
    <div className="flex min-w-0 items-center gap-2 text-[13px]">
      <span className="shrink-0 text-text-primary">{t('auditionLastHeard')}</span>
      <code className="min-w-0 truncate font-mono text-text-primary">{heardCode}</code>
      <button
        type="button"
        onClick={copyHeard}
        aria-label={copied ? t('auditionCopied') : t('auditionCopyCode')}
        title={copied ? t('auditionCopied') : t('auditionCopyCode')}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
      >
        {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
      </button>
    </div>
  );

  const shelves = (
    <>
      {!engineReady && (
        <p className="mb-4 text-[13px] text-text-muted">{t('engineStarting')}</p>
      )}
      {results ? (
        results.length === 0 ? (
          <p className="py-16 text-center text-sm text-text-muted">{t('auditionNoResults')}</p>
        ) : (
          results.map(({ category: cat, groups }) => (
            <div key={cat.id} className="mb-9 last:mb-0">
              <h2 className="mb-0 snap-start text-[17px] font-bold text-text-primary">{pick(cat.title)}</h2>
              {renderGroups(groups, `${cat.id}:`)}
            </div>
          ))
        )
      ) : (
        renderGroups(category.groups)
      )}
    </>
  );

  return (
    <main
      data-testid="audition-page"
      className="relative isolate flex h-full min-w-0 flex-1 flex-col overflow-visible"
    >
      {/* Under the whole window, nav column included, the way the galleries'
          light field is: the page is the room, not a panel set in it. */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0" style={{ background: PAGE_GROUND }} />

      {/* The heading beside the nav's top lobe, as on Favorites, with the
          open shelf's own description under it and the search across from it. */}
      <header
        className="relative z-10 flex shrink-0 items-start justify-between gap-6 pt-2"
        style={{ paddingLeft: PAGE_SIDE_INSET, paddingRight: PAGE_SIDE_INSET }}
      >
        {/* The page, the shelf it is on and how many sounds that shelf holds,
            read as one line: 试听 · 鼓组 128. A search stands in for the shelf
            while there is one, with its own count. */}
        <h1
          data-testid="audition-title"
          className="flex min-w-0 items-baseline gap-2 text-2xl font-semibold leading-10 tracking-[-0.02em] text-text-primary"
        >
          <span className="shrink-0">{t('navAudition')}</span>
          <span aria-hidden="true" className="shrink-0">·</span>
          <span className="min-w-0 truncate">{results ? t('auditionSearchResults') : pick(category.title)}</span>
          <span className="shrink-0 text-base font-normal tabular-nums tracking-normal text-text-muted">
            {results ? resultCount : countSamples(category)}
          </span>
        </h1>
        <div className="flex h-10 w-[13rem] shrink-0 items-center">
          <SearchField value={query} onChange={updateQuery} />
        </div>
      </header>

      <CategoryRail selectedId={results ? null : category.id} onSelect={selectCategory} />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col" style={{ marginBottom: HEARD_CLEARANCE }}>
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 snap-y snap-mandatory overflow-y-auto pb-10"
          style={{ paddingLeft: `calc(${PAGE_SIDE_INSET} + 2 * ${SHELF_NUDGE})` }}
        >
          <div className="mx-auto w-full" style={{ maxWidth: SHELF_WIDTH }}>
            {shelves}
          </div>
        </div>

        {/* The shelf fades into the page at both ends instead of being cut off
            by them. Laid over the scrollport rather than masking it, so the
            scrollbar keeps its full strength. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0"
          style={{ height: SHELF_FADE_TOP, background: `linear-gradient(to bottom, ${PAGE_GROUND}, transparent)` }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0"
          style={{ height: SHELF_FADE_BOTTOM, background: `linear-gradient(to top, ${PAGE_GROUND}, transparent)` }}
        />
      </div>

      {heardStrip && (
        <div
          data-testid="audition-last-heard"
          className="absolute bottom-3 right-4 z-20 rounded-[6px] py-1 pl-3 pr-1"
          style={{ background: PAGE_GROUND }}
        >
          {heardStrip}
        </div>
      )}
    </main>
  );
}

/**
 * The search line: a rule under what you type, quiet at rest and in the
 * accent while it is in use — the Favorites list's own field, in this page's
 * tokens.
 */
function SearchField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const filled = value !== '';
  return (
    <label className="flex w-full items-center gap-2 border-b border-border pb-[3px] transition-colors focus-within:border-brand-accent has-[input:not(:placeholder-shown)]:border-brand-accent">
      {filled ? (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label={t('auditionClearSearch')}
          className="shrink-0 text-text-muted transition-colors hover:text-text-primary"
        >
          <XIcon size={13} />
        </button>
      ) : (
        <SearchIcon size={13} className="shrink-0 text-text-muted" />
      )}
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Escape' || !filled) return;
          event.stopPropagation();
          onChange('');
        }}
        placeholder={t('auditionSearch')}
        aria-label={t('auditionSearch')}
        className="min-w-0 flex-1 bg-transparent text-[13px] text-text-primary caret-brand-accent outline-none placeholder:text-text-muted [&::-webkit-search-cancel-button]:hidden"
      />
    </label>
  );
}

/**
 * The shelves, down the strip between the nav's two lobes where Favorites
 * keeps its turn rail, set flush left with the nav itself. Words rather than ticks: there are seven of them and
 * each is a place you go, not a mark in something you read.
 */
function CategoryRail({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <nav
      aria-label={t('auditionCategories')}
      className="absolute top-1/2 z-40 flex -translate-y-1/2 select-none flex-col items-start gap-1"
      style={{ left: `calc(${NAV_LEFT_EDGE} + ${RAIL_INDENT})` }}
    >
      {SAMPLE_CATALOG.map((cat: SampleCategory) => {
        const selected = cat.id === selectedId;
        return (
          <button
            key={cat.id}
            type="button"
            onClick={() => onSelect(cat.id)}
            aria-current={selected ? 'true' : undefined}
            className={`whitespace-nowrap py-1.5 pr-1 text-left text-[12px] leading-4 transition-colors ${
              selected
                ? 'font-semibold text-text-primary'
                : 'text-text-muted hover:text-text-primary'
            }`}
          >
            {pick(cat.title)}
          </button>
        );
      })}
    </nav>
  );
}

function SampleKey({
  pointed,
  onPoint,
  sample,
  info,
  missing,
  heardTake,
  playback,
  failed,
  disabled,
  boundsRef,
  onPressTake,
}: {
  /** This is the one key the pointer (or focus) is on. */
  pointed: boolean;
  onPoint: (pointing: boolean) => void;
  sample: SampleEntry;
  info: SoundInfo | undefined;
  /** The engine has loaded and holds no such sound. */
  missing: boolean;
  /** The take of this sound last pressed, while it is the last one heard. */
  heardTake: number | null;
  /** This sound's press in flight, if it has one. */
  playback: Playback | null;
  failed: boolean;
  disabled: boolean;
  /** The shelf's scrollport — the box the take menu has to stay inside. */
  boundsRef: RefObject<HTMLDivElement | null>;
  onPressTake: (variant: number) => void;
}) {
  const itemRef = useRef<HTMLLIElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inert = disabled || missing;
  const takes = info?.kind === 'sample' ? info.variants : 1;
  const label = sample.label ? pick(sample.label) : null;
  const badge = takes > 1 ? `×${takes}` : null;
  /* Lit under the pointer (or keyboard focus), and that is also what opens
     the menu: the takes are right there to run down, with nothing to click
     open first. */
  const lit = pointed && !inert;
  const open = lit && takes > 1;
  /* Pressing the key itself runs down its takes in order, from the first
     the first time; a take that failed to play is tried again rather than
     skipped. */
  const nextTake = heardTake === null ? 0 : failed ? heardTake : (heardTake + 1) % takes;

  /*
   * The aim triangle. A lit key can run wide, and its menu hangs off the far
   * end of it, so the way from the name to the takes is a diagonal that
   * leaves the key's own box long before it reaches the menu — and leaving
   * the box ends the hover. So while the menu is open, an invisible triangle
   * runs from the pointer to the menu's two near corners: part of the key as
   * far as the pointer is concerned, and below the key itself so it never
   * catches a press meant for it. Redrawn on every move over the key, straight
   * on the DOM, so following the pointer costs no renders.
   */
  const aimRef = useRef<HTMLDivElement>(null);
  const aimRestRef = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(aimRestRef.current), []);

  const aimFrom = (clientX: number, clientY: number) => {
    const aim = aimRef.current;
    const menu = menuRef.current?.getBoundingClientRect();
    const item = itemRef.current?.getBoundingClientRect();
    if (!aim || !menu || !item) return;
    const px = clientX - item.left;
    const py = clientY - item.top;
    const nx = (menu.left >= clientX ? menu.left : menu.right) - item.left;
    const top = menu.top - item.top;
    const bottom = menu.bottom - item.top;
    const left = Math.min(px, nx);
    const boxTop = Math.min(py, top);
    aim.style.display = '';
    aim.style.left = `${left}px`;
    aim.style.top = `${boxTop}px`;
    aim.style.width = `${Math.max(px, nx) - left}px`;
    aim.style.height = `${Math.max(py, bottom) - boxTop}px`;
    aim.style.clipPath = `polygon(${px - left}px ${py - boxTop}px, ${nx - left}px ${top - boxTop}px, ${nx - left}px ${bottom - boxTop}px)`;
  };

  /* Resting in the triangle means the pointer is not on its way to the menu
     after all: stand the triangle down so the key under it can be pointed at. */
  const restInAim = () => {
    window.clearTimeout(aimRestRef.current);
    aimRestRef.current = window.setTimeout(() => {
      if (aimRef.current) aimRef.current.style.display = 'none';
    }, AIM_REST_MS);
  };

  /* The menu opens to the right and hangs from the key's top edge, unless
     that would run it past the shelf — then it opens to the left, or stands
     on the key's bottom edge. Placed before paint, so it never flashes on
     the wrong side first.

     It is first laid out up and to the left of the key (see its style below),
     the one way that never adds to the shelf's scrollable area. Measured
     hanging down instead, a long menu low on the last page would lengthen
     the shelf for that one layout, the snapping scroll would jump to the page
     top it can now reach, and then jump back once the menu is turned around
     — taking the key out from under the pointer, over and over. */
  useLayoutEffect(() => {
    const menu = menuRef.current;
    const item = itemRef.current?.getBoundingClientRect();
    const bounds = boundsRef.current?.getBoundingClientRect();
    if (!open || !menu || !item || !bounds) return;
    const toLeft = item.right + menu.offsetWidth > bounds.right - MENU_EDGE
      && item.left - menu.offsetWidth >= bounds.left;
    /* Where neither way fits, it stands on the key rather than hanging below
       it, for the same reason: running past the top is cut off, running past
       the bottom would set the shelf jumping again. */
    const fromBottom = item.top + menu.offsetHeight > bounds.bottom - MENU_EDGE;
    menu.style.left = toLeft ? '' : '100%';
    menu.style.right = toLeft ? '100%' : '';
    menu.style.top = fromBottom ? '' : '0';
    menu.style.bottom = fromBottom ? '0' : '';
  }, [boundsRef, open]);

  return (
    /* Pulled left by its own padding, so the name starts on the group
       heading's edge and the lit rectangle reaches a little past it. */
    <li
      ref={itemRef}
      onPointerEnter={() => onPoint(true)}
      onPointerLeave={() => onPoint(false)}
      onFocus={() => onPoint(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) onPoint(false);
      }}
      className={`relative -ml-1.5 ${lit ? 'z-30' : 'max-w-[calc(100%+0.375rem)]'}`}
      style={{ filter: lit ? RAISED : undefined }}
    >
      <button
        type="button"
        onClick={() => onPressTake(nextTake)}
        onPointerMove={open ? (event) => aimFrom(event.clientX, event.clientY) : undefined}
        disabled={inert}
        aria-haspopup={takes > 1 ? 'menu' : undefined}
        aria-expanded={takes > 1 ? open : undefined}
        /* No native tooltip: the lit key already shows its gloss, and a
           browser bubble over the take menu only gets in the way. Why a key
           cannot play is still said to assistive tech. */
        aria-description={missing ? t('auditionUnavailable') : failed ? t('auditionPlayFailed') : undefined}
        data-sample={sample.name}
        className={`relative z-10 flex h-7 items-center gap-1.5 overflow-hidden whitespace-nowrap px-1.5 text-left ${lit ? '' : 'max-w-full'} disabled:cursor-not-allowed disabled:opacity-40 ${
          failed ? 'bg-error text-white' : lit ? 'bg-brand-accent text-white' : 'text-text-primary'
        }`}
      >
        {/* At rest a key is its name and nothing else; the gloss only comes
            in under the pointer, where the key is raised over its neighbours
            and free to run as wide as name and gloss together need. */}
        <span className={`font-mono text-[13px] ${lit ? '' : 'min-w-0 truncate'}`}>{sample.name}</span>
        {label && lit && <span className="shrink-0 whitespace-nowrap text-[12px] text-white/75">{label}</span>}
        {/* At rest the key says how many takes it has; under the pointer, with
            all of them laid out in the menu beside it, it says which one you
            are hearing instead — or the first, 0, before any has been played —
            numbered the way the menu and the code number it. */}
        {badge && !lit && <span className="shrink-0 text-[11px] tabular-nums">{badge}</span>}
        {lit && takes > 1 && (
          <span
            data-testid="audition-take-number"
            className="shrink-0 font-mono text-[12px] font-semibold tabular-nums text-white"
          >
            {String(heardTake ?? 0).padStart(2, '0')}
          </span>
        )}
        {/* From the press on, a diagonal sheen sweeps across the key from left
            to right at one steady pace — the download and the sound alike —
            and when the key is done it spreads out to both sides and fades
            rather than stopping. White on a lit key, the accent at rest. */}
        {playback && (
          <span
            aria-hidden="true"
            data-testid="audition-listening"
            data-phase={playback.phase}
            data-surface={lit || failed ? 'filled' : 'rest'}
            className="audition-shimmer pointer-events-none absolute inset-0"
            style={{
              '--audition-shimmer': lit || failed
                ? 'rgba(255, 255, 255, 0.5)'
                : 'color-mix(in srgb, var(--color-brand-accent) 55%, transparent)',
            } as CSSProperties}
          />
        )}
      </button>

      {/* The lit key holds the pointer a little past its own rectangle, so a
          hand that drifts a few pixels off the edge does not drop it. Below
          the key, so it catches nothing the key itself would. */}
      {lit && (
        <div
          aria-hidden="true"
          data-testid="audition-key-halo"
          className="absolute z-0"
          style={{ inset: `-${HOVER_HALO}px` }}
        />
      )}

      {open && (
        <div
          ref={aimRef}
          aria-hidden="true"
          data-testid="audition-aim"
          onPointerMove={restInAim}
          className="absolute z-0"
          style={{ display: 'none' }}
        />
      )}

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={sample.name}
          /* Never scrolls: a long run of takes folds into further columns
             instead. No padding either, so a lit take's fill meets the
             menu's own edges. */
          /* The same reach past its edges as the key: the halo is drawn behind
             the takes (a negative layer inside the menu's own stacking
             context), so it only answers where no take is. */
          className="absolute z-10 grid grid-flow-col bg-brand-accent before:absolute before:-inset-2 before:-z-10 before:content-['']"
          style={{
            right: '100%',
            bottom: 0,
            gridTemplateRows: `repeat(${Math.min(takes, MENU_ROWS)}, auto)`,
          }}
        >
          {Array.from({ length: takes }, (_, variant) => (
            <button
              key={variant}
              type="button"
              role="menuitem"
              data-sample-take={`${sample.name}:${variant}`}
              onClick={() => onPressTake(variant)}
              className={`flex h-7 items-center whitespace-nowrap px-3 text-left font-mono text-[13px] text-white transition-colors ${
                heardTake === variant ? 'bg-white/25' : 'hover:bg-white/15'
              }`}
            >
              {sample.name}:{variant}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}
