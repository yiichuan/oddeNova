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
    supported: vi.fn(() => true),
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
async function mount(strict = false, input = snapshot) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(strict ? <StrictMode><ShareDialog snapshot={input} onClose={vi.fn()} /></StrictMode> : <ShareDialog snapshot={input} onClose={vi.fn()} />));
}
async function press(label: string, times = 1) {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).filter(b => b.textContent === label).at(-1);
  expect(button, label).toBeTruthy();
  await act(async () => { for (let i = 0; i < times; i++) button?.click(); });
}

async function editTitle(value: string, commit: 'blur' | 'Enter' = 'blur') {
  const input = document.querySelector<HTMLInputElement>('#share-card-title')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    input.dispatchEvent(commit === 'blur' ? new FocusEvent('focusout', { bubbles: true }) : new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  printer.supported.mockReturnValue(true);
  printer.setState('disconnected');
  printer.supported.mockReturnValue(true);
  upload.mockResolvedValue('qr123');
  rendered.mockResolvedValue({ preview: 'data:image/png;base64,AA==', raster });
  copy.mockResolvedValue('copied');
  native.mockResolvedValue('shared');
  Reflect.deleteProperty(navigator, 'share');
});
afterEach(() => {
  act(() => root?.unmount());
  document.body.innerHTML = '';
});

