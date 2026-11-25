import type { SessionProgress, RouterProgress } from './progress';
import type { LLMCaller } from './loop';
import { withVoice, type RouterVoice } from './router';
import { ROUTER_PROGRESS_PROMPT } from '../prompts/router';

const MAX_BATCH = 12;
const MAX_PENDING = 36;
const ROUTER_PROGRESS_ROW_INTERVAL_MS = 320;

export function waitForProgress(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0 || signal.aborted) return Promise.resolve();
  return new Promise(resolve => {
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done, { once: true });
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
  });
}

// The narration protocol is an ordered array of flat objects. Read each
// complete object as it arrives, leaving a partial object for the next chunk.
function readProgressEntries(onEntry: (value: unknown) => void) {
  const row = /^\s*(\{(?:[^{}"\\]|"(?:[^"\\]|\\[\s\S])*")*\})/;
  let buffer = '';
  let opened = false;
  let separator = false;
  let stopped = false;
  return (delta: string) => {
    if (stopped) return;
    buffer += delta;
    if (buffer.length > 65_536) {
      stopped = true;
      return;
    }
    if (!opened) {
      const start = buffer.match(/^\s*(?:```(?:json)?\s*)?\[/i);
      if (!start) return;
      buffer = buffer.slice(start[0].length);
      opened = true;
    }
    while (buffer.trim()) {
      if (buffer.trimStart().startsWith(']')) {
        stopped = true;
        return;
      }
      if (separator) {
        const comma = buffer.match(/^\s*,/);
        if (!comma) return;
        buffer = buffer.slice(comma[0].length);
        separator = false;
      }
      const match = buffer.match(row);
      if (!match) return;
      buffer = buffer.slice(match[0].length);
      separator = true;
      try {
        onEntry(JSON.parse(match[1]));
      } catch {
        stopped = true;
        return;
      }
    }
  };
}

export function createRouterProgress(
  llm: LLMCaller,
  message: string,
  voice: RouterVoice,
  signal: AbortSignal,
  publish: (entry: RouterProgress) => void,
) {
  let pending: SessionProgress[] = [];
  let scheduled: ReturnType<typeof setTimeout> | undefined;
  let active: Promise<void> | undefined;
  let closed = false;
  const work = new AbortController();

  let nextPublishAt = 0;
  let publication = Promise.resolve();
  const pendingPublication = AbortSignal.any([signal, work.signal]);

  const render = async (batch: SessionProgress[]) => {
    const deadline = AbortSignal.any([signal, work.signal, AbortSignal.timeout(5500)]);
    let lastIndex = -1;
    const enqueue = (index: number, entry: RouterProgress) => {
      if (index <= lastIndex || deadline.aborted) return;
      lastIndex = index;
      publication = publication.then(async () => {
        await waitForProgress(Math.max(0, nextPublishAt - performance.now()), pendingPublication);
        if (pendingPublication.aborted) return;
        publish(entry);
        nextPublishAt = performance.now() + ROUTER_PROGRESS_ROW_INTERVAL_MS;
      });
    };
    const accept = (value: unknown): [number, RouterProgress] | undefined => {
      if (!value || typeof value !== 'object') return;
      const { index, title, detail: rawDetail, application: rawApplication, summary: rawSummary } = value as Record<string, unknown>;
      if (typeof index !== 'number' || !Number.isInteger(index) || typeof title !== 'string') return;
      const source = batch[index];
      if (!source) return;
      const detail = typeof rawDetail === 'string' ? rawDetail.trim().slice(0, 1800) : '';
      const application = source.kind === 'tool' && typeof rawApplication === 'string'
        ? rawApplication.trim().slice(0, 900) : '';
      const summary = (source.kind === 'strategy' || source.kind === 'operation') && typeof rawSummary === 'string'
        ? rawSummary.trim().slice(0, 240) : '';
      const heading = title.trim();
      const generic = /^(?:下一步|计划|规划|next step|plan)\s*[：:.…]*\s*$/i.test(heading);
      const text = source.kind === 'plan' && (!heading || generic) ? detail : heading;
      if (!text || (source.kind !== 'plan' && !detail)) return;
      const action = source.kind === 'tool' && source.facts && typeof source.facts === 'object' && 'action' in source.facts
        ? source.facts.action : undefined;
      return [index, {
        kind: source.kind, title: text.slice(0, 180),
        ...(source.kind !== 'plan' && { detail }),
        ...(application && { application }),
        ...(summary && { summary }),
        ...(typeof action === 'string' && { toolAction: action }),
        ...(source.durationMs !== undefined && { durationMs: source.durationMs }),
      }];
    };
    const read = readProgressEntries(value => {
      const entry = accept(value);
      if (entry) enqueue(...entry);
    });
    try {
      const result = await llm.chatWithTools([
        { role: 'system', content: withVoice(ROUTER_PROGRESS_PROMPT, voice) },
        { role: 'user', content: JSON.stringify({ message, events: batch }) },
      ], [], read, undefined, deadline, false);
      if (!deadline.aborted && !result.toolCalls.length) {
        const entries: unknown = JSON.parse((result.content ?? '').trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
        if (Array.isArray(entries)) {
          const accepted = entries.map(accept).filter(entry => entry !== undefined);
          for (const entry of accepted.sort(([a], [b]) => a - b)) enqueue(...entry);
        }
      }
    } catch {
      // Narration is optional. Keep any grounded rows already received.
    }
  };

  const flush = (): Promise<void> => {
    clearTimeout(scheduled);
    scheduled = undefined;
    if (active) return active;
    if (signal.aborted || closed || !pending.length) return Promise.resolve();
    active = render(pending.splice(0, MAX_BATCH)).finally(() => {
      active = undefined;
      if (!closed && !signal.aborted && pending.length) void flush();
    });
    return active;
  };

  return {
    add(event: SessionProgress) {
      if (closed || signal.aborted) return;
      if (pending.length >= MAX_PENDING) pending.shift();
      pending.push(event);
      if (!active && scheduled === undefined) scheduled = setTimeout(() => void flush(), 170);
    },
    async finish() {
      // One short grace period at the end of the turn. Discard late updates so
      // the final receipt always remains the last message in the turn.
      const deadline = AbortSignal.any([signal, AbortSignal.timeout(6000)]);
      let finishWait: (() => void) | undefined;
      const expired = new Promise<void>(resolve => {
        finishWait = () => resolve();
        if (deadline.aborted) finishWait();
        else deadline.addEventListener('abort', finishWait, { once: true });
      });
      try {
        while (!deadline.aborted && (active || pending.length)) await Promise.race([flush(), expired]);
        await Promise.race([publication, expired]);
        // Let the final live row finish drawing before it joins the archive.
        await waitForProgress(Math.max(0, nextPublishAt - performance.now()), deadline);
      } finally {
        close();
        if (finishWait) deadline.removeEventListener('abort', finishWait);
      }
    },
    close,
  };

  function close() {
    closed = true;
    pending = [];
    clearTimeout(scheduled);
    work.abort();
  }
}
