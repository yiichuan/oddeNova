// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import SampleLibraryPage from './SampleLibraryPage';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
afterEach(() => { if (root) act(() => root.unmount()); document.body.innerHTML = ''; vi.unstubAllGlobals(); });
async function render() {
  const host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<SampleLibraryPage />));
  return host;
}
it('renders variant-specific annotation and clears details for an empty status filter', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ schemaVersion: 1, samples: [{ key: 'piano', aliases: [], category: '钢琴', summary: '', variants: [
    { id: 'a', index: 0, rootNote: 'C4', annotationStatus: 'model_initial', features: null, playback: 'note("C4").s("piano:0")' },
    { id: 'b', index: 1, rootNote: 'D4', annotationStatus: 'unavailable', features: null, playback: 'note("D4").s("piano:1")' },
  ] }] }) }));
  const host = await render();
  expect(host.querySelector('code')?.textContent).toContain('piano:0');
  const variants = host.querySelector<HTMLSelectElement>('.sl-variant select')!;
  await act(async () => { variants.value = 'b'; variants.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(host.querySelector('code')?.textContent).toContain('piano:1');
  expect(host.querySelector('.sl-status')?.textContent).toBe('暂无标注');
  const status = host.querySelector<HTMLSelectElement>('.sl-filter select')!;
  await act(async () => { status.value = 'expert_confirmed'; status.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(host.querySelector('code')).toBeNull();
  expect(host.textContent).toContain('没有匹配的音色');
});
it('offers a working retry after a failed catalog request', async () => {
  const fetchMock = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ ok: true, json: async () => ({ schemaVersion: 1, samples: [] }) });
  vi.stubGlobal('fetch', fetchMock);
  const host = await render();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('offline');
  await act(async () => host.querySelector<HTMLButtonElement>('[role="alert"] button')!.click());
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(host.textContent).toContain('0 个匹配音色');
});
