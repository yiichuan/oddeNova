import { isAbortError } from './errors';

type TimingFields = Record<string, string | number | boolean | undefined>;

export type SampleTiming = (stage: string, fields?: TimingFields) => void;

let runSequence = 0;

export function createSampleTiming(provider: string, model: string): SampleTiming | undefined {
  if (!import.meta.env.DEV) return undefined;

  const runId = `${Date.now()}-${++runSequence}`;
  const started = performance.now();
  let lastSearchFinished: number | undefined;
  let searchCalls = 0;
  let deduplicatedCalls = 0;

  return (stage, fields) => {
    const now = performance.now();
    if (stage === 'search_finished') {
      lastSearchFinished = now;
      searchCalls++;
    }
    if (stage === 'search_deduplicated') deduplicatedCalls++;
    const summary = stage === 'run_finished' ? {
      searchCalls,
      deduplicatedCalls,
      afterLastSearchMs: lastSearchFinished === undefined ? undefined : Math.round(now - lastSearchFinished),
    } : undefined;
    console.info(`[sample-timing] ${JSON.stringify({
      runId, provider, model, stage, elapsedMs: Math.round(now - started), ...summary, ...fields,
    })}`);
  };
}

export function elapsedMs(started: number): number {
  return Math.round(performance.now() - started);
}

export function timingErrorStatus(error: unknown, signal?: AbortSignal): 'timeout' | 'aborted' | 'error' {
  const reason = signal?.aborted ? signal.reason : error;
  if (reason instanceof Error && reason.name === 'TimeoutError') return 'timeout';
  return isAbortError(error, signal) ? 'aborted' : 'error';
}
