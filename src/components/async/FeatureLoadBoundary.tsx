import { Component, Suspense, type ReactNode } from 'react';
import { t } from '../../lib/i18n';

interface FeatureLoadBoundaryProps {
  /** Shown while the lazy child is downloading. Sized by the caller's layout. */
  fallback: ReactNode;
  children: ReactNode;
}

interface FeatureLoadBoundaryState {
  /** Bumped on every retry; keys the child so React.lazy drops its cached rejection. */
  attempt: number;
}

/**
 * The lazy shell's own failure line. A rejected `React.lazy` caches that
 * rejection forever — resetting an error boundary alone keeps rendering the
 * same failed component — so a retry bumps a key that re-creates the lazy
 * child, which re-runs the dynamic import.
 */
export class FeatureLoadBoundary extends Component<FeatureLoadBoundaryProps, FeatureLoadBoundaryState> {
  state: FeatureLoadBoundaryState = { attempt: 0 };

  static getDerivedStateFromError(): Partial<FeatureLoadBoundaryState> {
    return { attempt: Number.NaN };
  }

  render() {
    if (Number.isNaN(this.state.attempt)) {
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
        <span key={this.state.attempt} className="contents">
          {this.props.children}
        </span>
      </Suspense>
    );
  }

  private readonly retry = () => {
    this.setState((state) => ({ attempt: state.attempt + 1 }));
  };
}

