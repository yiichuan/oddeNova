import { analyticsContext, analyticsError, analyticsId, type AnalyticsContext } from './analytics-context';
import { emitTelemetry, markTelemetryError } from './telemetry';

export type PlaybackSource = 'agent' | 'manual' | 'history' | 'onboarding' | 'featured' | 'favorite' | 'shared';
type EndReason = 'stopped' | 'paused' | 'replaced' | 'runtime_error' | 'page_left' | 'startup_failed';
type Playback = {
  operation_id: string;
  source: PlaybackSource;
  context: AnalyticsContext;
  requested: number;
  started?: number;
  visibleSince?: number;
  foreground: number;
};

export class PlaybackTelemetry {
  private current?: Playback;

  request(source: PlaybackSource, context = analyticsContext()): Playback | undefined {
    this.finish('replaced');
    const operation_id = analyticsId();
    if (!operation_id) return;
    const playback = { operation_id, source, context, requested: performance.now(), foreground: 0 };
    this.current = playback;
    emitTelemetry('playback_requested', { operation_id, source }, context);
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.visibility);
      window.addEventListener('pagehide', this.pageLeft);
    }
    return playback;
  }

  private visibility = () => {
    const playback = this.current;
    if (!playback || playback.started === undefined) return;
    const now = performance.now();
    if (playback.visibleSince !== undefined) playback.foreground += now - playback.visibleSince;
    playback.visibleSince = document.visibilityState === 'visible' ? now : undefined;
  };

  private pageLeft = () => this.finish('page_left');

  start(playback: Playback | undefined): void {
    if (!playback || playback !== this.current || playback.started !== undefined) return;
    const { operation_id, source, context, requested } = playback;
    playback.started = performance.now();
    if (typeof document !== 'undefined') this.visibility();
    emitTelemetry('playback_started', { operation_id, source, duration_ms: Math.round(playback.started - requested) }, context);
  }

  observe(previous: { isPlaying: boolean; error: string | null }, next: { isPlaying: boolean; error: string | null }): void {
    if (this.current?.started === undefined) return;
    if (next.error && next.error !== previous.error) this.finish('runtime_error');
    else if (previous.isPlaying && !next.isPlaying) this.finish('stopped');
  }

  finish(reason: EndReason, playback = this.current, error?: unknown, errorCode?: string): void {
    if (!playback || playback !== this.current) return;
    this.current = undefined;
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.visibility);
      window.removeEventListener('pagehide', this.pageLeft);
    }
    const { operation_id, source, context, started, requested, visibleSince, foreground } = playback;
    const now = performance.now();
    const failed = reason === 'startup_failed' || reason === 'runtime_error';
    if (error) markTelemetryError(error);
    emitTelemetry('playback_finished', {
      operation_id, source, end_reason: reason,
      outcome: failed ? 'failed' : started === undefined ? 'cancelled' : 'completed',
      duration_ms: Math.round(now - (started ?? requested)),
      foreground_ms: Math.round(foreground + (visibleSince === undefined ? 0 : now - visibleSince)),
      ...(failed ? {
        failure_stage: started === undefined ? 'startup' : 'runtime',
        error_code: errorCode ?? analyticsError(error).error_code,
      } : {}),
    }, context);
  }
}
