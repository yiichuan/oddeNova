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
  vi.unstubAllEnvs();
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

function directoryHeading(host: HTMLElement, title: string) {
  return [...host.querySelectorAll<HTMLButtonElement>('.sl-directory-heading')]
    .find(button => button.children[1]?.textContent === title)!;
}

it('opens matching directory branches during search and restores browsing when cleared', async () => {
  mockFetch();
  const host = await render();
  expect(directoryHeading(host, '旋律采样').getAttribute('aria-expanded')).toBe('false');
  await click(directoryHeading(host, '军鼓'));
  await search(host, 'piano & keys');
  expect(directoryHeading(host, '鼓组')).toBeUndefined();
  expect(directoryHeading(host, '钢琴与键盘').getAttribute('aria-expanded')).toBe('true');
  expect(host.querySelector('.sl-directory-sample[aria-pressed=true]')?.textContent).toContain('piano');

  await click(directoryHeading(host, '旋律采样'));
  expect(host.querySelector('.sl-directory-sample')).toBeNull();
  expect(host.querySelector('.sl-code code')?.textContent).toContain('piano');
  await search(host, '');
  expect(directoryHeading(host, '军鼓').getAttribute('aria-expanded')).toBe('true');
  expect(directoryHeading(host, '钢琴与键盘').getAttribute('aria-expanded')).toBe('true');
});

it('pages within a group while counting all matching sounds', async () => {
  const samples = Array.from({ length: 61 }, (_, i) => ({ ...fixture.samples[0], key: `unknown-${i}` }));
  mockFetch().mockImplementationOnce(async () => ({ ok: true, json: async () => ({ ...fixture, samples }) }));
  const host = await render();
  expect(directoryHeading(host, '其他音色').textContent).toContain('61');
  expect(host.querySelectorAll('.sl-directory-sample')).toHaveLength(60);
  await click(host.querySelector<HTMLButtonElement>('.sl-more')!);
  expect(host.querySelectorAll('.sl-directory-sample')).toHaveLength(61);
  expect(host.querySelector('.sl-more')).toBeNull();
});

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
  await click(directoryHeading(host, '军鼓'));
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

