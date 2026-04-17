interface ControlBarProps {
  isPlaying: boolean;
  canUndo: boolean;
  engineReady: boolean;
  onPlay: () => void;
  onStop: () => void;
  onUndo: () => void;
}

export default function ControlBar({
  isPlaying,
  canUndo,
  engineReady,
  onPlay,
  onStop,
  onUndo,
}: ControlBarProps) {
  return (
    <div className="px-6 py-3 border-t border-border flex items-center justify-between bg-bg-secondary/80 backdrop-blur-sm">
      <div className="flex items-center gap-3">
          <>
            {isPlaying ? (
              <button
                onClick={onStop}
                className="w-10 h-10 rounded-lg bg-error/20 text-error flex items-center justify-center hover:bg-error/30 transition-colors"
                title="停止"
              >
                <StopIcon />
              </button>
            ) : (
              <button
                onClick={onPlay}
                disabled={!engineReady}
                className="w-10 h-10 rounded-lg bg-success/20 text-success flex items-center justify-center hover:bg-success/30 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="播放"
              >
                <PlayIcon />
              </button>
            )}

            <button
              onClick={onUndo}
              disabled={!canUndo}
              className="w-10 h-10 rounded-lg bg-bg-tertiary text-text-secondary flex items-center justify-center hover:bg-border transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title="撤销 (Ctrl+Z)"
            >
              <UndoIcon />
            </button>

            <div className="h-6 w-px bg-border mx-1" />

            <div className="text-xs text-text-muted space-y-0.5">
              <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${isPlaying ? 'bg-success animate-pulse' : 'bg-text-muted'}`} />
                {isPlaying ? '播放中' : '已停止'}
              </div>
            </div>
          </>
      </div>

      <div className="flex items-center gap-4 text-xs text-text-muted">
        <span>Powered by Strudel + GPT</span>
        <span className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${engineReady ? 'bg-success' : 'bg-text-muted'}`} />
          {engineReady ? '引擎就绪' : '未初始化'}
        </span>
      </div>
    </div>
  );
}

function PlayIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
    </svg>
  );
}
