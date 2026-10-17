import QRCode from 'qrcode';
import { P1_WIDTH, rgbaToRaster } from './paperang-protocol';

export function createShareQr(url: string) {
  const modules = QRCode.create(url, { errorCorrectionLevel: 'M' }).modules;
  const scale = Math.floor((P1_WIDTH - 32) / (modules.size + 8));
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
    if (measure(lines[last] + chars[index]) <= maxWidth) {
      lines[last] += chars[index];
    } else if (lines.length < 3) {
      lines.push(chars[index]);
    } else {
      while (measure(lines[last] + '…') > maxWidth && lines[last]) {
        lines[last] = Array.from(lines[last]).slice(0, -1).join('');
      }
      lines[last] += '…';
      break;
    }
  }
  return lines;
}

export async function renderShareReceipt(url: string, title: string, instruction = '扫码听听这段音乐'): Promise<{ preview: string; raster: Uint8Array }> {
  const qr = createShareQr(url);
  await document.fonts?.ready;
  const logo = new Image();
  logo.src = '/logo/logo-oddenova.svg';
  await logo.decode();
  const canvas = document.createElement('canvas');
  canvas.width = P1_WIDTH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  const padding = 32;
  const contentWidth = P1_WIDTH - padding * 2;
  ctx.font = '700 36px sans-serif';
  const titleSize = ctx.measureText(title).width <= contentWidth ? 36 : 28;
  ctx.font = `700 ${titleSize}px sans-serif`;
  const lines = wrapReceiptTitle(title, text => ctx.measureText(text).width, contentWidth);
  const titleTop = 112;
  const titleLineHeight = titleSize + 10;
  const taglineTop = titleTop + lines.length * titleLineHeight + 20;
  const separatorTop = taglineTop + 56;
  const qrTop = separatorTop + 24;
  const instructionTop = qrTop + qr.size + 8;
  const footerTop = instructionTop + 72;
  const footerLogoWidth = 104;
  const footerLogoHeight = Math.round(footerLogoWidth * logo.naturalHeight / logo.naturalWidth);
  canvas.height = footerTop + footerLogoHeight + 48;
  // Resizing a canvas resets its drawing state.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const drawLogo = (x: number, y: number, width: number) => {
    ctx.save();
    // Preserve the shared wordmark silhouette in solid black for thermal paper.
    ctx.filter = 'brightness(0)';
    ctx.drawImage(logo, x, y, width, Math.round(width * logo.naturalHeight / logo.naturalWidth));
    ctx.restore();
  };
  drawLogo(padding, 32, 132);
  ctx.fillRect(padding, 78, contentWidth, 2);
  ctx.font = `700 ${titleSize}px sans-serif`;
  lines.forEach((line, i) => ctx.fillText(line, padding, titleTop + i * titleLineHeight));
  ctx.font = '18px sans-serif';
  ctx.fillText('把这一刻，留在音乐里', padding, taglineTop);
  for (let x = padding; x < P1_WIDTH - padding; x += 12) {
    ctx.fillRect(x, separatorTop, Math.min(6, P1_WIDTH - padding - x), 2);
  }
  const left = Math.floor((P1_WIDTH - qr.size) / 2);
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.pixels[y * qr.size + x] === 0) ctx.fillRect(left + x, qrTop + y, 1, 1);
    }
  }
  ctx.font = '20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(instruction, P1_WIDTH / 2, instructionTop);
  ctx.font = '12px sans-serif';
  const footerLabel = 'CREATED WITH';
  const footerLabelWidth = ctx.measureText(footerLabel).width;
  const footerLeft = Math.round((P1_WIDTH - footerLabelWidth - 10 - footerLogoWidth) / 2);
  ctx.textAlign = 'left';
  ctx.fillText(footerLabel, footerLeft, footerTop + 3);
  drawLogo(footerLeft + Math.round(footerLabelWidth) + 10, footerTop, footerLogoWidth);
  return {
    preview: canvas.toDataURL('image/png'),
    raster: rgbaToRaster(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height),
  };
}
