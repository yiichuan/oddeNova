/** Paperang wire formats. Independently implemented from public protocol notes:
 * - Legacy 0x02 frames (gen1/gen2): https://github.com/Yrr0r/paperang-web,
 *   https://github.com/tinyprinter/python-paperang, https://github.com/wyrtensi/paperang-cli
 * - A5 frames (newer firmware): https://github.com/Orangray-MDJX/paperang-p1-connect
 *   (docs/protocol-a5.md and its capture-vector tests).
 * This is not an ESC/POS printer. Hardware/firmware compatibility needs testing.
 */
export const P1_WIDTH = 384;
export const P1_ROW_BYTES = P1_WIDTH / 8;
export const P1_CRC_SEED = 0x35769521;
// gen2 firmware expects frames seeded with zero, but only after GEN2_HANDSHAKE.
export const P1S_CRC_SEED = 0;
export const P1_SERVICE = '49535343-fe7d-4ae5-8fa9-9fafd205e455';
// Older P1 firmware exposes the RN4678 transparent UART write characteristic.
export const P1_WRITE = '49535343-6daa-4d02-abf6-19569aca69fe';
// P1S exposes the Microchip transparent UART RX (client → device) and TX (notify).
export const P1S_WRITE = '49535343-8841-43f4-a8d4-ecbe34729bb3';
export const P1S_NOTIFY = '49535343-1e4d-4bd9-ba61-23c647249616';
// Observed on the local P1: FF00/FF02 accepts the same seeded P1 framing.
export const P1_BLE_SERVICE = '0000ff00-0000-1000-8000-00805f9b34fb';
export const P1_BLE_WRITE = '0000ff02-0000-1000-8000-00805f9b34fb';
export const P1_BLE_NOTIFY = '0000ff01-0000-1000-8000-00805f9b34fb';
export const P1_BLE_FLOW = '0000ff03-0000-1000-8000-00805f9b34fb';

export const LEGACY_GET_BATTERY = 16;
export const LEGACY_FEED_LINE = 26;
export const LEGACY_SELF_TEST = 27;
// Fixed gen2 handshake: the standard-seeded SET_CRC_KEY frame that selects session
// key 0 (payload = LE32(0 ^ 0x35769521)). Later frames use P1S_CRC_SEED.
export const GEN2_HANDSHAKE = Uint8Array.from([0x02, 0x18, 0x00, 0x04, 0x00, 0x21, 0x95, 0x76, 0x35, 0x1c, 0xdf, 0x44, 0x21, 0x03]);
// A5 commands: (family << 8) | child, sent big endian.
export const A5_GET_VERSION = 0x0115;
export const A5_SET_DENSITY = 0x0511;
export const A5_FEED = 0x0516;
export const A5_SELF_TEST = 0x0517;
export const A5_PRINT_START = 0x0519;
export const A5_PRINT_END = 0x051a;
export const A5_BITMAP = 0x051b;
export const A5_PAPER_TYPE = 0x0520;
// Ten rows keep every A5 bitmap frame (rows + 26 bytes) within one 512-byte GATT value.
export const A5_BITMAP_ROWS_BYTES = 10 * P1_ROW_BYTES;
const MAX_REPLY_PAYLOAD = 4096;

