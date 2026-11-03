import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { LoaderCircle, Pause, Play, RotateCcw } from 'lucide-react';
import { t } from '../../lib/i18n';

export interface HummingAudioPlayerProps {
  src?: string | null;
  durationSeconds: number;
  label?: string;
  disabled?: boolean;
  loading?: boolean;
}

function formatTime(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${minutes}:${remainder.toString().padStart(2, '0')}`;
}

interface PlaybackState {
  source: string | null | undefined;
  currentTime: number;
  mediaDuration: number;
  metadataReady: boolean;
  isPlaying: boolean;
  isPending: boolean;
  playbackError: boolean;
}

function initialPlaybackState(source: string | null | undefined): PlaybackState {
  return {
    source,
    currentTime: 0,
    mediaDuration: Number.NaN,
    metadataReady: false,
    isPlaying: false,
    isPending: false,
    playbackError: false,
  };
}

export default function HummingAudioPlayer({
  src,
  durationSeconds,
  label,
  disabled = false,
  loading = false,
}: HummingAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const instanceId = useId();
  const [playback, setPlayback] = useState(() => initialPlaybackState(src));
  const sourcePlayback = playback.source === src ? playback : initialPlaybackState(src);
  const { currentTime, mediaDuration, metadataReady, isPlaying, isPending, playbackError } = sourcePlayback;
  const updatePlayback = useCallback((patch: Partial<PlaybackState>) => {
    setPlayback((current) => ({
      ...(current.source === src ? current : initialPlaybackState(src)),
      ...patch,
    }));
  }, [src]);
  const effectiveDuration = Number.isFinite(mediaDuration) && mediaDuration > 0
    ? mediaDuration
    : durationSeconds;
  const safeDuration = Number.isFinite(effectiveDuration) && effectiveDuration > 0
    ? effectiveDuration
    : 0;
  const displayedTime = Math.min(safeDuration, Math.max(0, currentTime));
  const progress = safeDuration > 0 ? displayedTime / safeDuration : 0;
  const unavailable = disabled || loading || !src;
  const safeDurationRef = useRef(safeDuration);

  useEffect(() => {
    safeDurationRef.current = safeDuration;
  }, [safeDuration]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => updatePlayback({ currentTime: Number.isFinite(audio.currentTime) ? audio.currentTime : 0 });
    const updateDuration = () => updatePlayback({ mediaDuration: audio.duration });
    const onPlaying = () => updatePlayback({ isPlaying: true, isPending: false });
    const onPause = () => updatePlayback({ isPlaying: false, isPending: false });
    const onEnded = () => updatePlayback({
      isPlaying: false,
      isPending: false,
      currentTime: safeDurationRef.current,
    });
    const onError = () => updatePlayback({ isPlaying: false, isPending: false, playbackError: true });
    const onOtherPreviewStarted = (event: Event) => {
      const detail = (event as CustomEvent<{ instanceId?: string }>).detail;
      if (detail?.instanceId !== instanceId) audio.pause();
    };

    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('durationchange', updateDuration);
    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    window.addEventListener('humming-preview-play', onOtherPreviewStarted);
    audio.pause();
    if (src) {
      try {
        audio.load();
      } catch {
        // The browser loads the new src attribute even if explicit load() is unavailable.
      }
    }
    return () => {
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('durationchange', updateDuration);
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      window.removeEventListener('humming-preview-play', onOtherPreviewStarted);
      audio.pause();
    };
  }, [instanceId, src, updatePlayback]);

  useEffect(() => {
    if (disabled || loading) audioRef.current?.pause();
  }, [disabled, loading]);

  const playFromUserAction = async (reload: boolean) => {
    const audio = audioRef.current;
    if (!audio || unavailable || isPending) return;

    if (reload) {
      try {
        audio.load();
      } catch {
        // play() below reports whether the browser can recover.
      }
      updatePlayback({ currentTime: 0 });
      try { audio.currentTime = 0; } catch { /* Metadata may not be ready yet. */ }
    } else if (audio.ended || (safeDuration > 0 && audio.currentTime >= safeDuration)) {
      updatePlayback({ currentTime: 0 });
      try { audio.currentTime = 0; } catch { /* Metadata may not be ready yet. */ }
    }

    updatePlayback({ playbackError: false, isPending: true });
    window.dispatchEvent(new CustomEvent('humming-preview-play', { detail: { instanceId } }));
    try {
      await audio.play();
      updatePlayback({ isPending: false });
    } catch {
      updatePlayback({ isPending: false, isPlaying: false, playbackError: true });
    }
  };

  const seekTo = (value: number) => {
    if (unavailable || !metadataReady || safeDuration <= 0) return;
    const next = Math.min(safeDuration, Math.max(0, value));
    updatePlayback({ currentTime: next });
    try {
      if (audioRef.current) audioRef.current.currentTime = next;
    } catch {
      // Keep the last valid position if the browser rejects a seek.
    }
  };

  return (
    <div className="humming-audio-player flex min-w-0 items-center gap-2" data-humming-audio-player>
      <audio
        ref={audioRef}
        src={src ?? undefined}
        preload="metadata"
        className="hidden"
        aria-hidden="true"
        onLoadedMetadata={() => updatePlayback({ metadataReady: true })}
      />
      <button
        type="button"
        onClick={() => {
          if (isPlaying) audioRef.current?.pause();
          else void playFromUserAction(false);
        }}
        disabled={unavailable || isPending}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
        aria-label={t(isPlaying ? 'pause' : 'play')}
        data-chat-input-focus-ignore
      >
        <span className="grid h-10 w-10 place-items-center rounded-full bg-bg-primary text-text-primary">
          {loading
            ? <LoaderCircle className="animate-spin motion-reduce:animate-none" size={16} />
            : isPending
              ? <LoaderCircle className="animate-spin motion-reduce:animate-none" size={16} />
              : isPlaying
                ? <Pause size={17} fill="currentColor" />
                : <Play size={17} fill="currentColor" />}
        </span>
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center justify-between gap-2">
          {label && <span className="truncate text-[11px] text-text-secondary">{label}</span>}
          {!label && <span className="sr-only">{t('hummingPreview')}</span>}
          <span className="shrink-0 tabular-nums text-[11px] text-text-muted">
            {formatTime(displayedTime)} / {formatTime(safeDuration)}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={safeDuration || 0}
          step={0.01}
          value={displayedTime}
          disabled={unavailable || !metadataReady || safeDuration <= 0}
          onChange={(event) => seekTo(Number(event.currentTarget.value))}
          className="humming-audio-player-range block h-6 w-full min-w-0 cursor-pointer disabled:cursor-not-allowed"
          style={{ '--humming-progress': `${progress * 100}%` } as CSSProperties}
          aria-label={t('hummingPlaybackProgress')}
          aria-valuetext={`${formatTime(displayedTime)} / ${formatTime(safeDuration)}`}
          data-chat-input-focus-ignore
        />
        {playbackError && (
          <div className="flex items-center justify-between gap-2 text-[11px] text-error" role="alert">
            <span>{t('hummingPlaybackError')}</span>
            <button
              type="button"
              onClick={() => { void playFromUserAction(true); }}
              disabled={unavailable || isPending}
              className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded px-1 text-text-secondary hover:text-text-primary disabled:opacity-50"
              aria-label={t('hummingRetryPlayback')}
              data-chat-input-focus-ignore
            >
              <RotateCcw size={12} />
              {t('hummingRetryPlayback')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
