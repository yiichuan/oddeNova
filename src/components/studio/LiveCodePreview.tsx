import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import type { LiveCodeDraft } from '../../agent/progress';
import { diffCodeLines } from '../../lib/code-diff';
import { t } from '../../lib/i18n';
import { highlightOddenovaLines } from '../../lib/oddenova-syntax-highlight';
import { diffLiveCodeEdits } from './live-code-edits';
import './live-code-preview.css';

const EXIT_MS = 550;
const FADE_IN_MS = 550;
const WRITE_MS = 420;
type Row = { id: number; text: string; phase: 'steady' | 'writing' | 'replace' | 'repair'; delay: number };
type Step = {
  rows: Row[];
  target?: { first: number; last: number; edge: 'start' | 'end' };
  outgoing?: Set<number>;
  duration: number;
};
type Preview = {
  draft: LiveCodeDraft;
  step: Step;
  remaining: Step[];
  nextId: number;
};

const lines = (code: string) => code ? code.split(/\r\n?|\n/) : [];

function editSteps(before: Row[], after: string[], rowId: () => number): Step[] {
  const { changes, inserted } = diffLiveCodeEdits(before.map(row => row.text), after);
  const blocks: { at: number; removed: Row[]; added: { text: string; line: number }[] }[] = [];
  const steady = before.slice();
  let block: (typeof blocks)[number] | undefined;
  let position = 0;
  for (const change of changes) {
    if (change.kind === 'context') {
      const old = change.oldLine! - 1;
      const text = after[change.newLine! - 1];
      if (steady[old].text !== text) steady[old] = { ...steady[old], text };
      block = undefined;
      position++;
      continue;
    }
    if (!block) {
      block = { at: position, removed: [], added: [] };
      blocks.push(block);
    }
    if (change.kind === 'remove') block.removed.push(before[change.oldLine! - 1]);
    else {
      const line = change.newLine!;
      block.added.push({ text: after[line - 1], line });
      position++;
    }
  }

  const steps: Step[] = [];
  let rows = steady;
  for (const { at, removed, added } of blocks) {
    if (removed.length) {
      steps.push({
        rows, outgoing: new Set(removed.map(row => row.id)), duration: EXIT_MS,
        target: { first: removed[0].id, last: removed.at(-1)!.id, edge: 'start' },
      });
    }
    let writingIndex = 0;
    const incoming = added.map(({ text, line }): Row => {
      const writing = !removed.length || inserted.has(line);
      return {
        id: rowId(), text, phase: writing ? 'writing' : 'replace',
        delay: writing ? Math.min(writingIndex++ * 60, 300) : 0,
      };
    });
    rows = [...rows.slice(0, at), ...incoming, ...rows.slice(at + removed.length)];
    steps.push({
      rows,
      target: incoming.length
        ? { first: incoming[0].id, last: incoming.at(-1)!.id, edge: 'start' }
        : undefined,
      duration: Math.max(0, ...incoming.map(row => row.delay + (row.phase === 'writing' ? WRITE_MS : FADE_IN_MS))),
    });
  }
  return steps.length ? steps : [{ rows, duration: 0 }];
}

function buildPreview(draft: LiveCodeDraft, prior?: Row[], nextId = 0): Preview {
  const before = prior ?? lines(draft.baseline ?? '').map((text): Row => ({
    id: nextId++, text, phase: 'steady', delay: 0,
  }));
  const after = lines(draft.code);
  if (draft.baseline && draft.phase === 'writing') {
    const [step, ...remaining] = editSteps(before, after, () => nextId++);
    return { draft, step, remaining, nextId };
  }

  const changes = diffCodeLines(before.map(row => row.text), after);
  const outgoing = new Set<number>();
  const rows: Row[] = [];
  let added = 0;
  let lastId: number | undefined;
  for (const change of changes) {
    if (change.kind === 'context') rows.push(before[change.oldLine! - 1]);
    else if (change.kind === 'remove') outgoing.add(before[change.oldLine! - 1].id);
    else {
      lastId = nextId++;
      rows.push({ id: lastId, text: change.text, phase: draft.phase, delay: Math.min(added++ * 60, 300) });
    }
  }
  const step: Step = {
    rows, duration: draft.phase === 'repair' && added ? FADE_IN_MS + Math.min((added - 1) * 60, 300) : 0,
    target: draft.phase === 'writing' && lastId !== undefined ? { first: lastId, last: lastId, edge: 'end' } : undefined,
  };
  return draft.phase === 'repair' && outgoing.size
    ? { draft, step: { rows: before, outgoing, duration: EXIT_MS }, remaining: [step], nextId }
    : { draft, step, remaining: [], nextId };
}

