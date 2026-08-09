import { useEffect, useRef, useState } from 'react';
import { CheckIcon, ChevronDownIcon } from './icons';
import { t } from '../lib/i18n';
import {
  getSelectedModel,
  getSelectedThinkingLevel,
  normalizeProvider,
  setSelectedThinkingLevel,
  type ThinkingLevel,
} from '../services/llm-config';
import { clampThinkingLevel, getSupportedThinkingLevels } from '../services/thinking-params';

const LABEL_KEYS: Record<ThinkingLevel, string> = {
  low: 'thinkingLevelLow',
  medium: 'thinkingLevelMedium',
  high: 'thinkingLevelHigh',
  extreme: 'thinkingLevelExtreme',
};

interface ThinkingLevelControlProps {
  disabled?: boolean;
}

// Text-label trigger + popover next to the send button (see CONTEXT.md:
// Thinking level) — shows the current level directly (e.g. "中") rather
// than behind an icon, so it's readable at a glance. Reads/writes the
// global localStorage preference directly — no prop threading through
// ChatInput/App, matching how provider/model are resolved directly from
// llm-config.ts wherever they're needed. Renders nothing at all when the
// active model has no effort dial (getSupportedThinkingLevels returns []).
export default function ThinkingLevelControl({ disabled = false }: ThinkingLevelControlProps) {
  const [level, setLevel] = useState<ThinkingLevel>(() => getSelectedThinkingLevel());
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  // Re-read the active provider/model on every render (cheap localStorage lookups,
  // no context/event plumbing) so switching provider in ApiKeyModal is reflected
  // here without prop threading — see the file-level comment above.
  const provider = normalizeProvider(localStorage.getItem('vibe_provider'));
  const model = getSelectedModel(provider);
  const supportedLevels = getSupportedThinkingLevels(provider, model);
  if (supportedLevels.length === 0) return null;

  const effectiveLevel = clampThinkingLevel(level, supportedLevels);

  const select = (next: ThinkingLevel) => {
    setSelectedThinkingLevel(next);
    setLevel(next);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-7 items-center gap-1 rounded-full px-2 text-[12px] text-[#888888] transition duration-200 hover:text-[#e0e0e0] disabled:cursor-not-allowed disabled:opacity-30"
        title={t('thinkingLevel')}
        aria-label={t('thinkingLevel')}
      >
        <span>{t(LABEL_KEYS[effectiveLevel])}</span>
        <ChevronDownIcon size={12} className={`transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label={t('thinkingLevel')}
          className="absolute bottom-full right-0 mb-2 w-24 overflow-hidden rounded-[10px] border border-[#2a2a2a] bg-[#181818] py-1 shadow-lg"
        >
          <div className="px-3 pb-1 pt-1.5 text-[13px] font-medium leading-4 text-[#666666]">
            {t('thinkingLevel')}
          </div>
          {supportedLevels.map((lvl) => (
            <button
              key={lvl}
              type="button"
              role="menuitemradio"
              aria-checked={lvl === effectiveLevel}
              onClick={() => select(lvl)}
              className={`flex w-full items-center justify-between px-3 py-1.5 text-[13px] transition-colors ${
                lvl === effectiveLevel ? 'text-white' : 'text-[#888888] hover:text-[#cccccc]'
              }`}
            >
              {t(LABEL_KEYS[lvl])}
              {lvl === effectiveLevel && <CheckIcon size={12} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
