import { lazy, useContext, type ComponentType } from 'react';
import { FeatureLoadAttemptContext } from './feature-load-attempt';

/** Keep the initial lazy type stable; replace it only for a boundary retry. */
export function retryableLazy<Props extends object>(
  load: () => Promise<{ default: ComponentType<Props> }>,
) {
  const InitialComponent = lazy(load);
  // Suspense discards hook caches on an initial suspended mount. Cache by the
  // boundary's retry token so every render of that attempt uses the same type.
  const retries = new WeakMap<object, typeof InitialComponent>();

  return function RetryableLazy(props: Props) {
    const attempt = useContext(FeatureLoadAttemptContext);
    let LazyComponent = InitialComponent;
    if (attempt !== null) {
      const cached = retries.get(attempt);
      LazyComponent = cached ?? lazy(load);
      if (!cached) retries.set(attempt, LazyComponent);
    }
    return <LazyComponent {...props} />;
  };
}
