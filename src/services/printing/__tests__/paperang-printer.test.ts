import { describe, expect, it, vi } from 'vitest';
import { PaperangPrinter, type PrinterBluetooth } from '../paperang-printer';
import { paperangFrame, p1PaperTypeFrame, p1SessionKeyFrame, rasterFrames, P1_SERVICE, P1_WRITE, P1S_WRITE, P1S_NOTIFY, P1_SESSION_CRC_KEY, P1_BLE_SERVICE, P1_BLE_WRITE, P1_BLE_NOTIFY, P1_BLE_FLOW } from '../paperang-protocol';

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
  const getPrimaryService = vi.fn(async () => ({ getCharacteristic }));
  const device = {
    name: undefined as string | undefined,
    gatt: { connected: true, connect: vi.fn(async () => ({ getPrimaryService })), disconnect: vi.fn() },
    addEventListener: vi.fn((_type: string, listener: () => void) => { disconnected = listener; }),
    removeEventListener: vi.fn(),
  };
  const bluetooth: PrinterBluetooth = { requestDevice: vi.fn(async () => device) };
  return { printer: new PaperangPrinter(() => bluetooth), bluetooth, write, writeWithoutResponse, receive, flow, grant, getPrimaryService, getCharacteristic, device, disconnect: () => disconnected(), reply: (bytes: number[]) => { receive.value = new DataView(Uint8Array.from(bytes).buffer); reply(); } };
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
  it('builds the Paperang session handshake and sequences negotiated print packets', () => {
    const handshake = p1SessionKeyFrame();
    expect(handshake[1]).toBe(24);
    expect(Array.from(handshake.slice(5, 9))).toEqual([0x78, 0x7a, 0xce, 0x33]);
    expect(p1PaperTypeFrame()[1]).toBe(44);
    const frames = rasterFrames(new Uint8Array(48 * 21), P1_SESSION_CRC_KEY, true);
    expect(frames.map(frame => frame[2])).toEqual([0, 1, 2, 0]);
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
    const { printer, getPrimaryService, getCharacteristic, write, writeWithoutResponse, receive, flow } = setup();
    getPrimaryService.mockRejectedValueOnce(new DOMException('missing', 'NotFoundError'));
    await printer.connect();
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
  it('falls back to the P1S transparent UART write characteristic', async () => {
    const { printer, getCharacteristic, write, writeWithoutResponse, receive, reply } = setup();
    write.mockImplementation(async data => {
      if ([24, 44, 26].includes(data[1])) queueMicrotask(() => reply([0x02, data[1] + 1, 0, 1, 0, 1]));
    });
    getCharacteristic.mockImplementation(async (uuid: string) => {
      if (uuid === P1_WRITE) throw new DOMException('missing', 'NotFoundError');
      if (uuid === P1S_NOTIFY) return receive;
      return { writeValueWithResponse: write, writeValueWithoutResponse: writeWithoutResponse };
    });
    await printer.connect();
    expect(getCharacteristic.mock.calls.map(call => call[0])).toEqual([P1_WRITE, P1S_WRITE, P1S_NOTIFY]);
    expect(write).toHaveBeenCalledWith(p1SessionKeyFrame());
    const raster = new Uint8Array(48 * 2);
    expect(await printer.print(raster)).toBe('sent');
    expect(writeWithoutResponse).not.toHaveBeenCalled();
    expect(write.mock.calls.map(call => call[0])).toEqual([
      p1SessionKeyFrame(),
      p1PaperTypeFrame(),
      ...rasterFrames(raster, P1_SESSION_CRC_KEY, true),
    ]);
    expect(printer.getLastDeviceReply()).toBe('02 1b 00 01 00 01');
  });
  it('waits for FF03 credits before sending more chunks and resumes on new grants', async () => {
    const { printer, getPrimaryService, writeWithoutResponse, grant } = setup();
    getPrimaryService.mockRejectedValueOnce(new DOMException('missing', 'NotFoundError'));
    writeWithoutResponse.mockImplementation(async () => {});
    await printer.connect();
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
  it('times out missing credits without sending or automatically retrying', async () => {
    vi.useFakeTimers();
    try {
      const { printer, getPrimaryService, flow, writeWithoutResponse, device } = setup();
      getPrimaryService.mockRejectedValueOnce(new DOMException('missing', 'NotFoundError'));
      flow.startNotifications.mockImplementation(async () => {});
      await printer.connect();
      const job = printer.print(new Uint8Array(48));
      const rejected = expect(job).rejects.toThrow('timed out');
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
      const { printer, write } = setup();
      await printer.connect();
      write.mockImplementationOnce(() => new Promise<void>(() => {}));
      const rejected = expect(printer.print(new Uint8Array(48))).rejects.toThrow('P1 frame 1/2, byte 0');
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
    const { printer, write, disconnect, device } = setup();
    await printer.connect();
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
    const { printer, write } = setup();
    await printer.connect();
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
    const { printer, write } = setup();
    await printer.connect();
    write.mockRejectedValueOnce(new Error('connection lost'));
    await expect(printer.print(new Uint8Array(48 * 12))).rejects.toThrow();
    expect(write).toHaveBeenCalledTimes(1);
    expect(printer.getSnapshot()).toBe('disconnected');
    await printer.connect();
    expect(printer.getSnapshot()).toBe('connected');
  });
  it('does not continue a job after the device disconnects', async () => {
    const { printer, write, disconnect } = setup();
    await printer.connect();
    write.mockImplementationOnce(async () => { disconnect(); });
    await expect(printer.print(new Uint8Array(48 * 12))).rejects.toThrow('disconnected');
    expect(write).toHaveBeenCalledTimes(1);
  });
});
