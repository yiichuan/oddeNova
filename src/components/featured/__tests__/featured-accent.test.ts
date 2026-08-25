import { describe, expect, it } from 'vitest';
import { dominantColorFromPixels } from '../featured-accent';

/** An RGBA buffer built from a list of [colour, how many pixels] runs. */
function pixels(runs: Array<[[number, number, number, number], number]>): Uint8ClampedArray {
  const total = runs.reduce((count, [, length]) => count + length, 0);
  const buffer = new Uint8ClampedArray(total * 4);
  let at = 0;
  for (const [[r, g, b, a], length] of runs) {
    for (let index = 0; index < length; index += 1) {
      buffer.set([r, g, b, a], at);
      at += 4;
    }
  }
  return buffer;
}

const BRAT_GREEN: [number, number, number, number] = [139, 207, 0, 255];
const BLACK: [number, number, number, number] = [8, 8, 8, 255];

describe('dominantColorFromPixels', () => {
  it('returns the colour the cover is mostly made of', () => {
    expect(dominantColorFromPixels(pixels([[BRAT_GREEN, 500], [BLACK, 76]])))
      .toBe('139, 207, 0');
  });

  it('does not blend the sleeve into a colour that is not on it', () => {
    // The average of a green field with black type is a dark olive that appears
    // nowhere on the cover — the reason this counts votes instead of averaging.
    const result = dominantColorFromPixels(pixels([[BRAT_GREEN, 400], [BLACK, 176]]))!;
    const [r, g, b] = result.split(', ').map(Number);
    expect(g).toBeGreaterThan(180);
    expect(r).toBeGreaterThan(100);
    expect(b).toBeLessThan(40);
  });

  it('gathers near-identical shades into one vote', () => {
    // Three JPEG-ish variations of the same green must not split the vote and
    // hand the page to a smaller block of some other colour.
    const nearlyGreen = pixels([
      [[139, 207, 0, 255], 120],
      [[137, 205, 2, 255], 120],
      [[141, 209, 1, 255], 120],
      [[210, 40, 80, 255], 200],
    ]);
    const [r, g, b] = dominantColorFromPixels(nearlyGreen)!.split(', ').map(Number);
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });

  it('prefers a colour that can tint over a larger field of grey', () => {
    // Grey has nothing to give a wash, so covering more of the sleeve is not
    // enough to win on its own.
    expect(dominantColorFromPixels(pixels([[[128, 128, 128, 255], 350], [BRAT_GREEN, 226]])))
      .toBe('139, 207, 0');
  });

  it('takes its colour from the printing when the sleeve is black', () => {
    // A black sleeve with a red title: the colour covering the most of it is a
    // colour that would leave the page as black as it started.
    expect(dominantColorFromPixels(pixels([[BLACK, 540], [[214, 26, 22, 255], 36]])))
      .toBe('214, 26, 22');
  });

  it('puts one hue smeared across many shades back together', () => {
    // Downscaling bleeds the red lettering into the black around it, so its
    // votes arrive split across shades that would each lose to the blue block
    // alone. Gathered by hue they win, and the wash lands on a lit red.
    const smeared = pixels([
      [BLACK, 700],
      [[214, 26, 22, 255], 20],
      [[150, 22, 20, 255], 30],
      [[104, 18, 16, 255], 40],
      [[60, 90, 190, 255], 60],
    ]);
    const [r, g, b] = dominantColorFromPixels(smeared)!.split(', ').map(Number);
    expect(r).toBeGreaterThan(130);
    expect(g).toBeLessThan(40);
    expect(b).toBeLessThan(40);
  });

  it('does not mistake the speckle around black type for colour', () => {
    // Compression noise on a black field has a hue but nothing to give a wash.
    const [r, g, b] = dominantColorFromPixels(
      pixels([[BLACK, 500], [[18, 6, 4, 255], 76]]),
    )!.split(', ').map(Number);
    expect(Math.max(r, g, b)).toBeLessThan(24);
  });

  it('lights a colourless sleeve with its own lettering', () => {
    // Black cover, white type: there is no colour to find, and washing the page
    // in the black it is mostly made of would leave it exactly as it was.
    expect(dominantColorFromPixels(pixels([[BLACK, 560], [[255, 255, 255, 255], 16]])))
      .toBe('255, 255, 255');
  });

  it('does not light a whole page from one stray highlight', () => {
    expect(dominantColorFromPixels(pixels([[BLACK, 574], [[255, 255, 255, 255], 2]])))
      .toBe('8, 8, 8');
  });

  it('settles for grey when the cover has no colour anywhere', () => {
    // Nothing to go looking for on a greyscale sleeve, so the second look finds
    // nothing and the biggest neutral keeps the win.
    expect(dominantColorFromPixels(pixels([[[190, 190, 190, 255], 500], [BLACK, 76]])))
      .toBe('190, 190, 190');
  });

  it('ignores transparent pixels, and gives up when everything is', () => {
    expect(dominantColorFromPixels(pixels([[[0, 0, 0, 0], 400], [BRAT_GREEN, 176]])))
      .toBe('139, 207, 0');
    expect(dominantColorFromPixels(pixels([[[10, 20, 30, 0], 64]]))).toBeNull();
    expect(dominantColorFromPixels(new Uint8ClampedArray(0))).toBeNull();
  });
});
