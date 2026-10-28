import { describe, expect, it, vi } from 'vitest';
import { PaperangPrinter, PrinterBridgeUnavailableError, PrinterConnectionError, PrinterProtocolError, PRINTER_BRIDGE_URL, type PrinterBluetooth } from '../paperang-printer';
import { paperangFrame, rasterFrames, selfTestFrame, a5Frame, a5Result, a5BitmapContent, PaperangReplyParser, type PaperangReply, GEN2_HANDSHAKE, A5_GET_VERSION, A5_BITMAP, A5_BITMAP_ROWS_BYTES, P1_CRC_SEED, P1S_CRC_SEED, P1_SERVICE, P1_WRITE, P1S_WRITE, P1S_NOTIFY, P1_BLE_SERVICE, P1_BLE_WRITE, P1_BLE_NOTIFY, P1_BLE_FLOW } from '../paperang-protocol';

const hex = (text: string) => Uint8Array.from(text.match(/../g)!.map(byte => parseInt(byte, 16)));
// Captured P1 A5 01.03.18 responses published by paperang-p1-connect (tests/test_a5.py).
const A5_VERSION_REPLY = 'a50110000115020b0001080030312e30332e3138b4204a405a';
const A5_BITMAP_ACK = 'a5010800051b020300010000ac4a277f5a';

function setup() {
  let disconnected = () => {};
  let notify = () => {};
  let reply = () => {};
  let receiving = false;
  const write = vi.fn(async (_data: Uint8Array) => {});
  const receive = {
    value: undefined as DataView | undefined,
    writeValueWithResponse: write,
    startNotifications: vi.fn(async () => { receiving = true; }),
    addEventListener: vi.fn((_type: string, listener: () => void) => { reply = listener; }),
    removeEventListener: vi.fn(),
  };
  const flow = {
    value: new DataView(new Uint8Array([1, 4]).buffer),
    writeValueWithResponse: write,
    startNotifications: vi.fn(async () => { flow.value = new DataView(new Uint8Array([1, 4]).buffer); notify(); }),
    addEventListener: vi.fn((_type: string, listener: () => void) => { notify = listener; }),
    removeEventListener: vi.fn(),
  };
  const grant = (count: number) => { flow.value = new DataView(new Uint8Array([1, count]).buffer); notify(); };
  // Reproduce the hardware: FF03 grants do not replenish without FF01 enabled.
  const writeWithoutResponse = vi.fn(async (_data: Uint8Array) => { if (receiving) grant(1); });
  const getCharacteristic = vi.fn(async (uuid: string) => {
    if (uuid === P1_BLE_FLOW) return flow;
    if (uuid === P1_BLE_NOTIFY || uuid === P1S_NOTIFY) return receive;
    return { writeValueWithResponse: write, writeValueWithoutResponse: writeWithoutResponse };
  });
  const getCharacteristics = vi.fn(async (): Promise<Array<{
    uuid: string;
    properties: { read?: boolean; write?: boolean; writeWithoutResponse?: boolean; notify?: boolean; indicate?: boolean };
    writeValueWithResponse: typeof write;
  }>> => []);
  const service = { getCharacteristic, getCharacteristics };
  const getPrimaryService = vi.fn(async () => service);
  const device = {
    name: undefined as string | undefined,
    gatt: { connected: true, connect: vi.fn(async () => ({ getPrimaryService })), disconnect: vi.fn() },
    addEventListener: vi.fn((_type: string, listener: () => void) => { disconnected = listener; }),
    removeEventListener: vi.fn(),
  };
  const bluetooth: PrinterBluetooth = { requestDevice: vi.fn(async () => device) };
  // Legacy P1 units never answer the A5 firmware probe; keep its wait short.
  const printer = new PaperangPrinter(() => bluetooth, undefined, 5);
  /** Connects and forgets the A5 firmware probe written while connecting. */
  const connected = async () => {
    const connection = printer.connect();
    if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(10);
    await connection;
    write.mockClear();
    writeWithoutResponse.mockClear();
  };
  return { printer, connected, bluetooth, write, writeWithoutResponse, receive, flow, grant, getPrimaryService, getCharacteristic, getCharacteristics, device, disconnect: () => disconnected(), reply: (bytes: number[]) => { receive.value = new DataView(Uint8Array.from(bytes).buffer); reply(); } };
}

