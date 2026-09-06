/**
 * How intense the music *sounds* right now, as one number in 0..1.
 *
 * This is a loudness impression, not a level meter. Two things separate it
 * from a plain RMS reading, and both matter because the number drives
 * something the eye reads as "how hard is this section hitting":
 *
 *   weighting   the ear is far more sensitive around 1-4 kHz than it is at
 *               the bottom of the spectrum, so a bass-only passage should not
 *               read as loud as a full mix at the same electrical level
 *   ballistics  loudness is an impression that builds and decays, so the
 *               follower rises fast and falls slowly — a hit registers
 *               immediately, and the impression of a busy passage survives
 *               the gaps between its hits
 *
 * The input is FFT *byte* data, which is already on a dB scale — the
 * perceptual axis — rather than linear amplitude. That is why plain averaging
 * of the bins below is defensible: the log has been taken for us.
 */

/** One FFT frame taken off the end of the audio chain. */
export interface AudioSpectrum {
  /** `getByteFrequencyData` output: one 0..255 byte per bin, on a dB scale. */
  bins: Uint8Array;
  /** The top of the range those bins span — the context's sample rate halved. */
  nyquistHz: number;
}

/**
 * Rough inverse of an equal-loudness contour: what share of the impression
 * each part of the spectrum carries. Sub-bass is discounted because it is felt
 * more than heard, and the top octave because very little musical energy lives
 * there. The weights sum to 1, so a spectrum pinned at 255 everywhere reads
 * as exactly 1 before the trim below.
 */
const LOUDNESS_BANDS = [
  { fromHz: 20, toHz: 120, weight: 0.14 },
  { fromHz: 120, toHz: 500, weight: 0.22 },
  { fromHz: 500, toHz: 2000, weight: 0.28 },
  { fromHz: 2000, toHz: 6000, weight: 0.24 },
  { fromHz: 6000, toHz: 16000, weight: 0.12 },
] as const;

/**
 * The weighted reading that counts as "as quiet as it gets" and "as loud as it
 * gets", before the result is stretched across 0..1.
 *
 * Without this the usable range would be squeezed into the middle of the
 * scale: real music never pins every band, so an untrimmed reading would sit
 * around a half whether the piece was sparse or dense, and the effect this
 * drives would never reach either end. These two numbers and the analyser's dB
 * window in `strudel.ts` are the tuning knobs — widen them if the response
 * saturates, narrow them if it never opens up.
 */
const QUIET_FLOOR = 0.15;
const LOUD_CEILING = 0.7;

/** Time constants for the follower, in ms. Fast up, slow down. */
const ATTACK_MS = 120;
const RELEASE_MS = 700;

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

/**
 * The loudness impression carried by a single FFT frame, 0..1.
 *
 * Pure and instantaneous — it knows nothing about what came before, which is
 * what `followIntensity` is for. A silent frame is 0; anything at or above the
 * ceiling is 1.
 */
export function perceivedIntensity(spectrum: AudioSpectrum): number {
  const { bins, nyquistHz } = spectrum;
  if (bins.length === 0 || !(nyquistHz > 0)) return 0;

  const binHz = nyquistHz / bins.length;
  let weighted = 0;

  for (const band of LOUDNESS_BANDS) {
    const from = Math.min(bins.length - 1, Math.floor(band.fromHz / binHz));
    const to = Math.min(bins.length, Math.ceil(band.toHz / binHz));
    if (to <= from) continue;

    let total = 0;
    for (let index = from; index < to; index += 1) total += bins[index];
    weighted += band.weight * (total / ((to - from) * 255));
  }

  return clamp01((weighted - QUIET_FLOOR) / (LOUD_CEILING - QUIET_FLOOR));
}

/**
 * Moves `current` toward `target` over `elapsedMs`, quickly on the way up and
 * slowly on the way down.
 *
 * Exponential rather than a fixed step per frame, so the curve is the same
 * whether it is driven at 30fps or 120 — a follower written as
 * `current += (target - current) * 0.2` silently changes its own ballistics
 * with the frame rate.
 */
export function followIntensity(current: number, target: number, elapsedMs: number): number {
  if (!(elapsedMs > 0)) return current;
  const timeConstant = target > current ? ATTACK_MS : RELEASE_MS;
  return current + (target - current) * (1 - Math.exp(-elapsedMs / timeConstant));
}
