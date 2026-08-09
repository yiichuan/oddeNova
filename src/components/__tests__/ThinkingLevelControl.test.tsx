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
    expect(container.querySelector('[role="menu"]')).toBeNull();
  });

  it('opens a menu on click, with the default "Medium" level clamped onto the official ladder (deepseek-v4-flash: low/high/extreme)', () => {
    const { container, root } = renderControl();
    roots.push(root);

    act(() => getTrigger(container).click());

    const menu = container.querySelector('[role="menu"]');
    expect(menu).not.toBeNull();
    const items = container.querySelectorAll('[role="menuitemradio"]');
    expect(items).toHaveLength(3);
    expect(Array.from(items).map((el) => el.textContent)).toEqual(['Low', 'High', 'Extreme']);
    expect(items[1].textContent).toContain('High');
    expect(items[1].getAttribute('aria-checked')).toBe('true');
  });

  it('shows a Thinking level heading above the menu options at the option text size', () => {
    const { container, root } = renderControl();
    roots.push(root);

    act(() => getTrigger(container).click());

    const menu = container.querySelector('[role="menu"]');
    expect(menu?.firstElementChild?.textContent).toBe('Thinking level');
    expect(menu?.firstElementChild?.classList).toContain('text-[13px]');
  });

  it('selecting a level persists it, updates the check mark, and closes the menu', () => {
    const { container, root } = renderControl();
    roots.push(root);

    act(() => getTrigger(container).click());
    const items = container.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]');
    act(() => items[2].click()); // Extreme

    expect(localStorage.getItem('vibe_thinking_level')).toBe('extreme');
    expect(container.querySelector('[role="menu"]')).toBeNull();

    act(() => getTrigger(container).click());
    const reopened = container.querySelectorAll('[role="menuitemradio"]');
    expect(reopened[2].getAttribute('aria-checked')).toBe('true');
  });

  it('reads a previously stored level on mount', () => {
    localStorage.setItem('vibe_thinking_level', 'high');
    const { container, root } = renderControl();
    roots.push(root);

    act(() => getTrigger(container).click());
    const items = container.querySelectorAll('[role="menuitemradio"]');
    expect(items[1].getAttribute('aria-checked')).toBe('true');
  });

  it('closes the menu on an outside click without changing the stored level', () => {
    const { container, root } = renderControl();
    roots.push(root);

    act(() => getTrigger(container).click());
    expect(container.querySelector('[role="menu"]')).not.toBeNull();

    act(() => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });

    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(localStorage.getItem('vibe_thinking_level')).toBeNull();
  });

  it('shows the current level as text on the trigger, updating after a selection changes it', () => {
    const { container, root } = renderControl();
    roots.push(root);

    // default medium clamps onto the official ladder as High
    expect(getTrigger(container).textContent).toContain('High');

    act(() => getTrigger(container).click());
    const items = container.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]');
    act(() => items[2].click()); // Extreme

    expect(getTrigger(container).textContent).toContain('Extreme');
  });

  it('disables the trigger button when disabled=true', () => {
    const { container, root } = renderControl({ disabled: true });
    roots.push(root);

    expect(getTrigger(container).disabled).toBe(true);
  });

  it('offers all 4 levels for every selectable openai model (gpt-5.4-mini)', () => {
    localStorage.setItem('vibe_provider', 'openai');
    localStorage.setItem('vibe_model_openai', 'gpt-5.4-mini');
    const { container, root } = renderControl();
    roots.push(root);

    act(() => getTrigger(container).click());
    const items = container.querySelectorAll('[role="menuitemradio"]');
    expect(items).toHaveLength(4);
    expect(Array.from(items).map((el) => el.textContent)).toEqual(['Low', 'Medium', 'High', 'Extreme']);
  });

  it('glm-5.2 only offers High and Extreme', () => {
    localStorage.setItem('vibe_provider', 'glm');
    localStorage.setItem('vibe_model_glm', 'glm-5.2');
    const { container, root } = renderControl();
    roots.push(root);

    act(() => getTrigger(container).click());
    const items = container.querySelectorAll('[role="menuitemradio"]');
    expect(Array.from(items).map((el) => el.textContent)).toEqual(['High', 'Extreme']);
  });

  it('clamps a stored level unsupported by the current model down to the nearest one, without overwriting storage', () => {
    localStorage.setItem('vibe_thinking_level', 'low');
    localStorage.setItem('vibe_provider', 'glm');
    localStorage.setItem('vibe_model_glm', 'glm-5.2');
    const { container, root } = renderControl();
    roots.push(root);

    expect(getTrigger(container).textContent).toContain('High');
    expect(localStorage.getItem('vibe_thinking_level')).toBe('low');
  });

  it('does not render anything for models with no effort dial (kimi)', () => {
    localStorage.setItem('vibe_provider', 'kimi');
    const { container, root } = renderControl();
    roots.push(root);

    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('[role="menu"]')).toBeNull();
  });

  it('does not render anything for glm models without an effort dial (glm-5.1)', () => {
    localStorage.setItem('vibe_provider', 'glm');
    localStorage.setItem('vibe_model_glm', 'glm-5.1');
    const { container, root } = renderControl();
    roots.push(root);

    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('[role="menu"]')).toBeNull();
  });

  it('does not render anything for anthropic haiku-4-5 (no effort dial)', () => {
    localStorage.setItem('vibe_provider', 'anthropic');
    localStorage.setItem('vibe_model_anthropic', 'claude-haiku-4-5');
    const { container, root } = renderControl();
    roots.push(root);

    expect(container.querySelector('button')).toBeNull();
  });
});