/** A P1S on the transparent UART path that answers only in one Paperang dialect. */
function p1s(dialect: 'a5' | 'gen1' | 'gen2' | 'silent', options: { reject?: number; wrongEcho?: boolean } = {}) {
  const harness = setup();
  harness.getCharacteristic.mockRejectedValueOnce(new DOMException('missing', 'NotFoundError'));
  const frames: PaperangReply[] = [];
  let handshake = false;
  harness.write.mockImplementation(async (data: Uint8Array) => {
    for (const frame of new PaperangReplyParser().feed(data)) {
      frames.push(frame);
      if (dialect === 'a5' && frame.kind === 'a5') {
        // P1S acknowledges each bitmap chunk by echoing its order as a nested TLV {1: LE16 order}.
        const result = frame.command === A5_GET_VERSION ? new TextEncoder().encode('01.03.18')
          : frame.command === options.reject ? new Uint8Array([1])
            : frame.command === 0x051b ? Uint8Array.from([1, 2, 0, frame.content[0] + (options.wrongEcho ? 1 : 0), frame.content[1]])
              : new Uint8Array();
        harness.reply(Array.from(a5Frame(frame.command, Uint8Array.from([1, result.length, 0, ...result]), 2)));
      } else if (dialect === 'gen1' && frame.kind === 'legacy' && frame.crcSeed === P1_CRC_SEED) {
        harness.reply(Array.from(paperangFrame(frame.command, new Uint8Array([0]))));
      } else if (dialect === 'gen2' && frame.kind === 'legacy') {
        if (frame.command === 0x18) handshake = true;
        else if (handshake && frame.crcSeed === P1S_CRC_SEED) harness.reply(Array.from(paperangFrame(frame.command, new Uint8Array([0]), P1S_CRC_SEED)));
      }
    }
  });
  return { ...harness, sent: () => frames };
}

/** A paired P1S reached through the local SPP bridge, answering in A5. */
function bridgePrinter(bridge: 'ready' | 'absent' | 'error' = 'ready') {
  const listeners: Record<string, ((event: { data: unknown }) => void)[]> = {};
  const emit = (type: string, data?: unknown) => listeners[type]?.forEach(listener => listener({ data }));
  const sent: Uint8Array[] = [];
  const socket = {
    binaryType: 'blob' as BinaryType,
    url: '',
    send: vi.fn((data: string | Uint8Array) => {
      if (typeof data === 'string') {
        if (JSON.parse(data).type === 'open') {
          queueMicrotask(() => emit('message', JSON.stringify(bridge === 'ready'
            ? { type: 'ready', name: 'Paperang_P1S' }
            : { type: 'error', message: 'Could not open the printer' })));
        }
        return;
      }
      sent.push(data);
      for (const frame of new PaperangReplyParser().feed(data)) {
        if (frame.kind !== 'a5') continue;
        const result = frame.command === A5_GET_VERSION ? new TextEncoder().encode('00.00.08') : new Uint8Array();
        const reply = a5Frame(frame.command, Uint8Array.from([1, result.length, 0, ...result]), 2);
        queueMicrotask(() => emit('message', reply.buffer));
      }
    }),
    close: vi.fn(() => emit('close')),
    addEventListener: vi.fn((type: string, listener: (event: { data: unknown }) => void) => { (listeners[type] ??= []).push(listener); }),
  };
  const openSocket = vi.fn((url: string) => {
    socket.url = url;
    queueMicrotask(() => emit(bridge === 'absent' ? 'close' : 'open'));
    return socket;
  });
  const printer = new PaperangPrinter(() => undefined, openSocket);
  return { printer, socket, openSocket, sent, dropLink: () => emit('close') };
}