export default function LiveCodePreview({ draft, editorRoot, onSettled }: {
  draft: LiveCodeDraft;
  editorRoot: RefObject<HTMLDivElement | null>;
  onSettled?: (draft: LiveCodeDraft) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [preview, setPreview] = useState(() => buildPreview(draft));
  if (preview.draft !== draft) setPreview(buildPreview(draft, preview.step.rows, preview.nextId));
  const { step, remaining } = preview;
  const { target } = step;
  const highlighted = useMemo(() => highlightOddenovaLines(step.rows.map(row => row.text).join('\n')), [step.rows]);

  useLayoutEffect(() => {
    if (!remaining.length && !step.duration) return;
    const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : step.duration;
    const timer = setTimeout(() => {
      const [next, ...rest] = remaining;
      setPreview(current => current.step === step
        ? { ...current, step: next ?? { ...step, duration: 0 }, remaining: rest } : current);
    }, delay);
    return () => clearTimeout(timer);
  }, [remaining, step]);

  useLayoutEffect(() => {
    if (!onSettled || step.duration || remaining.length) return;
    const editor = editorRoot.current?.querySelector('.cm-scroller');
    if (editor && scroller.current) editor.scrollTop = scroller.current.scrollTop;
    onSettled(draft);
  }, [draft, editorRoot, onSettled, remaining.length, step.duration]);

  useLayoutEffect(() => {
    const pane = scroller.current;
    if (pane && draft.baseline) pane.scrollTop = editorRoot.current?.querySelector('.cm-scroller')?.scrollTop ?? 0;
  }, [draft.baseline, editorRoot]);

  useLayoutEffect(() => {
    const pane = scroller.current;
    if (draft.phase !== 'writing' || !pane || !target) return;
    const first = pane.querySelector(`[data-live-code-id="${target.first}"]`);
    const last = pane.querySelector(`[data-live-code-id="${target.last}"]`);
    if (!first || !last) return;
    const reveal = () => {
      if (!pane.clientHeight) return;
      const bounds = pane.getBoundingClientRect();
      const top = first.getBoundingClientRect().top;
      const bottom = last.getBoundingClientRect().bottom;
      if (target.edge === 'start' && bottom - top > pane.clientHeight - 16) pane.scrollTop += top - bounds.top;
      else if (bottom > bounds.bottom - 16) pane.scrollTop += bottom - bounds.bottom + 16;
      else if (top < bounds.top) pane.scrollTop += top - bounds.top;
    };
    reveal();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(reveal);
    observer.observe(pane);
    return () => observer.disconnect();
  }, [draft.phase, target]);

  return (
    <div ref={scroller} tabIndex={0} role="region" aria-label={t('strudelCode')}
      data-live-code-preview data-live-code-phase={draft.phase}
      className="live-code-preview absolute inset-0 z-[241] overflow-auto bg-conversation-surface text-text-primary"
      style={{
        '--live-code-exit': `${EXIT_MS}ms`, '--live-code-fade-in': `${FADE_IN_MS}ms`, '--live-code-write': `${WRITE_MS}ms`,
      } as CSSProperties}>
      <pre className="m-0">
        {step.rows.map((row, index) => {
          const tokens = highlighted[index].map(({ text, color }, tokenIndex) => (
            <span key={tokenIndex} style={color ? { color } : undefined}>{text}</span>
          ));
          return (
            <span key={row.id} data-live-code-id={row.id}
              data-live-code-row={step.outgoing?.has(row.id) ? 'removing' : row.phase}
              className="live-code-row"
              style={{ '--live-code-delay': `${row.delay}ms` } as CSSProperties}>
              <span aria-hidden="true" className="live-code-gutter">{index + 1}</span>
              <span className="relative min-w-0 max-w-full justify-self-start">
                <span className="live-code-clear">{row.text ? tokens : '\u200b'}</span>
                {row.phase === 'writing' && <span aria-hidden="true" className="live-code-blur"><span>{tokens}</span></span>}
              </span>
            </span>
          );
        })}
      </pre>
    </div>
  );
}
