// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const { installHighlight, replInstance } = vi.hoisted(() => ({
  installHighlight: vi.fn(),
  replInstance: {
    dispatch: vi.fn(),
    evaluate: vi.fn(),
    setCode: vi.fn(),
    stop: vi.fn(),
    toggle: vi.fn(),
    dispose: vi.fn(),
  },
}));

vi.mock('../mini-repl-engine', () => ({
  getMiniReplPrebake: vi.fn(),
}));

vi.mock('@strudel/codemirror', () => ({
  StrudelMirror: class {
    // The docs example editor's surface lives in CSS, not in the instance —
    // the fake only carries the API the docs' own wiring touches.
    constructor() {
      return {
        evaluate: replInstance.evaluate,
        setCode: replInstance.setCode,
        stop: replInstance.stop,
        toggle: replInstance.toggle,
        dispose: replInstance.dispose,
        editor: { dispatch: replInstance.dispatch },
      };
    }
  },
  compartments: {
    theme: { reconfigure: (extension: unknown) => ({ extension }) },
  },
}));

vi.mock('@strudel/transpiler', () => ({ transpiler: {} }));
vi.mock('@strudel/webaudio', () => ({ webaudioOutput: {} }));
vi.mock('superdough', () => ({ getAudioContext: () => ({}) }));
vi.mock('@strudel/core', () => ({ noteToMidi: () => 0 }));
vi.mock('@strudel/draw', () => ({ getDrawContext: () => undefined }));

vi.mock('../../lib/oddenova-syntax-highlight', () => ({
  installOddenovaSyntaxHighlight: installHighlight,
}));

import { setThemePreference } from '../../lib/appearance-preferences';
import { CodeBlock as CodeBlockHost } from '../components';

// The docs' own syntax palette comes from learn.css, not from anything the
// editor stores — assert the file re-declares the syntax set per app theme,
// which is what severs the root's `data-editor-theme` inheritance.
const learnCss = readFileSync(resolve(__dirname, '../learn.css'), 'utf8');

describe('learn.css theme scoping', () => {
  it('declares the oddeNova dark syntax set under .learn-page', () => {
    expect(learnCss).toMatch(/--syntax-atom:\s*#4BA3B9/);
    expect(learnCss).toMatch(/--syntax-keyword:\s*#ECB43C/);
    expect(learnCss).toMatch(/--hap-highlight:\s*#D9D9D9/);
  });

  it('re-declares the light syntax set under the light theme only', () => {
    const lightBlock = learnCss.match(/html\[data-theme='light'\] \.learn-page \{[\s\S]*?\n\}/);
    expect(lightBlock).not.toBeNull();
    expect(lightBlock?.[0]).toMatch(/--syntax-atom:\s*#0B6D85/);
    expect(lightBlock?.[0]).toMatch(/--syntax-keyword:\s*#7434CF/);
    expect(lightBlock?.[0]).toMatch(/--hap-highlight:\s*#292D33/);
  });

  it('declares the editor surface and pitch palettes per theme', () => {
    expect(learnCss).toMatch(/--learn-editor-bg:\s*#0D0D0D/);
    expect(learnCss).toMatch(/--learn-frequency:\s*#3b82f6/);
    expect(learnCss).toMatch(/--learn-pitch:\s*#eab308/);
    const lightBlock = learnCss.match(/html\[data-theme='light'\] \.learn-page \{[\s\S]*?\n\}/);
    expect(lightBlock?.[0]).toMatch(/--learn-editor-bg:\s*#F7F7FA/);
    expect(lightBlock?.[0]).toMatch(/--learn-frequency:\s*#1d4ed8/);
    expect(lightBlock?.[0]).toMatch(/--learn-pitch:\s*#854d0e/);
  });
});

describe('learn example editor across theme flips', () => {
  let root: Root | null = null;
  let container: HTMLElement | null = null;

  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
    installHighlight.mockClear();
    (Object.keys(replInstance) as Array<keyof typeof replInstance>).forEach((key) => {
      replInstance[key].mockClear();
    });
  });

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
    }
    container?.remove();
    root = null;
    container = null;
  });

  it('installs the variable-driven highlighter once, after the editor is created', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<CodeBlockHost code={'note("c3")'} />);
      await Promise.resolve();
    });

    expect(installHighlight).toHaveBeenCalledTimes(1);
    // The docs never touch the editor's theme compartment again — a later
    // dark/light flip repaints through the CSS variables, not through a
    // re-dispatch.
    expect(replInstance.dispatch).not.toHaveBeenCalled();
    expect(replInstance.evaluate).not.toHaveBeenCalled();
  });

  it('keeps the same editor instance, unevaluated, through a dark/light flip', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<CodeBlockHost code={'note("c3")'} />);
      await Promise.resolve();
    });
    expect(installHighlight).toHaveBeenCalledTimes(1);

    act(() => setThemePreference('dark'));
    act(() => setThemePreference('light'));

    // No re-install, no re-evaluation, no playback toggles: the flip is a
    // pure repaint.
    expect(installHighlight).toHaveBeenCalledTimes(1);
    expect(replInstance.evaluate).not.toHaveBeenCalled();
    expect(replInstance.setCode).not.toHaveBeenCalled();
    expect(replInstance.stop).not.toHaveBeenCalled();
    expect(replInstance.toggle).not.toHaveBeenCalled();
  });
});
