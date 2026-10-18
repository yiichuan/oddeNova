import {
  P1_SERVICE, P1_WRITE, P1S_WRITE, P1S_NOTIFY, P1_CRC_SEED, P1S_CRC_SEED, P1_BLE_SERVICE, P1_BLE_WRITE, P1_BLE_NOTIFY, P1_BLE_FLOW, P1_ROW_BYTES,
  GEN2_HANDSHAKE, LEGACY_FEED_LINE, LEGACY_SELF_TEST, A5_GET_VERSION, A5_SET_DENSITY, A5_PAPER_TYPE, A5_PRINT_START, A5_BITMAP, A5_PRINT_END, A5_FEED, A5_SELF_TEST, A5_BITMAP_ROWS_BYTES,
  PaperangReplyParser, type PaperangReply, a5Frame, a5BitmapContent, a5Result, batteryQueryFrame, paperangFrame, rasterFrames, selfTestFrame,
} from './paperang-protocol';

// Narrow Web Bluetooth interfaces keep browser-specific types inside this service.
interface WriteCharacteristic {
  uuid?: string;
  properties?: { read?: boolean; write?: boolean; writeWithoutResponse?: boolean; notify?: boolean; indicate?: boolean };
  writeValueWithResponse(value: Uint8Array<ArrayBuffer>): Promise<void>;
  writeValueWithoutResponse?(value: Uint8Array<ArrayBuffer>): Promise<void>;
  value?: DataView;
  startNotifications?(): Promise<unknown>;
  addEventListener?(type: 'characteristicvaluechanged', callback: () => void): void;
  removeEventListener?(type: 'characteristicvaluechanged', callback: () => void): void;
}
interface PrinterService {
  getCharacteristic(uuid: string): Promise<WriteCharacteristic>;
  getCharacteristics?(): Promise<WriteCharacteristic[]>;
}
const WRITE_TIMEOUT_MS = 10_000;
const PROBE_TIMEOUT_MS = 1_500;
const HANDSHAKE_SETTLE_MS = 300;
const LEGACY_ACK_TIMEOUT_MS = 3_000;
const A5_REPLY_TIMEOUT_MS = 5_000;
const A5_BITMAP_TIMEOUT_MS = 15_000;
const A5_PRINT_END_TIMEOUT_MS = 30_000;
const FLOW_CHUNK_SIZE = 20;
const LEGACY_SET_PAPER_TYPE = 44;
const A5_DENSITY = 80;
// The card carries its own bottom margin; this short tail only clears the tear edge.
const A5_FEED_LINES = 16;
const CONNECTION_RETRY_DELAY_MS = 200;
// P1S firmware carries print data only over Bluetooth Classic SPP. macOS Chrome cannot
// open that RFCOMM link (Web Serial fails), so scripts/paperang-bridge relays it locally.
export const PRINTER_BRIDGE_URL = 'ws://127.0.0.1:47615';
// Covers the bridge's baseband connect, service query, RFCOMM retries and settle delay.
const BRIDGE_READY_TIMEOUT_MS = 20_000;
async function withWriteTimeout<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('P1 Bluetooth write or flow-control wait timed out after 10 seconds')), WRITE_TIMEOUT_MS);
    })]);
  } finally { clearTimeout(timer); }
}
interface PrinterDevice {
  name?: string;
  gatt?: {
    connected: boolean;
    connect(): Promise<{ getPrimaryService(uuid: string): Promise<PrinterService> }>;
    disconnect(): void;
  };
  addEventListener(type: 'gattserverdisconnected', callback: () => void): void;
  removeEventListener(type: 'gattserverdisconnected', callback: () => void): void;
}
// The subset of WebSocket the bridge transport uses, so tests can drive it directly.
export interface PrinterSocket {
  binaryType: BinaryType;
  send(data: string | Uint8Array<ArrayBuffer>): void;
  close(): void;
  addEventListener(type: 'open' | 'close' | 'error', callback: () => void): void;
  addEventListener(type: 'message', callback: (event: { data: unknown }) => void): void;
}
/** The local bridge is not running (or not reachable) on this computer. */
export class PrinterBridgeUnavailableError extends Error {
  constructor() { super(`No Paperang bridge is listening on ${PRINTER_BRIDGE_URL}`); }
}
export type PrinterTransport = 'ble' | 'spp';
export interface PrinterBluetooth {
  requestDevice(options: ({ acceptAllDevices: true } | { filters: { services?: string[]; namePrefix?: string }[] }) & { optionalServices: string[] }): Promise<PrinterDevice>;
}
export type PrinterConnectionStage = 'selection' | 'connection' | 'service' | 'characteristic';
export class PrinterConnectionError extends Error {
  readonly stage: PrinterConnectionStage;
  constructor(stage: PrinterConnectionStage, cause: unknown) {
    super(`P1 connection failed: ${stage}`, { cause });
    this.stage = stage;
  }
}

