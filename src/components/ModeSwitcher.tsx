import { useEffect, useRef, useState } from 'react';
import type { AgentMode } from '../hooks/useChat';
import { ChatBubbleIcon, ChevronDownIcon, SparklesIcon } from './icons';
import { t } from '../lib/i18n';

interface ModeSwitcherProps {
  mode: AgentMode;
  onChange: (mode: AgentMode) => void;
}

const MODE_OPTIONS: Array<{
  mode: AgentMode;
  labelKey: string;
  descKey: string;
  Icon: typeof SparklesIcon;
}> = [
  {
    mode: 'create',
    labelKey: 'modeCreate',
    descKey: 'modeCreateDesc',
    Icon: SparklesIcon,
  },
  {
    mode: 'chat',
    labelKey: 'modeChat',
    descKey: 'modeChatDesc',
    Icon: ChatBubbleIcon,
  },
];

export default function ModeSwitcher({ mode, onChange }: ModeSwitcherProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = MODE_OPTIONS.find((option) => option.mode === mode) ?? MODE_OPTIONS[0];
  const CurrentIcon = current.Icon;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || !event.shiftKey) return;
      event.preventDefault();
      setOpen(false);
      onChange(mode === 'create' ? 'chat' : 'create');
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, onChange]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [open]);

  const selectMode = (nextMode: AgentMode) => {
    if (nextMode !== mode) {
      onChange(nextMode);
    }
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={t('switchMode')}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-border bg-transparent px-2.5 text-[11px] text-text-secondary transition hover:border-accent/50 hover:text-text-primary"
      >
        <CurrentIcon size={13} />
        <span>{t(current.labelKey)}</span>
        <ChevronDownIcon size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 bottom-full z-20 mb-2 w-56 overflow-hidden rounded-[8px] border border-border bg-bg-primary shadow-lg"
        >
          {MODE_OPTIONS.map((option) => {
            const Icon = option.Icon;
            const selected = option.mode === mode;
            return (
              <button
                key={option.mode}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                onClick={() => selectMode(option.mode)}
                className={`flex w-full items-start gap-2 px-3 py-2 text-left transition ${
                  selected
                    ? 'bg-[#93C2FF]/10 text-text-primary'
                    : 'text-text-secondary hover:bg-white/5 hover:text-text-primary'
                }`}
              >
                <Icon size={14} className="mt-0.5 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-xs">{t(option.labelKey)}</span>
                  <span className="block truncate text-[10px] text-text-muted">{t(option.descKey)}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
