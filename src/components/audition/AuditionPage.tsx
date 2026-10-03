import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useIsMobile } from '../../hooks/useIsMobile';
import { CheckIcon, CopyIcon, EllipsisIcon, SearchIcon, XIcon } from '../icons';

const pick = ([zhText, enText]: Bilingual) => (zh ? zhText : enText);

/* How long a pressed name stays lit. Superdough does not say when a sound has
   finished, and a light that waits for the end of a three-second break would
   be lit long after the ear has moved on — this is "that was the one you
   pressed", not a playhead. */
const LIT_MS = 900;

/* The phone's top bar, cut to the other mobile pages': a 36px key holding a
   20px glyph, and the page's name centred between the edges. */
const SAFE_TOP = 'max(12px, env(safe-area-inset-top))';
const SAFE_BOTTOM = 'max(12px, env(safe-area-inset-bottom))';
const BAR_KEY = 'flex h-9 w-9 items-center justify-center text-text-secondary'
  + ' transition-colors hover:text-text-primary';

const TOTAL_SOUNDS = SAMPLE_CATALOG.reduce((sum, category) => sum + countSamples(category), 0);

/** One sound in the code it would be written as — what the copy key copies. */
function soundCode(name: string, info: SoundInfo | undefined, variant: number): string {
  return info?.kind === 'sample' && info.variants > 1 && variant > 0
    ? `s("${name}:${variant}")`
    : `s("${name}")`;
}

interface Heard {
  name: string;
  variant: number;
}

interface AuditionPageProps {
  /** Hidden rather than unmounted when you leave, so it is told when it is up. */
  active: boolean;
  engineReady: boolean;
  previewSound: (name: string, options?: { variant?: number; note?: string }) => Promise<void>;
  describeSounds: (names: readonly string[]) => Promise<Record<string, SoundInfo>>;
  /** Mobile only: the key in the page's own top bar that opens the shell's drawer. */
  onOpenNav?: () => void;
}

/**
 * 试听 — every sound the studio can play, shelved by what it sounds like
 * (see sample-catalog.ts), each one a key: press it to hear it.
 */
