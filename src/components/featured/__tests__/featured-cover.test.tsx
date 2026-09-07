// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { FeaturedCover } from '../featured-cover';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('FeaturedCover artwork loading', () => {
  let root: ReturnType<typeof createRoot> | null = null;

  afterEach(() => {
    if (root) act(() => root?.unmount());
    root = null;
    document.body.innerHTML = '';
  });

  it('shows a themed record placeholder until the artwork loads', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => root?.render(
      <FeaturedCover piece={{ id: 'undertale', coverUrl: '/featured/UNDERTALE.jpg' }} />,
    ));

    const placeholder = container.querySelector<HTMLElement>('[data-featured-cover-placeholder]')!;
    const image = container.querySelector<HTMLImageElement>('[data-featured-cover-image]')!;
    expect(placeholder.className).toContain('featured-cover-placeholder');
    expect(placeholder.className).toContain('text-icon-idle');
    expect(placeholder.className).toContain('opacity-100');
    expect(image.className).toContain('opacity-0');

    act(() => image.dispatchEvent(new Event('load')));

    expect(placeholder.className).toContain('opacity-0');
    expect(image.className).toContain('opacity-100');
  });

  it('restores the placeholder when the component receives a new cover', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => root?.render(
      <FeaturedCover piece={{ id: 'first', coverUrl: '/featured/first.jpg' }} />,
    ));
    act(() => container.querySelector<HTMLImageElement>('[data-featured-cover-image]')
      ?.dispatchEvent(new Event('load')));

    act(() => root?.render(
      <FeaturedCover piece={{ id: 'second', coverUrl: '/featured/second.jpg' }} />,
    ));

    expect(container.querySelector<HTMLElement>('[data-featured-cover-placeholder]')?.className)
      .toContain('opacity-100');
    expect(container.querySelector<HTMLImageElement>('[data-featured-cover-image]')?.className)
      .toContain('opacity-0');
  });
});