describe('ShareDialog', () => {
  it.each([
    ['oddeNova beta 1.0 默认印象', '默认印象'],
    ['oddeNova beta 1.0 Default Impression', 'Default Impression'],
    ['New session', 'My music creation'],
    ['oddeNova beta 1.0 custom', 'oddeNova beta 1.0 custom'],
  ])('uses the card title for %s without changing the upload', async (title, expected) => {
    await mount(false, { ...snapshot, title });
    expect(document.querySelector('input')?.value).toBe(expected);
    expect(upload.mock.calls[0][0].title).toBe(title);
  });
  it('commits trimmed titles on blur or Enter and restores empty titles without uploading', async () => {
    await mount();
    await editTitle('  New card  ');
    expect(rendered).toHaveBeenLastCalledWith(expect.any(String), 'New card', 'Scan to hear this music');
    expect(document.querySelector('input')?.value).toBe('New card');
    await editTitle('   ', 'Enter');
    expect(document.querySelector('input')?.value).toBe('Test');
    expect(upload).toHaveBeenCalledTimes(1);
    await press('Copy link');
    expect(copy).toHaveBeenCalledWith(expect.any(String), '[oddeNova] Test', true);
  });
  it('disables export while rendering and ignores a stale title result', async () => {
    await mount();
    const pending = new Map<string, (value: { preview: string; raster: Uint8Array }) => void>();
    rendered.mockImplementation((_url: string, title: string) => new Promise(resolve => pending.set(title, resolve)));
    await press('Print card');
    act(() => printer.setState('connected'));
    await editTitle('First');
    expect(Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Save image')?.disabled).toBe(true);
    expect(document.querySelector<HTMLButtonElement>('#share-printer button')?.disabled).toBe(true);
    await editTitle('Second', 'Enter');
    await act(async () => pending.get('Second')?.({ preview: 'data:image/png;base64,second', raster }));
    await act(async () => pending.get('First')?.({ preview: 'data:image/png;base64,first', raster }));
    expect(document.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,second');
    expect(upload).toHaveBeenCalledTimes(1);
  });
  it('downloads the same preview with a sanitized title', async () => {
    await mount();
    await editTitle('Song/Name?');
    const downloads: { href: string; filename: string }[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push({ href: this.href, filename: this.download });
    });
    try {
      await press('Save image');
      expect(downloads).toEqual([{ href: 'data:image/png;base64,AA==', filename: 'Song_Name_.png' }]);
      expect(document.querySelector('a[download]')).toBeNull();
      expect(completed).not.toHaveBeenCalled();
    } finally { click.mockRestore(); }
  });
  it('keeps copying and saving available when Bluetooth is unsupported', async () => {
    printer.supported.mockReturnValue(false);
    await mount();
    await press('Print card');
    expect(document.body.textContent).toContain('Bluetooth printing requires');
    expect(Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Save image')?.disabled).toBe(false);
    await press('Copy link');
    expect(copy).toHaveBeenCalledTimes(1);
    expect(printer.connect).not.toHaveBeenCalled();
  });
  it('offers reconnection after a connection failure', async () => {
    printer.connect.mockRejectedValueOnce(new Error('offline')).mockImplementationOnce(async () => printer.setState('connected'));
    await mount();
    await press('Print card');
    await press('Connect printer');
    await press('Reconnect');
    expect(document.body.textContent).toContain('Paperang P1 · Connected');
    expect(printer.print).not.toHaveBeenCalled();
  });
  it('includes the title input in the keyboard focus loop and restores focus on close', async () => {
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
    expect(dialog.querySelector('input')).toBeTruthy();
    act(() => root.unmount());
    expect(document.activeElement).toBe(previous);
  });
  it('uploads once under StrictMode and never counts preview as completed sharing', async () => {
    await mount(true);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(rendered).toHaveBeenCalledWith(`${window.location.origin}/s/qr123`, 'Test', 'Scan to hear this music');
    expect(completed).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('30 days');
    expect(document.body.textContent).not.toContain('/s/qr123');
    expect(document.body.textContent).not.toContain('Test');
  });
  it('shows card controls and reveals printing without connecting automatically', async () => {
    await mount();
    expect(document.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,AA==');
    expect(document.querySelector('h2')?.textContent).toBe('Share creation');
    expect(document.querySelector('input')?.value).toBe('Test');
    expect(document.body.textContent).not.toContain('Connect printer');
    await press('Print card');
    expect(printer.connect).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Paperang P1 · Disconnected');
    await press('Copy link');
    expect(copy).toHaveBeenCalledWith(`${window.location.origin}/s/qr123`, '[oddeNova] Test', true);
    expect(native).not.toHaveBeenCalled();
    expect(completed).toHaveBeenCalledWith({ share_method: 'clipboard' });
  });
  it('handles native sharing and cancellation through the same share action', async () => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: vi.fn() });
    native.mockResolvedValueOnce('cancelled').mockResolvedValueOnce('shared');
    await mount();
    await press('System share');
    expect(completed).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('Share failed');
    await press('System share');
    expect(completed).toHaveBeenCalledTimes(1);
    expect(completed).toHaveBeenCalledWith({ share_method: 'native' });
  });
  it('prevents repeated share clicks while the target is opening', async () => {
    let release!: (value: string) => void;
    copy.mockImplementation(() => new Promise<string>(resolve => { release = resolve; }));
    await mount();
    await press('Copy link', 2);
    expect(copy).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain('Sharing…');
    await act(async () => release('copied'));
    expect(document.body.textContent).toContain('Share details copied');
  });
  it('can reconnect and reprint the same receipt without uploading again', async () => {
    printer.connect.mockImplementation(async () => { printer.setState('connected'); });
    printer.print.mockResolvedValue(undefined);
    await mount();
    if (!document.querySelector('#share-printer')) await press('Print card');
    await press('Connect printer');
    if (!document.querySelector('#share-printer')) await press('Print card');
    await press('Print card');
    if (!document.querySelector('#share-printer')) await press('Print card');
    await press('Print card');
    expect(upload).toHaveBeenCalledTimes(1);
    expect(printer.print.mock.calls).toEqual([[raster], [raster]]);
    expect(printFinished).toHaveBeenCalledWith({ outcome: 'sent' });
    expect(completed).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Sent to printer');
    act(() => printer.setState('disconnected'));
    if (!document.querySelector('#share-printer')) await press('Print card');
    await press('Connect printer');
    expect(printer.connect).toHaveBeenCalledTimes(2);
  });
  it('keeps the QR and copy action when printing fails, without retrying', async () => {
    printer.connect.mockImplementation(async () => { printer.setState('connected'); });
    printer.print.mockImplementation(async () => { printer.setState('disconnected'); throw new Error('lost'); });
    await mount();
    if (!document.querySelector('#share-printer')) await press('Print card');
    await press('Connect printer');
    if (!document.querySelector('#share-printer')) await press('Print card');
    await press('Print card');
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
    if (!document.querySelector('#share-printer')) await press('Print card');
    await press('Connect printer');
    expect(document.body.textContent).not.toContain('Connection failed');
    expect(document.body.textContent).toContain('Connect printer');
  });
  it('distinguishes an absent P1 service from connection and permission failures', async () => {
    printer.connect.mockRejectedValue(new PrinterConnectionError('service', new DOMException('No Services matching UUID found', 'NotFoundError')));
    await mount();
    if (!document.querySelector('#share-printer')) await press('Print card');
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
    if (!document.querySelector('#share-printer')) await press('Print card');
    await press('Connect printer');
    expect(document.body.textContent).toContain('The browser denied Bluetooth access');
    expect(document.body.textContent).toContain('SecurityError: Access denied');
    expect(document.body.textContent).not.toContain('does not expose');
  });
  it('explains unsupported GATT devices without suggesting a power or permission fix', async () => {
    printer.connect.mockRejectedValue(new PrinterConnectionError('connection', new DOMException('Unsupported device.', 'NetworkError')));
    await mount();
    if (!document.querySelector('#share-printer')) await press('Print card');
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
    if (!document.querySelector('#share-printer')) await press('Print card');
    await press('Print card', 2);
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
