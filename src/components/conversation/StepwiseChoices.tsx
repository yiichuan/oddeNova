import { useEffect, useRef, useState } from 'react';
import { t } from '../../lib/i18n';
import { stepwiseOptionText } from '../../services/suggestions';

export default function StepwiseChoices({ options, isMobile, onSelect }: {
  options: string[];
  isMobile: boolean;
  onSelect: (text: string) => boolean | void | Promise<boolean | void>;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState('');
  const sending = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  function choose(index: number) {
    if (sending.current) return;
    sending.current = true;
    setSelected(index);
    setError('');
    const send = async () => {
      try {
        if (await onSelect(stepwiseOptionText(options[index])) !== false) return;
        setError(t('requestFailed'));
      } catch (error) {
        setError(error instanceof Error ? error.message : t('requestFailed'));
      } finally {
        sending.current = false;
        setSelected(null);
      }
    };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) void send();
    else timer.current = setTimeout(() => { void send(); }, 200);
  }

  return (
    <div role="group" aria-label={t('choiceOptionsLabel')} data-chat-choice-options className="mt-2 -ml-1">
      {options.map((option, index) => {
        const dismissed = selected !== null && selected !== index;
        return (
          <div key={index} className={`grid transition-[grid-template-rows,opacity] duration-200 ease-in-out motion-reduce:transition-none ${dismissed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr]'}`}>
            <div className="min-h-0 overflow-hidden pt-1 pr-1">
              <button type="button" disabled={selected !== null} aria-hidden={dismissed || undefined}
                onClick={() => choose(index)}
                className={`min-h-9 max-w-full rounded-[6px] border border-border px-3 py-1.5 text-left ${isMobile ? 'text-base' : 'text-[13px]'} leading-snug text-text-primary [overflow-wrap:anywhere] enabled:cursor-pointer enabled:hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-accent pointer-coarse:min-h-11 ${selected === index ? 'bg-surface-selected' : 'bg-transparent'}`}>
                {stepwiseOptionText(option)}
              </button>
            </div>
          </div>
        );
      })}
      {error && <p role="alert" className="px-1 py-1 text-xs text-error">{error}</p>}
    </div>
  );
}
