// @vitest-environment happy-dom
import { act, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ShareDialog from '../ShareDialog';
import type { UploadShareInput } from '../../../services/share';
import { PrinterBridgeUnavailableError, PrinterConnectionError, PrinterProtocolError } from '../../../services/printing/paperang-printer';

const upload = vi.hoisted(() => vi.fn());
const copy = vi.hoisted(() => vi.fn());
const native = vi.hoisted(() => vi.fn());
const rendered = vi.hoisted(() => vi.fn());
const completed = vi.hoisted(() => vi.fn());
const printFinished = vi.hoisted(() => vi.fn());
const printer = vi.hoisted(() => {
  let state = 'disconnected';
  let name: string | undefined;
  const listeners = new Set<() => void>();
  return {
    supported: vi.fn(() => true),
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => state,
    getDeviceName: () => state === 'connected' || state === 'printing' ? name?.trim() || undefined : undefined,
    getLastDeviceReply: vi.fn(() => undefined),
    getProtocol: vi.fn((): string | undefined => undefined),
    getTransport: vi.fn((): string | undefined => undefined),
    bridgeSupported: vi.fn(() => false),
    connectBridge: vi.fn(),
    setDeviceName(next?: string) { name = next; },
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
async function mount(strict = false, input = snapshot, onClose = vi.fn()) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(strict ? <StrictMode><ShareDialog snapshot={input} onClose={onClose} /></StrictMode> : <ShareDialog snapshot={input} onClose={onClose} />));
}
async function press(label: string, times = 1) {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).filter(b => b.textContent === label).at(-1);
  expect(button, label).toBeTruthy();
  await act(async () => { for (let i = 0; i < times; i++) button?.click(); });
}

function shareTrigger() {
  return document.querySelector<HTMLButtonElement>('[aria-label="System share"]')!;
}
async function pressSystemShare() {
  await act(async () => shareTrigger().click());
}
function key(element: HTMLElement, value: string, shiftKey = false) {
  act(() => element.dispatchEvent(new KeyboardEvent('keydown', { key: value, shiftKey, bubbles: true, cancelable: true })));
}

beforeEach(() => {
  vi.resetAllMocks();
  printer.supported.mockReturnValue(true);
  printer.setState('disconnected');
  printer.setDeviceName();
  printer.supported.mockReturnValue(true);
  upload.mockResolvedValue('qr123');
  rendered.mockResolvedValue({ preview: 'data:image/png;base64,AA==', raster });
  copy.mockResolvedValue('copied');
  native.mockResolvedValue('shared');
  Reflect.deleteProperty(navigator, 'share');
  localStorage.clear();
});
afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = '';
  vi.useRealTimers();
});

