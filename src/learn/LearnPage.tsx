import { Suspense, useEffect, useState } from 'react';
import { SECTIONS, findChapter, firstChapter, flatChapters } from './content';
import ChapterLayout from './ChapterLayout';
import { t, zh } from '../lib/i18n';
import { useIsMobile } from '../hooks/useIsMobile';
import { MenuIcon, XIcon } from '../components/icons';

export const LEARN_PATH_PREFIX = '/learn';

function parsePath(pathname: string) {
  const parts = pathname.replace(LEARN_PATH_PREFIX, '').split('/').filter(Boolean);
  if (parts.length === 2) {
    const found = findChapter(parts[0], parts[1]);
    if (found) return found;
  }
  return firstChapter();
}

function pathFor(sectionId: string, chapterId: string) {
  return `${LEARN_PATH_PREFIX}/${sectionId}/${chapterId}`;
}

export default function LearnPage() {
  const [current, setCurrent] = useState(() => parsePath(window.location.pathname));
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    const handler = () => setCurrent(parsePath(window.location.pathname));
    window.addEventListener('popstate', handler);
    return () => window.removeEventListener('popstate', handler);
  }, []);

  function navigate(sectionId: string, chapterId: string) {
    const found = findChapter(sectionId, chapterId);
    if (!found) return;
    window.history.pushState(null, '', pathFor(sectionId, chapterId));
    setCurrent(found);
    setSidebarOpen(false);
    window.scrollTo({ top: 0 });
  }

  const flat = flatChapters();
  const index = flat.findIndex((c) => c.section.id === current.section.id && c.chapter.id === current.chapter.id);
  const prev = index > 0 ? flat[index - 1] : null;
  const next = index >= 0 && index < flat.length - 1 ? flat[index + 1] : null;

  const { section, chapter } = current;
  const Body = chapter.Component;

  return (
    <div className="h-dvh bg-black text-white flex flex-col">
      <header className="h-12 border-b border-[#232323] flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-3">
          {isMobile && (
            <button onClick={() => setSidebarOpen((v) => !v)} aria-label={t('tableOfContents')}>
              {sidebarOpen ? <XIcon size={18} /> : <MenuIcon size={18} />}
            </button>
          )}
          <a href="/" className="text-[16px] leading-none" aria-label="oddeNova">
            <span style={{ fontFamily: "'Baskervville', serif", fontStyle: 'italic' }}>odde</span>
            <span style={{ fontFamily: "'42dot Sans', sans-serif", fontWeight: 800 }}>Nova</span>
          </a>
          <span className="w-px h-4 bg-[#323232]" />
          <span className="text-[14px] font-bold">{t('learnPageTitle')}</span>
        </div>
        <a href="/" className="text-[13px] text-white/60 hover:text-white transition-colors">
          {t('backToApp')}
        </a>
      </header>

      <div className="flex flex-1 min-h-0">
        <nav
          className={`${isMobile ? (sidebarOpen ? 'block absolute z-20 bg-black inset-x-0 top-12 bottom-0 overflow-y-auto' : 'hidden') : 'block w-[220px] shrink-0 border-r border-[#232323] overflow-y-auto'} py-4 px-4`}
        >
          {SECTIONS.map((s) => (
            <div key={s.id} className="mb-5">
              <div className="text-[11px] uppercase tracking-wide text-white/35 mb-2">
                {zh ? s.titleZh : s.titleEn}
              </div>
              <ul className="space-y-1">
                {s.chapters.map((c) => {
                  const active = c.id === chapter.id && s.id === section.id;
                  return (
                    <li key={c.id}>
                      <button
                        onClick={() => navigate(s.id, c.id)}
                        className={`text-left text-[13px] w-full px-2 py-1 rounded-sm transition-colors ${
                          active ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white hover:bg-white/5'
                        }`}
                      >
                        {zh ? c.titleZh : c.titleEn}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <main className="flex-1 overflow-y-auto">
          <Suspense fallback={<div className="p-10 text-white/40 text-[13px]">{t('loading')}</div>}>
            <ChapterLayout section={section} chapter={chapter} prev={prev} next={next} onNavigate={navigate}>
              <Body />
            </ChapterLayout>
          </Suspense>
        </main>
      </div>
    </div>
  );
}