export function crc32(data: Uint8Array, seed: number): number {
  let crc = seed ^ 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function paperangFrame(command: number, payload: Uint8Array, crcSeed = P1_CRC_SEED): Uint8Array<ArrayBuffer> {
  if (payload.length > 480) throw new Error('P1 payload exceeds 480 bytes');
  const frame = new Uint8Array(payload.length + 10);
  frame.set([2, command, 0, payload.length & 255, payload.length >>> 8]);
  frame.set(payload, 5);
  new DataView(frame.buffer).setUint32(5 + payload.length, crc32(payload, crcSeed), true);
  frame[frame.length - 1] = 3;
  return frame;
}

/** Every public client sends the self-test command with a single zero byte. */
export const selfTestFrame = (crcSeed = P1_CRC_SEED) => paperangFrame(LEGACY_SELF_TEST, new Uint8Array([0]), crcSeed);
export const batteryQueryFrame = (crcSeed = P1_CRC_SEED) => paperangFrame(LEGACY_GET_BATTERY, new Uint8Array([1]), crcSeed);

export function rasterFrames(raster: Uint8Array, crcSeed = P1_CRC_SEED): Uint8Array<ArrayBuffer>[] {
  if (!raster.length || raster.length % P1_ROW_BYTES) throw new Error('Invalid P1 raster rows');
  const frames: Uint8Array<ArrayBuffer>[] = [];
  for (let offset = 0; offset < raster.length; offset += 480) {
    frames.push(paperangFrame(0, raster.slice(offset, offset + 480), crcSeed));
  }
  // Blank rows ensure the QR quiet zone and footer pass the tear edge.
  frames.push(paperangFrame(LEGACY_FEED_LINE, new Uint8Array([80, 0]), crcSeed));
  return frames;
}

/** A5 01 | len LE16 | command BE16, type, contentLen LE16, content | crc32 LE | 5A */
export function a5Frame(command: number, content: Uint8Array = new Uint8Array(), messageType = 1): Uint8Array<ArrayBuffer> {
  const payload = new Uint8Array(5 + content.length);
  payload.set([command >>> 8, command & 255, messageType, content.length & 255, content.length >>> 8]);
  payload.set(content, 5);
  const frame = new Uint8Array(payload.length + 9);
  frame.set([0xa5, 1, payload.length & 255, payload.length >>> 8]);
  frame.set(payload, 4);
  new DataView(frame.buffer).setUint32(4 + payload.length, crc32(payload, P1_CRC_SEED), true);
  frame[frame.length - 1] = 0x5a;
  return frame;
}

export function a5BitmapContent(rows: Uint8Array, order: number): Uint8Array {
  if (!rows.length || rows.length % P1_ROW_BYTES || order < 1 || order > 0xffff) throw new Error('Invalid A5 bitmap chunk');
  const inner = new Uint8Array(8 + rows.length);
  const view = new DataView(inner.buffer);
  inner[0] = 1;
  view.setUint16(1, P1_ROW_BYTES, true);
  view.setUint16(3, 0, true);
  inner[5] = 0;
  view.setUint16(6, rows.length, true);
  inner.set(rows, 8);
  const content = new Uint8Array(4 + inner.length);
  new DataView(content.buffer).setUint16(0, order, true);
  new DataView(content.buffer).setUint16(2, inner.length, true);
  content.set(inner, 4);
  return content;
}

/** A5 response content is TLV: key, LE16 length, value. Key 1 is the result. */
export function a5Result(content: Uint8Array): Uint8Array | undefined {
  for (let offset = 0; offset + 3 <= content.length;) {
    const size = content[offset + 1] | content[offset + 2] << 8;
    if (offset + 3 + size > content.length) return undefined;
    if (content[offset] === 1) return content.slice(offset + 3, offset + 3 + size);
    offset += 3 + size;
  }
  return undefined;
}

export type PaperangReply =
  | { kind: 'a5'; command: number; messageType: number; content: Uint8Array }
  | { kind: 'legacy'; command: number; payload: Uint8Array; crcSeed: number };

/** Streaming parser for device notifications; drops bytes until a valid frame aligns. */
export class PaperangReplyParser {
  private buffer: number[] = [];
  private legacySeeds: number[];
  constructor(legacySeeds = [P1_CRC_SEED, P1S_CRC_SEED]) { this.legacySeeds = legacySeeds; }
  reset() { this.buffer = []; }
  feed(bytes: Uint8Array): PaperangReply[] {
    this.buffer.push(...bytes);
    const replies: PaperangReply[] = [];
    while (this.buffer.length) {
      const result = this.parseOne();
      if (result === 'incomplete') break;
      if (result === 'invalid') { this.buffer.shift(); continue; }
      replies.push(result.reply);
      this.buffer.splice(0, result.length);
    }
    return replies;
  }
  private parseOne(): { reply: PaperangReply; length: number } | 'incomplete' | 'invalid' {
    const b = this.buffer;
    if (b[0] === 0xa5) {
      if (b.length < 4) return 'incomplete';
      const size = b[2] | b[3] << 8;
      if (b[1] > 1 || size < 5 || size > MAX_REPLY_PAYLOAD) return 'invalid';
      if (b.length < size + 9) return 'incomplete';
      const payload = Uint8Array.from(b.slice(4, 4 + size));
      const crc = (b[4 + size] | b[5 + size] << 8 | b[6 + size] << 16 | b[7 + size] << 24) >>> 0;
      const contentLength = payload[3] | payload[4] << 8;
      if (b[size + 8] !== 0x5a || contentLength !== size - 5 || crc !== crc32(payload, P1_CRC_SEED)) return 'invalid';
      return { reply: { kind: 'a5', command: payload[0] << 8 | payload[1], messageType: payload[2], content: payload.slice(5) }, length: size + 9 };
    }
    if (b[0] === 0x02) {
      if (b.length < 5) return 'incomplete';
      const size = b[3] | b[4] << 8;
      if (size > MAX_REPLY_PAYLOAD) return 'invalid';
      if (b.length < size + 10) return 'incomplete';
      const payload = Uint8Array.from(b.slice(5, 5 + size));
      const crc = (b[5 + size] | b[6 + size] << 8 | b[7 + size] << 16 | b[8 + size] << 24) >>> 0;
      const crcSeed = this.legacySeeds.find(seed => crc32(payload, seed) === crc);
      if (b[size + 9] !== 0x03 || crcSeed === undefined) return 'invalid';
      return { reply: { kind: 'legacy', command: b[1], payload, crcSeed }, length: size + 10 };
    }
    return 'invalid';
  }
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
