import { ASCII_GALAXY_FRAME as FRAME } from '../../components/settings/ascii-galaxy-frame';

/**
 * The receipt's closing picture: one frame of the code panel's ASCII galaxy,
 * captured from the animation itself (see `npm run previews:animation`) and
 * scaled to the paper as a screenshot of the pane. The pane's camera already
 * looks down on the disk about 30° off face-on, so the frame is used as is,
 * cropped to its middle band so the picture closes the card without
 * outgrowing it. The camera aims at the core, so the core stays at the
 * band's mid-height.
 */

const FRAME_WIDTH = FRAME.columns * FRAME.cellWidth;
// Share of the frame's height kept, centred on the core.
const CROP = 0.7;
const CROP_HEIGHT = FRAME.rows * FRAME.cellHeight * CROP;
const CROP_TOP = (FRAME.rows * FRAME.cellHeight - CROP_HEIGHT) / 2;
// Drawn larger than it prints, then scaled down, so each glyph lands as an
// averaged patch of ink instead of a few aliased pixels.
const SUPERSAMPLE = 3;
const MAX_OPACITY = Math.max(...FRAME.opacities);

/** Printed height of the cropped band for a given width, at the pane's scale. */
export function receiptGalaxyHeight(width: number): number {
  return Math.round(width * CROP_HEIGHT / FRAME_WIDTH);
}

export function drawReceiptGalaxy(ctx: CanvasRenderingContext2D, left: number, top: number, width: number): void {
  const height = receiptGalaxyHeight(width);
  const shot = document.createElement('canvas');
  shot.width = width * SUPERSAMPLE;
  shot.height = height * SUPERSAMPLE;
  const shotCtx = shot.getContext('2d');
  if (!shotCtx) throw new Error('Canvas unavailable');
  shotCtx.fillStyle = '#fff';
  shotCtx.fillRect(0, 0, shot.width, shot.height);
  shotCtx.scale(shot.width / FRAME_WIDTH, shot.height / CROP_HEIGHT);
  shotCtx.translate(0, -CROP_TOP);
  shotCtx.font = `600 ${FRAME.fontSize}px "SFMono-Regular", "Cascadia Mono", "Noto Sans Mono", monospace`;
  shotCtx.textBaseline = 'top';
  // Ink on paper, at the pane's own relative opacities: its brightest glyph
  // prints black and the hub stays as dim against the arms as on screen.
  FRAME.glyphRows.forEach((glyphRow, row) => {
    Array.from(glyphRow).forEach((glyph, column) => {
      const level = parseInt(FRAME.opacityRows[row][column], 36);
      if (!level || glyph === ' ') return;
      shotCtx.fillStyle = `rgba(0, 0, 0, ${FRAME.opacities[level - 1] / MAX_OPACITY})`;
      // maxWidth condenses a glyph the font sets wide, as the pane does.
      shotCtx.fillText(glyph, column * FRAME.cellWidth, row * FRAME.cellHeight, FRAME.cellWidth);
    });
  });

  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(shot, left, top, width, height);
  ctx.restore();
  ditherRegion(ctx, left, top, width, height);
}

/**
 * The printer has no grey: every dot is ink or paper. Floyd–Steinberg keeps
 * the frame's tones as dot density, where a plain threshold would drop the
 * faint gaps entirely and fuse the arms into solid bands.
 */
function ditherRegion(ctx: CanvasRenderingContext2D, left: number, top: number, width: number, height: number) {
  const image = ctx.getImageData(left, top, width, height);
  const { data } = image;
  const tone = new Float32Array(width * height);
  for (let pixel = 0; pixel < tone.length; pixel++) {
    const i = pixel * 4;
    tone[pixel] = data[i] * .299 + data[i + 1] * .587 + data[i + 2] * .114;
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = y * width + x;
      const value = tone[pixel] < 128 ? 0 : 255;
      const error = tone[pixel] - value;
      if (x + 1 < width) tone[pixel + 1] += error * 7 / 16;
      if (y + 1 < height) {
        if (x > 0) tone[pixel + width - 1] += error * 3 / 16;
        tone[pixel + width] += error * 5 / 16;
        if (x + 1 < width) tone[pixel + width + 1] += error / 16;
      }
      data.set([value, value, value, 255], pixel * 4);
    }
  }
  ctx.putImageData(image, left, top);
}
