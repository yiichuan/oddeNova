import { analyticsContext, analyticsError } from '../../lib/analytics-context';
import { emitTelemetry, markTelemetryError } from '../../lib/telemetry';
import { lazy, useContext, type ComponentType } from 'react';
import { FeatureLoadAttemptContext } from './feature-load-attempt';

/** Keep the initial lazy type stable; replace it only for a boundary retry. */
export function retryableLazy<Props extends object>(
  load: () => Promise<{ default: ComponentType<Props> }>,
  feature = 'lazy_module',
) {
  const loadAttempt = async (source: 'initial' | 'retry') => {
    const context = analyticsContext();
    const started = performance.now();
    try {
      const value = await load();
      if (source === 'retry') emitTelemetry('feature_load_finished', {
        feature, source, outcome: 'success', duration_ms: Math.round(performance.now() - started),
      }, context);
      return value;
    } catch (error) {
      markTelemetryError(error);
      emitTelemetry('feature_load_finished', {
        feature, source, outcome: 'failed', duration_ms: Math.round(performance.now() - started), ...analyticsError(error),
      }, context);
      throw error;
    }
  };
  const InitialComponent = lazy(() => loadAttempt('initial'));
  // Suspense discards hook caches on an initial suspended mount. Cache by the
  // boundary's retry token so every render of that attempt uses the same type.
  const retries = new WeakMap<object, typeof InitialComponent>();

  return function RetryableLazy(props: Props) {
    const attempt = useContext(FeatureLoadAttemptContext);
    let LazyComponent = InitialComponent;
    if (attempt !== null) {
      const cached = retries.get(attempt);
      LazyComponent = cached ?? lazy(() => loadAttempt('retry'));
      if (!cached) retries.set(attempt, LazyComponent);
    }
    return <LazyComponent {...props} />;
  };
}