it('preserves edits through save and publish failures and updates shared references on retry', async () => {
  const first = fixture.samples[0];
  const variant = {
    ...first.variants.find(item => item.sha256 && item.features)!,
    annotationStatus: 'model_initial' as const,
  };
  const original = {
    ...variant.features!,
    timbre: { ...variant.features!.timbre, texture_tags: ['airy', 'breathy', 'buzzy', 'grainy'] },
  };
  const other = { ...variant, id: 'shared-reference', index: 5 };
  const samples = [
    { ...first, variants: [variant] },
    { ...fixture.samples[1], variants: [other] },
  ];
  let live: SearchCatalog = { ...fixture, samples };
  const brightness = original.timbre.brightness === 'bright' ? 'dark' : 'bright';
  let review: import('./annotation-editor-types').AnnotationReview = {
    revision: 'initial', draft: null, effectiveFeatures: original, modelFeatures: original, pendingPublication: false,
  };
  let saveFailed = false;
  const jsonHeaders = new Headers({ 'Content-Type': 'application/json' });
  const fetchMock = vi.fn(async (path: string, options?: RequestInit) => {
    if (path.startsWith('/api/local/sample-annotations/')) {
      if (options?.body) {
        const command = JSON.parse(String(options.body));
        if (command.action === 'save') {
          if (!saveFailed) {
            saveFailed = true;
            return { ok: false, headers: jsonHeaders, json: async () => ({ error: '保存失败，请重试。' }) };
          }
          review = { ...review, revision: 'saved', draft: { revision: 'draft', features: command.features } };
        } else if (command.action === 'publish') {
          if (!review.pendingPublication) {
            review = { ...review, revision: 'partial', pendingPublication: true };
            return { ok: false, headers: jsonHeaders, json: async () => ({ error: '目录尚未更新。' }) };
          }
          expect(command.revision).toBe('partial');
          const features = review.draft!.features;
          live = { ...live, samples: live.samples.map(sample => ({
            ...sample, variants: sample.variants.map(item => ({
              ...item, features, modelFeatures: original, annotationStatus: 'expert_confirmed',
            })),
          })) };
          review = { ...review, revision: 'published', draft: null, effectiveFeatures: features, pendingPublication: false };
        }
      }
      return { ok: true, headers: jsonHeaders, json: async () => review };
    }
    return { ok: true, json: async () => path === catalogPath ? live : readPublicJson(path) };
  });
  vi.stubGlobal('fetch', fetchMock);
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  const host = await render();
  const button = (label: string) => [...host.querySelectorAll('button')].find(item => item.textContent?.trim() === label)!;
  await click(button('编辑标注'));
  expect(host.querySelector('.sl-features')).toBeNull();
  expect(host.querySelector('.sl-editor-original')).toBeNull();
  expect(host.querySelector<HTMLDetailsElement>('.sl-editor-scope')?.open).toBe(false);
  expect(host.querySelector('.sl-edit-references')?.textContent).toContain(`${samples[1].key}:5`);
  const textures = [...host.querySelectorAll<HTMLInputElement>('.sl-editor-textures input')];
  const selected = textures.find(input => input.checked)!;
  const unselected = textures.find(input => !input.checked)!;
  expect(unselected.disabled).toBe(true);
  await act(async () => selected.click());
  expect(unselected.disabled).toBe(false);
  expect(host.querySelector('.sl-editor-textures .sl-editor-unsaved')?.textContent).toBe('未保存');
  expect(host.querySelector('.sl-editor-footer')?.textContent).toContain('有 1 项未保存修改');
  await act(async () => selected.click());
  expect(unselected.disabled).toBe(true);
  expect(host.querySelector('.sl-editor-original')).toBeNull();
  expect(host.querySelector('.sl-editor-unsaved')).toBeNull();
  expect(host.querySelector('.sl-editor-footer')?.textContent).toContain('当前为模型初标，尚未经人工确认');
  const field = [...host.querySelectorAll('.sl-editor-field')].find(item => item.textContent?.startsWith('亮度'))!;
  const changeBrightness = () => act(async () => {
    const select = field.querySelector('select')!;
    select.value = brightness;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await changeBrightness();
  expect(field.textContent).toContain('AI 原值');
  expect(field.getAttribute('data-unsaved')).toBe('true');
  await click(button('恢复 AI 原值'));
  expect(field.querySelector('select')?.value).toBe(original.timbre.brightness);
  expect(host.querySelector('.sl-editor-original')).toBeNull();
  await changeBrightness();
  await click(button('关闭编辑'));
  expect(confirm).toHaveBeenCalled();
  expect(host.querySelector('.sl-editor-footer')?.textContent).toContain('有 1 项未保存修改');
  expect(button('确认发布').disabled).toBe(true);
  await click(button('保存草稿'));
  expect(host.querySelector('.sl-editor-footer [role=alert]')?.textContent).toContain('保存失败');
  expect(field.querySelector('select')?.value).toBe(brightness);
  expect(field.getAttribute('data-unsaved')).toBe('true');
  await click(button('保存草稿'));
  expect(host.textContent).toContain('草稿已保存');
  expect(host.textContent).not.toContain('有 1 项未保存修改');
  expect(field.textContent).toContain('AI 原值');
  expect(field.getAttribute('data-unsaved')).toBe('false');
  expect(live.samples[0].variants[0].features).toEqual(variant.features);

  await click(button('关闭编辑'));
  expect(host.querySelector('.sl-features')).not.toBeNull();
  expect(confirm).toHaveBeenCalledTimes(1);
  await click(button('编辑标注'));
  expect(host.querySelector('.sl-editor-footer')?.textContent).toContain('草稿已保存');
  await click(button('确认发布'));
  expect(host.querySelector('.sl-editor-footer [role=alert]')?.textContent).toContain('目录尚未更新');
  await click(button('重试发布'));
  expect(host.textContent).toContain('标注已发布');
  expect(host.textContent).toContain('人工确认');
  expect(host.querySelector('.sl-editor')).toBeNull();
  const modelDetails = [...host.querySelectorAll('details')].find(item => item.textContent?.startsWith('查看 AI 原始标注'));
  expect(modelDetails?.querySelectorAll('dt')).toHaveLength(10);
  expect(live.samples.every(sample => sample.variants[0].features?.timbre.brightness === brightness)).toBe(true);

  await click(button('编辑标注'));
  expect(host.querySelector('.sl-editor-footer [role=status]')?.textContent).toBe('当前人工标注已生效');
  expect(host.querySelector('.sl-editor-revised')?.textContent).toBe('人工修订');
  expect(host.querySelector('.sl-editor-unsaved')).toBeNull();
  await click(button('恢复 AI 原值'));
  expect(host.querySelector('.sl-editor-revised')).toBeNull();
  expect(host.querySelector('.sl-editor-unsaved')?.textContent).toBe('未保存');
});

it('identifies an unannotated sample without presenting an AI comparison', async () => {
  const first = fixture.samples[0];
  const variant = {
    ...first.variants.find(item => item.sha256)!,
    features: null, modelFeatures: null, annotationStatus: 'unavailable',
  };
  const fetchMock = mockFetch();
  fetchMock.mockImplementationOnce(async () => ({
    ok: true, json: async () => ({ ...fixture, samples: [{ ...first, variants: [variant] }] }),
  })).mockImplementation(async path => ({
    ok: true,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    json: async () => path.startsWith('/api/local/sample-annotations/') ? {
      revision: 'initial', draft: null, effectiveFeatures: null, modelFeatures: null, pendingPublication: false,
    } : readPublicJson(path),
  }));

  const host = await render();
  await click(host.querySelector<HTMLButtonElement>('.sl-edit-toggle')!);
  expect(host.querySelector('.sl-editor-footer [role=status]')?.textContent).toBe('暂无生效标注');
  expect(host.querySelector('.sl-editor-original')).toBeNull();
});

it('keeps published AI values visible without offering editing in production', async () => {
  vi.stubEnv('DEV', false);
  const first = fixture.samples[0];
  const original = first.variants.find(item => item.features)!;
  const reviewed = {
    ...original, annotationStatus: 'expert_confirmed' as const,
    modelFeatures: original.features,
  };
  const fetchMock = mockFetch();
  fetchMock.mockImplementationOnce(async () => ({
    ok: true, json: async () => ({ ...fixture, samples: [{ ...first, variants: [reviewed] }] }),
  }));
  const host = await render();
  expect(host.querySelector('.sl-edit-toggle')).toBeNull();
  expect(host.textContent).toContain('查看 AI 原始标注');
  expect(fetchMock.mock.calls.every(([path]) => !path.startsWith('/api/local/'))).toBe(true);
});
