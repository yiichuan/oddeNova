import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { ListIcon, SparkleIcon } from '../icons';
import { useStrudelTracks, useTransportEvent } from '../../hooks/useStrudel';
import { t } from '../../lib/i18n';
import type { PlaybackTimeline } from '../../lib/strudel-timing';
import TrackPanel from './TrackPanel';
import VizPlaceholder from './VizPlaceholder';

type StudioView = 'animation' | 'tracks';

const STUDIO_VIEWS: readonly StudioView[] = ['animation', 'tracks'];

interface VisualizerViewSwitchProps {
  activeView: StudioView;
  idPrefix: string;
  onSelect: (view: StudioView) => void;
}

function VisualizerViewSwitch({ activeView, idPrefix, onSelect }: VisualizerViewSwitchProps) {
  const buttonRefs = useRef<Record<StudioView, HTMLButtonElement | null>>({ animation: null, tracks: null });

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const currentIndex = STUDIO_VIEWS.indexOf(activeView);
    let nextView: StudioView | null = null;
    if (event.key === 'ArrowLeft') {
      nextView = STUDIO_VIEWS[(currentIndex - 1 + STUDIO_VIEWS.length) % STUDIO_VIEWS.length];
    } else if (event.key === 'ArrowRight') {
      nextView = STUDIO_VIEWS[(currentIndex + 1) % STUDIO_VIEWS.length];
    } else if (event.key === 'Home') {
      nextView = STUDIO_VIEWS[0];
    } else if (event.key === 'End') {
      nextView = STUDIO_VIEWS[STUDIO_VIEWS.length - 1];
    }
    if (!nextView) return;

    event.preventDefault();
    onSelect(nextView);
    buttonRefs.current[nextView]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={t('visualizerView')}
      aria-orientation="horizontal"
      data-view={activeView}
      className="studio-view-switch"
    >
      <span aria-hidden="true" className="studio-view-switch-indicator" />
      {STUDIO_VIEWS.map(view => {
        const selected = view === activeView;
        const Icon = view === 'animation' ? SparkleIcon : ListIcon;
        const label = t(view === 'animation' ? 'animationView' : 'tracksView');
        return (
          <button
            key={view}
            ref={element => { buttonRefs.current[view] = element; }}
            type="button"
            id={`${idPrefix}-${view}-tab`}
            role="tab"
            aria-label={label}
            aria-selected={selected}
            aria-controls={`${idPrefix}-${view}`}
            tabIndex={selected ? 0 : -1}
            title={label}
            className="studio-view-switch-button"
            onClick={() => onSelect(view)}
            onKeyDown={handleKeyDown}
          >
            <span aria-hidden="true"><Icon size={15} /></span>
          </button>
        );
      })}
    </div>
  );
}

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
  const [view, setView] = useState<StudioView>('animation');
  const [codeHint, setCodeHint] = useState<string | null>(null);
  const id = useId();
  const {
    tracks,
    soloId,
    mutedIds,
    status,
    revision,
    getClock,
    fullScene,
    ensureFullScene,
    prewarmFullScene,
    previewGeneration,
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
  const activeView: StudioView = showTracks ? 'tracks' : 'animation';
  const selectView = useCallback((nextView: StudioView) => {
    if (nextView === 'animation' && !animationEnabled) return;
    if (nextView === activeView) return;
    if (nextView === 'animation') clearMix();
    setView(nextView);
  }, [activeView, animationEnabled, clearMix]);

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
    <section
      className="studio-visualizer relative flex h-full min-h-0 flex-col overflow-hidden rounded-region border border-border bg-bg-primary"
      data-has-view-switch={animationEnabled ? 'true' : undefined}
    >
      {animationEnabled && <VisualizerViewSwitch activeView={activeView} idPrefix={id} onSelect={selectView} />}
      {animationEnabled && <div id={`${id}-animation`} role="tabpanel" aria-labelledby={`${id}-animation-tab`} hidden={showTracks} className="min-h-0 flex-1 [&>div]:rounded-none [&>div]:border-0"><VizPlaceholder isPlaying={isPlaying} /></div>}
      <div
        id={`${id}-tracks`}
        role="tabpanel"
        aria-labelledby={animationEnabled ? `${id}-tracks-tab` : undefined}
        aria-label={!animationEnabled ? t('tracksView') : undefined}
        hidden={!showTracks}
        className="min-h-0 flex-1"
      >
        {trackContent ? <div className="flex h-full items-center justify-center text-sm text-text-secondary">{trackContent}</div> : (
          <TrackPanel
            tracks={tracks}
            soloId={soloId}
            mutedIds={mutedIds}
            toggleSolo={toggleSolo}
            toggleMute={toggleMute}
            getClock={getClock}
            fullScene={fullScene}
            ensureFullScene={ensureFullScene}
            prewarmFullScene={prewarmFullScene}
            previewGeneration={previewGeneration}
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
      {showTracks && codeHint && (
        <div data-testid="track-code-stale-hint" className="shrink-0 px-3 py-1.5 text-[11px] text-text-secondary" role="status">
          {codeHint}
        </div>
      )}
    </section>
  );
}
