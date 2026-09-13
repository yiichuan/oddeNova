// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

function firePointer(el: EventTarget, type: string, init: PointerEventInit = {}): PointerEvent {
  const event = new PointerEvent(type, { bubbles: true, cancelable: true, ...init });
  act(() => el.dispatchEvent(event));
  return event;
}

const RECT = { left: 100, top: 0, width: 208, height: 44, right: 308, bottom: 44, x: 100, y: 0 };

function mockGeometry(slider: HTMLInputElement, rect: typeof RECT = RECT) {
  const row = slider.parentElement as HTMLElement;
  row.getBoundingClientRect = () => ({ ...rect, toJSON: () => ({}) }) as DOMRect;
}

function mockCapture(slider: HTMLInputElement) {
  slider.setPointerCapture = vi.fn();
  slider.hasPointerCapture = vi.fn(() => true);
  slider.releasePointerCapture = vi.fn();
}

/** Dot-centre X for stop `index` with the default 208px row at left 100. */
function dotX(index: number, stops: number): number {
  const segmentCount = stops + 1;
  const percent = ((index + 1) * 100) / segmentCount;
  const offset = ((index + 0.5 - stops / 2) * 16) / segmentCount;
  return RECT.left + (RECT.width * percent) / 100 + offset;
}

function levelWrites(spy: ReturnType<typeof vi.spyOn>): number {
  return spy.mock.calls.filter(([key]) => key === 'vibe_thinking_level').length;
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
    expect(dot?.classList).toContain('bg-track-idle');
    expect(segment?.classList).toContain('bg-track-idle');

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

  it('closes the popover on an outside pointerdown without changing the stored level', () => {
    const { container, root } = renderControl();
    roots.push(root);

    act(() => getTrigger(container).click());
    expect(getPopover(container)).not.toBeNull();

    const outside = new PointerEvent('pointerdown', { bubbles: true });
    act(() => document.body.dispatchEvent(outside));

    expect(getPopover(container)).toBeNull();
    expect(outside.defaultPrevented).toBe(false);
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

describe('ThinkingLevelControl accessibility', () => {
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

  it('exposes aria-expanded and a stable aria-controls pointing at the popover id', () => {
    const { container, root } = renderControl();
    roots.push(root);

    const trigger = getTrigger(container);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.getAttribute('aria-controls')).toBe('thinking-level-popover');

    act(() => trigger.click());

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(getPopover(container)?.id).toBe('thinking-level-popover');
  });

  it('closes on Escape and returns focus to the trigger when focus is inside the popover', () => {
    const { container, root } = renderControl();
    roots.push(root);

    act(() => getTrigger(container).click());
    const slider = getSlider(container);
    act(() => slider.focus());
    expect(document.activeElement).toBe(slider);

    act(() => {
      slider.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(getPopover(container)).toBeNull();
    expect(document.activeElement).toBe(getTrigger(container));
  });

  it('closes on Escape without moving focus when focus is outside the popover', () => {
    const { container, root } = renderControl();
    roots.push(root);

    act(() => getTrigger(container).click());

    act(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(getPopover(container)).toBeNull();
    expect(document.activeElement).not.toBe(getTrigger(container));
  });

  it('closes and stops selecting as soon as it is disabled', () => {
    const { container, root } = renderControl();
    roots.push(root);

    act(() => getTrigger(container).click());
    expect(getPopover(container)).not.toBeNull();

    act(() => root.render(<ThinkingLevelControl disabled />));

    expect(getPopover(container)).toBeNull();
  });
});

describe('ThinkingLevelControl input focus protection', () => {
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

  function pressTrigger(container: HTMLElement, init: PointerEventInit = {}): PointerEvent {
    return firePointer(getTrigger(container), 'pointerdown', init);
  }

  it('cancels pointerdown and mousedown on the control while input focus should be preserved', () => {
    const { container, root } = renderControl({ shouldPreserveInputFocus: () => true });
    roots.push(root);

    act(() => getTrigger(container).click());

    const triggerPointerDown = pressTrigger(container, {
      pointerId: 1,
      isPrimary: true,
      pointerType: 'touch',
      button: 0,
    });
    expect(triggerPointerDown.defaultPrevented).toBe(true);

    const popover = getPopover(container);
    if (!popover) throw new Error('popover not found');
    const popoverMouseDown = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 });
    act(() => popover.dispatchEvent(popoverMouseDown));
    expect(popoverMouseDown.defaultPrevented).toBe(true);

    const mouseDown = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 });
    act(() => getTrigger(container).dispatchEvent(mouseDown));
    expect(mouseDown.defaultPrevented).toBe(true);
  });

  it('keeps native press defaults when input focus should not be preserved', () => {
    const { container, root } = renderControl({ shouldPreserveInputFocus: () => false });
    roots.push(root);

    act(() => getTrigger(container).click());

    const pointerDown = pressTrigger(container, {
      pointerId: 1,
      isPrimary: true,
      pointerType: 'touch',
      button: 0,
    });
    const mouseDown = new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 });
    act(() => getTrigger(container).dispatchEvent(mouseDown));

    expect(pointerDown.defaultPrevented).toBe(false);
    expect(mouseDown.defaultPrevented).toBe(false);
  });

  it('ignores secondary pointers and non-left buttons when protecting focus', () => {
    const { container, root } = renderControl({ shouldPreserveInputFocus: () => true });
    roots.push(root);

    act(() => getTrigger(container).click());

    const secondary = pressTrigger(container, {
      pointerId: 2,
      isPrimary: false,
      pointerType: 'touch',
      button: 0,
    });
    expect(secondary.defaultPrevented).toBe(false);

    const rightButton = pressTrigger(container, {
      pointerId: 3,
      isPrimary: true,
      pointerType: 'mouse',
      button: 2,
    });
    expect(rightButton.defaultPrevented).toBe(false);
  });
});

