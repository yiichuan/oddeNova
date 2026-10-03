// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../../lib/i18n';
import { SAMPLE_CATALOG } from '../../../lib/sample-catalog';
import type { SoundInfo } from '../../../lib/sample-preview';
import AuditionPage from '../AuditionPage';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const roots: Root[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.innerHTML = '';
});

async function renderPage(infos: Record<string, SoundInfo> = {}) {
  const previewSound = vi.fn(async (_name: string, _options?: { variant?: number; note?: string }) => {});
  const describeSounds = vi.fn(async () => infos);
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  roots.push(root);
  await act(async () => {
    root.render(
      <AuditionPage active engineReady previewSound={previewSound} describeSounds={describeSounds} />,
    );
  });
  return { host, previewSound, describeSounds };
}

const categoryTab = (host: HTMLElement, id: string) => {
  const title = SAMPLE_CATALOG.find((category) => category.id === id)!.title;
  return [...host.querySelectorAll('nav button')]
    .find((button) => title.some((text) => button.textContent?.startsWith(text)));
};

const key = (host: HTMLElement, name: string) =>
  host.querySelector<HTMLButtonElement>(`button[data-sample="${name}"]`);

describe('AuditionPage', () => {
  it('opens on the first category and switches shelves from the category list', async () => {
    const { host } = await renderPage();
    expect(key(host, 'bd')).not.toBeNull();
    expect(key(host, 'gm_piano')).toBeNull();

    const gmTab = categoryTab(host, 'gm');
    await act(async () => { gmTab?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    expect(key(host, 'gm_piano')).not.toBeNull();
    expect(key(host, 'bd')).toBeNull();
  });

  it('steps through takes when the same sound is pressed again, and shows the code', async () => {
    const { host, previewSound } = await renderPage({
      bd: { kind: 'sample', variants: 3 },
      sd: { kind: 'sample', variants: 2 },
    });

    expect(key(host, 'bd')?.textContent).toContain('×3');

    const press = async (name: string) => {
      await act(async () => { key(host, name)?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    };
    await press('bd');
    await press('bd');
    await press('sd');
    await press('bd');

    expect(previewSound.mock.calls.map(([name, options]) => [name, options?.variant])).toEqual([
      ['bd', 0], ['bd', 1], ['sd', 0], ['bd', 1],
    ]);
    expect(key(host, 'bd')?.textContent).toContain('2/3');
    expect(host.textContent).toContain('s("bd:1")');
  });

  it('passes a group pitch to pitched sounds', async () => {
    const { host, previewSound } = await renderPage({ gm_acoustic_bass: { kind: 'pitched', variants: 1 } });
    const gmTab = categoryTab(host, 'gm');
    await act(async () => { gmTab?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await act(async () => {
      key(host, 'gm_acoustic_bass')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(previewSound).toHaveBeenCalledWith('gm_acoustic_bass', { variant: 0, note: 'c2' });
  });

  it('searches across every category', async () => {
    const { host } = await renderPage();
    const input = host.querySelector<HTMLInputElement>('input[type="search"]');
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setValue?.call(input, 'TR808');
      input?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(key(host, 'RolandTR808_bd')).not.toBeNull();
    expect(key(host, 'bd')).toBeNull();

    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setValue?.call(input, 'no-such-sound');
      input?.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(host.textContent).toContain(t('auditionNoResults'));
  });

  it('disables sounds the engine does not hold', async () => {
    const { host } = await renderPage({ bd: { kind: 'sample', variants: 1 } });
    expect(key(host, 'bd')?.disabled).toBe(false);
    expect(key(host, 'sd')?.disabled).toBe(true);
  });
});
