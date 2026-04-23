import { useEffect, useRef, useState } from 'react';
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
  const [gutterWidth, setGutterWidth] = useState(0);

  useEffect(() => {
    if (containerRef.current) {
      onMount(containerRef.current);
    }
  // onMount is stable (useCallback), so this fires only once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track .cm-gutters width so the footer divider aligns with the editor's gutter border
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let ro: ResizeObserver | null = null;

    const mo = new MutationObserver(() => {
      const gutters = container.querySelector('.cm-gutters') as HTMLElement | null;
      if (!gutters) return;
      mo.disconnect();
      setGutterWidth(gutters.offsetWidth);
      ro = new ResizeObserver(() => setGutterWidth(gutters.offsetWidth));
      ro.observe(gutters);
    });

    mo.observe(container, { childList: true, subtree: true });

    return () => {
      mo.disconnect();
      ro?.disconnect();
    };
  }, []);

  const handlePlayClick = () => {
    if (isPlaying) {
      onStop();
    } else if (engineReady) {
      onPlay();
    }
  };

  return (
    <div className="h-full flex flex-col border border-border overflow-hidden bg-bg-secondary/30">
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

      {/* Play button footer — black background, divider aligned with editor gutter */}
      <div className="shrink-0 flex items-stretch border-t" style={{ background: '#000', borderColor: '#323232' }}>
        {/* Left section: same width as .cm-gutters, contains play button, right border = divider */}
        <div
          className="flex items-center justify-center py-[6px]"
          style={{
            width: gutterWidth || undefined,
            minWidth: gutterWidth || undefined,
            borderRight: gutterWidth ? '1px solid #323232' : undefined,
          }}
        >
          <button
            onClick={handlePlayClick}
            disabled={!engineReady && !isPlaying}
            className={`flex items-center justify-center transition-opacity text-error ${
              isPlaying ? 'hover:opacity-70' : 'hover:opacity-70 disabled:opacity-30 disabled:cursor-not-allowed'
            }`}
            title={isPlaying ? '停止' : '播放'}
          >
            {isPlaying ? <StopIcon size={52} /> : <PlayIcon size={52} />}
          </button>
        </div>

        {/* Right spacer */}
        <div className="flex-1" />
      </div>
    </div>
  );
}
