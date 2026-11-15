import { analyticsError, analyticsId, type AnalyticsContext } from './analytics-context';
import { emitTelemetry, markTelemetryError } from './telemetry';

type SaveTarget = 'local' | 'cloud';
type SaveOutcome = 'success' | 'failed' | 'memory_only';
type Aggregate = { count: number; duration: number; context: AnalyticsContext };
const aggregates = new Map<string, Aggregate>();
let timer: ReturnType<typeof setTimeout> | undefined;

function flush(): void {
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
  for (const { count, duration, context } of aggregates.values()) {
    emitTelemetry('session_save_finished', {
      target: 'local', outcome: 'success', write_count: count, duration_ms: duration,
    }, context);
  }
  aggregates.clear();
  if (typeof window !== 'undefined') window.removeEventListener('pagehide', flush);
}

export function recordSave(
  target: SaveTarget, context: AnalyticsContext, started: number, outcome: SaveOutcome,
  options: { error?: unknown; retries?: number; streamingKey?: string } = {},
): void {
  const duration = Math.round(performance.now() - started);
  if (target === 'local' && outcome === 'success' && options.streamingKey) {
    const entry = aggregates.get(options.streamingKey) ?? { count: 0, duration: 0, context };
    entry.count++;
    entry.duration += duration;
    aggregates.set(options.streamingKey, entry);
    if (timer === undefined) {
      timer = setTimeout(flush, 30_000);
      if (typeof window !== 'undefined') window.addEventListener('pagehide', flush);
    }
    return;
  }
  if (outcome === 'failed') markTelemetryError(options.error);
  emitTelemetry('session_save_finished', {
    operation_id: analyticsId(), target, outcome, duration_ms: duration, write_count: 1,
    retry_count: options.retries, ...(outcome === 'failed' ? analyticsError(options.error) : {}),
  }, context);
}
