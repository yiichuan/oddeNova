import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useStrudelTracks, useTransportEvent } from '../../hooks/useStrudel';
import { t } from '../../lib/i18n';
import type { PlaybackTimeline } from '../../lib/strudel-timing';
import TrackPanel from './TrackPanel';
import VizPlaceholder from './VizPlaceholder';

export type TrackRevealTiming = 'immediate' | 'deferred';

interface StudioVisualizerProps {
  isPlaying: boolean;
  isPaused: boolean;
  visible: boolean;
  animationEnabled: boolean;
  scopeKey: string;
  hasCode: boolean;
  engineReady: boolean;
  /** Engine ready and no export or other audio takeover in progress. */
  seekEnabled?: boolean;
  /** The shared playback timeline (loop length, duration, tempo) for the track view. */
  playbackTimeline?: PlaybackTimeline;
  /**
   * Prepares the code editor for a track navigation and says whether it is
   * already visible ('immediate') or needs a frame to lay out ('deferred').
   */
  onTrackReveal?: (trackId: string) => TrackRevealTiming;
  /**
   * Whether the current app mode allows renaming (agent idle, not replaying,
   * not in video mode, a session is open). The service re-checks everything
   * it owns on its own; this only gates the entry point.
   */
  renameEnabled?: boolean;
}

export default function StudioVisualizer({
  isPlaying, isPaused, visible, animationEnabled, scopeKey, hasCode, engineReady,
  seekEnabled = true, playbackTimeline, onTrackReveal, renameEnabled = true,
}: StudioVisualizerProps) {
  const [view, setView] = useState<'animation' | 'tracks'>('animation');
  const [codeHint, setCodeHint] = useState<string | null>(null);
  const id = useId();
  const {
    tracks,
    soloId,
    mutedIds,
    status,
    revision,
    getFrame,
    prepareTrackPreview,
    toggleSolo,
    toggleMute,
    clearMix,
    seekToCycle,
    revealTrackSource,
    renameTrack,
  } = useStrudelTracks(scopeKey);
  const transport = useTransportEvent();
  const showTracks = view === 'tracks' || !animationEnabled;
  const choices = animationEnabled ? ['animation', 'tracks'] as const : ['tracks'] as const;

  useEffect(() => {
    if (!visible || !showTracks || !hasCode || !engineReady || status !== 'idle') return;
    void prepareTrackPreview()
      .catch(() => {});
  }, [engineReady, hasCode, prepareTrackPreview, showTracks, status, visible]);

  // Mobile has to swap panes first, so the reveal waits for the layout — and
  // gives up if the session or the compile moved meanwhile.
  const scopeRef = useRef({ scopeKey });
  useEffect(() => {
    scopeRef.current = { scopeKey };
  }, [scopeKey]);
  const pendingRevealRef = useRef(0);
  const handleTrackReveal = useCallback((trackId: string) => {
    const timing = onTrackReveal?.(trackId) ?? 'immediate';
    const attempt = () => {
      const result = revealTrackSource(trackId);
      if (result === 'stale-code') setCodeHint(t('trackCodeStale'));
    };
    if (timing === 'deferred') {
      const requestId = ++pendingRevealRef.current;
      const scope = scopeRef.current.scopeKey;
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (pendingRevealRef.current !== requestId || scopeRef.current.scopeKey !== scope) return;
        attempt();
      }));
    } else {
      attempt();
    }
  }, [onTrackReveal, revealTrackSource]);

  useEffect(() => {
    if (!codeHint) return;
    const timer = window.setTimeout(() => setCodeHint(null), 2500);
    return () => window.clearTimeout(timer);
  }, [codeHint]);

  const trackContent = !hasCode
    ? t('tracksNoCode')
      : status === 'idle'
        ? t('tracksPreparing')
        : null;
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-region border border-border bg-bg-primary">
      <div className="flex min-h-10 shrink-0 flex-wrap items-center justify-between gap-x-3 border-b border-border px-3">
        <div role="tablist" aria-label={t('visualizerView')} className="flex gap-4">
          {choices.map(choice => {
            const selected = (choice === 'tracks') === showTracks;
            return <button key={choice} type="button" id={`${id}-${choice}-tab`} role="tab" aria-selected={selected} aria-controls={`${id}-${choice}`} onClick={() => {
              if (choice === 'animation') clearMix();
              setView(choice);
            }} className={`min-h-10 cursor-pointer border-b-2 px-1 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-accent ${selected ? 'border-accent text-text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'}`}>{t(choice === 'tracks' ? 'tracksView' : 'animationView')}</button>;
          })}
        </div>
      </div>
      {codeHint && (
        <div data-testid="track-code-stale-hint" className="shrink-0 px-3 py-1.5 text-[11px] text-text-secondary" role="status">
          {codeHint}
        </div>
      )}
      {animationEnabled && <div id={`${id}-animation`} role="tabpanel" aria-labelledby={`${id}-animation-tab`} hidden={showTracks} className="min-h-0 flex-1 [&>div]:rounded-none [&>div]:border-0"><VizPlaceholder isPlaying={isPlaying} /></div>}
      <div id={`${id}-tracks`} role="tabpanel" aria-labelledby={`${id}-tracks-tab`} hidden={!showTracks} className="min-h-0 flex-1">
        {trackContent ? <div className="flex h-full items-center justify-center text-sm text-text-secondary">{trackContent}</div> : (
          <TrackPanel
            tracks={tracks}
            soloId={soloId}
            mutedIds={mutedIds}
            toggleSolo={toggleSolo}
            toggleMute={toggleMute}
            getFrame={getFrame}
            refreshRevision={revision}
            transportEvent={transport}
            isPlaying={isPlaying}
            isPaused={isPaused}
            active={visible && showTracks}
            canSeek={engineReady && seekEnabled}
            seekToCycle={seekToCycle}
            onNavigateToTrack={handleTrackReveal}
            canRename={renameEnabled}
            renameTrack={renameTrack}
            timeline={playbackTimeline}
            sessionKey={scopeKey}
          />
        )}
      </div>
    </section>
  );
}
