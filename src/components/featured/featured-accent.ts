/**
 * Finding the colour a cover is mostly made of.
 *
 * Split from the component that uses it so the part with the judgement in it —
 * which colour wins — is a pure function over pixels, testable without a canvas.
 */

/**
 * The cover is read at this size rather than full resolution: the browser's own
 * downscale is a cheap box filter over every pixel, so nothing is missed, and
 * 576 samples is plenty to find what a cover is mostly made of.
 */
const SAMPLE_SIZE = 24;

/**
 * How much of the cover a colour covers decides the winner, but not on its own.
 *
 * Grey has nothing to give a tint, and colours at either end of the luminance
 * range disappear against a near-black page at these alphas — so a sleeve that
 * is half black type still glows in its actual colour rather than in the type.
 */
function tintability(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturation = max === 0 ? 0 : (max - min) / max;
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return Math.max(0.01, (0.25 + saturation) * (1 - Math.abs(luminance - 0.55) * 1.2));
}

/**
 * The dominant colour of an RGBA buffer, as an `r, g, b` triple ready to drop
 * into `rgba(…)`. Null when there is nothing opaque to look at.
 *
 * Bucketed rather than averaged. An average is the midpoint of everything on
 * the cover, which for any two-tone sleeve is a colour that appears nowhere in
 * it; coarse buckets let near-identical pixels vote together and hand the win
 * to the colour that actually covers the most of it.
 */
export function dominantColorFromPixels(pixels: Uint8ClampedArray): string | null {
  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();

  for (let index = 0; index + 3 < pixels.length; index += 4) {
    const r = pixels[index];
    const g = pixels[index + 1];
    const b = pixels[index + 2];
    if (pixels[index + 3] < 128) continue;

    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
    bucket.count += 1;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
  }

  let best: { score: number; r: number; g: number; b: number } | null = null;
  for (const bucket of buckets.values()) {
    const r = Math.round(bucket.r / bucket.count);
    const g = Math.round(bucket.g / bucket.count);
    const b = Math.round(bucket.b / bucket.count);
    const score = bucket.count * tintability(r, g, b);
    if (!best || score > best.score) best = { score, r, g, b };
  }

  return best ? `${best.r}, ${best.g}, ${best.b}` : null;
}

/** The same, read off a loaded image. Null if the canvas cannot be read. */
export function readCoverColor(image: HTMLImageElement): string | null {
  const canvas = document.createElement('canvas');
  canvas.width = SAMPLE_SIZE;
  canvas.height = SAMPLE_SIZE;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;

  context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
  try {
    return dominantColorFromPixels(context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data);
  } catch {
    // A cover served from another origin taints the canvas. Nothing to read,
    // and nothing to do about it here — the page simply goes without a glow.
    return null;
  }
}
