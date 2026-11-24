import type { SessionProgress, RouterProgress } from './progress';
import type { LLMCaller } from './loop';
import { withVoice, type RouterVoice } from './router';
import { ROUTER_PROGRESS_PROMPT } from '../prompts/router';

const MAX_BATCH = 12;
const MAX_PENDING = 36;

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

  const render = async (batch: SessionProgress[]) => {
    try {
      const deadline = AbortSignal.any([signal, work.signal, AbortSignal.timeout(5500)]);
      const result = await llm.chatWithTools([
        { role: 'system', content: withVoice(ROUTER_PROGRESS_PROMPT, voice) },
        { role: 'user', content: JSON.stringify({ message, events: batch }) },
      ], [], undefined, undefined, deadline, false);
      if (closed || deadline.aborted || result.toolCalls.length) return;
      const entries: unknown = JSON.parse((result.content ?? '').trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
      if (!Array.isArray(entries)) return;
      const accepted = new Map<number, RouterProgress>();
      for (const entry of entries) {
        if (!entry || !Number.isInteger(entry.index) || accepted.has(entry.index)) continue;
        const source = batch[entry.index];
        if (!source || typeof entry.title !== 'string') continue;
        const detail = typeof entry.detail === 'string' ? entry.detail.trim().slice(0, 1800) : '';
        const title = entry.title.trim();
        const plan = /^(?:下一步|计划|规划|next step|plan)\s*[：:.…]*\s*$/i.test(title);
        const text = source.kind === 'plan' && (!title || plan) ? detail : title;
        if (!text) continue;
        if (source.kind !== 'plan' && !detail) continue;
        const action = source.kind === 'tool' && source.facts && typeof source.facts === 'object' && 'action' in source.facts
          ? source.facts.action : undefined;
        accepted.set(entry.index, {
          kind: source.kind, title: text.slice(0, 180),
          ...(source.kind !== 'plan' && { detail }),
          ...(typeof action === 'string' && { toolAction: action }),
          ...(source.durationMs !== undefined && { durationMs: source.durationMs }),
        });
      }
      for (const [, entry] of [...accepted].sort(([a], [b]) => a - b)) publish(entry);
    } catch {
      // Progress presentation is optional. A model failure cannot interrupt the music task.
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
