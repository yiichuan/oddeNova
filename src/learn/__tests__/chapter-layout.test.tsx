// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ChapterLayout from '../ChapterLayout';
import type { Chapter, Section } from '../content';

vi.mock('../../lib/i18n', () => ({
  zh: true,
  t: (key: string) => key,
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const ChapterBody = () => null;
const chapter: Chapter = {
  id: 'toc-test',
  titleZh: '目录测试',
  titleEn: 'TOC test',
  originalPath: 'learn/toc-test',
  translatedDate: '2026-07-28',
  Component: ChapterBody,
};
const section: Section = {
  id: 'test',
  titleZh: '测试',
  titleEn: 'Test',
  chapters: [chapter],
};

describe('ChapterLayout table of contents', () => {
  let root: Root | null = null;

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
      root = null;
    }
    document.body.innerHTML = '';
  });

  it('includes h3 headings and indents them more deeply than h2 headings', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        <ChapterLayout section={section} chapter={chapter} prev={null} next={null} onNavigate={vi.fn()}>
          <h2>一级章节</h2>
          <h3>二级章节</h3>
          <h2>另一个一级章节</h2>
        </ChapterLayout>,
      );
    });

    const tocButtons = Array.from(container.querySelectorAll<HTMLButtonElement>('nav button'));
    expect(tocButtons.map((button) => button.textContent?.trim())).toEqual([
      '一级章节',
      '二级章节',
      '另一个一级章节',
    ]);
    expect(tocButtons[0].className).toContain('pl-3');
    expect(tocButtons[1].className).toContain('pl-7');
  });
});
