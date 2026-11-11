// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { SearchCatalog } from '../lib/sample-search';
import SampleLibraryPage from './SampleLibraryPage';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | null;
afterEach(() => {
  if (root) act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const catalogPath = '/sample-annotations/catalog.json';
const readPublicJson = (path: string) => JSON.parse(readFileSync('public' + path, 'utf8'));
const catalog = readPublicJson(catalogPath) as SearchCatalog;
const fixture = {
  ...catalog,
  samples: catalog.samples.filter(sample => ['808cy', '808sd', 'piano'].includes(sample.key)),
};

function mockFetch() {
  const fetchMock = vi.fn(async (path: string) => ({
    ok: true,
    json: async () => path === catalogPath ? fixture : readPublicJson(path),
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function mockAudio() {
  const elements: HTMLAudioElement[] = [];
  const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLAudioElement) {
    elements.push(this);
    return Promise.resolve();
  });
  const pause = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
  return { elements, play, pause };
}

async function render() {
  const host = document.createElement('div');
  document.body.append(host);
  const mounted = createRoot(host);
  root = mounted;
  await act(async () => mounted.render(<SampleLibraryPage />));
  return host;
}

async function search(host: HTMLElement, query: string) {
  const input = host.querySelector<HTMLInputElement>('input[type="search"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, query);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function click(button: HTMLButtonElement) {
  await act(async () => button.click());
}

function rows(host: HTMLElement) {
  return [...host.querySelectorAll<HTMLLIElement>('.sl-variant-row')];
}

function previewButton(row: HTMLElement) {
  return row.querySelector<HTMLButtonElement>('.sl-preview-button')!;
}

it.each([
  ['808sd', 'SD'],
  ['808cy', 'CY'],
])('shows all 25 %s variants and plays the exact file for each selected row', async (name, prefix) => {
  mockFetch();
  const { elements, play, pause } = mockAudio();
  const host = await render();
  await search(host, name);
  expect(rows(host).map(row => row.querySelector('code')?.textContent))
    .toEqual(Array.from({ length: 25 }, (_, index) => `${name}:${index}`));
  expect(play).not.toHaveBeenCalled();

  for (const [index, file] of [[0, '0000'], [12, '2525'], [24, '7575']] as const) {
    const row = rows(host)[index];
    await click(previewButton(row));
    expect(row.querySelector('.sl-variant-select')?.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('.sl-code code')?.textContent).toBe(`s("${name}:${index}")`);
    expect(elements.at(-1)?.src).toBe(
      `https://raw.githubusercontent.com/tidalcycles/Dirt-Samples/master/${name}/${prefix}${file}.WAV`,
    );
  }
  expect(pause).toHaveBeenCalledTimes(2);
  expect(elements.slice(0, 2).every(audio => !audio.hasAttribute('src'))).toBe(true);
  await click(previewButton(rows(host)[24]));
  expect(pause).toHaveBeenCalledTimes(3);
  expect(previewButton(rows(host)[24]).textContent).toBe('试听');
});

it('switches piano details without playing and stops audio hidden by a filter', async () => {
  mockFetch();
  const { elements, play, pause } = mockAudio();
  const host = await render();
  await search(host, 'piano');
  const row = rows(host).find(item => item.textContent?.includes('C4'))!;
  await click(row.querySelector<HTMLButtonElement>('.sl-variant-select')!);
  expect(host.querySelector('.sl-code code')?.textContent).toBe('note("C4").s("piano:0")');
  expect(play).not.toHaveBeenCalled();

  await click(previewButton(row));
  expect(elements.at(-1)?.src).toBe('https://raw.githubusercontent.com/felixroos/dough-samples/main/piano/C4v8.mp3');
  const status = host.querySelector<HTMLSelectElement>('.sl-status-filter select')!;
  await act(async () => {
    status.value = 'expert_confirmed';
    status.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(pause).toHaveBeenCalledTimes(1);
  expect(host.querySelector('.sl-code')).toBeNull();
  expect(host.textContent).toContain('没有匹配的音色');
});

it('can retry a failed preview and releases it when leaving the page', async () => {
  mockFetch();
  const { play, elements, pause } = mockAudio();
  play.mockRejectedValueOnce(new Error('could not play'));
  const host = await render();
  const row = rows(host)[0];
  await click(previewButton(row));
  expect(row.querySelector('[role="alert"]')?.textContent).toContain('音频播放失败');
  expect(host.querySelector('.sl-code')).not.toBeNull();
  await click(previewButton(row));
  expect(row.querySelector('[role="alert"]')).toBeNull();
  expect(previewButton(row).textContent).toBe('停止试听');

  await act(async () => window.dispatchEvent(new Event('pagehide')));
  expect(pause).toHaveBeenCalledTimes(2);
  expect(elements.at(-1)?.hasAttribute('src')).toBe(false);
  expect(previewButton(row).textContent).toBe('试听');
});

it('ignores a late playback error after switching to a different recording', async () => {
  mockFetch();
  const { play } = mockAudio();
  let rejectFirst!: (error: Error) => void;
  play.mockImplementationOnce(() => new Promise<void>((_, reject) => { rejectFirst = reject; }));
  const host = await render();
  const [first, second] = rows(host);
  await click(previewButton(first));
  expect(previewButton(first).textContent).toContain('加载中');
  await click(previewButton(second));
  await act(async () => rejectFirst(new Error('interrupted')));
  expect(first.querySelector('[role="alert"]')).toBeNull();
  expect(previewButton(second).textContent).toBe('停止试听');
});

it('resets the preview when a recording ends or the selected sound changes', async () => {
  mockFetch();
  const { elements, pause } = mockAudio();
  const host = await render();
  const [first] = rows(host);
  await click(previewButton(first));
  await act(async () => elements[0].dispatchEvent(new Event('ended')));
  expect(previewButton(first).textContent).toBe('试听');
  await click(previewButton(first));
  const snare = [...host.querySelectorAll<HTMLButtonElement>('.sl-results button')]
    .find(button => button.textContent?.includes('808sd'))!;
  await click(snare);
  expect(pause).toHaveBeenCalledTimes(2);
  expect(host.querySelector('.sl-code code')?.textContent).toBe('s("808sd:0")');
  expect(previewButton(rows(host)[0]).textContent).toBe('试听');
});

it('offers a working retry after a failed catalog request', async () => {
  const fetchMock = mockFetch().mockRejectedValueOnce(new Error('offline'));
  const host = await render();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('offline');
  await click(host.querySelector<HTMLButtonElement>('[role="alert"] button')!);
  expect(fetchMock.mock.calls.filter(([path]) => path === catalogPath)).toHaveLength(2);
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(rows(host)).toHaveLength(25);
});

it('keeps annotations visible and can retry when loading the audio indexes fails', async () => {
  const fetchMock = mockFetch();
  fetchMock.mockImplementationOnce(async () => ({ ok: true, json: async () => fixture }));
  fetchMock.mockRejectedValueOnce(new Error('offline'));
  const host = await render();
  expect(host.querySelector('.sl-code')).not.toBeNull();
  expect(host.querySelector('.sl-preview-button')).toBeNull();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('试听索引加载失败');
  await click(host.querySelector<HTMLButtonElement>('[role="alert"] button')!);
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(rows(host).map(previewButton).every(Boolean)).toBe(true);
});

it('keeps preview controls in sync and stops playback when selecting another variant', async () => {
  mockFetch();
  const { play, pause } = mockAudio();
  const host = await render();
  const [first, second] = rows(host);
  const detailPreview = host.querySelector<HTMLButtonElement>('.sl-detail .sl-preview-button')!;
  await click(detailPreview);
  expect(previewButton(first).textContent).toBe('停止试听');
  await click(second.querySelector<HTMLButtonElement>('.sl-variant-select')!);
  expect(pause).toHaveBeenCalledTimes(1);
  expect(play).toHaveBeenCalledTimes(1);
  expect(previewButton(first).textContent).toBe('试听');
  expect(host.querySelector('.sl-detail h2')?.textContent).toBe('808cy:1');
  await click(previewButton(second));
  expect(detailPreview.textContent).toBe('停止试听');
});

it('replaces an excluded variant and clears the search and filters', async () => {
  mockFetch();
  const host = await render();
  await search(host, '808sd');
  const current = fixture.samples.find(sample => sample.key === '808sd')!;
  const initialBrightness = current.variants[0].features?.timbre.brightness;
  const different = current.variants.find(item => item.features && item.features.timbre.brightness !== initialBrightness)!;
  const brightness = host.querySelector<HTMLSelectElement>('.sl-filter select')!;
  await act(async () => {
    brightness.value = different.features!.timbre.brightness;
    brightness.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(host.querySelector('.sl-code code')?.textContent).toBe(different.playback);
  await click(host.querySelector<HTMLButtonElement>('.sl-clear')!);
  expect(brightness.value).toBe('');
  expect(host.querySelector<HTMLInputElement>('.sl-search input')?.value).toBe('');
  expect(host.querySelector('.sl-active-filters')).toBeNull();
});

it('copies the current playback code and reports clipboard failures', async () => {
  mockFetch();
  const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValueOnce(undefined)
    .mockRejectedValueOnce(new Error('denied'));
  const host = await render();
  const button = host.querySelector<HTMLButtonElement>('.sl-code button')!;
  await click(button);
  expect(writeText).toHaveBeenCalledWith('s("808cy:0")');
  expect(host.querySelector('.sl-copy-feedback')?.textContent).toBe('已复制');
  await click(button);
  expect(host.querySelector('.sl-copy-feedback')?.textContent).toContain('复制失败');
  expect(host.querySelector('.sl-code code')?.textContent).toBe('s("808cy:0")');
});
