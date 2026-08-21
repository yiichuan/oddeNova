/**
 * Which transport is making sound.
 *
 * The studio and the Featured page each drive their own scheduler, and neither
 * knows the other exists — but there is one audio output and one pair of ears,
 * so two schedulers running at once is just noise on top of noise. Whoever
 * starts playing takes the floor, and whoever was holding it is stopped.
 *
 * A module of its own rather than one player calling into the other: no import
 * cycle, and anything else that starts making sound joins by claiming the floor
 * the same way.
 */
export type TransportId = 'studio' | 'featured';

let holder: { id: TransportId; stop: () => void } | null = null;

/**
 * Take the floor for `id`, stopping whatever else held it. `stop` is how the
 * next claimant will silence this one, so it must be safe to call at any time,
 * including when this transport has already stopped on its own.
 */
export function claimTransport(id: TransportId, stop: () => void): void {
  if (holder && holder.id !== id) holder.stop();
  holder = { id, stop };
}

/** Give the floor up, if this transport still holds it. */
export function releaseTransport(id: TransportId): void {
  if (holder?.id === id) holder = null;
}

/** Testing seam — the floor is module state, and a test should start empty. */
export function resetTransportForTests(): void {
  holder = null;
}
