import QRCode from 'qrcode';
import { parseScore } from '../../agent/parser';
import { formatPlaybackTime, getStrudelLoopDurationSeconds } from '../../lib/strudel-timing';
import type { ChatMessage } from '../../hooks/useChat';
import { P1_WIDTH, rgbaToRaster } from './paperang-protocol';
import { formatReceiptNumber } from './receipt-counter';
import { resolveLayerNotes, resolveLayerRanges } from './receipt-layers';
import { drawReceiptGalaxy, receiptGalaxyHeight } from './receipt-galaxy';

// Thermal paper loses fine strokes, so no printed text goes below 15px.
// Inter (Latin only) ships with the app in public/fonts. PingFang SC is the macOS
// system face and sets everything below the BPM row; its heaviest weight is 600.
const PINGFANG = '"PingFang SC", sans-serif';
const MOTTO_FONT = '400 20px "Inter", sans-serif';
const IDENTITY_FONT = `400 20px ${PINGFANG}`;
const DATE_FONT = `400 18px ${PINGFANG}`;
const FACTS_FONT = '400 20px "Inter", sans-serif';
const TABLE_HEADING_FONT = `600 20px ${PINGFANG}`;
const TOTALS_LABEL_FONT = `600 21px ${PINGFANG}`;
const TOTALS_VALUE_FONT = `600 21px ${PINGFANG}`;
const INSTRUCTION_FONT = `600 20px ${PINGFANG}`;
const LAYER_NUMBER_FONT = `400 21px ${PINGFANG}`;
const LAYER_FONT = `400 21px ${PINGFANG}`;
const DETAIL_FONT = `400 15px ${PINGFANG}`;
const TIME_FONT = `400 18px ${PINGFANG}`;

export interface ShareReceiptDetails {
  code: string;
  createdAt: number;
  locale: 'zh-CN' | 'en';
  /** Today's print count for this receipt; see receipt-counter. */
  number: number;
  /** The session's turns; the agent's per-layer notes are read from them. */
  messages?: ChatMessage[];
}

const MAX_NOTE_LINES = 2;

/** Keeps at most `maxLines`, ending the last kept line with an ellipsis when text was cut. */
export function clampReceiptLines(lines: string[], maxLines: number, measure: (text: string) => number, maxWidth: number): string[] {
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = Array.from(kept[maxLines - 1]);
  while (last.length > 0 && measure(`${last.join('')}…`) > maxWidth) last = last.slice(0, -1);
  kept[maxLines - 1] = `${last.join('').trimEnd()}…`;
  return kept;
}

export function createShareQr(url: string, maxSize = P1_WIDTH - 32) {
  const modules = QRCode.create(url, { errorCorrectionLevel: 'M' }).modules;
  const scale = Math.floor(maxSize / (modules.size + 8));
  if (scale < 2) throw new Error('Share URL is too long for a P1 QR code');
  const size = (modules.size + 8) * scale;
  // White = 255; black = 0. Four modules of quiet zone on every edge.
  const pixels = new Uint8ClampedArray(size * size).fill(255);
  for (let row = 0; row < modules.size; row++) {
    for (let col = 0; col < modules.size; col++) {
      if (!modules.get(row, col)) continue;
      for (let y = 0; y < scale; y++) {
        pixels.fill(0, ((row + 4) * scale + y) * size + (col + 4) * scale,
          ((row + 4) * scale + y) * size + (col + 5) * scale);
      }
    }
  }
  return { pixels, size, scale };
}

export function wrapReceiptTitle(title: string, measure: (text: string) => number, maxWidth = 320): string[] {
  const chars = Array.from(title.replace(/\s+/g, ' ').trim());
  const lines = [''];
  for (let index = 0; index < chars.length; index++) {
    const last = lines.length - 1;
    if (measure(lines[last] + chars[index]) <= maxWidth || !lines[last]) {
      lines[last] += chars[index];
    } else {
      lines.push(chars[index]);
    }
  }
  return lines;
}

/** A deliberately conservative genre read: code can name an instrument, but
 * that does not make the piece a genre. We only print a genre when the score
 * itself includes an unambiguous genre marker. */
