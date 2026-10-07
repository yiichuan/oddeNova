import { Component, Suspense, type ReactNode } from 'react';
import { t } from '../../lib/i18n';
import { FeatureLoadAttemptContext } from './feature-load-attempt';

interface FeatureLoadBoundaryProps {
  /** Shown while the lazy child is downloading. Sized by the caller's layout. */
  fallback: ReactNode;
  children: ReactNode;
}

interface FeatureLoadBoundaryState {
  attempt: object | null;
  hasError: boolean;
}

/**
 * Retry clears the error and tells retryableLazy children to create fresh
 * lazy types, since React.lazy caches rejected loads on the type itself.
 */
export class FeatureLoadBoundary extends Component<FeatureLoadBoundaryProps, FeatureLoadBoundaryState> {
  state: FeatureLoadBoundaryState = { attempt: null, hasError: false };

  static getDerivedStateFromError(): Partial<FeatureLoadBoundaryState> {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6">
          <p className="text-sm text-text-secondary">{t('featureLoadFailed')}</p>
          {/* No automatic reload: a stale-deployed chunk can 404 forever, and
              an app-wide reload is what loses the draft. Local retry first. */}
          <button
            type="button"
            onClick={this.retry}
            className="rounded-lg bg-accent px-4 py-2 text-sm text-on-accent transition-colors hover:bg-accent-light"
          >
            {t('featureLoadRetry')}
          </button>
        </div>
      );
    }
    return (
      <Suspense fallback={this.props.fallback}>
        <FeatureLoadAttemptContext value={this.state.attempt}>
          {this.props.children}
        </FeatureLoadAttemptContext>
      </Suspense>
    );
  }

  private readonly retry = () => {
    this.setState({ attempt: {}, hasError: false });
  };
}