export default function AuditionPage({
  active,
  engineReady,
  previewSound,
  describeSounds,
  onOpenNav,
}: AuditionPageProps) {
  const isMobile = useIsMobile();
  const [categoryId, setCategoryId] = useState(SAMPLE_CATALOG[0].id);
  const [query, setQuery] = useState('');
  const [infos, setInfos] = useState<Record<string, SoundInfo> | null>(null);
  /* Which take each name last played, so coming back to a name plays the one
     you left it on, and pressing it again moves to the next. */
  const [takes, setTakes] = useState<Record<string, number>>({});
  const [heard, setHeard] = useState<Heard | null>(null);
  const [lit, setLit] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const litTimer = useRef<number | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);

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
    }).catch(() => { /* Unknown counts just mean no take badges. */ });
    return () => { cancelled = true; };
  }, [active, describeSounds, engineReady, infos]);

  useEffect(() => () => window.clearTimeout(litTimer.current), []);

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

  const selectCategory = (id: string) => {
    setCategoryId(id);
    setQuery('');
    scrollRef.current?.scrollTo({ top: 0 });
  };

  const press = useCallback(async (name: string, group: SampleGroup) => {
    if (!engineReady) return;
    const info = infos?.[name];
    const takeCount = info?.kind === 'sample' ? info.variants : 1;
    const previous = takes[name];
    /* The same name pressed again steps on to its next take; arriving from
       another name replays the take this one was left on. */
    const variant = previous === undefined
      ? 0
      : heard?.name === name ? (previous + 1) % takeCount : previous;

    setTakes((current) => ({ ...current, [name]: variant }));
    setHeard({ name, variant });
    setFailed(null);
    setCopied(false);
    setLoading(name);
    try {
      await previewSound(name, { variant, note: group.note });
      window.clearTimeout(litTimer.current);
      setLit(name);
      litTimer.current = window.setTimeout(() => setLit(null), LIT_MS);
    } catch {
      setFailed(name);
    } finally {
      setLoading((current) => (current === name ? null : current));
    }
  }, [engineReady, heard, infos, previewSound, takes]);

  const heardCode = heard ? soundCode(heard.name, infos?.[heard.name], heard.variant) : null;

  const copyHeard = () => {
    if (!heardCode) return;
    navigator.clipboard?.writeText(heardCode).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }).catch(() => { /* A refused clipboard is not worth a dialog. */ });
  };

  const renderGroup = (group: SampleGroup, keyPrefix = '') => (
    <section key={keyPrefix + group.id} aria-label={pick(group.title)} className="mb-7 last:mb-0">
      <h3 className="mb-2.5 flex items-baseline gap-2 text-[13px] font-medium text-text-secondary">
        <span>{pick(group.title)}</span>
        {group.subtitle && <span className="font-mono text-[11px] text-text-muted">{group.subtitle}</span>}
        <span className="text-[11px] tabular-nums text-text-muted">{group.samples.length}</span>
      </h3>
      <ul className="flex flex-wrap gap-1.5">
        {group.samples.map((sample) => (
          <li key={sample.name}>
            <SampleKey
              sample={sample}
              info={infos?.[sample.name]}
              missing={infos !== null && !infos[sample.name]}
              take={heard?.name === sample.name ? heard.variant : takes[sample.name]}
              lit={lit === sample.name}
              loading={loading === sample.name}
              failed={failed === sample.name}
              disabled={!engineReady}
              onPress={() => void press(sample.name, group)}
            />
          </li>
        ))}
      </ul>
    </section>
  );

  const searchField = (
    <label className="relative flex min-w-0 items-center">
      <SearchIcon size={15} className="pointer-events-none absolute left-2.5 text-text-muted" />
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
        onKeyDown={(event) => { if (event.key === 'Escape') setQuery(''); }}
        placeholder={t('auditionSearch')}
        aria-label={t('auditionSearch')}
        className="h-9 w-full rounded-[6px] border border-border bg-transparent pl-8 pr-8 text-base text-text-primary placeholder:text-text-muted outline-none transition-colors focus:border-border-focus md:text-sm [&::-webkit-search-cancel-button]:hidden"
      />
      {query && (
        <button
          type="button"
          onClick={() => setQuery('')}
          aria-label={t('auditionClearSearch')}
          className="absolute right-1.5 flex h-6 w-6 items-center justify-center rounded text-text-muted hover:text-text-primary"
        >
          <XIcon size={14} />
        </button>
      )}
    </label>
  );

  /* The take you last heard, written the way you would write it — the bridge
     from "that one" to the line of code that plays it. */
  const heardStrip = heardCode && (
    <div className="flex min-w-0 items-center gap-2 text-[13px]">
      <span className="shrink-0 text-text-muted">{t('auditionLastHeard')}</span>
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

  const body = (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-4 md:px-8 md:pt-6">
      {!engineReady && (
        <p className="mb-4 text-[13px] text-text-muted">{t('engineStarting')}</p>
      )}
      {results ? (
        results.length === 0 ? (
          <p className="py-16 text-center text-sm text-text-muted">{t('auditionNoResults')}</p>
        ) : (
          results.map(({ category: cat, groups }) => (
            <div key={cat.id} className="mb-9 last:mb-0">
              <h2 className="mb-4 text-[15px] font-semibold text-text-primary">{pick(cat.title)}</h2>
              {groups.map((group) => renderGroup(group, `${cat.id}:`))}
            </div>
          ))
        )
      ) : (
        <>
          <p className="mb-6 max-w-[640px] text-[13px] leading-5 text-text-muted">{pick(category.blurb)}</p>
          {category.groups.map((group) => renderGroup(group))}
        </>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <main data-testid="audition-page-mobile" className="relative flex h-full w-full min-w-0 flex-col overflow-hidden bg-conversation-surface">
        <div className="relative flex shrink-0 items-center px-2" style={{ paddingTop: SAFE_TOP, paddingBottom: '8px' }}>
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
          <h1 className="absolute left-1/2 -translate-x-1/2 text-[17px] font-semibold tracking-[-0.01em] text-text-primary">
            {t('navAudition')}
          </h1>
        </div>
        <div className="shrink-0 px-4 pb-2">{searchField}</div>
        {!results && (
          <CategoryTabs
            selectedId={category.id}
            onSelect={selectCategory}
            className="flex shrink-0 gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]"
            pill
          />
        )}
        {body}
        {heardStrip && (
          <div className="shrink-0 border-t border-border px-4 pt-2" style={{ paddingBottom: SAFE_BOTTOM }}>
            {heardStrip}
          </div>
        )}
      </main>
    );
  }

  return (
    <main
      data-testid="audition-page"
      className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden rounded-region border border-border bg-conversation-surface"
    >
      <header className="flex shrink-0 flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b border-border px-8 pb-5 pt-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold leading-10 tracking-[-0.02em] text-text-primary">{t('navAudition')}</h1>
          <p className="text-[13px] text-text-muted">
            {t('auditionHint')}
            <span className="mx-1.5 text-border-hover">·</span>
            <span className="tabular-nums">
              {results
                ? t('auditionMatches').replace('{n}', String(resultCount))
                : t('auditionTotal').replace('{n}', TOTAL_SOUNDS.toLocaleString())}
            </span>
          </p>
        </div>
        <div className="w-[280px] max-w-full">{searchField}</div>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav aria-label={t('auditionCategories')} className="w-[188px] shrink-0 overflow-y-auto border-r border-border px-3 py-4">
          <CategoryTabs
            selectedId={results ? null : category.id}
            onSelect={selectCategory}
            className="flex flex-col gap-0.5"
          />
        </nav>
        <div className="flex min-w-0 flex-1 flex-col">
          {body}
          {heardStrip && (
            <div className="shrink-0 border-t border-border px-8 py-2.5">{heardStrip}</div>
          )}
        </div>
      </div>
    </main>
  );
}

function CategoryTabs({
  selectedId,
  onSelect,
  className,
  pill = false,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
  className: string;
  /** The phone's row of pills, rather than the desktop's column of rows. */
  pill?: boolean;
}) {
  return (
    <div className={className}>
      {SAMPLE_CATALOG.map((cat: SampleCategory) => {
        const selected = cat.id === selectedId;
        return (
          <button
            key={cat.id}
            type="button"
            onClick={() => onSelect(cat.id)}
            aria-current={selected ? 'true' : undefined}
            className={pill
              ? `shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-[13px] transition-colors ${
                selected
                  ? 'border-transparent bg-surface-selected text-text-primary'
                  : 'border-border text-text-secondary active:bg-surface-hover'
              }`
              : `flex w-full items-center justify-between rounded-[6px] px-3 py-2 text-left text-sm transition-colors ${
                selected
                  ? 'bg-surface-selected text-text-primary'
                  : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
              }`}
          >
            <span className="truncate">{pick(cat.title)}</span>
            {!pill && <span className="ml-2 text-[11px] tabular-nums text-text-muted">{countSamples(cat)}</span>}
          </button>
        );
      })}
    </div>
  );
}

function SampleKey({
  sample,
  info,
  missing,
  take,
  lit,
  loading,
  failed,
  disabled,
  onPress,
}: {
  sample: SampleEntry;
  info: SoundInfo | undefined;
  /** The engine has loaded and holds no such sound. */
  missing: boolean;
  /** The take this name was last played on, if it has been played. */
  take: number | undefined;
  lit: boolean;
  loading: boolean;
  failed: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const takes = info?.kind === 'sample' ? info.variants : 1;
  const label = sample.label ? pick(sample.label) : null;
  /* Before a name is played its badge says how many takes it has; after, which
     one you are on — the count is still there, as the denominator. */
  const badge = takes > 1 ? (take === undefined ? `×${takes}` : `${take + 1}/${takes}`) : null;

  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled || missing}
      title={missing ? t('auditionUnavailable') : failed ? t('auditionPlayFailed') : undefined}
      data-sample={sample.name}
      className={`group flex h-8 items-center gap-1.5 rounded-[6px] border px-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        lit
          ? 'border-playback-accent bg-surface-hover'
          : failed
            ? 'border-error/60'
            : 'border-border hover:border-border-hover hover:bg-surface-hover active:bg-surface-selected'
      }`}
    >
      <span className={`audition-meter ${lit ? 'is-lit' : ''} ${loading ? 'is-loading' : ''}`} aria-hidden="true">
        <span /><span /><span />
      </span>
      <span className="font-mono text-[13px] text-text-primary">{sample.name}</span>
      {label && <span className="text-[12px] text-text-muted">{label}</span>}
      {badge && <span className="text-[11px] tabular-nums text-text-muted">{badge}</span>}
    </button>
  );
}