describe('ShareDialog', () => {
  it('updates the printer name with connection states and reconnection', async () => {
    await mount();
    await press('Print receipt');
    const status = () => document.querySelector('#share-printer [role="status"]')!;
    expect(status().textContent).toBe('Printer · Disconnected');
    printer.setDeviceName('MiaoMiaoJi-1234');
    act(() => printer.setState('connecting'));
    expect(status().textContent).toBe('Printer · Connecting');
    act(() => printer.setState('connected'));
    expect(status().textContent).toBe('MiaoMiaoJi-1234 · Connected');
    act(() => printer.setState('printing'));
    expect(status().textContent).toBe('MiaoMiaoJi-1234 · Sending');
    act(() => printer.setState('disconnected'));
    expect(status().textContent).toBe('Printer · Disconnected');
    printer.setDeviceName('Paperang-5678');
    act(() => printer.setState('connected'));
    expect(status().textContent).toBe('Paperang-5678 · Connected');
  });
  it.each([undefined, '', '   '])('uses the generic label for an unnamed connected printer (%s)', async name => {
    printer.setDeviceName(name);
    printer.setState('connected');
    await mount();
    await press('Print receipt');
    expect(document.querySelector('#share-printer [role="status"]')?.textContent).toBe('Printer · Connected');
  });
  it('retains a long device name and allows wrapping inside the dialog', async () => {
    const name = 'MiaoMiaoJi'.repeat(30);
    printer.setDeviceName(name);
    printer.setState('connected');
    await mount();
    await press('Print receipt');
    const status = document.querySelector('#share-printer [role="status"]')!;
    expect(status.textContent).toBe(`${name} · Connected`);
    expect(status.classList.contains('[overflow-wrap:anywhere]')).toBe(true);
  });
  it('uses a generic printer name in ordinary connection failure advice', async () => {
    printer.connect.mockRejectedValue(new PrinterConnectionError('connection', new Error('connection lost')));
    await mount();
    await press('Print receipt');
    await press('Connect P1');
    expect(document.body.textContent).toContain('Turn on the printer');
    expect(document.body.textContent).not.toContain('Turn on P1');
  });
  it('downloads the generated preview with the fixed card filename', async () => {
    await mount();
    const downloads: { href: string; filename: string }[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push({ href: this.href, filename: this.download });
    });
    try {
      await press('Save image');
      expect(downloads).toEqual([{ href: 'data:image/png;base64,AA==', filename: 'oddeNova-card.png' }]);
      expect(document.querySelector('a[download]')).toBeNull();
      expect(completed).not.toHaveBeenCalled();
      expect(document.body.textContent).not.toContain('Image download started');
    } finally { click.mockRestore(); }
  });
  it('keeps copying and saving available when Bluetooth is unsupported', async () => {
    printer.supported.mockReturnValue(false);
    await mount();
    await press('Print receipt');
    expect(document.body.textContent).toContain('Bluetooth printing requires');
    expect(Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Save image')?.disabled).toBe(false);
    await press('Copy link');
    expect(copy).toHaveBeenCalledTimes(1);
    expect(printer.connect).not.toHaveBeenCalled();
  });
  it('keeps focus inside the dialog and restores it on close', async () => {
    const previous = document.createElement('button');
    document.body.appendChild(previous);
    previous.focus();
    await mount();
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    const first = dialog.querySelector<HTMLButtonElement>('button')!;
    const last = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button')).at(-1)!;
    act(() => { last.focus(); last.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })); });
    expect(document.activeElement).toBe(first);
    act(() => { first.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })); });
    expect(document.activeElement).toBe(last);
    expect(dialog.querySelector('input')).toBeNull();
    act(() => root.unmount());
    expect(document.activeElement).toBe(previous);
  });
  it('uploads once under StrictMode and never counts preview as completed sharing', async () => {
    await mount(true);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(rendered).toHaveBeenCalledWith(
      `${window.location.origin}/s/qr123`,
      'SCAN QR TO VIEW THE PROCESS',
      // The session's turns carry the agent's per-layer notes for the card.
      { code: 's("bd")', createdAt: expect.any(Number), locale: 'en', messages: snapshot.messages, number: 1 },
    );
    expect(completed).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('30 days');
    expect(document.body.textContent).not.toContain('/s/qr123');
    expect(document.body.textContent).not.toContain('Test');
  });
  it('shows card controls and reveals printing without connecting automatically', async () => {
    await mount();
    expect(document.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,AA==');
    expect(document.querySelector('h2')?.textContent).toBe('Share creation');
    expect(document.querySelector('input')).toBeNull();
    expect(document.body.textContent).not.toContain('Connect P1');
    await press('Print receipt');
    expect(printer.connect).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Printer · Disconnected');
    await press('Copy link');
    expect(copy).toHaveBeenCalledWith(`${window.location.origin}/s/qr123`, '[oddeNova] Test', true);
    expect(native).not.toHaveBeenCalled();
    expect(completed).toHaveBeenCalledWith({ share_method: 'clipboard' });
  });
  it('handles native sharing and cancellation through the same share action', async () => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: vi.fn() });
    native.mockResolvedValueOnce('cancelled').mockResolvedValueOnce('shared');
    await mount();
    await pressSystemShare();
    expect(completed).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('Share failed');
    await pressSystemShare();
    expect(completed).toHaveBeenCalledTimes(1);
    expect(completed).toHaveBeenCalledWith({ share_method: 'native' });
  });
  it('keeps copy separate from the direct system share action and hides unsupported sharing', async () => {
    await mount();
    expect(shareTrigger()).toBeNull();
    expect(document.body.textContent).not.toContain('System share');
    act(() => root.unmount());
    Object.defineProperty(navigator, 'share', { configurable: true, value: vi.fn() });
    await mount();
    const actions = document.querySelector('.grid-cols-3')!;
    expect(Array.from(actions.querySelectorAll('button')).map(button => button.textContent)).toEqual(['Copy link', 'Save image', 'Print receipt']);
    await press('Copy link');
    expect(copy).toHaveBeenCalledTimes(1);
    await pressSystemShare();
    expect(copy).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).not.toContain('More sharing options');
    expect(native).toHaveBeenCalledWith(`${window.location.origin}/s/qr123`, '[oddeNova] Test');
    expect(document.querySelector('[role="menu"]')).toBeNull();
  });
  it('closes the dialog directly on Escape from the system share button', async () => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: vi.fn() });
    const close = vi.fn();
    await mount(false, snapshot, close);
    key(shareTrigger(), 'Escape');
    expect(close).toHaveBeenCalledTimes(1);
    expect(native).not.toHaveBeenCalled();
  });
  it('disables copy and system sharing during native sharing and preserves failure feedback', async () => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: vi.fn() });
    let release!: (value: string) => void;
    native.mockImplementation(() => new Promise<string>(resolve => { release = resolve; }));
    await mount();
    await pressSystemShare();
    expect(shareTrigger().disabled).toBe(true);
    expect(Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Sharing…')?.disabled).toBe(true);
    expect(document.querySelector('[role="menu"]')).toBeNull();
    await act(async () => release('failed'));
    expect(shareTrigger().disabled).toBe(false);
    expect(document.body.textContent).toContain('Share failed');
    expect(completed).not.toHaveBeenCalled();
  });
  it('prevents repeated share clicks while the target is opening', async () => {
    let release!: (value: string) => void;
    copy.mockImplementation(() => new Promise<string>(resolve => { release = resolve; }));
    await mount();
    await press('Copy link', 2);
    expect(copy).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain('Sharing…');
    await act(async () => release('copied'));
    expect(document.body.textContent).toContain('✓ Copied');
    expect(document.body.textContent).not.toContain('Share details copied');
  });
  it('restores the copy label two seconds after the latest successful copy', async () => {
    vi.useFakeTimers();
    await mount();
    await press('Copy link');
    await act(async () => vi.advanceTimersByTime(1500));
    await press('✓ Copied');
    await act(async () => vi.advanceTimersByTime(1500));
    expect(document.body.textContent).toContain('✓ Copied');
    await act(async () => vi.advanceTimersByTime(500));
    expect(document.body.textContent).not.toContain('✓ Copied');
    expect(document.body.textContent).toContain('Copy link');
    await press('Copy link');
    act(() => root.unmount());
    expect(vi.getTimerCount()).toBe(0);
  });
  it('does not claim copying succeeded when a manual prompt is needed', async () => {
    copy.mockResolvedValue('shown');
    await mount();
    await press('Copy link');
    expect(document.body.textContent).not.toContain('✓ Copied');
    expect(document.body.textContent).toContain('Copy the link from the prompt');
  });
  it('can reconnect and reprint the same receipt without uploading again', async () => {
    printer.connect.mockImplementation(async () => { printer.setState('connected'); });
    printer.print.mockResolvedValue('sent');
    await mount();
    if (!document.querySelector('#share-printer')) await press('Print receipt');
    await press('Connect P1');
    if (!document.querySelector('#share-printer')) await press('Print receipt');
    await press('Print receipt');
    if (!document.querySelector('#share-printer')) await press('Print receipt');
    await press('Print receipt');
    expect(upload).toHaveBeenCalledTimes(1);
    expect(printer.print.mock.calls).toEqual([[raster], [raster]]);
    expect(printFinished).toHaveBeenCalledWith({ outcome: 'sent' });
    expect(completed).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Sent to printer');
    act(() => printer.setState('disconnected'));
    if (!document.querySelector('#share-printer')) await press('Print receipt');
    await press('Connect P1');
    expect(printer.connect).toHaveBeenCalledTimes(2);
  });
  it('numbers each print of the day and shows the next number in the preview', async () => {
    printer.setState('connected');
    printer.print.mockResolvedValue('sent');
    await mount();
    await press('Print receipt');
    const numbers = () => rendered.mock.calls.map(call => call[2].number);
    expect(numbers()).toEqual([1]);
    await press('Print receipt');
    expect(numbers()).toEqual([1, 2]);
    await press('Print receipt');
    expect(numbers()).toEqual([1, 2, 3]);
    expect(printer.print).toHaveBeenCalledTimes(2);
  });
  it('re-renders with the current number when another print happened since the preview', async () => {
    printer.setState('connected');
    printer.print.mockResolvedValue('sent');
    const second = { preview: 'data:image/png;base64,BB==', raster: new Uint8Array(96) };
    await mount();
    await press('Print receipt');
    localStorage.setItem('oddenova_receipt_counter', JSON.stringify({ day: (d => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`)(new Date()), count: 4 }));
    rendered.mockResolvedValueOnce(second);
    await press('Print receipt');
    expect(rendered.mock.calls[1][2].number).toBe(5);
    expect(printer.print).toHaveBeenCalledWith(second.raster);
  });
  it('does not report printer success after an unconfirmed P1S write', async () => {
    printer.connect.mockImplementation(async () => { printer.setState('connected'); });
    printer.print.mockResolvedValue('unconfirmed');
    await mount();
    await press('Print receipt');
    await press('Connect P1');
    await press('Print receipt');
    expect(document.body.textContent).toContain('printer did not confirm the job');
    expect(printFinished).not.toHaveBeenCalled();
  });
  it('warns right after connecting when no Paperang protocol answers, and does not report a failed print', async () => {
    printer.connect.mockImplementation(async () => { printer.setState('connected'); });
    printer.getProtocol.mockReturnValue('unknown');
    printer.print.mockRejectedValue(new PrinterProtocolError());
    await mount();
    await press('Print receipt');
    await press('Connect P1');
    expect(document.body.textContent).toContain('Classic Bluetooth (SPP)');
    await press('Print receipt');
    expect(document.body.textContent).toContain('did not answer any known Paperang protocol');
    expect(document.body.textContent).not.toContain('Sending interrupted');
    expect(printFinished).not.toHaveBeenCalled();
  });
  it('connects P1S over classic Bluetooth SPP with only print and disconnect controls', async () => {
    printer.bridgeSupported.mockReturnValue(true);
    printer.connectBridge.mockImplementation(async () => { printer.setState('connected'); });
    printer.getTransport.mockReturnValue('spp');
    await mount();
    await press('Print receipt');
    await press('Connect P1S');
    expect(printer.connectBridge).toHaveBeenCalledTimes(1);
    expect(printer.connect).not.toHaveBeenCalled();
    expect(Array.from(document.querySelectorAll('#share-printer button')).map(button => button.textContent)).toEqual(['Print receipt', 'Disconnect']);
  });
  it('offers separate P1 and P1S entries, P1 first', async () => {
    printer.bridgeSupported.mockReturnValue(true);
    await mount();
    await press('Print receipt');
    expect(Array.from(document.querySelectorAll('#share-printer button')).map(button => button.textContent)).toEqual(['Connect P1', 'Connect P1S']);
    await press('Connect P1');
    expect(printer.connect).toHaveBeenCalledWith();
    expect(printer.connectBridge).not.toHaveBeenCalled();
  });
  it('tells the user to start the local bridge when it is not running', async () => {
    printer.bridgeSupported.mockReturnValue(true);
    printer.connectBridge.mockRejectedValue(new PrinterConnectionError('connection', new PrinterBridgeUnavailableError()));
    await mount();
    await press('Print receipt');
    await press('Connect P1S');
    expect(document.body.textContent).toContain('npm run printer:bridge');
  });
  it('keeps the QR and copy action when printing fails, without retrying', async () => {
    printer.connect.mockImplementation(async () => { printer.setState('connected'); });
    printer.print.mockImplementation(async () => { printer.setState('disconnected'); throw new Error('lost'); });
    await mount();
    if (!document.querySelector('#share-printer')) await press('Print receipt');
    await press('Connect P1');
    if (!document.querySelector('#share-printer')) await press('Print receipt');
    await press('Print receipt');
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
    if (!document.querySelector('#share-printer')) await press('Print receipt');
    await press('Connect P1');
    expect(document.body.textContent).not.toContain('Connection failed');
    expect(document.body.textContent).toContain('Connect P1');
  });
  it('distinguishes an absent P1 service from connection and permission failures', async () => {
    printer.connect.mockRejectedValue(new PrinterConnectionError('service', new DOMException('No Services matching UUID found', 'NotFoundError')));
    await mount();
    if (!document.querySelector('#share-printer')) await press('Print receipt');
    await press('Connect P1');
    expect(document.body.textContent).toContain('does not expose the supported P1 print service');
    expect(document.body.textContent).toContain('NotFoundError: No Services matching UUID found');
    expect(document.body.textContent).not.toContain('Turn on P1');
    expect(upload).toHaveBeenCalledTimes(1);
    expect(printer.print).not.toHaveBeenCalled();
  });
  it('shows browser permission failures without calling them absent services', async () => {
    printer.connect.mockRejectedValue(new PrinterConnectionError('service', new DOMException('Access denied', 'SecurityError')));
    await mount();
    if (!document.querySelector('#share-printer')) await press('Print receipt');
    await press('Connect P1');
    expect(document.body.textContent).toContain('The browser denied Bluetooth access');
    expect(document.body.textContent).toContain('SecurityError: Access denied');
    expect(document.body.textContent).not.toContain('does not expose');
  });
  it('explains unsupported GATT devices without suggesting a power or permission fix', async () => {
    printer.connect.mockRejectedValue(new PrinterConnectionError('connection', new DOMException('Unsupported device.', 'NetworkError')));
    await mount();
    if (!document.querySelector('#share-printer')) await press('Print receipt');
    await press('Connect P1');
    expect(document.body.textContent).toContain('use "Connect P1S" instead');
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
    if (!document.querySelector('#share-printer')) await press('Print receipt');
    await press('Print receipt', 2);
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
    expect(Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Save image')?.disabled).toBe(true);
    await press('Retry print preview');
    expect(document.querySelector('img')).toBeTruthy();
    expect(upload).toHaveBeenCalledTimes(1);
    expect(rendered).toHaveBeenCalledTimes(2);
  });
});