describe('P1 protocol', () => {
  it('matches independently calculated seeded CRC32 vectors and little endian framing', () => {
    expect(Array.from(paperangFrame(0, new Uint8Array([128, 0, 255])))).toEqual([2, 0, 0, 3, 0, 128, 0, 255, 0xab, 0xab, 0xa9, 0xbf, 3]);
    expect(Array.from(paperangFrame(16, new Uint8Array([0])))).toEqual([2, 16, 0, 1, 0, 0, 0x46, 0x89, 0x5e, 0x9e, 3]);
  });
  it('keeps complete 48-byte rows, limits payloads to 480, and feeds after the last row', () => {
    const raster = Uint8Array.from({ length: 48 * 23 }, (_, i) => i % 256);
    const frames = rasterFrames(raster);
    expect(frames.map(frame => frame.length)).toEqual([490, 490, 154, 12]);
    expect(frames.at(-1)).toEqual(paperangFrame(26, new Uint8Array([80, 0])));
    expect(frames.slice(0, -1).flatMap(f => Array.from(f.slice(5, -5)))).toEqual(Array.from(raster));
    expect(() => rasterFrames(new Uint8Array(49))).toThrow();
    expect(() => paperangFrame(0, new Uint8Array(481))).toThrow();
  });
  it('sends the self-test command with the single zero byte every public client uses', () => {
    expect(Array.from(selfTestFrame())).toEqual(Array.from(paperangFrame(27, new Uint8Array([0]), P1_CRC_SEED)));
    expect(selfTestFrame()[3]).toBe(1);
  });
  it('builds the fixed gen2 handshake as a standard-seeded switch to CRC key 0', () => {
    expect(Array.from(paperangFrame(0x18, hex('21957635')))).toEqual(Array.from(GEN2_HANDSHAKE));
  });
  it('parses captured A5 responses and re-encodes them byte for byte', () => {
    const [version] = new PaperangReplyParser().feed(hex(A5_VERSION_REPLY));
    expect(version).toMatchObject({ kind: 'a5', command: 0x0115, messageType: 2 });
    expect(new TextDecoder().decode(version.kind === 'a5' ? a5Result(version.content) : undefined)).toBe('01.03.18');
    expect(Array.from(a5Frame(0x051b, hex('010000'), 2))).toEqual(Array.from(hex(A5_BITMAP_ACK)));
  });
  it('reassembles split notifications, skips noise, and rejects bad CRCs', () => {
    const parser = new PaperangReplyParser();
    const bytes = hex(`ff00${A5_BITMAP_ACK}`);
    expect(parser.feed(bytes.slice(0, 7))).toEqual([]);
    expect(parser.feed(bytes.slice(7))).toMatchObject([{ kind: 'a5', command: 0x051b }]);
    const corrupt = hex(A5_BITMAP_ACK);
    corrupt[10] ^= 1;
    expect(new PaperangReplyParser().feed(corrupt)).toEqual([]);
    expect(new PaperangReplyParser().feed(paperangFrame(17, new Uint8Array([88]), 0))).toMatchObject([{ kind: 'legacy', command: 17, crcSeed: 0 }]);
  });
  it('wraps A5 bitmap rows with their order and row geometry', () => {
    const rows = new Uint8Array(96).fill(0xff);
    const content = a5BitmapContent(rows, 2);
    expect(Array.from(content.slice(0, 12))).toEqual([2, 0, 104, 0, 1, 48, 0, 0, 0, 0, 96, 0]);
    expect(a5Frame(A5_BITMAP, a5BitmapContent(new Uint8Array(A5_BITMAP_ROWS_BYTES), 1)).length).toBeLessThanOrEqual(512);
    expect(() => a5BitmapContent(new Uint8Array(47), 1)).toThrow();
  });
});

