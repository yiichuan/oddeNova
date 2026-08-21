// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ThinkingLevelControl from '../ThinkingLevelControl';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

// Provide localStorage mock for happy-dom
if (!globalThis.localStorage) {
  const store: Record<string, string> = {};
  Object.assign(globalThis, {
    localStorage: {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => { store[key] = value; },
      removeItem: (key: string) => { delete store[key]; },
      clear: () => { Object.keys(store).forEach(k => delete store[k]); },
      key: (index: number) => Object.keys(store)[index] ?? null,
      length: () => Object.keys(store).length,
    },
  });
}

function renderControl(props: Partial<Parameters<typeof ThinkingLevelControl>[0]> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<ThinkingLevelControl {...props} />);
  });
  return { container, root };
}

function getTrigger(container: HTMLElement): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>('button');
  if (!button) throw new Error('trigger button not found');
  return button;
}

function getPopover(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>('[data-testid="thinking-level-popover"]');
}

function getSlider(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>('[data-testid="thinking-level-slider"]');
  if (!input) throw new Error('slider not found');
  return input;
}

/** Drives the range input the way a drag does: set the value, fire `input`. */
function drag(input: HTMLInputElement, value: number) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, String(value));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('ThinkingLevelControl', () => {
  const roots: Root[] = [];

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => root.unmount());
    }
    document.body.innerHTML = '';
  });

  it('renders a trigger button next to the send button, closed by default', () => {
    const { container, root } = renderControl();
    roots.push(root);

    expect(getTrigger(container)).not.toBeNull();
    expect(getPopover(container)).toBeNull();
  });

  it('opens a slider on click, one dot per supported level (deepseek-v4-flash: low/medium/high)', () => {
    const { container, root } = renderControl();
    roots.push(root);

    act(() => getTrigger(container).click());

    expect(getPopover(container)).not.toBeNull();
    expect(container.querySelectorAll('[data-testid="thinking-level-dot"]')).toHaveLength(3);
    const slider = getSlider(container);
    expect(slider.min).toBe('0');
    expect(slider.max).toBe('2');
    expect(slider.step).toBe('1');
    // default medium — the middle stop
    expect(slider.value).toBe('1');
  });

  it('bookends the dot row with a capsule, one more capsule than there are stops', () => {
    const { container, root } = renderControl();
    roots.push(root);

    act(() => getTrigger(container).click());

    const segments = container.querySelectorAll<HTMLElement>('[data-testid="thinking-level-segment"]');
    expect(segments).toHaveLength(4); // 3 stops
    expect(Array.from(segments).map((seg) => seg.style.left)).toEqual([
      'calc(0% + 0px)',
      'calc(25% + 4px)',
      'calc(50% + 8px)',
      'calc(75% + 12px)',
    ]);
    // Every capsule is the same length; the 16px gaps come out of the total.
    expect(new Set(Array.from(segments).map((seg) => seg.style.width))).toEqual(
      new Set(['calc(25% - 12px)']),
    );
    expect(segments[0].classList).toContain('rounded-full');
  });

  it('centres each dot in the gap between two capsules', () => {
    const { container, root } = renderControl();
    roots.push(root);

    act(() => getTrigger(container).click());

    const dots = container.querySelectorAll<HTMLElement>('[data-testid="thinking-level-dot"]');
    // Capsule 0 ends at 25% - 12px and capsule 1 starts at 25% + 4px, so the
    // midpoint of that 16px gap is 25% - 4px.
    expect(Array.from(dots).map((dot) => dot.style.left)).toEqual([
      'calc(25% - 4px)',
      'calc(50% + 0px)',
      'calc(75% + 4px)',
    ]);
  });

  it('draws the dots at the capsule height, in the capsule colour, with a larger thumb', () => {
    const { container, root } = renderControl();
    roots.push(root);

    act(() => getTrigger(container).click());

    const segment = container.querySelector<HTMLElement>('[data-testid="thinking-level-segment"]');
    const dot = container.querySelector<HTMLElement>('[data-testid="thinking-level-dot"]');
    const thumb = container.querySelector<HTMLElement>('[data-testid="thinking-level-thumb"]');

    expect(dot?.style.width).toBe(segment?.style.height);
    expect(dot?.style.width).toBe(dot?.style.height);
    expect(dot?.classList).toContain('bg-[#6A6A6A]');
    expect(segment?.classList).toContain('bg-[#6A6A6A]');

    const dotSize = parseInt(dot?.style.width ?? '0', 10);
    const thumbSize = parseInt(thumb?.style.width ?? '0', 10);
    expect(thumbSize).toBeGreaterThan(dotSize);
    // The gap the thumb lands in has to clear it, or the knob would overlap
    // the capsule ends it sits between.
    expect(16).toBeGreaterThan(thumbSize);
  });

  it('parks the thumb on the dot for the current level', () => {
    const { container, root } = renderControl();
    roots.push(root);

    act(() => getTrigger(container).click());

    const thumb = container.querySelector<HTMLElement>('[data-testid="thinking-level-thumb"]');
    // Medium, the middle of three stops
    expect(thumb?.style.left).toBe('calc(50% + 0px)');

    drag(getSlider(container), 2);
    expect(container.querySelector<HTMLElement>('[data-testid="thinking-level-thumb"]')?.style.left)
      .toBe('calc(75% + 4px)');
  });

  it('names the current level in the heading, in parentheses', () => {
    const { container, root } = renderControl();
    roots.push(root);

    act(() => getTrigger(container).click());

    const heading = container.querySelector('[data-testid="thinking-level-heading"]');
    expect(heading?.textContent).toBe('Thinking level (Medium)');
    // Same size and colour as a user message bubble's text.
    expect(heading?.classList).toContain('text-sm');
    expect(heading?.classList).toContain('text-text-primary');

    drag(getSlider(container), 0);
    expect(container.querySelector('[data-testid="thinking-level-heading"]')?.textContent)
      .toBe('Thinking level (Low)');
  });

  it('dragging the thumb persists the level and leaves the popover open', () => {
    const { container, root } = renderControl();
    roots.push(root);

    act(() => getTrigger(container).click());
    drag(getSlider(container), 2); // High

    expect(localStorage.getItem('vibe_thinking_level')).toBe('high');
    expect(getPopover(container)).not.toBeNull();
    expect(getSlider(container).value).toBe('2');
  });

  it('reads a previously stored level on mount', () => {
    localStorage.setItem('vibe_thinking_level', 'high');
    const { container, root } = renderControl();
    roots.push(root);

    act(() => getTrigger(container).click());
    expect(getSlider(container).value).toBe('2');
  });

  it('closes the popover on an outside click without changing the stored level', () => {
    const { container, root } = renderControl();
    roots.push(root);

    act(() => getTrigger(container).click());
    expect(getPopover(container)).not.toBeNull();

    act(() => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });

    expect(getPopover(container)).toBeNull();
    expect(localStorage.getItem('vibe_thinking_level')).toBeNull();
  });

  it('shows the current level as text on the trigger, updating after a drag changes it', () => {
    const { container, root } = renderControl();
    roots.push(root);

    expect(getTrigger(container).textContent).toContain('Medium');

    act(() => getTrigger(container).click());
    drag(getSlider(container), 2); // High

    expect(getTrigger(container).textContent).toContain('High');
  });

  it('disables the trigger button when disabled=true', () => {
    const { container, root } = renderControl({ disabled: true });
    roots.push(root);

    expect(getTrigger(container).disabled).toBe(true);
  });

  it('offers all 3 levels for every selectable openai model (gpt-5.4-mini)', () => {
    localStorage.setItem('vibe_provider', 'openai');
    localStorage.setItem('vibe_model_openai', 'gpt-5.4-mini');
    const { container, root } = renderControl();
    roots.push(root);

    act(() => getTrigger(container).click());
    expect(container.querySelectorAll('[data-testid="thinking-level-dot"]')).toHaveLength(3);
    expect(container.querySelectorAll('[data-testid="thinking-level-segment"]')).toHaveLength(4);
    expect(getSlider(container).max).toBe('2');
  });

  it('glm-5.2 only offers Medium and High, laid out as a two-stop rail', () => {
    localStorage.setItem('vibe_provider', 'glm');
    localStorage.setItem('vibe_model_glm', 'glm-5.2');
    const { container, root } = renderControl();
    roots.push(root);

    act(() => getTrigger(container).click());
    const dots = container.querySelectorAll<HTMLElement>('[data-testid="thinking-level-dot"]');
    expect(dots).toHaveLength(2);
    expect(container.querySelectorAll('[data-testid="thinking-level-segment"]')).toHaveLength(3);
    expect(Array.from(dots).map((dot) => dot.style.left)).toEqual([
      'calc(33.33% - 2.67px)',
      'calc(66.67% + 2.67px)',
    ]);
    expect(container.querySelector('[data-testid="thinking-level-heading"]')?.textContent)
      .toBe('Thinking level (Medium)');

    drag(getSlider(container), 1);
    expect(localStorage.getItem('vibe_thinking_level')).toBe('high');
  });

  it('clamps a stored level unsupported by the current model up to the nearest one, without overwriting storage', () => {
    localStorage.setItem('vibe_thinking_level', 'low');
    localStorage.setItem('vibe_provider', 'glm');
    localStorage.setItem('vibe_model_glm', 'glm-5.2');
    const { container, root } = renderControl();
    roots.push(root);

    expect(getTrigger(container).textContent).toContain('Medium');
    expect(localStorage.getItem('vibe_thinking_level')).toBe('low');
  });

  it('does not render anything for models with no effort dial (kimi)', () => {
    localStorage.setItem('vibe_provider', 'kimi');
    const { container, root } = renderControl();
    roots.push(root);

    expect(container.querySelector('button')).toBeNull();
    expect(getPopover(container)).toBeNull();
  });

  it('does not render anything for glm models without an effort dial (glm-5.1)', () => {
    localStorage.setItem('vibe_provider', 'glm');
    localStorage.setItem('vibe_model_glm', 'glm-5.1');
    const { container, root } = renderControl();
    roots.push(root);

    expect(container.querySelector('button')).toBeNull();
    expect(getPopover(container)).toBeNull();
  });

  it('does not render anything for anthropic haiku-4-5 (no effort dial)', () => {
    localStorage.setItem('vibe_provider', 'anthropic');
    localStorage.setItem('vibe_model_anthropic', 'claude-haiku-4-5');
    const { container, root } = renderControl();
    roots.push(root);

    expect(container.querySelector('button')).toBeNull();
  });
});
