// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ChatInput from '../ChatInput';
import { uploadImage } from '../../../lib/image-attachments';
import { rememberUploadedImagePreview } from '../../../lib/image-preview-memory';
import { isImageAttachments } from '../../../lib/image-types';

vi.mock('../../../lib/image-attachments', async importOriginal => ({
  ...await importOriginal<typeof import('../../../lib/image-attachments')>(),
  uploadImage: vi.fn(),
}));
vi.mock('../../../lib/image-preview-memory', async importOriginal => ({
  ...await importOriginal<typeof import('../../../lib/image-preview-memory')>(),
  rememberUploadedImagePreview: vi.fn(),
}));
vi.mock('../../../lib/image-cache', () => ({ previewImageUrl: vi.fn(() => new Promise(() => {})) }));
vi.mock('../../../services/airjelly', () => ({ checkAirJellyAvailable: async () => false }));
const mobileState = vi.hoisted(() => ({ value: false }));
vi.mock('../../../hooks/useIsMobile', () => ({ useIsMobile: () => mobileState.value }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let container: HTMLDivElement;
let urlId = 0;
const attachment = (id: string) => ({ id, name: `${id}.jpg`, path: `user/${id}`, mimeType: 'image/jpeg', width: 100, height: 100, size: 100 });
beforeEach(() => {
  localStorage.clear();
  vi.mocked(rememberUploadedImagePreview).mockReset().mockResolvedValue(undefined);
  mobileState.value = false;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:preview-${urlId++}`);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  act(() => root.render(<ChatInput isLoading={false} engineReady engineStatus="ready" onSendText={vi.fn()} onReinitEngine={vi.fn()} />));
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.mocked(uploadImage).mockReset();
  localStorage.clear();
});
async function add(count: number) {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, 'files', { configurable: true, value: Array.from({ length: count }, (_, i) => new File(['image'], `${i}.png`, { type: 'image/png' })) });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
}
it.each([false, true])('updates the image button when provider or model changes (mobile: %s)', mobile => {
  mobileState.value = mobile;
  const render = () => act(() => root.render(
    <ChatInput isLoading={false} engineReady onSendText={vi.fn()} onReinitEngine={vi.fn()} />,
  ));
  const button = () => container.querySelector('button[aria-label="Add image"]');
  localStorage.setItem('vibe_provider', 'glm');
  render();
  expect(button()).toBeNull();
  localStorage.setItem('vibe_provider', 'deepseek');
  localStorage.setItem('vibe_model_deepseek', 'deepseek-flash');
  render();
  expect(button()).not.toBeNull();
  localStorage.setItem('vibe_model_deepseek', 'deepseek-v4-pro');
  render();
  expect(button()).toBeNull();
  localStorage.setItem('vibe_model_deepseek', 'deepseek-flash');
  render();
  expect(button()).not.toBeNull();
});

it('keeps existing attachments visible and removable after switching to an unsupported provider', async () => {
  vi.mocked(uploadImage).mockResolvedValue(attachment('existing'));
  await add(1);
  localStorage.setItem('vibe_provider', 'glm');
  act(() => root.render(<ChatInput isLoading={false} engineReady onSendText={vi.fn()} onReinitEngine={vi.fn()} />));
  expect(container.querySelector('button[aria-label="Add image"]')).toBeNull();
  const removeButton = container.querySelector<HTMLButtonElement>('button[title^="Remove"]');
  expect(removeButton).not.toBeNull();
  act(() => removeButton!.click());
  expect(container.querySelector('button[title^="Remove"]')).toBeNull();
});

it('shows local blurred previews while uploading ten images, then retains thumbnails without a cloud preview wait', async () => {
  let complete!: (value: ReturnType<typeof attachment>) => void;
  vi.mocked(uploadImage).mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }))
    .mockImplementation(async file => attachment(file.name));
  await add(10);
  expect(container.querySelectorAll('img[src^="blob:"]')).toHaveLength(10);
  expect(container.querySelector('img.blur-sm')).not.toBeNull();
  expect(container.textContent).not.toContain('图片加载中');
  const addButton = container.querySelector<HTMLButtonElement>('button[aria-label="Add image"]')!;
  expect(addButton.title).toBe('Add image');
  expect(addButton.disabled).toBe(true);
  await act(async () => complete(attachment('first')));
  expect(uploadImage).toHaveBeenCalledTimes(10);
  expect(container.querySelectorAll('img[src^="blob:"]')).toHaveLength(10);
  expect(addButton.disabled).toBe(true);
  await act(async () => { container.querySelectorAll('img').forEach(image => image.dispatchEvent(new Event('load'))); });
  expect(container.querySelector('button[aria-haspopup="dialog"] [role="status"]')).toBeNull();
});
it('rejects eleven images before uploading', async () => {
  await add(11);
  expect(uploadImage).not.toHaveBeenCalled();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('10');
});
it('clears pending thumbnails and releases previews when upload fails', async () => {
  vi.mocked(uploadImage).mockRejectedValue(new Error('Upload failed'));
  await add(1);
  expect(container.querySelectorAll('img')).toHaveLength(0);
  expect(container.querySelector('[role="alert"]')?.textContent).toBe('0.png: Upload failed');
  expect(URL.revokeObjectURL).toHaveBeenCalled();
});
it('accepts ten persisted attachments and rejects eleven', () => {
  expect(isImageAttachments(Array.from({ length: 10 }, (_, i) => attachment(String(i))))).toBe(true);
  expect(isImageAttachments(Array.from({ length: 11 }, (_, i) => attachment(String(i))))).toBe(false);
});

it('clears attachments immediately while the send is pending and restores them on failure', async () => {
  let rejectSend!: (error: Error) => void;
  const onSendText = vi.fn(() => new Promise<void>((_, reject) => { rejectSend = reject; }));
  act(() => root.render(<ChatInput isLoading={false} engineReady engineStatus="ready" onSendText={onSendText} onReinitEngine={vi.fn()} />));
  vi.mocked(uploadImage).mockImplementation(async () => attachment('sent'));
  await add(1);
  expect(container.querySelector('button[aria-haspopup="dialog"]')).not.toBeNull();
  await act(async () => { container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  expect(onSendText).toHaveBeenCalledWith('', 'text', [attachment('sent')]);
  expect(container.querySelector('button[aria-haspopup="dialog"]')).toBeNull();
  expect(container.querySelector('button[title^="Remove"]')).toBeNull();
  expect(URL.revokeObjectURL).toHaveBeenCalled();
  await act(async () => rejectSend(new Error('Send failed')));
  expect(container.querySelector('button[title^="Remove"]')).not.toBeNull();
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('Send failed');
});

it('accepts another batch during upload and keeps sending blocked until both finish', async () => {
  let finishFirst!: (value: ReturnType<typeof attachment>) => void;
  let finishSecond!: (value: ReturnType<typeof attachment>) => void;
  vi.mocked(uploadImage)
    .mockImplementationOnce(() => new Promise(resolve => { finishFirst = resolve; }))
    .mockImplementationOnce(() => new Promise(resolve => { finishSecond = resolve; }));
  await add(1);
  const addButton = container.querySelector<HTMLButtonElement>('button[aria-label="Add image"]')!;
  expect(addButton.disabled).toBe(false);
  await add(1);
  expect(uploadImage).toHaveBeenCalledTimes(2);
  expect(container.querySelectorAll('img')).toHaveLength(2);
  await act(async () => finishSecond(attachment('second-batch')));
  expect(container.querySelector('img.blur-sm')).not.toBeNull();
  expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);
  expect(addButton.disabled).toBe(false);
  await act(async () => finishFirst(attachment('first-batch')));
  expect(container.querySelectorAll('button[aria-haspopup="dialog"]')).toHaveLength(2);
  expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
});

it('limits all batches to three uploads, preserves selection order, and continues after failure', async () => {
  const uploads: { resolve: (image: ReturnType<typeof attachment>) => void; reject: (error: Error) => void }[] = [];
  vi.mocked(uploadImage).mockImplementation(() => new Promise((resolve, reject) => uploads.push({ resolve, reject })));
  await add(5);
  await add(5);
  expect(uploadImage).toHaveBeenCalledTimes(3);
  expect(container.querySelectorAll('img')).toHaveLength(10);
  await add(1);
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('10');
  await act(async () => uploads[1].resolve(attachment('second')));
  expect(uploadImage).toHaveBeenCalledTimes(4);
  await act(async () => uploads[0].resolve(attachment('first')));
  expect(uploadImage).toHaveBeenCalledTimes(5);
  expect(Array.from(container.querySelectorAll('[data-image-thumbnail]')).map(node => node.getAttribute('data-image-thumbnail'))).toEqual(['first', 'second']);
  await act(async () => uploads[2].reject(new Error('Failed third image')));
  expect(uploadImage).toHaveBeenCalledTimes(6);
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('2.png: Failed third image');
  await add(1); // Only the failed slot is available again; the queue remains capped.
  expect(uploadImage).toHaveBeenCalledTimes(6);
  expect(container.querySelectorAll('img')).toHaveLength(10);
  for (let index = 3; index < 11; index++) {
    await act(async () => uploads[index].resolve(attachment(`image-${index}`)));
  }
  expect(uploadImage).toHaveBeenCalledTimes(11);
  expect(container.querySelectorAll('[data-image-thumbnail]')).toHaveLength(10);
  expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(false);
});

it('drops queued uploads and ignores late results after the composer unmounts', async () => {
  const uploads: Array<(image: ReturnType<typeof attachment>) => void> = [];
  vi.mocked(uploadImage).mockImplementation(() => new Promise(resolve => uploads.push(resolve)));
  await add(5);
  expect(uploadImage).toHaveBeenCalledTimes(3);
  act(() => root.render(null));
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(5);
  await act(async () => uploads.forEach((resolve, index) => resolve(attachment(String(index)))));
  expect(uploadImage).toHaveBeenCalledTimes(3);
  expect(container.childElementCount).toBe(0);
  expect(rememberUploadedImagePreview).not.toHaveBeenCalled();
});

it('holds concurrency slots until preview preparation finishes', async () => {
  const finishPreviews: Array<() => void> = [];
  vi.mocked(uploadImage).mockImplementation(async file => attachment(file.name));
  vi.mocked(rememberUploadedImagePreview).mockImplementation(() => new Promise(resolve => finishPreviews.push(resolve)));
  await add(5);
  expect(uploadImage).toHaveBeenCalledTimes(3);
  expect(container.querySelectorAll('[data-image-thumbnail]')).toHaveLength(0);
  await act(async () => finishPreviews[0]());
  expect(uploadImage).toHaveBeenCalledTimes(4);
  act(() => root.render(null));
  await act(async () => finishPreviews.slice(1).forEach(resolve => resolve()));
  expect(uploadImage).toHaveBeenCalledTimes(4);
  expect(container.childElementCount).toBe(0);
});
