import { analyticsContext, analyticsError } from './analytics-context';
import { emitTelemetry, hasTelemetryError } from './telemetry';

export function installAppErrorTelemetry(): void {
  const lastSeen = new Map<string, number>();
  const record = (source: string, error: unknown) => {
    if (hasTelemetryError(error)) return;
    const context = analyticsContext();
    const { error_code } = analyticsError(error);
    const key = [source, context.page, error_code].join(':');
    const now = Date.now();
    if (now - (lastSeen.get(key) ?? -Infinity) < 60_000) return;
    lastSeen.set(key, now);
    emitTelemetry('app_error', { source, error_code }, context);
  };
  window.addEventListener('error', event => record('window_error', event.error));
  window.addEventListener('unhandledrejection', event => record('unhandled_rejection', event.reason));
}
