import { CircleCheck, Cog, Ear, Eye, FileCheck, FileMusic, FilePenLine, Search } from 'lucide-react';
import type { ReactNode } from 'react';
import type { RouterProgress } from '../../agent/progress';
import { t, zh } from '../../lib/i18n';
import { ChevronRightIcon } from '../icons';
import { MusicText } from './music-text';
import { isCompletionTool, routerStrategySeconds, type RouterProcess } from './router-progress-display';

const icons = {
  image: Eye,
  score: FileMusic,
  humming: Ear,
  search: Search,
  write: FilePenLine,
  validate: FileCheck,
  commit: CircleCheck,
  generic: Cog,
};

type ToolIconName = keyof typeof icons;

const knownToolIcons = new Map<string, ToolIconName>([
  ['inspect images', 'image'],
  ['inspect score versions', 'score'],
  ['analyzeHummingWaveform', 'humming'],
  ['searchSamples', 'search'],
  ['setCode', 'write'],
  ['validate', 'validate'],
  ['validate final draft', 'validate'],
  ['commit', 'commit'],
]);

// Older conversations may only have the user-facing tool title.
const legacyToolIcons: [RegExp, ToolIconName][] = [
  [/图片|参考图|图像|\bimages?\b/i, 'image'],
  [/哼唱|波形|读谱|\b(?:humming|waveform)\b/i, 'humming'],
  [/(?:查找|搜索|检索).*(?:音色|采样)|\bsearch\b.*\b(?:samples?|sounds?)\b/i, 'search'],
  [/(?:读取|查看).*(?:作品|乐谱|编曲)|\bread(?:ing)?\b.*\b(?:score|arrangement)\b/i, 'score'],
  [/校验|验证|\bvalidat\w*\b|\b(?:check|test\w*)\b.*\b(?:syntax|code|draft)\b/i, 'validate'],
  [/提交|\bcommit\w*\b/i, 'commit'],
  [/(?:写入|编写|生成).*(?:代码|草稿)|\bwrit\w*\b.*\b(?:code|draft)\b/i, 'write'],
];

function ToolIcon({ entry }: { entry: RouterProgress }) {
  const name = entry.toolAction !== undefined
    ? knownToolIcons.get(entry.toolAction)
    : legacyToolIcons.find(([pattern]) => pattern.test(entry.title))?.[1];
  const Icon = icons[name ?? 'generic'];
  return <Icon aria-hidden size={14} className="shrink-0" />;
}

function Disclosure({ kind, label, live = false, children }: {
  kind: string;
  label: string;
  live?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={live} className="group/router min-w-0 px-2 text-sm text-text-secondary"
      data-router-progress={kind} data-live-router-progress={live || undefined}>
      <summary
        className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded py-0.5 hover:text-text-primary [&::-webkit-details-marker]:hidden"
        onClick={live ? event => event.preventDefault() : undefined}
      >
        <span className="font-bold text-text-primary">{label}</span>
        <ChevronRightIcon size={14} className="shrink-0 transition-transform group-open/router:rotate-90" />
      </summary>
      {children}
    </details>
  );
}

const bodyClass = 'whitespace-pre-wrap break-words text-sm leading-relaxed [@media(max-width:460px)]:text-base';
const quoteClass = 'border-l border-border/60 pl-3';
const detailClass = `mt-1.5 py-1 text-text-secondary ${bodyClass} ${quoteClass}`;
const primaryTextClass = 'whitespace-pre-wrap break-words px-2 text-sm leading-relaxed text-text-primary';

function ProgressSummary({ text }: { text: string }) {
  return text ? (
    <p data-router-progress-summary className={`mt-1 ${primaryTextClass} [@media(max-width:460px)]:text-base`}>
      <MusicText text={text} />
    </p>
  ) : null;
}

function ProgressList({ kind, label, entries }: { kind: string; label: string; entries: RouterProgress[] }) {
  const disclosure = (
    <Disclosure kind={kind} label={label}>
      <ul className={kind === 'completion' ? `mt-1.5 space-y-2 ${quoteClass}` : detailClass}>
        {entries.map((entry, index) => entry.kind === 'tool' ? (
          <li key={index} data-router-tool-action={entry.toolAction}
            className={`flex items-center gap-1.5 px-2 text-text-secondary/60 ${bodyClass}`}>
            <ToolIcon entry={entry} />
            <MusicText text={entry.title} />
          </li>
        ) : (
          <li key={index} className="mb-2 last:mb-0">
            <div><MusicText text={entry.title} /></div>
            {entry.detail && <div><MusicText text={entry.detail} /></div>}
          </li>
        ))}
      </ul>
    </Disclosure>
  );
  if (kind === 'completion') return disclosure;
  const summaries = [...new Set(entries.map(entry => entry.summary || entry.title))]
    .map(text => /[.!?。！？]$/.test(text) ? text : text + (zh ? '。' : '.'));
  return <div>{disclosure}<ProgressSummary text={summaries.join(zh ? '' : ' ')} /></div>;
}