describe('ThinkingLevelControl protected slider gesture', () => {
  const roots: Root[] = [];

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => root.unmount());
    }
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  function renderProtected() {
    return renderControl({ shouldPreserveInputFocus: () => true });
  }

  function openAndPrepare(container: HTMLElement) {
    act(() => getTrigger(container).click());
    const slider = getSlider(container);
    mockGeometry(slider);
    mockCapture(slider);
    return slider;
  }

  it('selects the nearest stop on pointerdown, tracks moves, and clamps past the ends', () => {
    const { container, root } = renderProtected();
    roots.push(root);
    const slider = openAndPrepare(container);
    const setItemSpy = vi.spyOn(localStorage, 'setItem');

    // 3 stops: dot centres at x = 148 / 204 / 260.
    firePointer(slider, 'pointerdown', { pointerId: 1, isPrimary: true, pointerType: 'touch', clientX: 148 });
    expect(slider.setPointerCapture).toHaveBeenCalledWith(1);
    expect(localStorage.getItem('vibe_thinking_level')).toBe('low');

    firePointer(document, 'pointermove', { pointerId: 1, clientX: 204 });
    expect(localStorage.getItem('vibe_thinking_level')).toBe('medium');

    firePointer(document, 'pointermove', { pointerId: 1, clientX: 400 });
    expect(localStorage.getItem('vibe_thinking_level')).toBe('high');

    firePointer(document, 'pointermove', { pointerId: 1, clientX: 20 });
    expect(localStorage.getItem('vibe_thinking_level')).toBe('low');

    expect(getPopover(container)).not.toBeNull();
    expect(levelWrites(setItemSpy)).toBe(4);
  });

  it('ends the gesture on pointerup; later moves with the same id are ignored', () => {
    const { container, root } = renderProtected();
    roots.push(root);
    const slider = openAndPrepare(container);
    const setItemSpy = vi.spyOn(localStorage, 'setItem');

    firePointer(slider, 'pointerdown', { pointerId: 1, isPrimary: true, pointerType: 'touch', clientX: dotX(0, 3) });
    firePointer(document, 'pointermove', { pointerId: 1, clientX: dotX(2, 3) });
    expect(localStorage.getItem('vibe_thinking_level')).toBe('high');

    firePointer(document, 'pointerup', { pointerId: 1, clientX: dotX(2, 3) });
    expect(slider.releasePointerCapture).toHaveBeenCalledWith(1);

    firePointer(document, 'pointermove', { pointerId: 1, clientX: dotX(0, 3) });
    expect(localStorage.getItem('vibe_thinking_level')).toBe('high');
    expect(levelWrites(setItemSpy)).toBe(2);
  });

  it('keeps the last selection on pointercancel', () => {
    const { container, root } = renderProtected();
    roots.push(root);
    const slider = openAndPrepare(container);

    firePointer(slider, 'pointerdown', { pointerId: 1, isPrimary: true, pointerType: 'touch', clientX: dotX(1, 3) });
    firePointer(document, 'pointermove', { pointerId: 1, clientX: dotX(2, 3) });
    expect(localStorage.getItem('vibe_thinking_level')).toBe('high');

    firePointer(document, 'pointercancel', { pointerId: 1 });

    expect(localStorage.getItem('vibe_thinking_level')).toBe('high');
    firePointer(document, 'pointermove', { pointerId: 1, clientX: dotX(0, 3) });
    expect(localStorage.getItem('vibe_thinking_level')).toBe('high');
  });

  it('ends the gesture on lostpointercapture, keeping the last selection', () => {
    const { container, root } = renderProtected();
    roots.push(root);
    const slider = openAndPrepare(container);

    firePointer(slider, 'pointerdown', { pointerId: 1, isPrimary: true, pointerType: 'touch', clientX: dotX(2, 3) });
    expect(localStorage.getItem('vibe_thinking_level')).toBe('high');

    act(() => {
      slider.dispatchEvent(new PointerEvent('lostpointercapture', { pointerId: 1 }));
    });
    firePointer(document, 'pointermove', { pointerId: 1, clientX: dotX(0, 3) });

    expect(localStorage.getItem('vibe_thinking_level')).toBe('high');
  });

  it('a second pointer does not take over an active gesture', () => {
    const { container, root } = renderProtected();
    roots.push(root);
    const slider = openAndPrepare(container);

    firePointer(slider, 'pointerdown', { pointerId: 1, isPrimary: true, pointerType: 'touch', clientX: dotX(0, 3) });
    expect(localStorage.getItem('vibe_thinking_level')).toBe('low');

    firePointer(slider, 'pointerdown', { pointerId: 2, isPrimary: false, pointerType: 'touch', clientX: dotX(2, 3) });
    firePointer(document, 'pointermove', { pointerId: 2, clientX: dotX(2, 3) });
    expect(localStorage.getItem('vibe_thinking_level')).toBe('low');

    firePointer(document, 'pointermove', { pointerId: 1, clientX: dotX(2, 3) });
    expect(localStorage.getItem('vibe_thinking_level')).toBe('high');
  });

  it('ignores the gesture when the row has zero width', () => {
    const { container, root } = renderProtected();
    roots.push(root);
    act(() => getTrigger(container).click());
    const slider = getSlider(container);
    mockGeometry(slider, { ...RECT, width: 0, right: RECT.left });
    mockCapture(slider);

    firePointer(slider, 'pointerdown', { pointerId: 1, isPrimary: true, pointerType: 'touch', clientX: 204 });

    expect(slider.setPointerCapture).not.toHaveBeenCalled();
    expect(localStorage.getItem('vibe_thinking_level')).toBeNull();
  });

  it('maps a two-stop rail onto its own dot span (glm-5.2)', () => {
    localStorage.setItem('vibe_provider', 'glm');
    localStorage.setItem('vibe_model_glm', 'glm-5.2');
    localStorage.setItem('vibe_thinking_level', 'high');
    const { container, root } = renderProtected();
    roots.push(root);
    const slider = openAndPrepare(container);

    // 2 stops: dot centres at x ≈ 166.67 / 241.33.
    firePointer(slider, 'pointerdown', { pointerId: 1, isPrimary: true, pointerType: 'touch', clientX: 166 });
    expect(localStorage.getItem('vibe_thinking_level')).toBe('medium');

    firePointer(document, 'pointermove', { pointerId: 1, clientX: 242 });
    expect(localStorage.getItem('vibe_thinking_level')).toBe('high');
  });

  it('does not double-write when the selected stop is unchanged, and ignores native input during the gesture', () => {
    localStorage.setItem('vibe_thinking_level', 'medium');
    const { container, root } = renderProtected();
    roots.push(root);
    const slider = openAndPrepare(container);
    const setItemSpy = vi.spyOn(localStorage, 'setItem');

    firePointer(slider, 'pointerdown', { pointerId: 1, isPrimary: true, pointerType: 'touch', clientX: dotX(1, 3) });
    expect(localStorage.getItem('vibe_thinking_level')).toBe('medium');
    expect(levelWrites(setItemSpy)).toBe(0);

    drag(slider, 2);
    expect(localStorage.getItem('vibe_thinking_level')).toBe('medium');
    expect(levelWrites(setItemSpy)).toBe(0);
    expect(container.querySelector<HTMLElement>('[data-testid="thinking-level-thumb"]')?.style.left)
      .toBe('calc(50% + 0px)');

    firePointer(document, 'pointerup', { pointerId: 1, clientX: dotX(1, 3) });
    expect(levelWrites(setItemSpy)).toBe(0);
  });

  it('stops honouring old gesture moves once the supported levels change', () => {
    localStorage.setItem('vibe_thinking_level', 'low');
    const { container, root } = renderProtected();
    roots.push(root);
    const slider = openAndPrepare(container);

    firePointer(slider, 'pointerdown', { pointerId: 1, isPrimary: true, pointerType: 'touch', clientX: dotX(1, 3) });
    expect(localStorage.getItem('vibe_thinking_level')).toBe('medium');

    localStorage.setItem('vibe_provider', 'glm');
    localStorage.setItem('vibe_model_glm', 'glm-5.2');
    act(() => root.render(<ThinkingLevelControl shouldPreserveInputFocus={() => true} />));

    firePointer(document, 'pointermove', { pointerId: 1, clientX: dotX(2, 3) });
    expect(localStorage.getItem('vibe_thinking_level')).toBe('medium');
  });

  it('stops honouring old gesture moves once it is disabled', () => {
    localStorage.setItem('vibe_thinking_level', 'low');
    const { container, root } = renderProtected();
    roots.push(root);
    const slider = openAndPrepare(container);

    firePointer(slider, 'pointerdown', { pointerId: 1, isPrimary: true, pointerType: 'touch', clientX: dotX(1, 3) });
    expect(localStorage.getItem('vibe_thinking_level')).toBe('medium');

    act(() => root.render(<ThinkingLevelControl disabled shouldPreserveInputFocus={() => true} />));

    firePointer(document, 'pointermove', { pointerId: 1, clientX: dotX(2, 3) });
    expect(localStorage.getItem('vibe_thinking_level')).toBe('medium');
  });

  it('stops honouring old gesture moves after unmount', () => {
    localStorage.setItem('vibe_thinking_level', 'low');
    const { container, root } = renderProtected();
    const slider = openAndPrepare(container);

    firePointer(slider, 'pointerdown', { pointerId: 1, isPrimary: true, pointerType: 'touch', clientX: dotX(1, 3) });
    expect(localStorage.getItem('vibe_thinking_level')).toBe('medium');

    act(() => root.unmount());
    roots.push(root);

    firePointer(document, 'pointermove', { pointerId: 1, clientX: dotX(2, 3) });
    expect(localStorage.getItem('vibe_thinking_level')).toBe('medium');
  });
});
