import { useMemo, useState, type ReactNode } from 'react';
import type { CodeRevision } from '../hooks/useSessions';
import { buildCodeDiff, type DiffRow } from '../lib/code-diff';
import { t } from '../lib/i18n';
import { CheckIcon, ChevronRightIcon, CopyIcon } from './icons';

interface CodeDiffViewProps {
  messageId: string;
  revision: CodeRevision;
  expanded: boolean;
  onToggle: () => void;
}

function counterpartFor(rows: DiffRow[], index: number): string | undefined {
  const row = rows[index];
  if (row.kind !== 'add' && row.kind !== 'remove') return undefined;
  let start = index;
  while (start > 0 && (rows[start - 1].kind === 'add' || rows[start - 1].kind === 'remove')) start--;
  let end = index + 1;
  while (end < rows.length && (rows[end].kind === 'add' || rows[end].kind === 'remove')) end++;
  const block = rows.slice(start, end);
  const sameKindBefore = block
    .slice(0, index - start)
    .filter((candidate) => candidate.kind === row.kind).length;
  const otherKind = row.kind === 'add' ? 'remove' : 'add';
  const counterpart = block.filter((candidate) => candidate.kind === otherKind)[sameKindBefore];
  return counterpart && counterpart.kind !== 'skip' ? counterpart.text : undefined;
}

function highlightedText(text: string, counterpart: string | undefined, kind: 'add' | 'remove'): ReactNode {
  if (counterpart == null) return text;
  let prefix = 0;
  while (prefix < text.length && prefix < counterpart.length && text[prefix] === counterpart[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < text.length - prefix &&
    suffix < counterpart.length - prefix &&
    text[text.length - 1 - suffix] === counterpart[counterpart.length - 1 - suffix]
  ) suffix++;
  const changedEnd = suffix === 0 ? text.length : text.length - suffix;
  const changed = text.slice(prefix, changedEnd);
  if (!changed) return text;
  return (
    <>
      {text.slice(0, prefix)}
      <span className={kind === 'add' ? 'bg-emerald-300/20' : 'bg-rose-300/20'}>{changed}</span>
      {text.slice(changedEnd)}
    </>
  );
}

export function CodeDiffView({ messageId, revision, expanded, onToggle }: CodeDiffViewProps) {
  const [copied, setCopied] = useState(false);
  const diff = useMemo(
    () => buildCodeDiff(revision.beforeCode, revision.afterCode),
    [revision.beforeCode, revision.afterCode],
  );

  return (
    <div className="mt-4 -ml-1 overflow-hidden rounded-md border border-[#93C2FF]/30 bg-bg-primary/35 animate-fade-in">
      <div className="flex w-full items-stretch bg-bg-primary/60 text-[11px] text-[#93C2FF]/70">
        <button
          type="button"
          data-code-diff-toggle={messageId}
          aria-expanded={expanded}
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-1.5 px-2 py-1.5 text-left transition-colors hover:bg-bg-primary/80 hover:text-[#93C2FF]/90"
        >
          <ChevronRightIcon
            size={12}
            className={`shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
          />
          <span>{t('viewChanges')}</span>
          <span className="text-emerald-300/75">+{diff.additions}</span>
          <span className="text-rose-300/75">−{diff.deletions}</span>
          {revision.playbackStatus === 'failed' && (
            <span className="ml-1 truncate text-amber-300/70">{t('revisionPlaybackFailed')}</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(revision.afterCode).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            });
          }}
          className="px-2 py-1.5 transition-colors hover:bg-bg-primary/80 hover:text-[#93C2FF]/90"
          title={t('copyCode')}
        >
          {copied ? <CheckIcon size={13} /> : <CopyIcon size={13} />}
        </button>
      </div>

      {expanded && (
        <div className="border-t border-[#93C2FF]/15 bg-[#080a0d] py-1 animate-fade-in">
          {diff.groups.length === 0 && (
            <div className="px-3 py-3 text-[11px] text-text-muted">{t('noCodeChanges')}</div>
          )}
          {diff.groups.map((group) => (
            <section key={group.key} data-diff-group={group.name} className="py-1.5 first:pt-0 last:pb-0">
              <div className="sticky top-0 z-[1] flex items-center gap-2 border-y border-white/[0.055] bg-[#101319] px-2.5 py-1 font-mono text-[10px] tracking-[0.16em] text-white/55">
                <span>{group.name.toUpperCase()}</span>
                <span className="tracking-normal text-emerald-300/60">+{group.additions}</span>
                <span className="tracking-normal text-rose-300/60">−{group.deletions}</span>
              </div>
              <div className="overflow-x-auto py-1 font-mono text-[11px] leading-[1.65]">
                {group.rows.map((row, index) => {
                  if (row.kind === 'skip') {
                    return (
                      <div key={`skip-${index}`} className="grid grid-cols-[2.25rem_2.25rem_1.25rem_minmax(max-content,1fr)] text-white/30">
                        <span /><span /><span className="text-center">···</span>
                        <span className="px-1.5 italic">{t('unchangedLines').replace('{count}', String(row.count))}</span>
                      </div>
                    );
                  }
                  const tone = row.kind === 'add'
                    ? 'bg-emerald-400/[0.075] text-emerald-50/80'
                    : row.kind === 'remove'
                      ? 'bg-rose-400/[0.075] text-rose-50/75'
                      : 'text-white/42';
                  const sign = row.kind === 'add' ? '+' : row.kind === 'remove' ? '−' : ' ';
                  const counterpart = counterpartFor(group.rows, index);
                  return (
                    <div
                      key={`${row.kind}-${index}`}
                      data-diff-kind={row.kind}
                      className={`grid min-w-full grid-cols-[2.25rem_2.25rem_1.25rem_minmax(max-content,1fr)] ${tone}`}
                    >
                      <span className="select-none border-r border-white/[0.035] pr-1.5 text-right text-white/20">{row.oldLine ?? ''}</span>
                      <span className="select-none border-r border-white/[0.035] pr-1.5 text-right text-white/20">{row.newLine ?? ''}</span>
                      <span className="select-none text-center">{sign}</span>
                      <code className="whitespace-pre pr-3">
                        {row.kind === 'add' || row.kind === 'remove'
                          ? highlightedText(row.text, counterpart, row.kind)
                          : row.text}
                      </code>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
