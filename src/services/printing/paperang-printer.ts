import { P1_SERVICE, P1_WRITE, P1S_WRITE, P1S_NOTIFY, P1_BLE_SERVICE, P1_BLE_WRITE, P1_BLE_NOTIFY, P1_BLE_FLOW, rasterFrames } from './paperang-protocol';

// Narrow Web Bluetooth interfaces keep browser-specific types inside this service.
interface WriteCharacteristic {
  writeValueWithResponse(value: Uint8Array<ArrayBuffer>): Promise<void>;
  writeValueWithoutResponse?(value: Uint8Array<ArrayBuffer>): Promise<void>;
  value?: DataView;
  startNotifications?(): Promise<unknown>;
  addEventListener?(type: 'characteristicvaluechanged', callback: () => void): void;
  removeEventListener?(type: 'characteristicvaluechanged', callback: () => void): void;
}
const WRITE_TIMEOUT_MS = 10_000;
const P1S_CHUNK_SIZE = 20;
const P1S_CHUNK_DELAY_MS = 30;
const CONNECTION_RETRY_DELAY_MS = 200;
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
    connect(): Promise<{ getPrimaryService(uuid: string): Promise<{ getCharacteristic(uuid: string): Promise<WriteCharacteristic> }> }>;
    disconnect(): void;
  };
  addEventListener(type: 'gattserverdisconnected', callback: () => void): void;
  removeEventListener(type: 'gattserverdisconnected', callback: () => void): void;
}
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

export class PaperangPrinter {
  private state: PrinterState = 'disconnected';
  private listeners = new Set<() => void>();
  private device?: PrinterDevice;
  private characteristic?: WriteCharacteristic;
  private usesP1sProtocol = false;
  private receiveCharacteristic?: WriteCharacteristic;
  private lastDeviceReply?: string;
  private flowCharacteristic?: WriteCharacteristic;
  private credits = 0;
  private creditWaiter?: { resolve: () => void; reject: (error: Error) => void };
  private generation = 0;
  private bluetooth: () => PrinterBluetooth | undefined;
  constructor(bluetooth: () => PrinterBluetooth | undefined = () =>
    (navigator as Navigator & { bluetooth?: PrinterBluetooth }).bluetooth) {
    this.bluetooth = bluetooth;
  }

  supported = () => typeof window !== 'undefined' && window.isSecureContext && !!this.bluetooth();
  getSnapshot = () => this.state;
  getDeviceName = () => this.state === 'connected' || this.state === 'printing'
    ? this.device?.name?.trim() || undefined : undefined;
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
    this.characteristic = undefined;
    this.usesP1sProtocol = false;
    this.receiveCharacteristic?.removeEventListener?.('characteristicvaluechanged', this.onDeviceReply);
    this.receiveCharacteristic = undefined;
    this.setState('disconnected');
  };
  private onDeviceReply = () => {
    const value = this.receiveCharacteristic?.value;
    if (!value) return;
    this.lastDeviceReply = Array.from(new Uint8Array(value.buffer, value.byteOffset, Math.min(value.byteLength, 32)))
      .map(byte => byte.toString(16).padStart(2, '0')).join(' ');
  };
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
  disconnect() {
    this.generation++;
    this.clearFlowControl();
    this.device?.removeEventListener('gattserverdisconnected', this.onDisconnected);
    this.device?.gatt?.disconnect();
    this.device = undefined;
    this.characteristic = undefined;
    this.usesP1sProtocol = false;
    this.receiveCharacteristic?.removeEventListener?.('characteristicvaluechanged', this.onDeviceReply);
    this.receiveCharacteristic = undefined;
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
      this.usesP1sProtocol = writeUuid === P1S_WRITE;
      if (this.usesP1sProtocol && !characteristic.writeValueWithoutResponse) throw new Error('P1S write-without-response unavailable');
      if (this.usesP1sProtocol) {
        const receive = await service.getCharacteristic(P1S_NOTIFY);
        if (!receive.startNotifications || !receive.addEventListener || !receive.removeEventListener) throw new Error('P1S notification channel unavailable');
        this.receiveCharacteristic = receive;
        receive.addEventListener('characteristicvaluechanged', this.onDeviceReply);
        await withWriteTimeout(receive.startNotifications());
        if (generation !== this.generation) return;
      }
      this.setState('connected');
    } catch (error) {
      if (generation === this.generation) this.disconnect();
      if (stage === 'selection' && error instanceof Error && error.name === 'NotFoundError') return;
      throw new PrinterConnectionError(stage, error);
    }
  }
  async print(raster: Uint8Array): Promise<PrintResult> {
    if (this.state !== 'connected' || !this.characteristic) throw new Error('P1 not ready');
    const usesP1sProtocol = this.usesP1sProtocol;
    const frames = rasterFrames(raster);
    const characteristic = this.characteristic;
    const generation = this.generation;
    const usesFlowControl = !!this.flowCharacteristic;
    let frameIndex = 0;
    let offset = 0;
    this.setState('printing');
    this.lastDeviceReply = undefined;
    try {
      for (; frameIndex < frames.length; frameIndex++) {
        const frame = frames[frameIndex];
        const chunkSize = usesFlowControl ? 20 : usesP1sProtocol ? P1S_CHUNK_SIZE : frame.length;
        for (offset = 0; offset < frame.length; offset += chunkSize) {
          if (generation !== this.generation || !this.device?.gatt?.connected) throw new Error('P1 disconnected');
          if (usesFlowControl) {
            await this.takeCredit(generation);
            if (generation !== this.generation || !this.device?.gatt?.connected) throw new Error('P1 disconnected');
            await withWriteTimeout(characteristic.writeValueWithoutResponse!(frame.slice(offset, offset + chunkSize)));
          } else if (usesP1sProtocol) {
            await withWriteTimeout(characteristic.writeValueWithoutResponse!(frame.slice(offset, offset + chunkSize)));
            if (offset + chunkSize < frame.length) await new Promise(resolve => setTimeout(resolve, P1S_CHUNK_DELAY_MS));
          } else {
            await withWriteTimeout(characteristic.writeValueWithResponse(frame.slice(offset, offset + chunkSize)));
          }
        }
      }
      if (generation !== this.generation) throw new Error('P1 disconnected');
      this.setState('connected');
      // BLE write completion does not mean the P1S accepted a print job.
      return usesP1sProtocol ? 'unconfirmed' : 'sent';
    } catch (error) {
      // No automatic retries: part of the receipt may already be on paper.
      if (generation === this.generation) this.disconnect();
      const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
      throw new Error(`P1 frame ${Math.min(frameIndex + 1, frames.length)}/${frames.length}, byte ${offset}: ${detail}`, { cause: error });
    }
  }
}

export const paperangPrinter = new PaperangPrinter();
