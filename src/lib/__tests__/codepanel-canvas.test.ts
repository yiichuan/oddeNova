// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { CODE_PANEL_CANVAS_ID, createCodePanelDrawContext } from '../codepanel-canvas';

describe('createCodePanelDrawContext', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('appends the canvas as a child of the panel, not the document body', () => {
    const panel = document.createElement('div');
    document.body.appendChild(panel);
    const getDrawContext = vi.fn(() => ({}));

    createCodePanelDrawContext({ panel, getDrawContext });

    const canvas = panel.querySelector(`#${CODE_PANEL_CANVAS_ID}`);
    expect(canvas).not.toBeNull();
    // Strudel's own creation path prepends to <body>; this must not.
    expect(canvas?.parentElement).toBe(panel);
    expect(document.body.firstElementChild).toBe(panel);
  });

  it('positions the canvas to fill the panel, not the viewport', () => {
    const panel = document.createElement('div');
    document.body.appendChild(panel);

    createCodePanelDrawContext({ panel, getDrawContext: () => ({}) });

    const canvas = panel.querySelector<HTMLCanvasElement>(`#${CODE_PANEL_CANVAS_ID}`)!;
    expect(canvas.style.position).toBe('absolute');
    expect(canvas.style.cssText).toContain('inset: 0');
    // `position: fixed` — what @strudel/draw's own creation path sets — is
    // exactly what would break out of the panel and cover the viewport.
    expect(canvas.style.position).not.toBe('fixed');
  });

  it("gives the panel a positioned ancestor so the canvas's absolute box resolves against it", () => {
    const panel = document.createElement('div');
    document.body.appendChild(panel);

    createCodePanelDrawContext({ panel, getDrawContext: () => ({}) });

    expect(getComputedStyle(panel).position).toBe('relative');
  });

  it("does not override a panel that is already positioned", () => {
    const panel = document.createElement('div');
    panel.style.position = 'sticky';
    document.body.appendChild(panel);

    createCodePanelDrawContext({ panel, getDrawContext: () => ({}) });

    expect(getComputedStyle(panel).position).toBe('sticky');
  });

  it("does not intercept clicks or keystrokes meant for the editor", () => {
    const panel = document.createElement('div');
    document.body.appendChild(panel);

    createCodePanelDrawContext({ panel, getDrawContext: () => ({}) });

    const canvas = panel.querySelector<HTMLCanvasElement>(`#${CODE_PANEL_CANVAS_ID}`)!;
    expect(canvas.style.pointerEvents).toBe('none');
  });

  it('looks the canvas up by id, so @strudel/draw finds it instead of building one', () => {
    const panel = document.createElement('div');
    document.body.appendChild(panel);
    const getDrawContext = vi.fn(() => ({ tag: 'context' }));

    const { context } = createCodePanelDrawContext({ panel, getDrawContext });

    expect(getDrawContext).toHaveBeenCalledWith(CODE_PANEL_CANVAS_ID);
    expect(context).toEqual({ tag: 'context' });
  });

  it('sizes the canvas to the panel, scaled by the device pixel ratio', () => {
    const panel = document.createElement('div');
    Object.defineProperty(panel, 'clientWidth', { value: 400, configurable: true });
    Object.defineProperty(panel, 'clientHeight', { value: 200, configurable: true });
    document.body.appendChild(panel);
    const originalRatio = window.devicePixelRatio;
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });

    createCodePanelDrawContext({ panel, getDrawContext: () => ({}) });

    const canvas = panel.querySelector<HTMLCanvasElement>(`#${CODE_PANEL_CANVAS_ID}`)!;
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(400);

    Object.defineProperty(window, 'devicePixelRatio', { value: originalRatio, configurable: true });
  });

  it('erases the panel-sized rect, not the last-created size', () => {
    const panel = document.createElement('div');
    Object.defineProperty(panel, 'clientWidth', { value: 400, configurable: true });
    Object.defineProperty(panel, 'clientHeight', { value: 200, configurable: true });
    document.body.appendChild(panel);
    const clearRect = vi.fn();

    const { clear } = createCodePanelDrawContext({ panel, getDrawContext: () => ({ clearRect }) });
    clear();

    expect(clearRect).toHaveBeenCalledWith(0, 0, 400, 200);
  });

  it('stops tracking the panel once disposed', () => {
    const panel = document.createElement('div');
    document.body.appendChild(panel);
    const disconnect = vi.fn();
    const observe = vi.fn();
    const OriginalResizeObserver = globalThis.ResizeObserver;
    // @ts-expect-error -- stubbing the global for one assertion
    globalThis.ResizeObserver = vi.fn(() => ({ observe, disconnect }));

    const { dispose } = createCodePanelDrawContext({ panel, getDrawContext: () => ({}) });
    dispose();

    expect(disconnect).toHaveBeenCalledTimes(1);
    globalThis.ResizeObserver = OriginalResizeObserver;
  });
});
