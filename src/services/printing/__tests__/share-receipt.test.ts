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
  it('wraps Chinese titles into at most three lines, with a bounded ellipsis', () => {
    const measure = (s: string) => Array.from(s).length * 22;
    const lines = wrapReceiptTitle('这是一首特别特别长的中文作品标题'.repeat(6), measure);
    expect(lines).toHaveLength(3);
    expect(lines[2].endsWith('…')).toBe(true);
    lines.forEach(line => expect(measure(line)).toBeLessThanOrEqual(320));
    expect(wrapReceiptTitle('短标题', measure)).toEqual(['短标题']);
    expect(wrapReceiptTitle('hello\nworld', measure)).toEqual(['hello world']);
  });
  it.each([
    ['短标题', undefined, 1],
    ['中文标题'.repeat(15), '扫码听听这段音乐', 3],
    ['写给那些下班后还不想立刻回家的夜晚', undefined, 2],
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
      measureText(text: string) {
        const size = Number(this.font.match(/(\d+)px/)?.[1] ?? 22);
        return { width: Array.from(text).reduce((sum, char) => sum + size * (char.charCodeAt(0) > 127 ? 1 : 0.5), 0) };
      },
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
      expect(fillText).toHaveBeenCalledTimes(lineCount + 3);
      const titleCalls = fillText.mock.calls.slice(0, lineCount);
      const renderedTitle = titleCalls.map(call => call[0]).join('');
      if (title.length > 40) expect(renderedTitle).toMatch(/…$/);
      else expect(renderedTitle).toBe(title);
      expect(titleCalls.every(call => call[1] === 32)).toBe(true);
      expect(titleCalls[0][2]).toBe(112);
      const taglineCall = fillText.mock.calls[lineCount];
      expect(taglineCall[0]).toBe('把这一刻，留在音乐里');
      expect(taglineCall[2]).toBeGreaterThan(titleCalls.at(-1)![2]);
      expect(fillText.mock.calls[lineCount + 1][0]).toBe(instruction ?? '扫码听听这段音乐');
      expect(fillText.mock.calls.at(-1)?.[0]).toBe('CREATED WITH');
      expect(drawImage).toHaveBeenCalledWith(expect.objectContaining({ src: '/logo/logo-oddenova.svg' }), 32, 32, 132, 22);
      expect(drawImage).toHaveBeenCalledTimes(2);
      const footerLogo = drawImage.mock.calls[1];
      expect(footerLogo[3]).toBe(104);
      expect(height - footerLogo[2] - footerLogo[4]).toBe(48);
      // Each extra title line moves the QR, instruction and footer down together.
      const titleSize = lineCount === 1 ? 36 : 28;
      expect(height).toBe(112 + lineCount * (titleSize + 10) + 20 + 56 + 24
        + createShareQr(url).size + 8 + 72 + 17 + 48);
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
