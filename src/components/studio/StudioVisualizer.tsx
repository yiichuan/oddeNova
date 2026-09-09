import { useEffect, useId, useState } from 'react';
import { useStrudelTracks } from '../../hooks/useStrudel';
import { t } from '../../lib/i18n';
import TrackPanel from './TrackPanel';
import VizPlaceholder from './VizPlaceholder';

interface StudioVisualizerProps {
  isPlaying: boolean;
  isPaused: boolean;
  visible: boolean;
  animationEnabled: boolean;
  scopeKey: string;
  hasCode: boolean;
  engineReady: boolean;
}

export default function StudioVisualizer({ isPlaying, isPaused, visible, animationEnabled, scopeKey, hasCode, engineReady }: StudioVisualizerProps) {
  const [view, setView] = useState<'animation' | 'tracks'>('animation');
  const id = useId();
  const {
    tracks,
    soloId,
    status,
    revision,
    getFrame,
    prepareTrackPreview,
    toggleSolo,
    clearSolo,
  } = useStrudelTracks(scopeKey);
  const showTracks = view === 'tracks' || !animationEnabled;
  const choices = animationEnabled ? ['animation', 'tracks'] as const : ['tracks'] as const;

  useEffect(() => {
    if (!visible || !showTracks || !hasCode || !engineReady || status !== 'idle') return;
    void prepareTrackPreview()
      .catch(() => {});
  }, [engineReady, hasCode, prepareTrackPreview, showTracks, status, visible]);

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
              if (choice === 'animation') clearSolo();
              setView(choice);
            }} className={`min-h-10 cursor-pointer border-b-2 px-1 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-accent ${selected ? 'border-accent text-text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'}`}>{t(choice === 'tracks' ? 'tracksView' : 'animationView')}</button>;
          })}
        </div>
      </div>
      {animationEnabled && <div id={`${id}-animation`} role="tabpanel" aria-labelledby={`${id}-animation-tab`} hidden={showTracks} className="min-h-0 flex-1 [&>div]:rounded-none [&>div]:border-0"><VizPlaceholder isPlaying={isPlaying} /></div>}
      <div id={`${id}-tracks`} role="tabpanel" aria-labelledby={`${id}-tracks-tab`} hidden={!showTracks} className="min-h-0 flex-1">
        {trackContent ? <div className="flex h-full items-center justify-center text-sm text-text-secondary">{trackContent}</div> : <TrackPanel tracks={tracks} soloId={soloId} toggleSolo={toggleSolo} getFrame={getFrame} refreshRevision={revision} isPlaying={isPlaying} isPaused={isPaused} active={visible && showTracks} />}
      </div>
    </section>
  );
}
