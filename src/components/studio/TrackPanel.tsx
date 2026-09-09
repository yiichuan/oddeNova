import { useEffect, useMemo, useState } from 'react';
import { t } from '../../lib/i18n';
import type { PreviewTrack, TrackEvent, TrackFrame } from '../../services/track-preview';

interface TrackPanelProps {
  tracks: PreviewTrack[];
  soloId: string | null;
  toggleSolo: (id: string) => void;
  getFrame: () => TrackFrame;
  isPlaying: boolean;
  isPaused: boolean;
  active: boolean;
  refreshRevision?: number;
}
const EMPTY_FRAME: TrackFrame = { now: 0, begin: -2, end: 2, events: [] };
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
function noteY(event: TrackEvent): number {
  if (event.pitch !== null) return 8 + (1 - clamp((event.pitch - 24) / 72, 0, 1)) * 48;
  // Percussion sounds get stable lanes even as notes enter/leave the viewport.
  let hash = 0;
  for (const char of event.sound) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return 10 + hash % 5 * 10;
}

export default function TrackPanel({ tracks, soloId, toggleSolo, getFrame, isPlaying, isPaused, active, refreshRevision = 0 }: TrackPanelProps) {
  const [frame, setFrame] = useState(EMPTY_FRAME);
  useEffect(() => {
    if (!active || !tracks.length) return;
    let request = 0;
    let last = -Infinity;
    const draw = (time: number) => {
      if (document.visibilityState === 'hidden') return;
      if (time - last >= 32) { setFrame(getFrame()); last = time; }
      if (isPlaying) request = requestAnimationFrame(draw);
    };
    const resume = () => {
      cancelAnimationFrame(request);
      if (document.visibilityState !== 'hidden') { last = -Infinity; request = requestAnimationFrame(draw); }
    };
    resume();
    document.addEventListener('visibilitychange', resume);
    return () => { cancelAnimationFrame(request); document.removeEventListener('visibilitychange', resume); };
  }, [active, tracks, getFrame, isPlaying, isPaused, refreshRevision]);

  const grouped = useMemo(() => {
    const result = new Map<string, TrackEvent[]>();
    for (const event of frame.events) {
      const bucket = result.get(event.trackId) ?? [];
      bucket.push(event); result.set(event.trackId, bucket);
    }
    return result;
  }, [frame]);
  const ticks: number[] = [];
  for (let cycle = Math.max(0, Math.ceil(frame.begin)); cycle < frame.end; cycle++) ticks.push(cycle);
  const position = (cycle: number) => (cycle - frame.begin) / (frame.end - frame.begin) * 100;

  if (!tracks.length) return <div className="flex h-full min-h-24 items-center justify-center px-6 text-center text-sm text-text-secondary">{t('tracksUnsupported')}</div>;

  return (
    <div className="h-full overflow-y-auto overscroll-contain bg-bg-primary" aria-label={t('tracksView')}>
      <div className="sticky top-0 z-10 grid grid-cols-[6.5rem_minmax(0,1fr)] border-b border-border bg-bg-primary px-3 pt-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
        <span className="pb-2 text-[11px] text-text-secondary">{t('tracksCycle')}</span>
        <div className="relative mr-2 h-6 overflow-hidden text-[11px] tabular-nums text-text-secondary">
          {ticks.map(cycle => <span key={cycle} className="absolute" style={{ left: `${position(cycle)}%` }}>{cycle + 1}</span>)}
        </div>
      </div>
      {tracks.map(track => {
        const muted = soloId !== null && soloId !== track.id;
        const selected = soloId === track.id;
        const events = grouped.get(track.id) ?? [];
        return (
          <div key={track.id} data-track-id={track.id} data-muted={muted} className="grid grid-cols-[6.5rem_minmax(0,1fr)] border-b border-border px-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
            <div className="flex min-w-0 flex-col items-start justify-center gap-1.5 py-3 pr-3">
              <span className={`w-full truncate text-xs ${muted ? 'text-text-secondary' : 'text-text-primary'}`} title={track.name}>{track.name}</span>
              <button type="button" aria-label={`${t('trackSolo')} ${track.name}`} aria-pressed={selected} onClick={() => toggleSolo(track.id)}
                className={`min-h-8 min-w-12 cursor-pointer rounded-[4px] border px-2 py-1 text-[11px] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [@media(pointer:coarse)]:min-h-11 ${selected ? 'border-accent bg-accent text-on-accent' : 'border-border text-text-secondary hover:bg-surface-hover hover:text-text-primary'}`}>Solo</button>
            </div>
            <div className="relative mr-2 min-h-20 min-w-0 overflow-hidden">
              {ticks.map(cycle => <div key={cycle} className="pointer-events-none absolute inset-y-0 w-px bg-border" style={{ left: `${position(cycle)}%` }} />)}
              <svg viewBox="0 0 100 72" preserveAspectRatio="none" className={`absolute inset-0 block h-full w-full text-accent ${muted ? 'opacity-20' : ''}`} role="img" aria-label={`${track.name} · ${t('trackNotes')}`}>
                {events.map((event, index) => {
                  const x = clamp(position(event.begin), 0, 100);
                  const end = clamp(position(event.end), 0, 100);
                  const sounding = (isPlaying || isPaused) && !muted && event.begin <= frame.now && event.end > frame.now;
                  return <rect key={index} data-track-note data-sounding={sounding} x={x} y={noteY(event)} width={Math.max(.35, end - x)} height={sounding ? 6 : 4.5} rx=".35" fill="currentColor" opacity={sounding ? 1 : .5} />;
                })}
              </svg>
              <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px bg-text-primary/70" />
            </div>
          </div>
        );
      })}
    </div>
  );
}
