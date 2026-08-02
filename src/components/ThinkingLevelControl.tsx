import { useEffect, useRef, useState } from 'react';
import { CheckIcon, GaugeIcon } from './icons';
import { t } from '../lib/i18n';
import {
  getSelectedThinkingLevel,
  setSelectedThinkingLevel,
  THINKING_LEVELS,
  type ThinkingLevel,
} from '../services/llm-config';

const LABEL_KEYS: Record<ThinkingLevel, string> = {
  low: 'thinkingLevelLow',
  medium: 'thinkingLevelMedium',
  high: 'thinkingLevelHigh',
  extreme: 'thinkingLevelExtreme',
};

interface ThinkingLevelControlProps {
  disabled?: boolean;
}

// Icon button + popover next to the send button (see CONTEXT.md: Thinking
// level). Reads/writes the global localStorage preference directly — no
// prop threading through ChatInput/App, matching how provider/model are
// resolved directly from llm-config.ts wherever they're needed.
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
        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#888888] transition duration-200 hover:text-[#e0e0e0] disabled:cursor-not-allowed disabled:opacity-30"
        title={t('thinkingLevel')}
        aria-label={t('thinkingLevel')}
      >
        <GaugeIcon size={16} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full right-0 mb-2 w-28 overflow-hidden rounded-[10px] border border-[#2a2a2a] bg-[#181818] py-1 shadow-lg"
        >
          {THINKING_LEVELS.map((lvl) => (
            <button
              key={lvl}
              type="button"
              role="menuitemradio"
              aria-checked={lvl === level}
              onClick={() => select(lvl)}
              className={`flex w-full items-center justify-between px-3 py-1.5 text-[13px] transition-colors ${
                lvl === level ? 'text-white' : 'text-[#888888] hover:text-[#cccccc]'
              }`}
            >
              {t(LABEL_KEYS[lvl])}
              {lvl === level && <CheckIcon size={12} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