export default function RouterProgressView({ entry, live = false, durationLabel }: {
  entry: RouterProgress;
  live?: boolean;
  durationLabel?: string;
}) {
  const plain = entry.kind === 'plan' || entry.kind === 'operation';
  const strategy = entry.kind === 'strategy';
  const label = strategy ? [t('reasoningTitle'), durationLabel].filter(Boolean).join(' · ') : entry.title;
  const detail = entry.detail ?? '';
  const toolText = entry.kind === 'tool' ? [detail, entry.application].filter(Boolean).join(' ') : '';
  if (plain) {
    return (
      <p data-router-progress={entry.kind} data-live-router-progress={live || undefined}
        className={primaryTextClass}>
        <MusicText text={entry.kind === 'operation' ? entry.detail ?? entry.title : entry.title} />
      </p>
    );
  }
  if (strategy) {
    const disclosure = (
      <Disclosure kind={entry.kind} label={label} live={live}>
        <div className={`font-mono ${detailClass}`}>
          <MusicText text={detail} />
        </div>
      </Disclosure>
    );
    if (live) return disclosure;
    // Saved entries can predate the summary field. Use a short excerpt.
    const excerpt = detail.match(/^.+?(?:[。！？]|[.!?](?=\s|$)|\n|$)/)?.[0]?.trim() ?? '';
    const summary = entry.summary || (excerpt.length > 100 ? `${excerpt.slice(0, 100)}…` : excerpt);
    return <div>{disclosure}<ProgressSummary text={summary} /></div>;
  }
  return (
    <div data-router-progress={entry.kind} data-live-router-progress={live || undefined}
      data-router-tool-action={entry.toolAction} className="min-w-0 px-2 text-sm leading-relaxed">
      <p data-router-tool-title className="flex items-start gap-1.5 text-text-secondary/60 [&>svg]:mt-[calc((1lh_-_14px)/2)]">
        <ToolIcon entry={entry} />
        <span><MusicText text={label} /></span>
      </p>
      {toolText && (
        <p data-router-tool-text className="mt-1 whitespace-pre-wrap break-words text-text-primary">
          <MusicText text={toolText} />
        </p>
      )}
    </div>
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

export function RouterProcessView({ id, process, expanded, onToggle, markSize, formatDuration, renderNarration }: {
  id: string;
  process: RouterProcess;
  expanded: boolean;
  onToggle: () => void;
  markSize: number;
  formatDuration: (seconds: number) => string;
  renderNarration: (content: string) => ReactNode;
}) {
  const progress = process.entries.flatMap(message => message.routerProgress ? [message.routerProgress] : []);
  const operations = progress.filter(entry => entry.kind === 'operation');
  const completion = progress.filter(isCompletionTool);
  const firstOperationId = process.entries.find(message => message.routerProgress?.kind === 'operation')?.id;
  return (
    <div className="animate-fade-in" style={{
      marginBlockEnd: expanded ? 'var(--spacing-action-expanded-content-gap)' : 'var(--spacing-action-divider-to-body)',
    }}>
      <ActionProcessHeader id={id} duration={formatDuration(process.seconds)} expanded={expanded}
        markSize={markSize} onToggle={onToggle} />
      {expanded && (
        <div className="mt-3 space-y-5">
          {process.entries.map(({ id, content, routerProgress: entry }) => {
            if (!entry) return <div key={id} data-message-id={id} className="px-2 text-sm text-text-primary [@media(max-width:460px)]:text-base">
              {renderNarration(content)}
            </div>;
            if (isCompletionTool(entry)) return null;
            if (entry.kind === 'operation') {
              if (id !== firstOperationId) return null;
              return <ProgressList key={id} kind="arrangement" label={t('routerArrangement')} entries={operations} />;
            }
            const seconds = routerStrategySeconds(entry);
            return <RouterProgressView key={id} entry={entry}
              durationLabel={seconds === undefined ? undefined : formatDuration(seconds)} />;
          })}
          {completion.length > 0 && <ProgressList kind="completion" label={t('routerCompletion')} entries={completion} />}
        </div>
      )}
    </div>
  );
}