function inferGenre(code: string): string {
  const score = code.toLowerCase();
  const genres: readonly [RegExp, string][] = [
    [/\bdrum\s*(?:&|and)\s*bass\b|\bdnb\b/, 'Drum & Bass'],
    [/\bjungle\b|\bamen\b/, 'Jungle'],
    [/\bbreakbeat\b/, 'Breakbeat'],
    [/\btechno\b/, 'Techno'],
    [/\bhouse\b/, 'House'],
    [/\bambient\b/, 'Ambient'],
    [/\b(?:lo[- ]?fi|lofi)\b/, 'Lo-fi'],
    [/\bhip[ -]?hop\b/, 'Hip-hop'],
    [/\btrap\b/, 'Trap'],
    [/\bdubstep\b/, 'Dubstep'],
    [/\bclassical\b/, 'Classical'],
  ];
  return genres.find(([pattern]) => pattern.test(score))?.[1] ?? 'Genreless';
}

function formatCreatedAt(timestamp: number, locale: 'zh-CN' | 'en'): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return '';
  if (locale === 'zh-CN') {
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
      hour: 'numeric', minute: '2-digit', hour12: true,
    }).format(date).replace(/\s+/g, ' ');
  }
  return new Intl.DateTimeFormat('en', {
    year: 'numeric', month: 'short', day: '2-digit', weekday: 'short',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(date).replace(/,/g, '').replace(/\s+/g, ' ').toUpperCase();
}

function dashedRule(ctx: CanvasRenderingContext2D, left: number, right: number, y: number) {
  for (let x = left; x < right; x += 8) ctx.fillRect(x, y, Math.min(4, right - x), 1);
}

let bundledFonts: Promise<void> | undefined;
/** Canvas text never triggers a webfont download, so the receipt loads its bundled faces first. */
function loadBundledFonts(): Promise<void> {
  if (typeof FontFace === 'undefined' || !document.fonts?.add) return Promise.resolve();
  bundledFonts ??= new FontFace('Inter', 'url(/fonts/Inter-Latin-Regular.woff2) format("woff2")', { weight: '400' })
    .load()
    .then(face => { document.fonts.add(face); })
    // A failed load leaves the fallback faces; the next receipt retries.
    .catch(() => { bundledFonts = undefined; });
  return bundledFonts;
}

export async function renderShareReceipt(
  url: string,
  instruction = '扫描二维码查看创作过程',
  details: ShareReceiptDetails = { code: '', createdAt: Date.now(), locale: 'zh-CN', number: 1 },
): Promise<{ preview: string; raster: Uint8Array }> {
  const qr = createShareQr(url, 184);
  const parsed = parseScore(details.code);
  const duration = formatPlaybackTime(getStrudelLoopDurationSeconds(details.code));
  const bpm = parsed.bpm ?? 60;
  const genre = inferGenre(details.code);
  const notes = resolveLayerNotes(details.code, details.messages ?? []);
  const ranges = await resolveLayerRanges(details.code);
  // `key` matches the range lookup: layer names, or '' for code without a stack.
  const layers = parsed.layers.length > 0
    ? parsed.layers.map(layer => ({ name: layer.name, key: layer.name, note: notes[layer.name] ?? '' }))
    : [{ name: details.locale === 'zh-CN' ? '主音层' : 'main', key: '', note: '' }];
  const isZh = details.locale === 'zh-CN';

  await loadBundledFonts();
  await document.fonts?.ready;
  const logo = new Image();
  logo.src = '/logo/logo-oddenova.svg';
  await logo.decode();
  const canvas = document.createElement('canvas');
  canvas.width = P1_WIDTH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  const padding = 14;
  const right = P1_WIDTH - padding;
  // Clear space between the number column and the layer names.
  const nameLeft = 76;
  const timeRight = right;
  ctx.font = TIME_FONT;
  // Keep the original typeface, but give every digit the same cell width.
  const digitWidth = Math.max(...Array.from('0123456789', digit => ctx.measureText(digit).width));
  const timeCharWidth = (char: string) => /[0-9]/.test(char) ? digitWidth : ctx.measureText(char).width;
  const timeWidth = (text: string) => Array.from(text).reduce((width, char) => width + timeCharWidth(char), 0);
  // Names take every dot up to the loop-range column, sized for the widest possible
  // range, so common names stay on one line.
  const rowNameWidth = Math.floor(timeRight - timeWidth(`00:00 – ${duration}`) - 10 - nameLeft);
  const nameLineHeight = 26;
  const detailLineHeight = 19;
  const timeLineHeight = 24;
  const layerLayouts = layers.map(layer => {
    ctx.font = LAYER_FONT;
    const nameLines = wrapReceiptTitle(layer.name, text => ctx.measureText(text).width, rowNameWidth);
    ctx.font = DETAIL_FONT;
    const measure = (text: string) => ctx.measureText(text).width;
    const detailLines = layer.note
      ? clampReceiptLines(wrapReceiptTitle(layer.note, measure, rowNameWidth), MAX_NOTE_LINES, measure, rowNameWidth)
      : [];
    // A silent layer, or one the engine could not analyse, prints a dash rather than a guess.
    const timeLines = ranges[layer.key]?.length ? ranges[layer.key] : ['—'];
    // Extra space after every entry so neighbouring layers read as separate items.
    const rowGap = 14;
    const height = rowGap + Math.max(
      60,
      nameLines.length * nameLineHeight + detailLines.length * detailLineHeight + 16,
      timeLines.length * timeLineHeight + 16,
    );
    return { ...layer, nameLines, detailLines, timeLines, height };
  });

  const logoTop = 76;
  const logoWidth = 264;
  const logoHeight = Math.round(logoWidth * logo.naturalHeight / logo.naturalWidth);
  const mottoTop = logoTop + logoHeight + 12;
  const mottoHeight = 20;
  // Same white space below the motto as above the logo.
  const identityTop = mottoTop + mottoHeight + logoTop;
  const dateTop = identityTop + 30;
  const factsTop = dateTop + 62;
  const tableTop = factsTop + 44;
  const headerHeight = 40;
  const rowsHeight = layerLayouts.reduce((sum, layer) => sum + layer.height, 0);
  const totalsTop = tableTop + headerHeight + rowsHeight + 22;
  const qrRuleTop = totalsTop + 86;
  const qrTop = qrRuleTop + 26;
  const instructionLines = instruction === '扫描二维码查看创作过程'
    ? ['扫描二维码', '查看创作过程']
    : [instruction];
  const instructionLineHeight = 28;
  // From the first line's top to the last line's glyph bottom.
  const instructionHeight = (instructionLines.length - 1) * instructionLineHeight + 20;
  // A screenshot of the code panel's galaxy, as wide as the rules above it, sits
  // behind the scan prompt with both centred on one line. It clears the QR code
  // first: dots inside the code's quiet zone would stop it scanning.
  const galaxyWidth = right - padding;
  const galaxyHeight = receiptGalaxyHeight(galaxyWidth);
  const galaxyTop = qrTop + qr.size + 9;
  const instructionTop = Math.round(galaxyTop + (galaxyHeight - instructionHeight) / 2);
  // The printer feeds only a short tail after the job, so the card's own bottom
  // margin matches the space above the logo.
  canvas.height = galaxyTop + galaxyHeight + logoTop;

  // Resizing a canvas resets all drawing state.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000';
  ctx.textBaseline = 'top';
  const drawLogo = (x: number, y: number, width: number) => {
    ctx.save();
    ctx.filter = 'brightness(0)';
    ctx.drawImage(logo, x, y, width, Math.round(width * logo.naturalHeight / logo.naturalWidth));
    ctx.restore();
  };

  drawLogo(Math.round((P1_WIDTH - logoWidth) / 2), logoTop, logoWidth);
  ctx.textAlign = 'center';
  ctx.font = MOTTO_FONT;
  ctx.fillText('[ vibe your bgm ]', P1_WIDTH / 2, mottoTop);

  ctx.font = IDENTITY_FONT;
  ctx.fillText(`${isZh ? '创作编号' : 'CREATION NO.'}  ${formatReceiptNumber(details.number)}`, P1_WIDTH / 2, identityTop);
  ctx.font = DATE_FONT;
  ctx.fillText(formatCreatedAt(details.createdAt, details.locale), P1_WIDTH / 2, dateTop);

  ctx.textAlign = 'left';
  ctx.font = FACTS_FONT;
  ctx.fillText(`BPM ${bpm}`, padding, factsTop);
  ctx.textAlign = 'right';
  ctx.fillText(genre, right, factsTop);
  dashedRule(ctx, padding, right, factsTop + 32);

  ctx.font = TABLE_HEADING_FONT;
  ctx.textAlign = 'left';
  ctx.fillText(isZh ? '层号' : 'NO.', padding, tableTop);
  ctx.fillText(isZh ? '音层名称' : 'LAYER', nameLeft, tableTop);
  ctx.textAlign = 'right';
  ctx.fillText(isZh ? '循环区间' : 'LOOP RANGE', timeRight, tableTop);
  dashedRule(ctx, padding, right, tableTop + 32);

  let rowTop = tableTop + headerHeight;
  layerLayouts.forEach((layer, index) => {
    ctx.textAlign = 'left';
    ctx.font = LAYER_NUMBER_FONT;
    ctx.fillText(String(index + 1).padStart(2, '0'), padding, rowTop + 10);
    ctx.font = LAYER_FONT;
    ctx.fillText(layer.nameLines[0], nameLeft, rowTop + 10);
    layer.nameLines.slice(1).forEach((line, lineIndex) => ctx.fillText(line, nameLeft, rowTop + 10 + (lineIndex + 1) * nameLineHeight));
    if (layer.detailLines.length > 0) {
      ctx.font = DETAIL_FONT;
      const detailTop = rowTop + 10 + layer.nameLines.length * nameLineHeight + 1;
      layer.detailLines.forEach((line, lineIndex) => ctx.fillText(line, nameLeft, detailTop + lineIndex * detailLineHeight));
    }
    ctx.textAlign = 'right';
    ctx.font = TIME_FONT;
    ctx.textAlign = 'center';
    layer.timeLines.forEach((line, lineIndex) => {
      let x = timeRight - timeWidth(line);
      for (const char of line) {
        const width = timeCharWidth(char);
        ctx.fillText(char, x + width / 2, rowTop + 10 + lineIndex * timeLineHeight);
        x += width;
      }
    });
    rowTop += layer.height;
  });
  dashedRule(ctx, padding, right, rowTop + 2);

  ctx.textAlign = 'left';
  ctx.font = TOTALS_LABEL_FONT;
  ctx.fillText(isZh ? '总时长' : 'TOTAL LENGTH', padding, totalsTop);
  ctx.fillText(isZh ? '音层总数' : 'TOTAL LAYERS', padding, totalsTop + 44);
  ctx.textAlign = 'right';
  ctx.font = TOTALS_VALUE_FONT;
  ctx.fillText(duration, right, totalsTop);
  ctx.fillText(String(layers.length).padStart(2, '0'), right, totalsTop + 44);

  dashedRule(ctx, padding, right, qrRuleTop);
  const qrLeft = Math.floor((P1_WIDTH - qr.size) / 2);
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.pixels[y * qr.size + x] === 0) ctx.fillRect(qrLeft + x, qrTop + y, 1, 1);
    }
  }
  drawReceiptGalaxy(ctx, padding, galaxyTop, galaxyWidth);
  ctx.font = INSTRUCTION_FONT;
  ctx.textAlign = 'center';
  // A paper-white halo keeps the prompt legible over the galaxy's dots.
  ctx.save();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 8;
  ctx.lineJoin = 'round';
  instructionLines.forEach((line, index) => ctx.strokeText(line, P1_WIDTH / 2, instructionTop + index * instructionLineHeight));
  ctx.restore();
  instructionLines.forEach((line, index) => ctx.fillText(line, P1_WIDTH / 2, instructionTop + index * instructionLineHeight));

  return {
    preview: canvas.toDataURL('image/png'),
    raster: rgbaToRaster(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height),
  };
}
