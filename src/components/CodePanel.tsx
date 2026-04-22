import { useEffect, useRef } from 'react';
import MiniWaveform from './MiniWaveform';
import { PlayIcon, StopIcon } from './icons';

interface CodePanelProps {
  error: string | null;
  isPlaying: boolean;
  engineReady: boolean;
  onMount: (el: HTMLDivElement) => void;
  onPlay: () => void;
  onStop: () => void;
}

export default function CodePanel({
  error,
  isPlaying,
  engineReady,
  onMount,
  onPlay,
  onStop,
}: CodePanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      onMount(containerRef.current);
    }
  // onMount is stable (useCallback), so this fires only once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePlayClick = () => {
    if (isPlaying) {
      onStop();
    } else if (engineReady) {
      onPlay();
    }
  };

  return (
    <div className="h-full flex flex-col border border-border rounded-lg overflow-hidden bg-bg-secondary/30">
      {/* StrudelMirror mounts here — it renders the CodeMirror editor,
          ._scope() canvas, and ._pianoroll() canvas natively.
          *:h-full is required so .cm-editor fills the container height
          (matches strudellm's container approach). */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 flex flex-col justify-stretch items-stretch overflow-hidden *:h-full"
      />

      {error && (
        <div className="mx-3 mb-2 p-2.5 bg-error/10 border border-error/30 rounded-md text-error text-xs font-mono shrink-0">
          {error}
        </div>
      )}

      {/* Play / waveform footer */}
      <div className="shrink-0 flex items-center gap-3 px-3 py-2 border-t border-border/40 bg-bg-secondary/60">
        <button
          onClick={handlePlayClick}
          disabled={!engineReady && !isPlaying}
          className={`w-9 h-9 rounded-md flex items-center justify-center shrink-0 transition-colors ${
            isPlaying
              ? 'bg-error/20 text-error hover:bg-error/30'
              : 'bg-error/15 text-error hover:bg-error/25 disabled:opacity-30 disabled:cursor-not-allowed'
          }`}
          title={isPlaying ? '停止' : '播放'}
        >
          {isPlaying ? <StopIcon size={14} /> : <PlayIcon size={14} />}
        </button>
        <div className="flex-1 min-w-0">
          <MiniWaveform isPlaying={isPlaying} />
        </div>
      </div>
    </div>
  );
}
