import { useEffect, useRef, useState, type ReactNode } from 'react';
import { zh, t } from '../lib/i18n';
import { ChevronLeftIcon, ChevronRightIcon } from '../components/icons';
import type { Chapter, Section } from './content';

interface ChapterLayoutProps {
  section: Section;
  chapter: Chapter;
  prev: { section: Section; chapter: Chapter } | null;
  next: { section: Section; chapter: Chapter } | null;
  onNavigate: (sectionId: string, chapterId: string) => void;
  children: ReactNode;
}

interface TocEntry {
  id: string;
  text: string;
  depth: 2 | 3;
}

function slugify(text: string, index: number) {
  const base = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return `${base || 'section'}-${index}`;
}

export default function ChapterLayout({ section, chapter, prev, next, onNavigate, children }: ChapterLayoutProps) {
  const originalUrl = `https://strudel.cc/${chapter.originalPath}/`;
  const contentRef = useRef<HTMLDivElement>(null);
  const [toc, setToc] = useState<TocEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Build the in-page table of contents from the chapter's own <h2>/<h3> headings —
  // content is plain JSX per chapter, not markdown, so headings only get IDs
  // by scanning the rendered DOM after mount, not from any static source.
  useEffect(() => {
    const container = contentRef.current;
    if (!container) return;
    const headings = Array.from(container.querySelectorAll<HTMLHeadingElement>('h2, h3'));
    const entries = headings.map((el, i) => {
      const id = slugify(el.textContent ?? '', i);
      el.id = id;
      return { id, text: el.textContent ?? '', depth: el.tagName === 'H3' ? 3 : 2 } satisfies TocEntry;
    });
    setToc(entries);
    setActiveId(entries[0]?.id ?? null);
    if (entries.length === 0) return;

    // Scroll-spy: on every scroll of the <main> container, the active entry
    // is the last heading whose top has crossed above a fixed offset line.
    // (IntersectionObserver's isIntersecting goes false for every heading in
    // the gap between "scrolled past the last one" and "reached the next
    // one", which left the TOC stuck on a stale entry — this reads current
    // position directly instead.)
    const scrollParent = container.closest('main') ?? window;
    const OFFSET = 96;
    const updateActive = () => {
      let current = headings[0];
      for (const el of headings) {
        if (el.getBoundingClientRect().top <= OFFSET) {
          current = el;
        } else {
          break;
        }
      }
      setActiveId(current.id);
    };
    updateActive();
    scrollParent.addEventListener('scroll', updateActive, { passive: true });
    return () => scrollParent.removeEventListener('scroll', updateActive);
  }, [chapter.id, section.id]);

  function scrollToHeading(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="flex gap-8 max-w-[980px] mx-auto px-6 py-10">
      <article className="max-w-[720px] min-w-0 flex-1" style={{ fontFamily: "'ABeeZee', monospace" }}>
        <div className="text-[12px] text-[var(--learn-text-muted)] mb-2">{zh ? section.titleZh : section.titleEn}</div>
        <h1 className="text-[24px] text-[var(--learn-text-primary)] font-bold mb-4">{zh ? chapter.titleZh : chapter.titleEn}</h1>

        <div className="mb-8 pb-4 border-b border-[var(--learn-border)] text-[12px] text-[var(--learn-text-muted)]">
          {t('translatedOn')} {chapter.translatedDate} ·{' '}
          <a
            href={originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-[var(--learn-text-secondary)]"
          >
            {t('viewOriginal')}
          </a>
          <span className="ml-1">(strudel.cc, AGPL-3.0)</span>
        </div>

        {zh ? (
          <div ref={contentRef} className="learn-prose">
            {children}
          </div>
        ) : (
          <div className="text-[14px] leading-[1.8] text-[var(--learn-text-secondary)]">
            <p className="mb-4">{t('notTranslatedNotice')}</p>
            <a
              href={originalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-3 py-1.5 border border-[var(--learn-border)] text-[var(--learn-text-secondary)] hover:text-[var(--learn-text-primary)] hover:border-[var(--learn-border-strong)] transition-colors"
            >
              {t('openOriginalPage')}
            </a>
          </div>
        )}

        <div className="mt-8 flex items-center justify-between gap-3">
          {prev ? (
            <button
              onClick={() => onNavigate(prev.section.id, prev.chapter.id)}
              className="flex items-center gap-1 text-[13px] text-[var(--learn-text-secondary)] hover:text-[var(--learn-text-primary)] transition-colors"
            >
              <ChevronLeftIcon size={14} />
              <span>{t('prevChapter')}：{zh ? prev.chapter.titleZh : prev.chapter.titleEn}</span>
            </button>
          ) : <span />}
          {next ? (
            <button
              onClick={() => onNavigate(next.section.id, next.chapter.id)}
              className="flex items-center gap-1 text-[13px] text-[var(--learn-text-secondary)] hover:text-[var(--learn-text-primary)] transition-colors ml-auto"
            >
              <span>{t('nextChapter')}：{zh ? next.chapter.titleZh : next.chapter.titleEn}</span>
              <ChevronRightIcon size={14} />
            </button>
          ) : <span />}
        </div>
      </article>

      {toc.length > 0 && (
        <nav className="hidden lg:block w-[180px] shrink-0 sticky top-10 self-start">
          <div className="text-[11px] uppercase tracking-wide text-[var(--learn-text-muted)] mb-2">{t('tableOfContents')}</div>
          <ul className="space-y-1.5 border-l border-[var(--learn-border)]">
            {toc.map((entry) => (
              <li key={entry.id}>
                <button
                  onClick={() => scrollToHeading(entry.id)}
                  className={`text-left text-[12.5px] leading-snug ${entry.depth === 3 ? 'pl-7' : 'pl-3'} -ml-px border-l w-full transition-colors ${activeId === entry.id
                    ? 'border-[var(--learn-accent)] text-[var(--learn-text-primary)]'
                    : 'border-transparent text-[var(--learn-text-muted)] hover:text-[var(--learn-text-secondary)]'
                  }`}
                >
                  {entry.text}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </div>
  );
}
