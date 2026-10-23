import { describe, expect, it, vi } from 'vitest';
import jsQR from 'jsqr';
import { clampReceiptLines, createShareQr, wrapReceiptTitle, renderShareReceipt } from '../share-receipt';

// Ranges come from the real Strudel engine (covered in receipt-layers.test.ts); here
// they are fixed so the layout is deterministic. Notes resolution stays real.
const ranges = vi.hoisted(() => vi.fn(async (): Promise<Record<string, string[]>> => ({})));
vi.mock('../receipt-layers', async importOriginal => ({
  ...await importOriginal<typeof import('../receipt-layers')>(),
  resolveLayerRanges: ranges,
}));
// The galaxy is a bitmap drawn on its own canvas; here only its place on the card matters.
const galaxy = vi.hoisted(() => ({ draw: vi.fn(), height: vi.fn((width: number) => Math.round(width * 0.6)) }));
vi.mock('../receipt-galaxy', () => ({ drawReceiptGalaxy: galaxy.draw, receiptGalaxyHeight: galaxy.height }));
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
  it('wraps long text without omitting any content', () => {
    const measure = (s: string) => Array.from(s).length * 22;
    const title = '这是一首特别特别长的中文作品标题'.repeat(6);
    const lines = wrapReceiptTitle(title, measure);
    expect(lines.length).toBeGreaterThan(3);
    expect(lines.join('')).toBe(title);
    expect(lines.join('')).not.toContain('…');
    lines.forEach(line => expect(measure(line)).toBeLessThanOrEqual(320));
    expect(wrapReceiptTitle('短标题', measure)).toEqual(['短标题']);
    expect(wrapReceiptTitle('hello\nworld', measure)).toEqual(['hello world']);
  });
  it('renders the full layer list in a decodable 384-dot editorial receipt', async () => {
    let width = 0;
    let height = 0;
    let pixels = new Uint8ClampedArray();
    const drawnText: { text: string; font: string }[] = [];
    const fillText = vi.fn(function (this: { font: string }, text: string, _x: number, _y: number) {
      drawnText.push({ text, font: this.font });
    });
    const drawImage = vi.fn();
    const ctx = {
      fillStyle: '#fff', font: '', textAlign: '', textBaseline: '',
      filter: '', strokeStyle: '', lineWidth: 1, lineJoin: '', save: vi.fn(), restore: vi.fn(), drawImage, strokeText: vi.fn(),
      measureText(text: string) {
        const size = Number(this.font.match(/(\d+)px/)?.[1] ?? 22);
        return { width: Array.from(text).reduce((sum, char) => sum + size * (char.charCodeAt(0) > 127 ? 1 : char === '1' ? 0.35 : 0.5), 0) };
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
      const code = `setcps(120/240)\nstack(\n  /* @layer horizon */ s("piano"),\n  /* @layer wind */ s("wind noise"),\n  /* @layer returning_theme */ note("c3 e3").s("sawtooth")\n)`;
      ranges.mockResolvedValueOnce({ horizon: ['00:00 – 00:02'], wind: ['00:00 – 00:01', '00:01 – 00:02'] });
      const longNote = '风声噪音在背景里缓慢起伏，像远处吹来的风，偶尔变强又慢慢消失';
      const { raster, preview } = await renderShareReceipt(url, '扫描二维码查看创作过程', {
        code,
        createdAt: Date.UTC(2026, 9, 17, 8, 30),
        locale: 'zh-CN',
        number: 7,
        messages: [{ id: 'a', role: 'assistant', content: '', code, timestamp: 0, layerNotes: { horizon: '钢琴铺出天空和声', wind: longNote } }],
      });
      expect(width).toBe(384);
      expect(raster.length).toBe(48 * height);
      expect(preview).toContain('data:image/png');
      // Time ranges are drawn character by character in fixed-width digit cells.
      const text = fillText.mock.calls.reduce<string[]>((lines, [value, , y], index, calls) => {
        if (value.length === 1 && index > 0 && calls[index - 1][0].length === 1 && calls[index - 1][2] === y) {
          lines[lines.length - 1] += value;
        } else lines.push(value);
        return lines;
      }, []);
      const timeRows = fillText.mock.calls.filter(([value]) => value.length === 1 && value !== '—');
      const firstRowY = timeRows[0][2];
      const firstRowX = timeRows.filter(([, , y]) => y === firstRowY).map(([, x]) => x);
      for (const y of new Set(timeRows.map(([, , y]) => y))) {
        expect(timeRows.filter(([, , rowY]) => rowY === y).map(([, x]) => x)).toEqual(firstRowX);
      }
      expect(text).toEqual(expect.arrayContaining([
        '[ vibe your bgm ]', '创作编号  007', 'BPM 120', 'Genreless',
        'horizon', 'wind', 'returning_theme', '钢琴铺出天空和声',
        '总时长', '音层总数', '扫描二维码', '查看创作过程',
      ]));
      expect(text).not.toContain('夜晚的漫游');
      const fontOf = (text: string) => drawnText.find(entry => entry.text === text || entry.text.startsWith(text))?.font;
      expect(fontOf('[ vibe your bgm ]')).toContain('"Inter"');
      expect(fontOf('创作编号')).toContain('"PingFang SC"');
      expect(fontOf('2026年')).toContain('"PingFang SC"');
      expect(fontOf('BPM 120')).toContain('"Inter"');
      expect(text).not.toEqual(expect.arrayContaining([expect.stringContaining('声部')]));
      // Everything below the BPM row is PingFang SC: headings, totals and the scan prompt
      // in semibold, layer rows in regular.
      const belowFacts = drawnText.slice(drawnText.findIndex(entry => entry.text === 'Genreless') + 1);
      expect(belowFacts.every(entry => entry.font.includes('"PingFang SC"'))).toBe(true);
      // The scan prompt is the last text; the galaxy picture replaces the old footer.
      expect(drawnText.at(-1)?.text).toBe('查看创作过程');
      expect(text).not.toContain('ODDENOVA · VIBE YOUR BGM');
      for (const label of ['层号', '音层名称', '循环区间', '总时长', '音层总数', '扫描二维码', '查看创作过程']) {
        expect(fontOf(label)).toMatch(/^600 /);
      }
      expect(drawnText.filter(entry => ['00:02', '03'].includes(entry.text) && entry.font.startsWith('600 21px'))).toHaveLength(2);
      for (const label of ['01', 'horizon', '钢琴铺出天空和声']) expect(fontOf(label)).toMatch(/^400 /);
      // Thermal paper loses fine strokes: nothing prints below 15px.
      expect(drawnText.every(entry => Number(entry.font.match(/(\d+)px/)?.[1]) >= 15)).toBe(true);
      expect(text.filter(value => ['horizon', 'wind', 'returning_theme'].includes(value))).toHaveLength(3);
      // The second line is the agent's note, cut to two lines; a layer without a note
      // (returning_theme) has no second line, and raw sound names never print.
      const windNote = text.slice(text.indexOf('wind') + 1, text.indexOf('00:00 – 00:01'));
      expect(windNote).toHaveLength(2);
      expect(windNote[1]).toMatch(/…$/);
      expect(longNote.startsWith(windNote.join('').replace('…', ''))).toBe(true);
      expect(text).not.toContain('piano');
      expect(text).not.toContain('sawtooth');
      expect(text.slice(text.indexOf('returning_theme') + 1, text.indexOf('returning_theme') + 2)).toEqual(['—']);
      // Each layer prints its own ranges: one, two stacked lines, or a dash when unknown.
      expect(text.filter(value => /^\d\d:\d\d – /.test(value))).toEqual(['00:00 – 00:02', '00:00 – 00:01', '00:01 – 00:02']);
      expect(drawImage).toHaveBeenCalledOnce();
      expect(drawImage).toHaveBeenCalledWith(expect.objectContaining({ src: '/logo/logo-oddenova.svg' }), 60, 76, 264, 44);
      // The galaxy spans the rules' width at the bottom of the card, above the same
      // 76-dot margin as above the logo.
      expect(galaxy.draw).toHaveBeenCalledOnce();
      const [, galaxyLeft, galaxyTop, galaxyWidth] = galaxy.draw.mock.calls[0];
      expect([galaxyLeft, galaxyWidth]).toEqual([14, 356]);
      expect(height - galaxyTop - galaxy.height(356)).toBe(76);
      // The scan prompt sits on the galaxy, the two centred on the same line.
      const promptY = fillText.mock.calls.filter(([value]) => ['扫描二维码', '查看创作过程'].includes(value)).map(([, , y]) => y);
      expect(Math.abs((promptY[0] + promptY[1] + 20) / 2 - (galaxyTop + galaxy.height(356) / 2))).toBeLessThanOrEqual(0.5);
      const decoded = new Uint8ClampedArray(width * height * 4);
      for (let p = 0; p < width * height; p++) {
        const value = raster[p >>> 3] & (0x80 >>> (p & 7)) ? 0 : 255;
        decoded.set([value, value, value, 255], p * 4);
      }
      expect(jsQR(decoded, width, height)?.data).toBe(url);
      // Long titles stay on one line, with an ellipsis, above the creation number.
      fillText.mockClear();
      const titled = await renderShareReceipt(url, undefined, {
        code, createdAt: 0, locale: 'zh-CN', number: 7,
        title: '特别长的中文作品标题'.repeat(4),
      });
      const identityIndex = fillText.mock.calls.findIndex(([value]) => value.startsWith('创作编号'));
      const titleRows = fillText.mock.calls.slice(1, identityIndex);
      expect(titleRows).toHaveLength(1);
      expect(titleRows[0][0]).toMatch(/…$/);
      ctx.font = '600 24px "PingFang SC", sans-serif';
      expect(ctx.measureText(titleRows[0][0]).width).toBeLessThanOrEqual(356);
      const top = titled.titleField.top / 100 * height;
      const bottom = (titled.titleField.top + titled.titleField.height) / 100 * height;
      expect(top).toBeLessThan(titleRows[0][2]);
      expect(bottom).toBeGreaterThan(titleRows.at(-1)![2] + 24);
      expect(bottom).toBeLessThan(fillText.mock.calls[identityIndex][2]);
    } finally { vi.unstubAllGlobals(); }
  });
  it('cuts notes to the line limit with an ellipsis that still fits', () => {
    const measure = (text: string) => Array.from(text).length * 10;
    expect(clampReceiptLines(['一二三', '四五六'], 2, measure, 30)).toEqual(['一二三', '四五六']);
    expect(clampReceiptLines(['一二三', '四五六', '七八'], 2, measure, 30)).toEqual(['一二三', '四五…']);
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