export type PrinterState = 'disconnected' | 'connecting' | 'connected' | 'printing';
export type PrintResult = 'sent' | 'unconfirmed';
/** a5: newer firmware frames; gen1: standard-seeded 0x02 frames; gen2: 0x02 frames after the key-0 handshake. */
export type PrinterProtocol = 'a5' | 'gen1' | 'gen2';
export type PrinterDiagnostic = { result: 'confirmed'; protocol: PrinterProtocol; reply: string } | { result: 'write-only' };
/** The BLE data channel accepted writes, but no known Paperang protocol answered on it. */
export class PrinterProtocolError extends Error {
  constructor() { super('No known Paperang protocol (A5, gen1, gen2) answered on this Bluetooth channel'); }
}
export type PrinterGattInspection = { characteristics: string[]; unavailable?: string };

export class PaperangPrinter {
  private state: PrinterState = 'disconnected';
  private listeners = new Set<() => void>();
  private device?: PrinterDevice;
  private characteristic?: WriteCharacteristic;
  private service?: PrinterService;
  private usesP1sProtocol = false;
  private receiveCharacteristic?: WriteCharacteristic;
  private lastDeviceReply?: string;
  private protocol?: PrinterProtocol;
  private parser = new PaperangReplyParser();
  private replyWaiter?: { match: (reply: PaperangReply) => boolean; resolve: (reply?: PaperangReply) => void };
  private flowCharacteristic?: WriteCharacteristic;
  private credits = 0;
  private creditWaiter?: { resolve: () => void; reject: (error: Error) => void };
  private generation = 0;
  private socket?: PrinterSocket;
  private bridgeName?: string;
  private bluetooth: () => PrinterBluetooth | undefined;
  private openSocket: (url: string) => PrinterSocket;
  constructor(
    bluetooth: () => PrinterBluetooth | undefined = () => (navigator as Navigator & { bluetooth?: PrinterBluetooth }).bluetooth,
    openSocket: (url: string) => PrinterSocket = url => new WebSocket(url),
  ) {
    this.bluetooth = bluetooth;
    this.openSocket = openSocket;
  }

