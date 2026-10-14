// @vitest-environment happy-dom
import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ShareDialog from '../ShareDialog';
import type { UploadShareInput } from '../../../services/share';
import { PrinterConnectionError } from '../../../services/printing/paperang-printer';

const upload = vi.hoisted(() => vi.fn());
const copy = vi.hoisted(() => vi.fn());
const native = vi.hoisted(() => vi.fn());
const rendered = vi.hoisted(() => vi.fn());
const completed = vi.hoisted(() => vi.fn());
const printFinished = vi.hoisted(() => vi.fn());
const printer = vi.hoisted(() => {
  let state = 'disconnected';
  const listeners = new Set<() => void>();
  return {
    supported: () => true,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => state,
    setState(next: string) { state = next; listeners.forEach(l => l()); },
    connect: vi.fn(), disconnect: vi.fn(), print: vi.fn(),
  };
});
vi.mock('../../../services/share', () => ({ uploadShare: upload }));
vi.mock('../../../services/share-target', () => ({ shareUrl: copy, nativeShare: native }));
vi.mock('../../../services/printing/share-receipt', () => ({ renderShareReceipt: rendered }));
vi.mock('../../../services/printing/paperang-printer', async importOriginal => ({ ...await importOriginal<typeof import('../../../services/printing/paperang-printer')>(), paperangPrinter: printer }));
vi.mock('../../../lib/analytics', () => ({ trackShareCompleted: completed, trackSharePrintFinished: printFinished }));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
const snapshot: UploadShareInput = { title: 'Test', code: 's("bd")', messages: [], locale: 'en' };
const raster = new Uint8Array(48);
async function mount(strict = false) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(strict ? <StrictMode><ShareDialog snapshot={snapshot} onClose={vi.fn()} /></StrictMode> : <ShareDialog snapshot={snapshot} onClose={vi.fn()} />));
}
async function press(label: string, times = 1) {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent === label);
  expect(button, label).toBeTruthy();
  await act(async () => { for (let i = 0; i < times; i++) button?.click(); });
}
beforeEach(() => {
  vi.resetAllMocks();
  printer.setState('disconnected');
  upload.mockResolvedValue('qr123');
  rendered.mockResolvedValue({ preview: 'data:image/png;base64,AA==', raster });
  copy.mockResolvedValue('copied');
});
afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = '';
});

describe('ShareDialog', () => {
  it('uploads once under StrictMode and never counts preview as completed sharing', async () => {
    await mount(true);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(rendered).toHaveBeenCalledWith(`${window.location.origin}/s/qr123`, 'Test');
    expect(completed).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('30 days');
  });
  it('can reconnect and reprint the same receipt without uploading again', async () => {
    printer.connect.mockImplementation(async () => { printer.setState('connected'); });
    printer.print.mockResolvedValue(undefined);
    await mount();
    await press('Connect printer');
    await press('Print one copy');
    await press('Print one copy');
    expect(upload).toHaveBeenCalledTimes(1);
    expect(printer.print.mock.calls).toEqual([[raster], [raster]]);
    expect(printFinished).toHaveBeenCalledWith({ outcome: 'sent' });
    expect(completed).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Sent to printer');
    act(() => printer.setState('disconnected'));
    await press('Connect printer');
    expect(printer.connect).toHaveBeenCalledTimes(2);
  });
  it('keeps the QR and copy action when printing fails, without retrying', async () => {
    printer.connect.mockImplementation(async () => { printer.setState('connected'); });
    printer.print.mockImplementation(async () => { printer.setState('disconnected'); throw new Error('lost'); });
    await mount();
    await press('Connect printer');
    await press('Print one copy');
    expect(printer.print).toHaveBeenCalledTimes(1);
    expect(printFinished).toHaveBeenCalledWith({ outcome: 'failed' });
    expect(document.body.textContent).toContain('some paper may have printed');
    expect(document.body.textContent).toContain('Sending details: lost');
    expect(document.querySelector('img')).toBeTruthy();
    await press('Copy link');
    expect(copy).toHaveBeenCalledWith(`${window.location.origin}/s/qr123`, '[oddeNova] Test', true);
  });
  it('does not show errors on connection cancellation', async () => {
    printer.connect.mockResolvedValue(undefined);
    await mount();
    await press('Connect printer');
    expect(document.body.textContent).not.toContain('Connection failed');
    expect(document.body.textContent).toContain('Connect printer');
  });
  it('distinguishes an absent P1 service from connection and permission failures', async () => {
    printer.connect.mockRejectedValue(new PrinterConnectionError('service', new DOMException('No Services matching UUID found', 'NotFoundError')));
    await mount();
    await press('Connect printer');
    expect(document.body.textContent).toContain('does not expose the supported P1 print service');
    expect(document.body.textContent).toContain('NotFoundError: No Services matching UUID found');
    expect(document.body.textContent).not.toContain('Turn on P1');
    expect(upload).toHaveBeenCalledTimes(1);
    expect(printer.print).not.toHaveBeenCalled();
  });
  it('shows browser permission failures without calling them absent services', async () => {
    printer.connect.mockRejectedValue(new PrinterConnectionError('service', new DOMException('Access denied', 'SecurityError')));
    await mount();
    await press('Connect printer');
    expect(document.body.textContent).toContain('The browser denied Bluetooth access');
    expect(document.body.textContent).toContain('SecurityError: Access denied');
    expect(document.body.textContent).not.toContain('does not expose');
  });
  it('explains unsupported GATT devices without suggesting a power or permission fix', async () => {
    printer.connect.mockRejectedValue(new PrinterConnectionError('connection', new DOMException('Unsupported device.', 'NetworkError')));
    await mount();
    await press('Connect printer');
    expect(document.body.textContent).toContain('Classic Bluetooth printing requires a local bridge');
    expect(document.body.textContent).toContain('NetworkError: Unsupported device.');
    expect(document.body.textContent).not.toContain('Turn on P1');
    expect(printer.print).not.toHaveBeenCalled();
  });
  it('prevents repeated print clicks while a job is running', async () => {
    printer.setState('connected');
    let release = () => {};
    printer.print.mockImplementation(() => {
      printer.setState('printing');
      return new Promise<void>(resolve => { release = resolve; });
    });
    await mount();
    await press('Print one copy', 2);
    expect(printer.print).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain('Sending…');
    await act(async () => { printer.setState('connected'); release(); });
  });
  it('does not disconnect the page-level printer on dialog unmount', async () => {
    printer.setState('connected');
    await mount();
    act(() => root.unmount());
    expect(printer.disconnect).not.toHaveBeenCalled();
    expect(printer.getSnapshot()).toBe('connected');
  });
  it('retains link and copying when receipt rendering fails, and retries rendering only', async () => {
    rendered.mockRejectedValueOnce(new Error('canvas')).mockResolvedValue({ preview: 'data:image/png;base64,AA==', raster });
    await mount();
    await press('Copy link');
    await press('Retry QR code');
    expect(document.querySelector('img')).toBeTruthy();
    expect(upload).toHaveBeenCalledTimes(1);
    expect(rendered).toHaveBeenCalledTimes(2);
  });
});
