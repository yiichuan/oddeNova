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

export function wrapReceiptTitle(title: string, measure: (text: string) => number, maxWidth = 336): string[] {
  const chars = Array.from(title.replace(/\s+/g, ' ').trim());
  const lines = [''];
  for (let index = 0; index < chars.length; index++) {
    const last = lines.length - 1;
    if (measure(lines[last] + chars[index]) <= maxWidth) {
      lines[last] += chars[index];
    } else if (lines.length < 2) {
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
  const logoWidth = 192;
  const logoHeight = Math.round(logoWidth * logo.naturalHeight / logo.naturalWidth);
  const canvas = document.createElement('canvas');
  canvas.width = P1_WIDTH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.font = '22px sans-serif';
  const lines = wrapReceiptTitle(title, text => ctx.measureText(text).width);
  const edgePadding = 48;
  const qrTop = edgePadding + lines.length * 30 + 16;
  const instructionTop = qrTop + qr.size + 16;
  const logoTop = instructionTop + 24 + 16;
  canvas.height = logoTop + logoHeight + edgePadding;
  // Resizing a canvas resets its drawing state.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#000';
  ctx.font = '22px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  lines.forEach((line, i) => ctx.fillText(line, P1_WIDTH / 2, edgePadding + i * 30));
  const left = Math.floor((P1_WIDTH - qr.size) / 2);
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.pixels[y * qr.size + x] === 0) ctx.fillRect(left + x, qrTop + y, 1, 1);
    }
  }
  ctx.font = '20px sans-serif';
  ctx.fillText(instruction, P1_WIDTH / 2, instructionTop);
  ctx.save();
  // The shared SVG is gray; print its original silhouette in solid black.
  ctx.filter = 'brightness(0)';
  ctx.drawImage(logo, (P1_WIDTH - logoWidth) / 2, logoTop, logoWidth, logoHeight);
  ctx.restore();
  return {
    preview: canvas.toDataURL('image/png'),
    raster: rgbaToRaster(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height),
  };
}
