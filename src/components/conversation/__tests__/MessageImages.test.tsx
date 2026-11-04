// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MessageImages from '../MessageImages';
import { rememberUploadedImagePreview } from '../../../lib/image-preview-memory';
import { previewImageUrl } from '../../../lib/image-cache';
import type { ImageAttachment } from '../../../lib/image-attachments';

vi.mock('../../../lib/image-cache', () => ({ previewImageUrl: vi.fn() }));
vi.mock('../../../lib/i18n', () => ({ zh: true }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const images: ImageAttachment[] = ['first', 'second'].map(id => ({
  id, name: `${id}.jpg`, path: `user/${id}`, mimeType: 'image/jpeg', width: 100, height: 100, size: 100,
}));
let root: Root;
let container: HTMLDivElement;
async function click(element: Element | null) {
  if (!element) throw new Error('Missing element');
  await act(async () => { element.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}
async function open() {
  await act(async () => { root.render(<MessageImages images={images} />); });
  await click(container.querySelector('button'));
  return document.querySelector('dialog')!;
}
beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  vi.mocked(previewImageUrl).mockClear();
  vi.mocked(previewImageUrl).mockImplementation(async image => `https://example.com/${image.name}`);
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) { this.open = true; });
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (this: HTMLDialogElement) { this.open = false; });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.style.overflow = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('MessageImages preview', () => {
  it('opens in a modal, switches images with buttons and arrows, and closes with Escape', async () => {
    document.body.style.overflow = 'auto';
    const dialog = await open();
    expect(container.querySelector('a')).toBeNull();
    expect(dialog.open).toBe(true);
    expect(previewImageUrl).toHaveBeenCalledTimes(2);
    expect(dialog.querySelector('[role="status"]')).toBeNull();
    expect(dialog.querySelector('img')?.alt).toBe('first.jpg');
    expect(document.body.style.overflow).toBe('hidden');
    await click(dialog.querySelector('[aria-label="下一张图片"]'));
    expect(dialog.querySelector('img')?.alt).toBe('second.jpg');
    await act(async () => { dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); });
    expect(dialog.querySelector('img')?.alt).toBe('first.jpg');
    await act(async () => { dialog.dispatchEvent(new Event('cancel', { cancelable: true })); });
    expect(document.querySelector('dialog')).toBeNull();
    expect(document.body.style.overflow).toBe('auto');
  });
  it('keeps the preview open when clicking the image, and closes from blank space or the close button', async () => {
    const dialog = await open();
    await click(dialog.querySelector('img'));
    expect(dialog.isConnected).toBe(true);
    await click(dialog.querySelector('img')!.parentElement);
    expect(document.querySelector('dialog')).toBeNull();
    await click(container.querySelector('button'));
    await click(document.querySelector('[aria-label="关闭预览"]'));
    expect(document.querySelector('dialog')).toBeNull();
  });
  it('shows an accessible image placeholder without visible text when an image cannot be loaded', async () => {
    vi.mocked(previewImageUrl).mockRejectedValue(new Error('Unavailable'));
    await act(async () => { root.render(<MessageImages images={[images[0]]} />); });
    const placeholder = container.querySelector('[role="img"]');
    expect(placeholder?.getAttribute('aria-label')).toBe('图片已过期');
    expect(placeholder?.getAttribute('title')).toBe('图片已过期');
    expect(placeholder?.querySelector('svg')).not.toBeNull();
    expect(container.textContent).toBe('');
    expect(container.querySelector('button')).toBeNull();
  });
  it('also replaces a failed image URL with the placeholder', async () => {
    await act(async () => { root.render(<MessageImages images={[images[0]]} />); });
    await act(async () => { container.querySelector('img')!.dispatchEvent(new Event('error')); });
    expect(container.querySelector('[role="img"]')).not.toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('button')).toBeNull();
    expect(container.textContent).toBe('');
  });
});

