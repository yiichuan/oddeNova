import { describe, expect, it, vi } from 'vitest';
import jsQR from 'jsqr';
import { createShareQr, wrapReceiptTitle, renderShareReceipt } from '../share-receipt';
import { rgbaToRaster } from '../paperang-protocol';

describe('share receipt', () => {
  it.each(['https://www.oddenova.com/s/abc123', 'https://www.oddenova.com/s/作品-123'])('independently decodes the exact URL %s', url => {
    const { pixels, size, scale } = createShareQr(url);
    const rgba = new Uint8ClampedArray(size * size * 4);
    for (let p = 0; p < pixels.length; p++) rgba.set([pixels[p], pixels[p], pixels[p], 255], p * 4);
    expect(jsQR(rgba, size, size)?.data).toBe(url);
    expect(Number.isInteger(scale)).toBe(true);
    expect(size).toBeLessThanOrEqual(352);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (x < scale * 4 || y < scale * 4 || x >= size - scale * 4 || y >= size - scale * 4) {
        expect(pixels[y * size + x]).toBe(255);
      }
    }
  });
  it('wraps Chinese titles into at most two lines, with a bounded ellipsis', () => {
    const measure = (s: string) => Array.from(s).length * 22;
    const lines = wrapReceiptTitle('这是一首特别特别长的中文作品标题'.repeat(6), measure);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith('…')).toBe(true);
    lines.forEach(line => expect(measure(line)).toBeLessThanOrEqual(336));
    expect(wrapReceiptTitle('短标题', measure)).toEqual(['短标题']);
    expect(wrapReceiptTitle('hello\nworld', measure)).toEqual(['hello world']);
  });
  it.each([
    ['短标题', undefined, 1],
    ['中文标题'.repeat(15), '扫码听听这段音乐', 2],
    ['My song', 'Scan to hear this music', 1],
  ] as const)('renders a decodable 384-dot receipt for %s', async (title, instruction, lineCount) => {
    let width = 0;
    let height = 0;
    let pixels = new Uint8ClampedArray();
    const fillText = vi.fn();
    const drawImage = vi.fn();
    const ctx = {
      fillStyle: '#fff', font: '', textAlign: '', textBaseline: '',
      filter: '', save: vi.fn(), restore: vi.fn(), drawImage,
      measureText: (text: string) => ({ width: Array.from(text).length * 22 }),
      fillText,
      fillRect(x: number, y: number, w: number, h: number) {
        expect([x, y, w, h].every(Number.isInteger)).toBe(true);
        const color = this.fillStyle === '#fff' ? 255 : 0;
        for (let row = y; row < y + h; row++) for (let col = x; col < x + w; col++) {
          pixels.set([color, color, color, 255], (row * width + col) * 4);
        }
      },
      getImageData: () => ({ data: pixels }),
    };
    const canvas = {
      set width(value: number) { width = value; }, get width() { return width; },
      set height(value: number) { height = value; pixels = new Uint8ClampedArray(width * height * 4); }, get height() { return height; },
      getContext: () => ctx, toDataURL: () => 'data:image/png;base64,preview',
    };
    vi.stubGlobal('document', { fonts: { ready: Promise.resolve() }, createElement: () => canvas });
    vi.stubGlobal('Image', class {
      src = '';
      naturalWidth = 1175;
      naturalHeight = 196;
      decode = async () => {};
    });
    try {
      const url = 'https://www.oddenova.com/s/printed123';
      const { raster, preview } = await renderShareReceipt(url, title, instruction);
      expect(width).toBe(384);
      expect(raster.length).toBe(48 * height);
      expect(preview).toContain('data:image/png');
      expect(fillText).toHaveBeenCalledTimes(lineCount + 1);
      if (lineCount === 2) expect(fillText.mock.calls[1][0]).toMatch(/…$/);
      expect(fillText.mock.calls.at(-1)?.[0]).toBe(instruction ?? '扫码听听这段音乐');
      expect(fillText.mock.calls[0]).toEqual([expect.any(String), 192, 48]);
      const logoTop = 48 + lineCount * 30 + 16 + createShareQr(url).size + 16 + 24 + 16;
      expect(drawImage).toHaveBeenCalledWith(expect.objectContaining({ src: '/logo/logo-oddenova.svg' }), 96, logoTop, 192, 32);
      expect(ctx.filter).toBe('brightness(0)');
      expect(height - logoTop - 32).toBe(48);
      const decoded = new Uint8ClampedArray(width * height * 4);
      for (let p = 0; p < width * height; p++) {
        const value = raster[p >>> 3] & (0x80 >>> (p & 7)) ? 0 : 255;
        decoded.set([value, value, value, 255], p * 4);
      }
      expect(jsQR(decoded, width, height)?.data).toBe(url);
    } finally { vi.unstubAllGlobals(); }
  });
  it('packs black pixels MSB first and treats transparency as white', () => {
    const rgba = new Uint8ClampedArray(384 * 4).fill(255);
    rgba.set([0, 0, 0, 255], 0);
    rgba.set([0, 0, 0, 255], 7 * 4);
    rgba.set([0, 0, 0, 0], 8 * 4);
    const raster = rgbaToRaster(rgba, 384, 1);
    expect(raster).toHaveLength(48);
    expect(raster[0]).toBe(129);
    expect(raster[1]).toBe(0);
    expect(() => rgbaToRaster(rgba, 383, 1)).toThrow();
  });
});