  supported = () => typeof window !== 'undefined' && window.isSecureContext && !!this.bluetooth();
  /** The bridge is a macOS IOBluetooth helper, so classic printing is offered on macOS only. */
  bridgeSupported = () => typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent) && typeof WebSocket !== 'undefined';
  getTransport = (): PrinterTransport | undefined => this.state === 'connected' || this.state === 'printing'
    ? this.socket ? 'spp' : 'ble' : undefined;
  private linkUp = () => this.socket ? true : !!this.device?.gatt?.connected;
  getSnapshot = () => this.state;
  getDeviceName = () => this.state === 'connected' || this.state === 'printing'
    ? (this.socket ? this.bridgeName : this.device?.name)?.trim() || undefined : undefined;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private setState(state: PrinterState) {
    this.state = state;
    this.listeners.forEach(listener => listener());
  }
  private onDisconnected = () => {
    this.generation++;
    this.clearFlowControl();
    this.releaseSocket();
    this.characteristic = undefined;
    this.service = undefined;
    this.usesP1sProtocol = false;
    this.receiveCharacteristic?.removeEventListener?.('characteristicvaluechanged', this.onDeviceReply);
    this.receiveCharacteristic = undefined;
    this.protocol = undefined;
    this.replyWaiter?.resolve();
    this.replyWaiter = undefined;
    this.setState('disconnected');
  };
  private onDeviceReply = () => {
    const value = this.receiveCharacteristic?.value;
    if (value) this.receive(new Uint8Array(value.buffer, value.byteOffset, value.byteLength));
  };
  private receive(bytes: Uint8Array) {
    this.lastDeviceReply = Array.from(bytes.subarray(0, 32), byte => byte.toString(16).padStart(2, '0')).join(' ');
    for (const reply of this.parser.feed(bytes)) {
      if (this.replyWaiter?.match(reply)) this.replyWaiter.resolve(reply);
    }
  }
  /** Connects over Bluetooth Classic SPP through the local bridge; P1S only accepts print data on this link. */
  async connectBridge(): Promise<void> {
    if (this.state !== 'disconnected') return;
    this.disconnect();
    const generation = this.generation;
    this.setState('connecting');
    let stage: PrinterConnectionStage = 'connection';
    try {
      const socket = this.openSocket(PRINTER_BRIDGE_URL);
      socket.binaryType = 'arraybuffer';
      this.socket = socket;
      const name = await new Promise<string>((resolve, reject) => {
        let opened = false;
        const timer = setTimeout(() => reject(new Error('The Paperang bridge did not reach the printer in time')), BRIDGE_READY_TIMEOUT_MS);
        const settle = (action: () => void) => { clearTimeout(timer); action(); };
        socket.addEventListener('open', () => {
          opened = true;
          socket.send(JSON.stringify({ type: 'open' }));
        });
        socket.addEventListener('message', ({ data }) => {
          if (data instanceof ArrayBuffer) {
            if (generation === this.generation) this.receive(new Uint8Array(data));
            return;
          }
          if (typeof data !== 'string') return;
          let status: { type?: string; name?: string; message?: string };
          try { status = JSON.parse(data); } catch { return; }
          if (status.type === 'ready') settle(() => resolve(status.name || 'Paperang'));
          else if (status.type === 'error') settle(() => reject(new Error(status.message || 'Paperang bridge error')));
        });
        socket.addEventListener('close', () => {
          settle(() => reject(opened ? new Error('The Paperang bridge closed the connection') : new PrinterBridgeUnavailableError()));
          if (generation === this.generation && this.socket === socket && this.state !== 'connecting') this.onDisconnected();
        });
      });
      if (generation !== this.generation) return;
      this.bridgeName = name;
      this.usesP1sProtocol = true;
      stage = 'characteristic';
      this.protocol = (await this.detectProtocol(generation))?.protocol;
      if (generation !== this.generation) return;
      this.setState('connected');
    } catch (error) {
      if (generation === this.generation) this.disconnect();
      throw new PrinterConnectionError(stage, error);
    }
  }
  getLastDeviceReply = () => this.lastDeviceReply;
  private onFlowControl = () => {
    const value = this.flowCharacteristic?.value;
    // FF03: 01 <count> grants additional write-without-response packets.
    if (!value || value.byteLength < 2 || value.getUint8(0) !== 1) return;
    this.credits += value.getUint8(1);
    if (this.credits > 0) this.creditWaiter?.resolve();
  };
  private clearFlowControl() {
    this.flowCharacteristic?.removeEventListener?.('characteristicvaluechanged', this.onFlowControl);
    this.flowCharacteristic = undefined;
    this.credits = 0;
    this.creditWaiter?.reject(new Error('P1 disconnected'));
    this.creditWaiter = undefined;
  }
  private async takeCredit(generation: number) {
    if (this.credits === 0) {
      let waiter: typeof this.creditWaiter;
      const ready = new Promise<void>((resolve, reject) => {
        waiter = { resolve, reject };
        this.creditWaiter = waiter;
      });
      try { await withWriteTimeout(ready); }
      finally { if (this.creditWaiter === waiter) this.creditWaiter = undefined; }
    }
    if (generation !== this.generation || this.credits === 0) throw new Error('P1 disconnected');
    this.credits--;
  }
  private releaseSocket() {
    const socket = this.socket;
    this.socket = undefined;
    this.bridgeName = undefined;
    // close() on an already closed socket is a no-op; its close event is ignored by generation.
    socket?.close();
  }
  disconnect() {
    this.generation++;
    this.clearFlowControl();
    this.releaseSocket();
    this.device?.removeEventListener('gattserverdisconnected', this.onDisconnected);
    this.device?.gatt?.disconnect();
    this.device = undefined;
    this.characteristic = undefined;
    this.service = undefined;
    this.usesP1sProtocol = false;
    this.receiveCharacteristic?.removeEventListener?.('characteristicvaluechanged', this.onDeviceReply);
    this.receiveCharacteristic = undefined;
    this.protocol = undefined;
    this.replyWaiter?.resolve();
    this.replyWaiter = undefined;
    this.setState('disconnected');
  }
  async connect(showAllDevices = false): Promise<void> {
    if (this.state !== 'disconnected') return;
    const bluetooth = this.bluetooth();
    if (!bluetooth) throw new Error('Bluetooth unavailable');
    this.disconnect();
    const generation = this.generation;
    this.setState('connecting');
    let stage: PrinterConnectionStage = 'selection';
    try {
      // Must happen before any await, directly from the user's click.
      const device = await bluetooth.requestDevice({
        ...(showAllDevices ? { acceptAllDevices: true as const } : { filters: [
          // Service-only and name-only filters are alternatives. Some firmware
          // advertises one but not the other, so never require both together.
          { services: [P1_SERVICE] },
          { services: [P1_BLE_SERVICE] },
          { namePrefix: 'Paperang' },
          { namePrefix: 'PAPERANG' },
          { namePrefix: 'MiaoMiaoJi' },
          { namePrefix: 'P1S' },
        ] }),
        optionalServices: [P1_SERVICE, P1_BLE_SERVICE],
      });
      if (generation !== this.generation) return;
      this.device = device;
      device.addEventListener('gattserverdisconnected', this.onDisconnected);
      if (!device.gatt) throw new Error('P1 GATT unavailable');
      stage = 'connection';
      let server;
      try {
        server = await device.gatt.connect();
      } catch (error) {
        if (!(error instanceof Error) || error.name !== 'NetworkError') throw error;
        device.gatt.disconnect();
        await new Promise(resolve => setTimeout(resolve, CONNECTION_RETRY_DELAY_MS));
        if (generation !== this.generation) return;
        server = await device.gatt.connect();
      }
      stage = 'service';
      let service;
      let writeUuid = P1_WRITE;
      try {
        service = await server.getPrimaryService(P1_SERVICE);
      } catch (error) {
        // Only an absent service permits trying the other verified P1 BLE profile.
        if (!(error instanceof Error) || error.name !== 'NotFoundError') throw error;
        service = await server.getPrimaryService(P1_BLE_SERVICE);
        writeUuid = P1_BLE_WRITE;
      }
      stage = 'characteristic';
      let characteristic;
      try {
        characteristic = await service.getCharacteristic(writeUuid);
      } catch (error) {
        // P1 and P1S share the ISSC service but expose different generations
        // of its transparent-UART downlink characteristic.
        if (writeUuid !== P1_WRITE || !(error instanceof Error) || error.name !== 'NotFoundError') throw error;
        characteristic = await service.getCharacteristic(P1S_WRITE);
        writeUuid = P1S_WRITE;
      }
      if (generation !== this.generation) return;
      this.service = service;
      if (writeUuid === P1_BLE_WRITE) {
        if (!characteristic.writeValueWithoutResponse) throw new Error('P1 FF02 write-without-response unavailable');
        // This P1 grants further FF03 credits only while its FF01 receive channel
        // is subscribed. FF03 alone stalls after the initial four packets.
        const receive = await service.getCharacteristic(P1_BLE_NOTIFY);
        if (generation !== this.generation) return;
        if (!receive.startNotifications) throw new Error('P1 FF01 receive notifications unavailable');
        await withWriteTimeout(receive.startNotifications());
        if (generation !== this.generation) return;
        const flow = await service.getCharacteristic(P1_BLE_FLOW);
        if (generation !== this.generation) return;
        if (!flow.startNotifications || !flow.addEventListener || !flow.removeEventListener) throw new Error('P1 FF03 flow control unavailable');
        this.flowCharacteristic = flow;
        // Install before subscribing: the initial credit grant can arrive immediately.
        flow.addEventListener('characteristicvaluechanged', this.onFlowControl);
        await withWriteTimeout(flow.startNotifications());
        if (generation !== this.generation) return;
      }
      this.characteristic = characteristic;
      // Firmware behind the Microchip UART characteristic speaks one of several
      // Paperang dialects, so the P1S path asks the device which one it understands.
      this.usesP1sProtocol = writeUuid === P1S_WRITE;
      if (this.usesP1sProtocol) {
        const receive = await service.getCharacteristic(P1S_NOTIFY);
        if (!receive.startNotifications || !receive.addEventListener || !receive.removeEventListener) throw new Error('P1S notification channel unavailable');
        this.receiveCharacteristic = receive;
        receive.addEventListener('characteristicvaluechanged', this.onDeviceReply);
        await withWriteTimeout(receive.startNotifications());
        if (generation !== this.generation) return;
        // An unanswered probe leaves the connection open for GATT inspection,
        // but print and self-test refuse to send into an unknown protocol.
        this.protocol = (await this.detectProtocol(generation))?.protocol;
        if (generation !== this.generation) return;
      }
      this.setState('connected');
    } catch (error) {
      if (generation === this.generation) this.disconnect();
      if (stage === 'selection' && error instanceof Error && error.name === 'NotFoundError') return;
      throw new PrinterConnectionError(stage, error);
    }
  }
  private async writeFrame(frame: Uint8Array<ArrayBuffer>, generation: number) {
    if (this.socket) {
      this.socket.send(frame);
      return;
    }
    const characteristic = this.characteristic;
    if (!characteristic) throw new Error('P1 not ready');
    if (!this.flowCharacteristic) {
      await withWriteTimeout(characteristic.writeValueWithResponse(frame));
      return;
    }
    for (let offset = 0; offset < frame.length; offset += FLOW_CHUNK_SIZE) {
      if (generation !== this.generation || !this.linkUp()) throw new Error('P1 disconnected');
      await this.takeCredit(generation);
      if (generation !== this.generation || !this.linkUp()) throw new Error('P1 disconnected');
      await withWriteTimeout(characteristic.writeValueWithoutResponse!(frame.slice(offset, offset + FLOW_CHUNK_SIZE)));
    }
  }
  /** Writes one frame and resolves with the first matching reply, or undefined on timeout. */
  private async request(frame: Uint8Array<ArrayBuffer>, match: (reply: PaperangReply) => boolean, timeoutMs: number, generation: number) {
    this.parser.reset();
    let resolve!: (reply?: PaperangReply) => void;
    const reply = new Promise<PaperangReply | undefined>(done => { resolve = done; });
    // Installed before writing: the device can answer before the write promise settles.
    this.replyWaiter = { match, resolve };
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await this.writeFrame(frame, generation);
      timer = setTimeout(() => resolve(undefined), timeoutMs);
      const result = await reply;
      if (generation !== this.generation || !this.linkUp()) throw new Error('P1 disconnected');
      return result;
    } finally {
      clearTimeout(timer);
      if (this.replyWaiter?.resolve === resolve) this.replyWaiter = undefined;
    }
  }
  /** Asks read-only questions in each known dialect; the first one answered is the device's protocol. */
  private async detectProtocol(generation: number): Promise<{ protocol: PrinterProtocol; reply: string } | undefined> {
    const a5 = await this.request(a5Frame(A5_GET_VERSION), reply => reply.kind === 'a5' && reply.command === A5_GET_VERSION && reply.messageType === 2, PROBE_TIMEOUT_MS, generation);
    if (a5) return { protocol: 'a5', reply: this.lastDeviceReply ?? '' };
    const gen1 = await this.request(batteryQueryFrame(P1_CRC_SEED), reply => reply.kind === 'legacy' && reply.crcSeed === P1_CRC_SEED, PROBE_TIMEOUT_MS, generation);
    if (gen1) return { protocol: 'gen1', reply: this.lastDeviceReply ?? '' };
    // gen2 ignores zero-seeded frames until this handshake switches its CRC key to 0.
    await this.request(GEN2_HANDSHAKE, reply => reply.kind === 'legacy', HANDSHAKE_SETTLE_MS, generation);
    const gen2 = await this.request(batteryQueryFrame(P1S_CRC_SEED), reply => reply.kind === 'legacy', PROBE_TIMEOUT_MS, generation);
    if (gen2) return { protocol: 'gen2', reply: this.lastDeviceReply ?? '' };
    return undefined;
  }
  private requireProtocol(): PrinterProtocol {
    if (!this.protocol) throw new PrinterProtocolError();
    return this.protocol;
  }
  /** `order` is the bitmap chunk number, which P1S echoes back as a nested TLV {1: LE16 order}. */
  private async a5Ack(command: number, content: Uint8Array, generation: number, timeoutMs = A5_REPLY_TIMEOUT_MS, order?: number) {
    const reply = await this.request(a5Frame(command, content), candidate => candidate.kind === 'a5' && candidate.command === command && candidate.messageType === 2, timeoutMs, generation);
    const name = `A5 0x${command.toString(16).padStart(4, '0')}`;
    // A late answer would be mistaken for the next command's, so a timeout ends the session.
    if (!reply || reply.kind !== 'a5') throw new Error(`${name} was not acknowledged`);
    const result = a5Result(reply.content);
    const echo = order !== undefined && result && result.length > 1 ? a5Result(result) : undefined;
    const echoesOrder = echo?.length === 2 && (echo[0] | echo[1] << 8) === order;
    if (!result || (!echoesOrder && (result.length > 1 || (result.length === 1 && result[0] !== 0)))) {
      throw new Error(`${name} rejected: ${Array.from(reply.content, byte => byte.toString(16).padStart(2, '0')).join(' ')}`);
    }
  }
  getProtocol = (): PrinterProtocol | 'unknown' | undefined =>
    this.usesP1sProtocol && (this.state === 'connected' || this.state === 'printing') ? this.protocol ?? 'unknown' : undefined;
  async inspectGatt(): Promise<PrinterGattInspection> {
    if (this.state !== 'connected' || !this.service) throw new Error('P1 not ready');
    if (!this.service.getCharacteristics) return { characteristics: [], unavailable: 'The browser did not expose characteristic enumeration.' };
    try {
      const characteristics = await this.service.getCharacteristics();
      return {
        characteristics: characteristics.map(characteristic => {
          const properties = characteristic.properties;
          const modes = [
            properties?.read && 'read',
            properties?.write && 'write',
            properties?.writeWithoutResponse && 'write-without-response',
            properties?.notify && 'notify',
            properties?.indicate && 'indicate',
          ].filter(Boolean).join(', ') || 'no properties reported';
          return `${characteristic.uuid || 'unknown UUID'} (${modes})`;
        }).sort(),
      };
    } catch (error) {
      return { characteristics: [], unavailable: error instanceof Error ? `${error.name}: ${error.message}` : String(error) };
    }
  }
  async printSelfTest(): Promise<PrintResult> {
    if (this.state !== 'connected' || (!this.characteristic && !this.socket)) throw new Error('P1 not ready');
    const protocol = this.usesP1sProtocol ? this.requireProtocol() : 'gen1';
    const generation = this.generation;
    this.setState('printing');
    this.lastDeviceReply = undefined;
    try {
      let result: PrintResult = 'sent';
      if (protocol === 'a5') {
        await this.a5Ack(A5_SELF_TEST, new Uint8Array(), generation);
      } else if (this.usesP1sProtocol) {
        const reply = await this.request(selfTestFrame(protocol === 'gen2' ? P1S_CRC_SEED : P1_CRC_SEED), candidate => candidate.kind === 'legacy' && candidate.command === LEGACY_SELF_TEST, LEGACY_ACK_TIMEOUT_MS, generation);
        if (!reply) result = 'unconfirmed';
      } else {
        await this.writeFrame(selfTestFrame(), generation);
      }
      if (generation !== this.generation || !this.linkUp()) throw new Error('P1 disconnected');
      this.setState('connected');
      return result;
    } catch (error) {
      if (generation === this.generation) this.disconnect();
      const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      throw new Error(`P1 self-test failed: ${detail}`, { cause: error });
    }
  }
  async diagnose(): Promise<PrinterDiagnostic> {
    if (this.state !== 'connected' || (!this.characteristic && !this.socket)) throw new Error('P1 not ready');
    const generation = this.generation;
    this.setState('printing');
    this.lastDeviceReply = undefined;
    try {
      let diagnostic: PrinterDiagnostic = { result: 'write-only' };
      if (this.usesP1sProtocol) {
        const detected = await this.detectProtocol(generation);
        this.protocol = detected?.protocol;
        if (detected) diagnostic = { result: 'confirmed', ...detected };
      } else {
        const reply = await this.request(batteryQueryFrame(), () => true, PROBE_TIMEOUT_MS, generation);
        if (reply) diagnostic = { result: 'confirmed', protocol: 'gen1', reply: this.lastDeviceReply ?? '' };
      }
      this.setState('connected');
      return diagnostic;
    } catch (error) {
      if (generation === this.generation) this.disconnect();
      const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      throw new Error(`P1 diagnostic failed: ${detail}`, { cause: error });
    }
  }
  async print(raster: Uint8Array): Promise<PrintResult> {
    if (this.state !== 'connected' || (!this.characteristic && !this.socket)) throw new Error('P1 not ready');
    const protocol = this.usesP1sProtocol ? this.requireProtocol() : undefined;
    const generation = this.generation;
    let step = 'start';
    this.setState('printing');
    this.lastDeviceReply = undefined;
    try {
      let result: PrintResult = 'sent';
      if (protocol === 'a5') {
        if (!raster.length || raster.length % P1_ROW_BYTES) throw new Error('Invalid P1 raster rows');
        step = 'setup';
        await this.a5Ack(A5_SET_DENSITY, new Uint8Array([A5_DENSITY]), generation);
        await this.a5Ack(A5_PAPER_TYPE, new Uint8Array([0, 0]), generation);
        await this.a5Ack(A5_PRINT_START, new Uint8Array(), generation);
        // Nothing else may be sent between print start and print end.
        const total = Math.ceil(raster.length / A5_BITMAP_ROWS_BYTES);
        for (let order = 1; order <= total; order++) {
          step = `bitmap ${order}/${total}`;
          const offset = (order - 1) * A5_BITMAP_ROWS_BYTES;
          await this.a5Ack(A5_BITMAP, a5BitmapContent(raster.slice(offset, offset + A5_BITMAP_ROWS_BYTES), order), generation, A5_BITMAP_TIMEOUT_MS, order);
        }
        step = 'finish';
        await this.a5Ack(A5_PRINT_END, new Uint8Array(), generation, A5_PRINT_END_TIMEOUT_MS);
        await this.a5Ack(A5_FEED, new Uint8Array([A5_FEED_LINES, 0]), generation);
      } else {
        const crcSeed = protocol === 'gen2' ? P1S_CRC_SEED : P1_CRC_SEED;
        const frames = rasterFrames(raster, crcSeed);
        if (protocol) frames.unshift(paperangFrame(LEGACY_SET_PAPER_TYPE, new Uint8Array([0]), crcSeed));
        for (let index = 0; index < frames.length; index++) {
          step = `frame ${index + 1}/${frames.length}`;
          if (generation !== this.generation || !this.linkUp()) throw new Error('P1 disconnected');
          if (protocol && index === frames.length - 1) {
            // The closing feed is the one legacy command whose reply confirms the job reached the device.
            const reply = await this.request(frames[index], candidate => candidate.kind === 'legacy' && candidate.command === LEGACY_FEED_LINE, LEGACY_ACK_TIMEOUT_MS, generation);
            if (!reply) result = 'unconfirmed';
          } else {
            await this.writeFrame(frames[index], generation);
          }
        }
      }
      if (generation !== this.generation) throw new Error('P1 disconnected');
      this.setState('connected');
      return result;
    } catch (error) {
      // No automatic retries: part of the receipt may already be on paper.
      if (generation === this.generation) this.disconnect();
      const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      throw new Error(`P1 ${protocol ?? 'gen1'} ${step}: ${detail}`, { cause: error });
    }
  }
}

export const paperangPrinter = new PaperangPrinter();
