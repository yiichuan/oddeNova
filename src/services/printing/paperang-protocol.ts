/** Paperang P1 wire format. Independently implemented from protocol observations:
 * https://github.com/Yrr0r/paperang-web (CRC32 seed, framing, 48 bytes/row).
 * This is not an ESC/POS printer. Hardware/firmware compatibility needs testing.
 */
export const P1_WIDTH = 384;
export const P1_ROW_BYTES = P1_WIDTH / 8;
export const P1_STANDARD_CRC_KEY = 0x35769521;
export const P1_SESSION_CRC_KEY = (0x6968634 ^ 0x2e696d) >>> 0;
export const P1_SERVICE = '49535343-fe7d-4ae5-8fa9-9fafd205e455';
// Older P1 firmware exposes the RN4678 transparent UART write characteristic.
export const P1_WRITE = '49535343-6daa-4d02-abf6-19569aca69fe';
// P1S exposes the newer Microchip transparent UART downlink characteristic.
export const P1S_WRITE = '49535343-8841-43f4-a8d4-ecbe34729bb3';
export const P1S_NOTIFY = '49535343-1e4d-4bd9-ba61-23c647249616';
// Observed on the local P1: FF00/FF02 accepts the same seeded P1 framing.
export const P1_BLE_SERVICE = '0000ff00-0000-1000-8000-00805f9b34fb';
export const P1_BLE_WRITE = '0000ff02-0000-1000-8000-00805f9b34fb';
export const P1_BLE_NOTIFY = '0000ff01-0000-1000-8000-00805f9b34fb';
export const P1_BLE_FLOW = '0000ff03-0000-1000-8000-00805f9b34fb';

export function paperangFrame(command: number, payload: Uint8Array, packetIndex = 0, crcKey = P1_STANDARD_CRC_KEY): Uint8Array<ArrayBuffer> {
  if (payload.length > 480) throw new Error('P1 payload exceeds 480 bytes');
  const frame = new Uint8Array(payload.length + 10);
  frame.set([2, command, packetIndex & 255, payload.length & 255, payload.length >>> 8]);
  frame.set(payload, 5);
  let crc = crcKey ^ 0xffffffff;
  for (const byte of payload) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  new DataView(frame.buffer).setUint32(5 + payload.length, (crc ^ 0xffffffff) >>> 0, true);
  frame[frame.length - 1] = 3;
  return frame;
}

export function rasterFrames(raster: Uint8Array, crcKey = P1_STANDARD_CRC_KEY, sequencePackets = false): Uint8Array<ArrayBuffer>[] {
  if (!raster.length || raster.length % P1_ROW_BYTES) throw new Error('Invalid P1 raster rows');
  const frames: Uint8Array<ArrayBuffer>[] = [];
  for (let offset = 0; offset < raster.length; offset += 480) {
    frames.push(paperangFrame(0, raster.slice(offset, offset + 480), sequencePackets ? frames.length : 0, crcKey));
  }
  // Blank rows ensure the QR quiet zone and footer pass the tear edge.
  frames.push(paperangFrame(26, new Uint8Array([80, 0]), 0, crcKey));
  return frames;
}

export function p1SessionKeyFrame(): Uint8Array<ArrayBuffer> {
  const payload = new Uint8Array(4);
  new DataView(payload.buffer).setUint32(0, (P1_SESSION_CRC_KEY ^ P1_STANDARD_CRC_KEY) >>> 0, true);
  return paperangFrame(24, payload);
}

export function p1PaperTypeFrame(crcKey = P1_SESSION_CRC_KEY): Uint8Array<ArrayBuffer> {
  return paperangFrame(44, new Uint8Array([0]), 0, crcKey);
}

export function rgbaToRaster(data: Uint8ClampedArray, width: number, height: number): Uint8Array {
  if (width !== P1_WIDTH || height < 1 || !Number.isInteger(height) || data.length !== width * height * 4) {
    throw new Error('Invalid P1 image dimensions');
  }
  const raster = new Uint8Array(height * P1_ROW_BYTES);
  for (let pixel = 0; pixel < width * height; pixel++) {
    const i = pixel * 4;
    const alpha = data[i + 3] / 255;
    const luminance = (data[i] * .299 + data[i + 1] * .587 + data[i + 2] * .114) * alpha + 255 * (1 - alpha);
    if (luminance < 128) raster[pixel >>> 3] |= 0x80 >>> (pixel & 7);
  }
  return raster;
}
