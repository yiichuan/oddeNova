import { useCallback, useEffect, useRef, useState } from 'react';
import type { FeaturedPiece } from '../lib/featured-pieces';

/**
 * Auditioning a featured piece.
 *
 * The Featured page drives a transport of its own (`featuredPlayer`), so this
 * is now only bookkeeping: which piece is sounding, and which one is holding a
 * playhead. Nothing is borrowed and nothing has to be given back — the studio's
 * editor, session and tempo are not on the other end of this any more.
 *
 * The one thing it cannot decide for itself is silence: only one transport
 * sounds at a time, so pressing play in the studio stops the audition from
 * underneath this hook. That is what the subscription is for.
 */

/** The slice of the transport an audition needs. Kept small so it can be faked. */
export interface PreviewPlayer {
  /** Resolves false when the engine refuses, e.g. before it has started up. */
  play: (code: string) => Promise<boolean>;
  /** Silence, keeping the playhead: playing the same piece picks it up again. */
  pause: () => void;
  /** Silence, and rewind. */
  stop: () => void;
  onStateChange: (callback: (state: { isPlaying: boolean; isPaused: boolean }) => void) => () => void;
}

export interface FeaturedPreview {
  /** The piece currently sounding, or null. */
  playingId: string | null;
  /**
   * The piece stopped mid-play and still holding its position, or null. It is
   * never the same piece as `playingId`: a piece is sounding or waiting.
   */
  pausedId: string | null;
  play: (piece: FeaturedPiece) => Promise<void>;
  stop: () => void;
  pause: () => void;
}

export function useFeaturedPreview(player: PreviewPlayer): FeaturedPreview {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [pausedId, setPausedId] = useState<string | null>(null);
  // The callbacks below outlive any one render, and the player is a singleton
  // rebuilt by nobody; reading it from a ref keeps them stable without going stale.
  const playerRef = useRef(player);
  useEffect(() => {
    playerRef.current = player;
  });
  /** True across a play() call, when the transport's own state is mid-flight. */
  const startingRef = useRef(false);

  // Silence that this hook did not ask for — the studio taking the floor, or an
  // evaluation that failed. Ignored while a play is in flight, where the
  // transport passes through "not started yet" on its way up.
  useEffect(() => player.onStateChange((state) => {
    if (startingRef.current || state.isPlaying) return;
    setPlayingId(null);
    if (!state.isPaused) setPausedId(null);
  }), [player]);

  const play = useCallback(async (piece: FeaturedPiece) => {
    setPlayingId(piece.id);
    setPausedId(null);
    startingRef.current = true;

    try {
      const started = await playerRef.current.play(piece.code);
      // The engine turns playback down while it is still coming up. Without
      // this the list would keep claiming a piece is sounding in silence.
      if (!started) setPlayingId((sounding) => (sounding === piece.id ? null : sounding));
    } finally {
      startingRef.current = false;
    }
  }, []);

  const stop = useCallback(() => {
    playerRef.current.stop();
    setPlayingId(null);
    setPausedId(null);
  }, []);

  const pause = useCallback(() => {
    if (playingId === null) return;
    playerRef.current.pause();
    setPausedId(playingId);
    setPlayingId(null);
  }, [playingId]);

  return { playingId, pausedId, play, stop, pause };
}