it('reuses the uploaded thumbnail after the composer unmounts, without loading or downloading again', async () => {
  const image = { ...images[0] };
  const close = vi.fn();
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 128, height: 256, close }));
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ fillRect: vi.fn(), drawImage } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL')
    .mockReturnValueOnce('data:image/jpeg;base64,full-image')
    .mockReturnValueOnce('data:image/jpeg;base64,thumbnail');
  await rememberUploadedImagePreview(image, new File(['image'], 'first.jpg', { type: 'image/jpeg' }));
  expect(close).toHaveBeenCalled();
  expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 64, 128, 128, 0, 0, 128, 128);
  await act(async () => { root.render(<MessageImages images={[image]} previewUrls={{ [image.id]: 'blob:composer-preview' }} />); });
  await act(async () => { root.render(null); });
  vi.mocked(previewImageUrl).mockClear();
  await act(async () => { root.render(<MessageImages images={[image]} />); });
  expect(container.querySelector('img')?.getAttribute('src')).toBe('data:image/jpeg;base64,thumbnail');
  expect(container.querySelector('[role="status"]')).toBeNull();
  expect(previewImageUrl).not.toHaveBeenCalled();
  await click(container.querySelector('button'));
  expect(document.querySelector('dialog img')?.getAttribute('src')).toBe('data:image/jpeg;base64,full-image');
  expect(document.querySelector('dialog [role="status"]')).toBeNull();
  expect(previewImageUrl).not.toHaveBeenCalled();
  await click(document.querySelector('[aria-label="关闭预览"]'));
  await click(container.querySelector('button'));
  expect(document.querySelector('dialog img')?.getAttribute('src')).toBe('data:image/jpeg;base64,full-image');
  expect(previewImageUrl).not.toHaveBeenCalled();
});

it('expands from the clicked thumbnail bounds and respects reduced motion', async () => {
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);
  await act(async () => { root.render(<MessageImages images={[images[0]]} />); });
  const button = container.querySelector('button')!;
  vi.spyOn(button, 'getBoundingClientRect').mockReturnValue(new DOMRect(200, 100, 64, 64));
  await click(button);
  const image = document.querySelector<HTMLImageElement>('dialog img')!;
  vi.spyOn(image, 'getBoundingClientRect').mockReturnValue(new DOMRect(500, 50, 320, 640));
  const exit = { onfinish: null as (() => void) | null, oncancel: null as (() => void) | null, cancel: vi.fn() };
  const animate = vi.fn().mockReturnValue(exit);
  Object.defineProperty(image, 'animate', { value: animate });
  await act(async () => { image.dispatchEvent(new Event('load')); });
  expect(animate).toHaveBeenCalledWith([
    { transform: 'translate(-428px, -238px) scale(0.2)', clipPath: 'inset(25% 0% round 8px)' },
    { transform: 'translate(0, 0) scale(1)', clipPath: 'inset(0% 0% round 2px)' },
  ], { duration: 280, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
  await click(document.querySelector('[aria-label="关闭预览"]'));
  expect(document.querySelector('dialog')).not.toBeNull();
  expect(animate).toHaveBeenLastCalledWith([
    expect.objectContaining({ clipPath: 'inset(0% 0% round 2px)' }),
    { transform: 'translate(-428px, -238px) scale(0.2)', clipPath: 'inset(25% 0% round 8px)' },
  ], { duration: 220, easing: 'cubic-bezier(0.4, 0, 0.8, 0.2)', fill: 'forwards' });
  await act(async () => { exit.onfinish?.(); });
  expect(document.querySelector('dialog')).toBeNull();
  vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList);
  await click(button);
  const reducedImage = document.querySelector<HTMLImageElement>('dialog img')!;
  const reducedAnimate = vi.fn();
  Object.defineProperty(reducedImage, 'animate', { value: reducedAnimate });
  await act(async () => { reducedImage.dispatchEvent(new Event('load')); });
  expect(reducedAnimate).not.toHaveBeenCalled();
});

it.each(['cancel', 'blank'])('animates closing via %s and ignores repeated close requests', async method => {
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList);
  const dialog = await open();
  const button = container.querySelector('button')!;
  vi.spyOn(button, 'getBoundingClientRect').mockReturnValue(new DOMRect(200, 100, 64, 64));
  const image = dialog.querySelector('img')!;
  vi.spyOn(image, 'getBoundingClientRect').mockReturnValue(new DOMRect(500, 50, 320, 640));
  const exit = { onfinish: null as (() => void) | null, oncancel: null as (() => void) | null, cancel: vi.fn() };
  const animate = vi.fn().mockReturnValue(exit);
  Object.defineProperty(image, 'animate', { value: animate });
  if (method === 'cancel') {
    await act(async () => { dialog.dispatchEvent(new Event('cancel', { cancelable: true })); });
  } else {
    await click(image.parentElement);
  }
  await click(document.querySelector('[aria-label="关闭预览"]'));
  expect(animate).toHaveBeenCalledTimes(1);
  expect(dialog.isConnected).toBe(true);
  await act(async () => { exit.onfinish?.(); });
  expect(document.querySelector('dialog')).toBeNull();
});
