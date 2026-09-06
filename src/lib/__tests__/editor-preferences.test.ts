// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyAppEditorTheme,
  getEditorTheme,
  loadEditorPreferences,
  setEditorTheme,
} from '../editor-preferences';

describe('editor preferences', () => {
  beforeEach(() => {
    localStorage.clear();
    document.head.innerHTML = '';
    delete document.documentElement.dataset.theme;
    delete document.documentElement.dataset.editorTheme;
  });

  it('opens in the palette matching the app theme when nothing is stored', () => {
    document.documentElement.dataset.theme = 'light';

    loadEditorPreferences();

    expect(document.documentElement.dataset.editorTheme).toBe('oddenova-light');
  });

  it('treats an unchosen default as a default, not a choice', () => {
    document.documentElement.dataset.theme = 'light';

    loadEditorPreferences();

    // Writing the fallback back would make it indistinguishable from a real
    // choice on the next load, and pin the editor against the app theme.
    expect(getEditorTheme()).toBeNull();
  });

  it('does not let a stored oddeNova palette outrank the app theme', () => {
    // Builds before the light palette wrote this key back on every boot, so a
    // long-lived browser is carrying one through no choice of its own. Honoured
    // as a choice it pins the code panel dark on paper, and since the palette
    // is otherwise only re-derived on a dark/light flip, no reload repairs it.
    localStorage.setItem('vibe-editor-theme', 'oddenova-dark');
    document.documentElement.dataset.theme = 'light';

    loadEditorPreferences();

    expect(document.documentElement.dataset.editorTheme).toBe('oddenova-light');
    // Cleared rather than merely ignored, so the store stops carrying it.
    expect(localStorage.getItem('vibe-editor-theme')).toBeNull();
  });

  it('restores a stored choice over the app default', () => {
    setEditorTheme('dracula');
    document.documentElement.dataset.theme = 'light';

    loadEditorPreferences();

    expect(document.documentElement.dataset.editorTheme).toBe('dracula');
  });

  it('re-establishes the app default without persisting it', () => {
    setEditorTheme('dracula');

    applyAppEditorTheme('light');

    expect(document.documentElement.dataset.editorTheme).toBe('oddenova-light');
    expect(getEditorTheme()).toBe('dracula');
  });

  it('pins the panel surface on .cm-editor so a piece cannot repaint it', () => {
    applyAppEditorTheme('light');

    const css = document.getElementById('vibe-editor-theme')?.innerHTML ?? '';
    expect(css).toContain('#F7F7FA');
    expect(css).toContain('!important');
  });
});
