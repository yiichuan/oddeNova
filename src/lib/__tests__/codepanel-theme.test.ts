// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { reify } from '@strudel/core';
import { mini } from '@strudel/mini';
import { createCodePanelTheme, createThemePainter, type CodePanelTheme } from '../codepanel-theme';

const GREEN = { tag: 'greenText-extension' };
const WHITE = { tag: 'whitescreen-extension' };

const themes = {
  greenText: GREEN,
  whitescreen: WHITE,
} as unknown as Parameters<typeof createCodePanelTheme>[0]['themes'];

describe('createCodePanelTheme', () => {
  let dispatch: ReturnType<typeof vi.fn>;
  let reconfigure: ReturnType<typeof vi.fn>;
  let theme: CodePanelTheme;

  beforeEach(() => {
    document.head.innerHTML = '';
    dispatch = vi.fn();
    reconfigure = vi.fn((extension: unknown) => ({ effect: extension }));
    theme = createCodePanelTheme({
      editor: { dispatch },
      themeCompartment: { reconfigure },
      themes,
    });
  });

  it('recolours the syntax by reconfiguring the theme compartment', () => {
    theme.apply('greenText');

    expect(reconfigure).toHaveBeenCalledWith(GREEN);
    expect(dispatch).toHaveBeenCalledWith({ effects: { effect: GREEN } });
  });

  it('leaves the panel surface to editor-preferences', () => {
    theme.apply('whitescreen');

    // The compartment reaches syntax colours and stops there. Background,
    // caret and selection are pinned on `.cm-editor` with `!important`, and
    // reaching past that would take a stylesheet written on purpose — the
    // panel keeps oddeNova's surface whatever a piece asks for.
    expect(document.head.querySelectorAll('style')).toHaveLength(0);
    expect(document.documentElement.style.getPropertyValue('--background')).toBe('');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('ignores a repeat of the theme already showing', () => {
    theme.apply('greenText');
    theme.apply('greenText');

    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it('swaps straight from one theme to the next', () => {
    theme.apply('greenText');
    theme.apply('whitescreen');

    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(reconfigure).toHaveBeenLastCalledWith(WHITE);
  });

  it('leaves the panel alone when the name is not a known theme', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    theme.apply('greenText');
    dispatch.mockClear();
    theme.apply('blackscren');

    expect(dispatch).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);

    // Once per name, however often the painter hands it over.
    theme.apply('blackscren');
    expect(warn).toHaveBeenCalledTimes(1);

    warn.mockRestore();
  });

  it('restores oddeNova syntax colours on reset', () => {
    theme.apply('greenText');
    dispatch.mockClear();

    theme.reset();

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(reconfigure).toHaveBeenLastCalledWith(expect.not.objectContaining({ tag: 'greenText-extension' }));
  });

  it('does not touch the editor when no theme is active', () => {
    theme.reset();

    expect(dispatch).not.toHaveBeenCalled();
  });

  it('re-applies a theme after a reset', () => {
    // What a pause/resume round trip does: reset on pause, and the painter
    // hands the same name back on the first frame after resume.
    theme.apply('greenText');
    theme.reset();
    dispatch.mockClear();

    theme.apply('greenText');

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(reconfigure).toHaveBeenLastCalledWith(GREEN);
  });
});

describe('createThemePainter', () => {
  // Queried against real @strudel patterns rather than a stub: what this has to
  // get right is Strudel's own sampling contract — that the Drawer's `time` is
  // in cycles, and that a zero-width query returns the hap covering it. A stub
  // would only restate the assumption instead of checking it.
  const paintFrames = (source: string, times: number[]): string[] => {
    const seen: string[] = [];
    const painter = createThemePainter(reify(mini(source)), name => seen.push(name));
    for (const time of times) painter(null, time);
    return seen;
  };

  it('follows a patterned theme name across cycles', () => {
    const frames = paintFrames(
      '<[greenText whitescreen] [blackscreen whitescreen]>/2',
      [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4],
    );

    // `/2` stretches each alternative over two cycles, and the brackets split
    // those in half: one name per cycle, wrapping at 4.
    expect(frames).toEqual([
      'greenText', 'greenText',
      'whitescreen', 'whitescreen',
      'blackscreen', 'blackscreen',
      'whitescreen', 'whitescreen',
      'greenText',
    ]);
  });

  it('reads a bare name as well as a pattern', () => {
    expect(paintFrames('greenText', [0, 7.25])).toEqual(['greenText', 'greenText']);
  });

  it('reports every frame and lets the panel decide what changed', () => {
    // Sixty frames inside one cycle is what the real Drawer delivers. The
    // painter says the name each time; only the panel is allowed to conclude
    // nothing happened, so a reset in between is always repainted.
    const dispatch = vi.fn();
    const panel = createCodePanelTheme({
      editor: { dispatch },
      themeCompartment: { reconfigure: vi.fn((extension: unknown) => extension) },
      themes,
    });
    const painter = createThemePainter(reify(mini('<greenText whitescreen>')), panel.apply);

    for (let frame = 0; frame < 60; frame += 1) painter(null, frame / 60);
    expect(dispatch).toHaveBeenCalledTimes(1);

    panel.reset();
    dispatch.mockClear();
    for (let frame = 0; frame < 60; frame += 1) painter(null, frame / 60);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
});
