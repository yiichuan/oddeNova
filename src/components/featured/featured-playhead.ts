/**
 * Where the loop is, kept outside React.
 *
 * The Featured transport is drawn twice — a bar on a display, a pill on a
 * phone — and the two are different trees, so dragging a window across the
 * breakpoint unmounts one and mounts the other. A playhead held in component
 * state dies with that unmount and the record starts reading from zero while it
 * is still audibly halfway through, so the origin lives here instead: one
 * module-level clock the mounted transport reads, running on wall time whether
 * or not anything is on screen to show it.
 *
 * It is an origin rather than a position — the moment playback started and how
 * far in it was then — so nothing has to tick it while it is unwatched.
 */

interface Playhead {
  /** Which record the origin belongs to; another record starts its own. */
  pieceId: string | null;
  /** How far in the record was when the current run began. */
  elapsedSeconds: number;
  /** `performance.now()` at the start of the run, or null while it is held. */
  startedAt: number | null;
}

let playhead: Playhead = { pieceId: null, elapsedSeconds: 0, startedAt: null };

/** Where the playhead stands right now, in seconds, wrapped into the loop. */
function positionSeconds(now: number, totalSeconds: number): number {
  const running = playhead.startedAt === null ? 0 : (now - playhead.startedAt) / 1000;
  const elapsed = playhead.elapsedSeconds + running;
  return totalSeconds > 0 ? elapsed % totalSeconds : 0;
}

/**
 * Brings the clock in line with what the transport is doing.
 *
 * Stopping rewinds the playhead; pausing is the whole point of not doing so,
 * and holds it where the ear left it. Reaching for another record rewinds it
 * too — a skip is a different record played from its own beginning, and the
 * transport never leaves playing while it happens.
 *
 * A run already under way is left alone, which is the whole point: a transport
 * that mounts into a record already playing adopts the origin rather than
 * setting a new one.
 */
export function syncPlayhead(
  pieceId: string | null,
  isPlaying: boolean,
  isPaused: boolean,
  totalSeconds: number,
  now = performance.now(),
): void {
  if (playhead.pieceId !== pieceId) {
    playhead = { pieceId, elapsedSeconds: 0, startedAt: null };
  }
  if (isPlaying && totalSeconds > 0) {
    if (playhead.startedAt === null) playhead.startedAt = now;
    return;
  }
  if (playhead.startedAt !== null) {
    playhead.elapsedSeconds = positionSeconds(now, totalSeconds);
    playhead.startedAt = null;
  }
  if (!isPaused) playhead.elapsedSeconds = 0;
}

/**
 * How far through the loop the record is, 0 to 1.
 *
 * Zero for any record the clock is not on — a transport reading it the frame
 * before its own sync has run is asking about the record it is being pointed
 * at, not the one that was playing.
 */
export function readPlayheadProgress(
  pieceId: string | null,
  totalSeconds: number,
  now = performance.now(),
): number {
  if (pieceId === null || playhead.pieceId !== pieceId || totalSeconds <= 0) return 0;
  return Math.min(1, positionSeconds(now, totalSeconds) / totalSeconds);
}

/**
 * Puts the playhead somewhere else in the loop.
 *
 * The clock's half of a seek: the engine is told separately (see
 * `featuredPlayer.seek`), and this is what keeps the drawn lap in step with what
 * the ear is about to hear — one is the sound, the other is the picture of it,
 * and a seek that moved only the first would be a band that snaps back the next
 * frame.
 *
 * A record the clock is not on adopts it, held rather than running: a lap
 * dragged while nothing is playing is where the next `play` should start from,
 * which is the same thing the player does with a seek made in silence.
 */
export function seekPlayhead(
  pieceId: string | null,
  progress: number,
  totalSeconds: number,
  now = performance.now(),
): void {
  if (pieceId === null || totalSeconds <= 0) return;
  const elapsedSeconds = Math.min(1, Math.max(0, progress)) * totalSeconds;
  if (playhead.pieceId !== pieceId) {
    playhead = { pieceId, elapsedSeconds, startedAt: null };
    return;
  }
  playhead.elapsedSeconds = elapsedSeconds;
  // A run under way keeps running, from here: the origin moves to now so the
  // seconds since it are counted from the place the drag left the head.
  if (playhead.startedAt !== null) playhead.startedAt = now;
}

/** Drops the clock. Test-only — nothing in the app outlives the page. */
export function resetPlayhead(): void {
  playhead = { pieceId: null, elapsedSeconds: 0, startedAt: null };
}
