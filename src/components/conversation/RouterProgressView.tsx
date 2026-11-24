import { Wrench } from 'lucide-react';
import type { ReactNode } from 'react';
import type { RouterProgress } from '../../agent/progress';
import { t } from '../../lib/i18n';
import { ChevronRightIcon } from '../icons';
import { isCompletionTool, routerStrategySeconds, type RouterProcess } from './router-progress-display';

function Disclosure({ kind, label, icon, live = false, children }: {
  kind: string;
  label: string;
  icon?: ReactNode;
  live?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={live} className="group/router min-w-0 px-2 text-sm text-text-secondary" data-router-progress={kind}>
      <summary
        className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded py-0.5 hover:text-text-primary [&::-webkit-details-marker]:hidden"
        onClick={live ? event => event.preventDefault() : undefined}
      >
        {icon}
        <span>{label}</span>
        <ChevronRightIcon size={14} className="shrink-0 transition-transform group-open/router:rotate-90" />
      </summary>
      {children}
    </details>
  );
}

const detailClass = 'mt-1.5 whitespace-pre-wrap break-words border-l border-border/60 py-1 pl-3 text-xs leading-relaxed text-text-secondary';

function ProgressList({ kind, label, entries }: { kind: string; label: string; entries: RouterProgress[] }) {
  return (
    <Disclosure kind={kind} label={label}>
      <ul className={detailClass}>
        {entries.map((entry, index) => (
          <li key={index} className="mb-2 last:mb-0">
            <div>{entry.title}</div>
            {entry.detail && <div>{entry.detail}</div>}
          </li>
        ))}
      </ul>
    </Disclosure>
  );
}

export default function RouterProgressView({ entry, live = false, durationLabel }: {
  entry: RouterProgress;
  live?: boolean;
  durationLabel?: string;
}) {
  if (entry.kind === 'plan' || entry.kind === 'operation') {
    return (
      <p data-router-progress={entry.kind} className="whitespace-pre-wrap break-words px-2 text-sm leading-relaxed text-text-primary">
        {entry.kind === 'operation' ? entry.detail ?? entry.title : entry.title}
      </p>
    );
  }
  const strategy = entry.kind === 'strategy';
  const label = strategy ? [t('reasoningTitle'), durationLabel].filter(Boolean).join(' · ') : entry.title;
  return (
    <Disclosure kind={entry.kind} label={label} live={live} icon={strategy ? undefined : <Wrench aria-hidden size={14} className="shrink-0" />}>
      <div className={strategy
        ? 'reasoning-scroll mt-1.5 max-h-64 overflow-y-auto overscroll-contain whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-text-reasoning'
        : detailClass}>
        {entry.detail}
      </div>
    </Disclosure>
  );
}

export function ActionProcessHeader({ id, duration, expanded, onToggle, markSize }: {
  id: string;
  duration?: string;
  expanded: boolean;
  onToggle: () => void;
  markSize: number;
}) {
  return (
    <div className="px-2">
      <button type="button" data-action-process-toggle={id} aria-expanded={expanded} onClick={onToggle}
        className="flex items-center gap-1.5 text-sm text-text-secondary/60 hover:text-text-secondary transition-colors">
        <span>{t('actionsTitle')}</span>
        {duration && <span>· {duration}</span>}
        <ChevronRightIcon size={markSize}
          className={`flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </button>
      <div className="mt-2 border-b border-border/60" />
    </div>
  );
}

export function RouterProcessView({ id, process, expanded, onToggle, markSize, formatDuration }: {
  id: string;
  process: RouterProcess;
  expanded: boolean;
  onToggle: () => void;
  markSize: number;
  formatDuration: (seconds: number) => string;
}) {
  const operations = process.entries.filter(entry => entry.kind === 'operation');
  const completion = process.entries.filter(isCompletionTool);
  const firstOperation = process.entries.findIndex(entry => entry.kind === 'operation');
  return (
    <div className="animate-fade-in" style={{
      marginBlockEnd: expanded ? 'var(--spacing-action-expanded-content-gap)' : 'var(--spacing-action-divider-to-body)',
    }}>
      <ActionProcessHeader id={id} duration={formatDuration(process.seconds)} expanded={expanded}
        markSize={markSize} onToggle={onToggle} />
      {expanded && (
        <div className="mt-3 space-y-3">
          {process.entries.map((entry, index) => {
            if (isCompletionTool(entry)) return null;
            if (entry.kind === 'operation') {
              if (index !== firstOperation) return null;
              return <ProgressList key={index} kind="arrangement" label={t('routerArrangement')} entries={operations} />;
            }
            const seconds = routerStrategySeconds(entry);
            return <RouterProgressView key={index} entry={entry}
              durationLabel={seconds === undefined ? undefined : formatDuration(seconds)} />;
          })}
          {completion.length > 0 && <ProgressList kind="completion" label={t('routerCompletion')} entries={completion} />}
        </div>
      )}
    </div>
  );
}
