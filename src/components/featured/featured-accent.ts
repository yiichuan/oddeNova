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
 * What it takes for a colour to carry the wash: channels far enough apart to
 * read as a hue at all — measured absolutely, so the speckle around black type
 * does not pass as colour — enough of that spread relative to the colour's own
 * brightness, and enough light to show against a near-black page.
 */
const MIN_CHROMA = 28;
const MIN_SATURATION = 0.22;
const MIN_LUMINANCE = 0.1;

/** Hues are gathered this coarsely when hunting for the colour on a dark sleeve. */
const HUE_BINS = 12;

/**
 * A sleeve with no colour on it anywhere is washed in its own light instead:
 * this bright, and covering at least this much of the cover, so the wash comes
 * from something printed on it rather than from one stray highlight.
 */
const MIN_LIGHT_LUMINANCE = 0.35;
const MIN_LIGHT_SHARE = 0.005;

function luminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

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
  return Math.max(0.01, (0.25 + saturation) * (1 - Math.abs(luminance(r, g, b) - 0.55) * 1.2));
}

/** Whether a colour is one the page could actually be washed in. */
function canTint(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b);
  const chroma = max - Math.min(r, g, b);
  // chroma over the floor puts max well above zero, so the division is safe.
  return chroma >= MIN_CHROMA
    && chroma / max >= MIN_SATURATION
    && luminance(r, g, b) >= MIN_LUMINANCE;
}

/** Which twelfth of the colour wheel a colour sits in. Only meaningful for hues. */
function hueBin(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const chroma = max - Math.min(r, g, b);
  const sixth = max === r
    ? ((g - b) / chroma + 6) % 6
    : max === g
      ? (b - r) / chroma + 2
      : (r - g) / chroma + 4;
  return Math.floor(sixth * (HUE_BINS / 6)) % HUE_BINS;
}

type Swatch = { count: number; r: number; g: number; b: number; score: number };

/**
 * The cover reduced to the handful of colours it is made of.
 *
 * Bucketed rather than averaged. An average is the midpoint of everything on
 * the cover, which for any two-tone sleeve is a colour that appears nowhere in
 * it; coarse buckets let near-identical pixels vote together and hand the win
 * to the colour that actually covers the most of it.
 */
function swatches(pixels: Uint8ClampedArray): Swatch[] {
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

  return Array.from(buckets.values(), (bucket) => {
    const r = Math.round(bucket.r / bucket.count);
    const g = Math.round(bucket.g / bucket.count);
    const b = Math.round(bucket.b / bucket.count);
    return { count: bucket.count, r, g, b, score: bucket.count * tintability(r, g, b) };
  });
}

/**
 * The colour of a sleeve that is mostly black or grey — the hue printed on it
 * rather than the ink field it is printed on.
 *
 * Gathered by hue rather than picked as a single swatch, because the thing
 * being looked for is usually small: downscaling smears its edges into the
 * black around it, so its votes arrive split across a dozen darker and lighter
 * shades that would each lose on their own. Binning by hue puts those votes
 * back together.
 *
 * The winning bin is then averaged, which sounds like the mistake this whole
 * module avoids but is not: what an average ruins is a mix of *different*
 * colours, and every shade here is the same one under more or less light.
 * Weighting that average by how washable each shade is settles it nearer the
 * lit lettering than the muddy edge where it runs into the black.
 */
function litColorOnDarkCover(palette: Swatch[]): Swatch | null {
  const hues = new Map<number, { score: number; r: number; g: number; b: number }>();

  for (const swatch of palette) {
    if (!canTint(swatch.r, swatch.g, swatch.b)) continue;
    const bin = hueBin(swatch.r, swatch.g, swatch.b);
    const hue = hues.get(bin) ?? { score: 0, r: 0, g: 0, b: 0 };
    hue.score += swatch.score;
    hue.r += swatch.r * swatch.score;
    hue.g += swatch.g * swatch.score;
    hue.b += swatch.b * swatch.score;
    hues.set(bin, hue);
  }

  let winner: { score: number; r: number; g: number; b: number } | null = null;
  for (const hue of hues.values()) if (!winner || hue.score > winner.score) winner = hue;
  if (!winner) return null;

  return {
    count: 0,
    r: Math.round(winner.r / winner.score),
    g: Math.round(winner.g / winner.score),
    b: Math.round(winner.b / winner.score),
    score: winner.score,
  };
}

/**
 * The light on a sleeve that has no colour on it at all — white lettering on
 * black, a grey photograph.
 *
 * Washing the page in the ink of such a cover washes it in nothing: black over
 * black leaves the page exactly as it was. Its lettering is the only thing on
 * it that is any colour at all, so the page is lit by that instead — a pale
 * wash rather than none. Only a cover that is dark all over, printing included,
 * goes without.
 */
function coverLight(palette: Swatch[]): Swatch | null {
  const samples = palette.reduce((total, swatch) => total + swatch.count, 0);
  let lightest: Swatch | null = null;

  for (const swatch of palette) {
    if (swatch.count < samples * MIN_LIGHT_SHARE) continue;
    if (luminance(swatch.r, swatch.g, swatch.b) < MIN_LIGHT_LUMINANCE) continue;
    if (!lightest || luminance(swatch.r, swatch.g, swatch.b) > luminance(lightest.r, lightest.g, lightest.b)) {
      lightest = swatch;
    }
  }

  return lightest;
}

/**
 * The dominant colour of an RGBA buffer, as an `r, g, b` triple ready to drop
 * into `rgba(…)`. Null when there is nothing opaque to look at.
 *
 * A sleeve that is mostly black or grey gets a second look: the colour covering
 * the most of it is then a colour that is no colour, and washing the page in it
 * leaves the page exactly as black as it started. What the cover is *made* of
 * matters less there than what little colour it has, so the wash is taken from
 * the printing instead of the ink field behind it — its colour if it has one,
 * its light if it has not, and its own grey only when it has neither.
 */
export function dominantColorFromPixels(pixels: Uint8ClampedArray): string | null {
  const palette = swatches(pixels);
  if (palette.length === 0) return null;

  const dominant = palette.reduce((best, swatch) => (swatch.score > best.score ? swatch : best));
  const winner = canTint(dominant.r, dominant.g, dominant.b)
    ? dominant
    : litColorOnDarkCover(palette) ?? coverLight(palette) ?? dominant;

  return `${winner.r}, ${winner.g}, ${winner.b}`;
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
