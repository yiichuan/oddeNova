import { trackTelemetry, type TelemetryEvent, type TelemetryProperties } from './analytics';
import { analyticsContext, type AnalyticsContext } from './analytics-context';

export function emitTelemetry<E extends TelemetryEvent>(event: E, properties: TelemetryProperties<E>, context?: AnalyticsContext): void {
  try {
    trackTelemetry(event, properties, context ?? analyticsContext());
  } catch {
    // Analytics is never part of the success criteria for the product action.
  }
}

const handledErrors = new WeakSet<object>();
export function markTelemetryError(error: unknown): void {
  if (error && typeof error === 'object') handledErrors.add(error);
}

export function hasTelemetryError(error: unknown): boolean {
  return !!error && typeof error === 'object' && handledErrors.has(error);
}
