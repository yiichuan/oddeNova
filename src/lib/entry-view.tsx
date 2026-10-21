// The entry's own loading and failure views. Deliberately dependency-free —
// no App, LearnPage, audio or views imported here — so the bootstrap screen
// does not drag the app it was hired to stand in for back into first paint.
import { createRoot } from 'react-dom/client';
import type { ReactNode } from 'react';

/** The React root the entry renders into, clearing the pre-module boot markup index.html painted inside #root. */
export function mountEntryRoot(): { render: (node: ReactNode) => void } {
  const element = document.getElementById('root');
  if (!element) throw new Error('Entry: #root not found');
  element.textContent = '';
  const root = createRoot(element);
  return { render: (node) => root.render(node) };
}

/**
 * Duplicated minimal locale read for the two strings here; importing lib/i18n
 * would pull the app's module graph back into the entry's static closure.
 */
const isZhLocale = (): boolean => {
  try {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('vibe_lang');
      if (stored === 'en') return false;
      if (stored === 'zh') return true;
    }
  } catch {
    /* storage can fail; fall through to navigator */
  }
  const languages = typeof navigator !== 'undefined'
    ? navigator.languages || [navigator.language]
    : [];
  return Boolean(languages[0]?.toLowerCase().startsWith('zh'));
};

/** Spinner on the page's own ground, so the handoff to App has no flash. */
export function entryLoadingView(): ReactNode {
  return (
    <div
      data-entry-loading
      className="grid min-h-dvh place-items-center bg-[var(--color-bg-primary,#0D0D0D)]"
    >
      <span
        aria-hidden="true"
        className="size-9 animate-spin rounded-full border-2 border-[var(--color-border,#262626)] border-t-[var(--color-border-accent,#88b4ab)]"
      />
    </div>
  );
}

/** Non-fatal failure view; a manual reload is the only exit it offers. */
export function entryErrorView(_error: unknown): ReactNode {
  return (
    <div
      data-entry-error
      className="grid min-h-dvh place-items-center bg-[var(--color-bg-primary,#0D0D0D)] text-center"
    >
      <div>
        <p className="text-sm text-[var(--color-text-primary,#E5E5E5)]">
          {isZhLocale()
            ? 'oddeNova 未能启动，请重新加载页面。'
            : 'oddeNova failed to start. Please reload the page.'}
        </p>
        <button
          data-entry-reload
          onClick={() => { window.location.reload(); }}
          className="mt-4 rounded-lg bg-[#4d6a63] px-4 py-2 text-sm text-white transition-colors hover:bg-[#5d7d75]"
        >
          {isZhLocale() ? '重新加载' : 'Reload'}
        </button>
      </div>
    </div>
  );
}
