// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../../lib/i18n';
import { countSamples, SAMPLE_CATALOG } from '../../../lib/sample-catalog';
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

  it('opens every take under the pointer, plays the one pressed and numbers it', async () => {
    const { host, previewSound } = await renderPage({
      bd: { kind: 'sample', variants: 3 },
      sd: { kind: 'sample', variants: 1 },
    });

    expect(key(host, 'bd')?.textContent).toContain('×3');

    const click = async (element: Element | null | undefined) => {
      await act(async () => { element?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    };
    const point = async (name: string) => {
      await act(async () => {
        key(host, name)?.closest('li')?.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
      });
    };
    const take = (name: string) => host.querySelector(`button[data-sample-take="${name}"]`);
    const takeNumber = (name: string) =>
      key(host, name)?.querySelector('[data-testid="audition-take-number"]')?.textContent ?? null;

    await point('sd');
    expect(host.querySelector('[role="menu"]')).toBeNull();
    await click(key(host, 'sd'));

    await point('bd');
    expect([...host.querySelectorAll('[data-sample-take]')].map((item) => item.textContent))
      .toEqual(['bd:0', 'bd:1', 'bd:2']);

    await click(key(host, 'bd'));
    expect(takeNumber('bd')).toBe('00');
    await click(take('bd:2'));

    expect(previewSound.mock.calls.map(([name, options]) => [name, options?.variant])).toEqual([
      ['sd', 0], ['bd', 0], ['bd', 2],
    ]);
    expect(takeNumber('bd')).toBe('02');
    expect(takeNumber('sd')).toBeNull();
    expect(key(host, 'bd')?.querySelector('[data-testid="audition-listening"]')).not.toBeNull();
    expect(host.textContent).toContain('s("bd:2")');
  });

  it('steps through takes in order when the key itself is pressed, and retries a failed one', async () => {
    const { host, previewSound } = await renderPage({ bd: { kind: 'sample', variants: 3 } });
    const bd = () => key(host, 'bd');
    const press = async () => {
      await act(async () => { bd()?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    };

    await press();
    await press();
    previewSound.mockRejectedValueOnce(new Error('no audio'));
    await press();
    expect(bd()?.querySelector('[data-testid="audition-listening"]')?.getAttribute('data-phase'))
      .toBe('ending');
    expect(bd()?.className).toContain('bg-error');

    /* The next press tries the same take again rather than moving on. */
    await press();
    expect(bd()?.className).not.toContain('bg-error');
    await press();

    expect(previewSound.mock.calls.map(([, options]) => options?.variant)).toEqual([0, 1, 2, 2, 0]);
  });

  it('lights only one key at a time, even one that kept focus after a click', async () => {
    const { host } = await renderPage({
      bd: { kind: 'sample', variants: 3 },
      sd: { kind: 'sample', variants: 1 },
    });
    const li = (name: string) => key(host, name)?.closest('li');
    const lit = () => [...host.querySelectorAll('button[data-sample]')]
      .filter((button) => button.className.includes('bg-brand-accent'))
      .map((button) => button.getAttribute('data-sample'));

    await act(async () => {
      li('bd')?.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
      key(host, 'bd')?.focus();
    });
    await act(async () => {
      li('sd')?.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
    });

    expect(lit()).toEqual(['sd']);
    expect(host.querySelector('[role="menu"]')).toBeNull();
  });

  it('ends the sheen of a key pressed twice even when the first press finishes last', async () => {
    vi.useFakeTimers();
    try {
      const { host, previewSound } = await renderPage({ bd: { kind: 'sample', variants: 3 } });
      const bd = () => key(host, 'bd');
      let finishFirst: () => void = () => {};
      previewSound.mockImplementationOnce(() => new Promise<void>((resolve) => { finishFirst = resolve; }));

      await act(async () => { bd()?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      await act(async () => { bd()?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      await act(async () => { finishFirst(); });

      await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
      expect(bd()?.querySelector('[data-testid="audition-listening"]')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('bridges the way to the take menu with an aim triangle that stands down when the pointer rests', async () => {
    vi.useFakeTimers();
    try {
      const { host } = await renderPage({ bd: { kind: 'sample', variants: 3 } });
      const aim = () => host.querySelector<HTMLElement>('[data-testid="audition-aim"]');
      await act(async () => {
        key(host, 'bd')?.closest('li')?.dispatchEvent(new MouseEvent('pointerover', { bubbles: true }));
      });
      expect(aim()?.style.display).toBe('none');

      await act(async () => {
        key(host, 'bd')?.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 10, clientY: 10 }));
      });
      expect(aim()?.style.display).toBe('');
      expect(aim()?.style.clipPath).toContain('polygon(');

      await act(async () => {
        aim()?.dispatchEvent(new MouseEvent('pointermove', { bubbles: true }));
        await vi.advanceTimersByTimeAsync(400);
      });
      expect(aim()?.style.display).toBe('none');
      expect(host.querySelector('[role="menu"]')).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('titles the page with the open shelf and how many sounds it holds', async () => {
    const { host } = await renderPage();
    const percussion = SAMPLE_CATALOG.find((category) => category.id === 'percussion')!;
    await act(async () => {
      categoryTab(host, 'percussion')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const title = host.querySelector('[data-testid="audition-title"]')?.textContent ?? '';
    expect(percussion.title.some((text) => title.includes(text))).toBe(true);
    expect(title).toContain(String(countSamples(percussion)));
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