describe('P1 Bluetooth transport', () => {
  it('publishes the current device name only after connecting and keeps it while printing', async () => {
    const { printer, device, write, disconnect } = setup();
    device.name = '  MiaoMiaoJi-1234  ';
    expect(printer.getDeviceName()).toBeUndefined();
    const connection = printer.connect();
    expect(printer.getDeviceName()).toBeUndefined();
    await connection;
    expect(printer.getDeviceName()).toBe('MiaoMiaoJi-1234');
    let release = () => {};
    write.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    const job = printer.print(new Uint8Array(48));
    expect(printer.getSnapshot()).toBe('printing');
    expect(printer.getDeviceName()).toBe('MiaoMiaoJi-1234');
    release();
    await job;
    printer.disconnect();
    expect(printer.getDeviceName()).toBeUndefined();
    device.name = 'Paperang-5678';
    await printer.connect();
    expect(printer.getDeviceName()).toBe('Paperang-5678');
    disconnect();
    expect(printer.getDeviceName()).toBeUndefined();
  });
  it.each([undefined, '', '   '])('returns no device name for an unnamed printer (%s)', async name => {
    const { printer, device } = setup();
    device.name = name;
    await printer.connect();
    expect(printer.getDeviceName()).toBeUndefined();
  });
  it('does not expose the selected name after a failed connection', async () => {
    const { printer, device, getPrimaryService } = setup();
    device.name = 'MiaoMiaoJi-1234';
    getPrimaryService.mockRejectedValue(new Error('discovery failed'));
    await expect(printer.connect()).rejects.toMatchObject({ stage: 'service' });
    expect(printer.getDeviceName()).toBeUndefined();
  });
  it('requests permission immediately, discovers P1 and publishes connection state', async () => {
    const { printer, bluetooth, getPrimaryService, getCharacteristic } = setup();
    const listener = vi.fn();
    const unsubscribe = printer.subscribe(listener);
    const connection = printer.connect();
    expect(bluetooth.requestDevice).toHaveBeenCalledWith({
      filters: [
        { services: [P1_SERVICE] },
        { services: [P1_BLE_SERVICE] },
        { namePrefix: 'Paperang' },
        { namePrefix: 'PAPERANG' },
        { namePrefix: 'MiaoMiaoJi' },
        { namePrefix: 'P1S' },
      ],
      optionalServices: [P1_SERVICE, P1_BLE_SERVICE],
    });
    expect(printer.getSnapshot()).toBe('connecting');
    await connection;
    expect(getPrimaryService).toHaveBeenCalledWith(P1_SERVICE);
    expect(getCharacteristic).toHaveBeenCalledWith(P1_WRITE);
    expect(printer.getSnapshot()).toBe('connected');
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });
  it('can explicitly show all BLE devices as a compatibility fallback', async () => {
    const { printer, bluetooth } = setup();
    await printer.connect(true);
    expect(bluetooth.requestDevice).toHaveBeenCalledWith({
      acceptAllDevices: true,
      optionalServices: [P1_SERVICE, P1_BLE_SERVICE],
    });
  });
  it('lists the connected service characteristics and their transport capabilities without writing', async () => {
    const { printer, getCharacteristics, write, connected } = setup();
    getCharacteristics.mockResolvedValue([
      { uuid: P1S_NOTIFY, properties: { notify: true }, writeValueWithResponse: write },
      { uuid: P1S_WRITE, properties: { write: true, writeWithoutResponse: true }, writeValueWithResponse: write },
    ]);
    await connected();
    await expect(printer.inspectGatt()).resolves.toEqual({ characteristics: [
      `${P1S_NOTIFY} (notify)`,
      `${P1S_WRITE} (write, write-without-response)`,
    ] });
    expect(write).not.toHaveBeenCalled();
  });
  it('ignores device picker cancellation and allows reconnection', async () => {
    const { printer, bluetooth } = setup();
    vi.mocked(bluetooth.requestDevice).mockRejectedValueOnce(Object.assign(new Error('cancel'), { name: 'NotFoundError' }));
    await expect(printer.connect()).resolves.toBeUndefined();
    expect(printer.getSnapshot()).toBe('disconnected');
    await printer.connect();
    expect(printer.getSnapshot()).toBe('connected');
  });
  it('retries one transient GATT connection failure without reopening the picker', async () => {
    const { printer, bluetooth, device, getPrimaryService } = setup();
    device.gatt.connect
      .mockRejectedValueOnce(new DOMException('temporary', 'NetworkError'))
      .mockResolvedValueOnce({ getPrimaryService });
    await printer.connect();
    expect(bluetooth.requestDevice).toHaveBeenCalledTimes(1);
    expect(device.gatt.connect).toHaveBeenCalledTimes(2);
    expect(printer.getSnapshot()).toBe('connected');
  });
  it('reports missing P1 services as discovery failures, not picker cancellation', async () => {
    const { printer, getPrimaryService } = setup();
    getPrimaryService.mockRejectedValue(Object.assign(new Error('missing'), { name: 'NotFoundError' }));
    await expect(printer.connect()).rejects.toMatchObject({ stage: 'service' });
    expect(printer.getSnapshot()).toBe('disconnected');
  });
  it('connects the observed FF00/FF02 P1 profile and sends P1 frames through it', async () => {
    const { printer, getPrimaryService, getCharacteristic, write, writeWithoutResponse, receive, flow, connected } = setup();
    getPrimaryService.mockRejectedValueOnce(new DOMException('missing', 'NotFoundError'));
    await connected();
    expect(getPrimaryService.mock.calls).toEqual([[P1_SERVICE], [P1_BLE_SERVICE]]);
    expect(getCharacteristic).toHaveBeenCalledWith(P1_BLE_WRITE);
    expect(getCharacteristic).toHaveBeenCalledWith(P1_BLE_NOTIFY);
    expect(receive.startNotifications).toHaveBeenCalledTimes(1);
    expect(receive.startNotifications.mock.invocationCallOrder[0]).toBeLessThan(flow.startNotifications.mock.invocationCallOrder[0]);
    expect(printer.getSnapshot()).toBe('connected');
    const raster = new Uint8Array(48 * 12);
    await printer.print(raster);
    expect(write).not.toHaveBeenCalled();
    const chunks = writeWithoutResponse.mock.calls.map(call => call[0]);
    expect(chunks.every(chunk => chunk.length <= 20)).toBe(true);
    expect(chunks.flatMap(chunk => Array.from(chunk))).toEqual(rasterFrames(raster).flatMap(frame => Array.from(frame)));
  });
  it('sends FF00 packets at the size the printer reports on FF03, one credit each', async () => {
    const { printer, getPrimaryService, flow, writeWithoutResponse, connected } = setup();
    getPrimaryService.mockRejectedValueOnce(new DOMException('missing', 'NotFoundError'));
    flow.startNotifications.mockImplementation(async () => {
      for (const message of [[2, 0x67, 0], [1, 4]]) {
        flow.value = new DataView(Uint8Array.from(message).buffer);
        flow.addEventListener.mock.calls[0][1]();
      }
    });
    await connected();
    const raster = new Uint8Array(48 * 12);
    await printer.print(raster);
    const chunks = writeWithoutResponse.mock.calls.map(call => call[0]);
    expect(chunks.every(chunk => chunk.length <= 103)).toBe(true);
    expect(chunks.some(chunk => chunk.length === 103)).toBe(true);
    expect(chunks.flatMap(chunk => Array.from(chunk))).toEqual(rasterFrames(raster).flatMap(frame => Array.from(frame)));
    expect(printer.getLog().some(line => line.includes('chunks of up to 103 B'))).toBe(true);
  });
  it('falls back to 20-byte packets when the browser rejects a large one, without losing bytes', async () => {
    const { printer, getPrimaryService, flow, writeWithoutResponse, grant, connected } = setup();
    getPrimaryService.mockRejectedValueOnce(new DOMException('missing', 'NotFoundError'));
    flow.startNotifications.mockImplementation(async () => {
      for (const message of [[2, 0xaa, 0], [1, 4]]) {
        flow.value = new DataView(Uint8Array.from(message).buffer);
        flow.addEventListener.mock.calls[0][1]();
      }
    });
    await connected();
    const accepted: Uint8Array[] = [];
    writeWithoutResponse.mockImplementation(async (chunk: Uint8Array) => {
      if (chunk.length > 20) throw new DOMException('Value is too long', 'InvalidModificationError');
      accepted.push(chunk);
      grant(1);
    });
    const raster = new Uint8Array(48 * 12);
    await expect(printer.print(raster)).resolves.toBe('sent');
    expect(accepted.flatMap(chunk => Array.from(chunk))).toEqual(rasterFrames(raster).flatMap(frame => Array.from(frame)));
    expect(printer.getLog().some(line => line.includes('170-byte packet rejected'))).toBe(true);
    expect(printer.getSnapshot()).toBe('connected');
  });
  it('detects A5 firmware on an FF00 P1 while connecting and prints in A5', async () => {
    const harness = setup();
    harness.getPrimaryService.mockRejectedValueOnce(new DOMException('missing', 'NotFoundError'));
    // Reassemble 20-byte chunks into A5 frames and acknowledge each one, as A5 firmware does.
    const parser = new PaperangReplyParser();
    const commands: number[] = [];
    harness.writeWithoutResponse.mockImplementation(async (chunk: Uint8Array) => {
      harness.grant(1);
      for (const frame of parser.feed(chunk)) {
        if (frame.kind !== 'a5') continue;
        commands.push(frame.command);
        const result = frame.command === A5_GET_VERSION ? new TextEncoder().encode('01.03.18')
          : frame.command === A5_BITMAP ? Uint8Array.from([1, 2, 0, frame.content[0], frame.content[1]]) : new Uint8Array();
        harness.reply(Array.from(a5Frame(frame.command, Uint8Array.from([1, result.length, 0, ...result]), 2)));
      }
    });
    await harness.printer.connect();
    expect(harness.printer.getLog().some(line => line.includes('print protocol: a5'))).toBe(true);
    await expect(harness.printer.print(new Uint8Array(48 * 12))).resolves.toBe('sent');
    // Bitmap acks are summarised; setup and finish replies stay in the log.
    const log = harness.printer.getLog();
    expect(log.some(line => line.includes('A5 0x051b'))).toBe(false);
    expect(log.some(line => line.includes('2 bitmap chunks acknowledged in'))).toBe(true);
    expect(log.some(line => line.includes('A5 0x051a'))).toBe(true);
    expect(commands).toEqual([A5_GET_VERSION, 0x0511, 0x0520, 0x0519, A5_BITMAP, A5_BITMAP, 0x051a, 0x0516]);
    expect(harness.printer.getSnapshot()).toBe('connected');
  });
  it('connects through the P1S transparent UART characteristic and asks A5 first', async () => {
    const { printer, getCharacteristic, write, writeWithoutResponse } = p1s('a5');
    await printer.connect();
    expect(getCharacteristic.mock.calls.map(call => call[0])).toEqual([P1_WRITE, P1S_WRITE, P1S_NOTIFY]);
    expect(writeWithoutResponse).not.toHaveBeenCalled();
    expect(write.mock.calls.map(call => call[0])).toEqual([a5Frame(A5_GET_VERSION)]);
    expect(printer.getProtocol()).toBe('a5');
    expect(printer.getSnapshot()).toBe('connected');
  });
  it('prints an uninterrupted, acknowledged A5 job', async () => {
    const { printer, sent } = p1s('a5');
    await printer.connect();
    const raster = Uint8Array.from({ length: 48 * 12 }, (_, i) => i % 256);
    await expect(printer.print(raster)).resolves.toBe('sent');
    expect(sent().slice(1).map(frame => frame.kind === 'a5' && frame.command)).toEqual([0x0511, 0x0520, 0x0519, 0x051b, 0x051b, 0x051a, 0x0516]);
    const bitmaps = sent().filter(frame => frame.kind === 'a5' && frame.command === 0x051b);
    expect(bitmaps.map(frame => frame.kind === 'a5' && Array.from(frame.content.slice(0, 2)))).toEqual([[1, 0], [2, 0]]);
    expect(bitmaps.flatMap(frame => frame.kind === 'a5' ? Array.from(frame.content.slice(12)) : [])).toEqual(Array.from(raster));
    expect(printer.getSnapshot()).toBe('connected');
  });
  it('stops an A5 job without retrying when the printer rejects a bitmap chunk', async () => {
    const { printer, sent } = p1s('a5', { reject: 0x051b });
    await printer.connect();
    await expect(printer.print(new Uint8Array(48 * 12))).rejects.toThrow('A5 0x051b rejected');
    expect(sent().filter(frame => frame.kind === 'a5' && frame.command === 0x051b)).toHaveLength(1);
    expect(printer.getSnapshot()).toBe('disconnected');
  });
  it('rejects a bitmap acknowledgement that echoes a different chunk order', async () => {
    const { printer } = p1s('a5', { wrongEcho: true });
    await printer.connect();
    await expect(printer.print(new Uint8Array(48 * 12))).rejects.toThrow('A5 0x051b rejected: 01 05 00 01 02 00 02 00');
  });
  it('acknowledges the A5 self-test command', async () => {
    const { printer, sent } = p1s('a5');
    await printer.connect();
    await expect(printer.printSelfTest()).resolves.toBe('sent');
    expect(sent().at(-1)).toMatchObject({ kind: 'a5', command: 0x0517 });
  });
  it('falls back to standard-seeded gen1 frames and confirms the job with the feed reply', async () => {
    const { printer, write } = p1s('gen1');
    await printer.connect();
    expect(printer.getProtocol()).toBe('gen1');
    expect(write.mock.calls.map(call => call[0])).toEqual([a5Frame(A5_GET_VERSION), paperangFrame(16, new Uint8Array([1]))]);
    write.mockClear();
    const raster = new Uint8Array(48 * 2);
    await expect(printer.print(raster)).resolves.toBe('sent');
    expect(write.mock.calls.map(call => call[0])).toEqual([paperangFrame(44, new Uint8Array([0])), ...rasterFrames(raster)]);
    write.mockClear();
    await expect(printer.printSelfTest()).resolves.toBe('sent');
    expect(write).toHaveBeenCalledWith(selfTestFrame(P1_CRC_SEED));
  });
  it('sends the gen2 handshake before zero-seeded frames', async () => {
    vi.useFakeTimers();
    try {
      const { printer, write } = p1s('gen2');
      const connection = printer.connect();
      // A5 and gen1 probes time out (1.5 s each) before the handshake settles.
      await vi.advanceTimersByTimeAsync(4_000);
      await connection;
      expect(printer.getProtocol()).toBe('gen2');
      expect(write.mock.calls.map(call => call[0]).slice(2)).toEqual([GEN2_HANDSHAKE, paperangFrame(16, new Uint8Array([1]), P1S_CRC_SEED)]);
      write.mockClear();
      const raster = new Uint8Array(48 * 2);
      await expect(printer.print(raster)).resolves.toBe('sent');
      expect(write.mock.calls.map(call => call[0])).toEqual([paperangFrame(44, new Uint8Array([0]), P1S_CRC_SEED), ...rasterFrames(raster, P1S_CRC_SEED)]);
    } finally { vi.useRealTimers(); }
  });
  it('stays connected but refuses to print when no known protocol answers', async () => {
    vi.useFakeTimers();
    try {
      const { printer, write } = p1s('silent');
      const connection = printer.connect();
      await vi.advanceTimersByTimeAsync(5_000);
      await connection;
      expect(write.mock.calls.map(call => call[0])).toEqual([
        a5Frame(A5_GET_VERSION), paperangFrame(16, new Uint8Array([1])), GEN2_HANDSHAKE, paperangFrame(16, new Uint8Array([1]), P1S_CRC_SEED),
      ]);
      expect(printer.getSnapshot()).toBe('connected');
      expect(printer.getProtocol()).toBe('unknown');
      write.mockClear();
      await expect(printer.print(new Uint8Array(48))).rejects.toBeInstanceOf(PrinterProtocolError);
      await expect(printer.printSelfTest()).rejects.toBeInstanceOf(PrinterProtocolError);
      expect(write).not.toHaveBeenCalled();
      expect(printer.getSnapshot()).toBe('connected');
      const diagnostic = printer.diagnose();
      await vi.advanceTimersByTimeAsync(5_000);
      await expect(diagnostic).resolves.toEqual({ result: 'write-only' });
    } finally { vi.useRealTimers(); }
  });
  it('reports the answering protocol and raw reply from the connection test', async () => {
    const { printer } = p1s('a5');
    await printer.connect();
    const diagnostic = await printer.diagnose();
    expect(diagnostic).toMatchObject({ result: 'confirmed', protocol: 'a5' });
    expect(diagnostic.result === 'confirmed' && diagnostic.reply.startsWith('a5 01')).toBe(true);
  });
  it('connects P1S over classic Bluetooth through the local bridge and detects A5', async () => {
    const { printer, socket, openSocket, sent } = bridgePrinter();
    await printer.connectBridge();
    expect(openSocket).toHaveBeenCalledWith(PRINTER_BRIDGE_URL);
    expect(socket.binaryType).toBe('arraybuffer');
    expect(socket.send.mock.calls[0][0]).toBe(JSON.stringify({ type: 'open' }));
    expect(sent).toEqual([a5Frame(A5_GET_VERSION)]);
    expect(printer.getSnapshot()).toBe('connected');
    expect(printer.getTransport()).toBe('spp');
    expect(printer.getProtocol()).toBe('a5');
    expect(printer.getDeviceName()).toBe('Paperang_P1S');
  });
  it('prints an acknowledged A5 job through the bridge', async () => {
    const { printer, sent } = bridgePrinter();
    await printer.connectBridge();
    await expect(printer.print(new Uint8Array(48 * 12))).resolves.toBe('sent');
    const commands = sent.slice(1).flatMap(chunk => new PaperangReplyParser().feed(chunk)).map(frame => frame.kind === 'a5' && frame.command);
    expect(commands).toEqual([0x0511, 0x0520, 0x0519, 0x051b, 0x051b, 0x051a, 0x0516]);
    expect(printer.getSnapshot()).toBe('connected');
  });
  it('reports a missing bridge separately from bridge-side printer errors', async () => {
    const absent = bridgePrinter('absent');
    const missing = await absent.printer.connectBridge().catch(error => error);
    expect(missing).toBeInstanceOf(PrinterConnectionError);
    expect(missing.cause).toBeInstanceOf(PrinterBridgeUnavailableError);
    expect(absent.printer.getSnapshot()).toBe('disconnected');
    const failing = bridgePrinter('error');
    const failed = await failing.printer.connectBridge().catch(error => error);
    expect(failed.cause).not.toBeInstanceOf(PrinterBridgeUnavailableError);
    expect(failed.cause.message).toBe('Could not open the printer');
  });
  it('drops to disconnected when the bridge link closes and closes the socket on disconnect', async () => {
    const first = bridgePrinter();
    await first.printer.connectBridge();
    first.dropLink();
    expect(first.printer.getSnapshot()).toBe('disconnected');
    const second = bridgePrinter();
    await second.printer.connectBridge();
    second.printer.disconnect();
    expect(second.socket.close).toHaveBeenCalled();
    expect(second.printer.getSnapshot()).toBe('disconnected');
  });
  it('waits for FF03 credits before sending more chunks and resumes on new grants', async () => {
    const { printer, getPrimaryService, writeWithoutResponse, grant, connected } = setup();
    getPrimaryService.mockRejectedValueOnce(new DOMException('missing', 'NotFoundError'));
    writeWithoutResponse.mockImplementation(async () => {});
    await connected();
    // Give back the credit the firmware probe spent while connecting.
    grant(1);
    const job = printer.print(new Uint8Array(48));
    for (let i = 0; i < 20; i++) await Promise.resolve();
    // A raster frame uses 3 chunks and the feed uses 1; initial grant covers exactly 4.
    await job;
    expect(writeWithoutResponse).toHaveBeenCalledTimes(4);
    const nextJob = printer.print(new Uint8Array(48));
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(writeWithoutResponse).toHaveBeenCalledTimes(4);
    grant(4);
    await nextJob;
    expect(writeWithoutResponse).toHaveBeenCalledTimes(8);
  });
  it('times out missing credits while connecting, without sending or automatically retrying', async () => {
    vi.useFakeTimers();
    try {
      const { printer, getPrimaryService, flow, writeWithoutResponse, device } = setup();
      getPrimaryService.mockRejectedValueOnce(new DOMException('missing', 'NotFoundError'));
      flow.startNotifications.mockImplementation(async () => {});
      // The firmware probe is the first write, so a printer that never grants credits fails here.
      const connection = printer.connect();
      const rejected = expect(connection).rejects.toMatchObject({ stage: 'characteristic', cause: expect.objectContaining({ message: expect.stringContaining('timed out') }) });
      await vi.advanceTimersByTimeAsync(10_000);
      await rejected;
      expect(writeWithoutResponse).not.toHaveBeenCalled();
      expect(printer.getSnapshot()).toBe('disconnected');
      expect(device.gatt.disconnect).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
  it('ends an unresponsive legacy write after the timeout', async () => {
    vi.useFakeTimers();
    try {
      const { printer, write, connected } = setup();
      await connected();
      write.mockImplementationOnce(() => new Promise<void>(() => {}));
      const rejected = expect(printer.print(new Uint8Array(48))).rejects.toThrow('P1 gen1 frame 1/2');
      await vi.advanceTimersByTimeAsync(10_000);
      await rejected;
      expect(printer.getSnapshot()).toBe('disconnected');
      expect(write).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });
  it('does not try another service after a connection or permission error', async () => {
    const { printer, getPrimaryService } = setup();
    getPrimaryService.mockRejectedValueOnce(new DOMException('disconnected', 'NetworkError'));
    await expect(printer.connect()).rejects.toMatchObject({ stage: 'service' });
    expect(getPrimaryService).toHaveBeenCalledTimes(1);
    expect(printer.getSnapshot()).toBe('disconnected');
  });
  it('does not tear down a new connection when an older interrupted write settles', async () => {
    const { printer, write, disconnect, device, connected } = setup();
    await connected();
    let release = () => {};
    write.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    const oldJob = printer.print(new Uint8Array(48 * 12));
    disconnect();
    await printer.connect();
    device.gatt.disconnect.mockClear();
    release();
    await expect(oldJob).rejects.toThrow('disconnected');
    expect(printer.getSnapshot()).toBe('connected');
    expect(device.gatt.disconnect).not.toHaveBeenCalled();
  });
  it('serializes writes, rejects simultaneous jobs, and ends with feed', async () => {
    const { printer, write, connected } = setup();
    await connected();
    let release = () => {};
    write.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    const raster = new Uint8Array(48 * 12);
    const job = printer.print(raster);
    expect(write).toHaveBeenCalledTimes(1);
    await expect(printer.print(raster)).rejects.toThrow('not ready');
    release();
    await job;
    expect(write.mock.calls.map(call => call[0])).toEqual(rasterFrames(raster));
    expect(printer.getSnapshot()).toBe('connected');
  });
  it('stops on write failure without retrying, then permits manual reconnection', async () => {
    const { printer, write, connected } = setup();
    await connected();
    write.mockRejectedValueOnce(new Error('connection lost'));
    await expect(printer.print(new Uint8Array(48 * 12))).rejects.toThrow();
    expect(write).toHaveBeenCalledTimes(1);
    expect(printer.getSnapshot()).toBe('disconnected');
    await printer.connect();
    expect(printer.getSnapshot()).toBe('connected');
  });
  it('does not continue a job after the device disconnects', async () => {
    const { printer, write, disconnect, connected } = setup();
    await connected();
    write.mockImplementationOnce(async () => { disconnect(); });
    await expect(printer.print(new Uint8Array(48 * 12))).rejects.toThrow('disconnected');
    expect(write).toHaveBeenCalledTimes(1);
  });
});
