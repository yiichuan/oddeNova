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
  const button = container.querySelector<HTMLButtonElement>('button[title="Thinking level"]');
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

  it('opens a 4-item menu on click, with the default "Medium" level checked', () => {
    const { container, root } = renderControl();
    roots.push(root);

    act(() => getTrigger(container).click());

    const menu = container.querySelector('[role="menu"]');
    expect(menu).not.toBeNull();
    const items = container.querySelectorAll('[role="menuitemradio"]');
    expect(items).toHaveLength(4);
    expect(items[1].textContent).toContain('Medium');
    expect(items[1].getAttribute('aria-checked')).toBe('true');
  });

  it('selecting a level persists it, updates the check mark, and closes the menu', () => {
    const { container, root } = renderControl();
    roots.push(root);

    act(() => getTrigger(container).click());
    const items = container.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]');
    act(() => items[3].click()); // Extreme

    expect(localStorage.getItem('vibe_thinking_level')).toBe('extreme');
    expect(container.querySelector('[role="menu"]')).toBeNull();

    act(() => getTrigger(container).click());
    const reopened = container.querySelectorAll('[role="menuitemradio"]');
    expect(reopened[3].getAttribute('aria-checked')).toBe('true');
  });

  it('reads a previously stored level on mount', () => {
    localStorage.setItem('vibe_thinking_level', 'high');
    const { container, root } = renderControl();
    roots.push(root);

    act(() => getTrigger(container).click());
    const items = container.querySelectorAll('[role="menuitemradio"]');
    expect(items[2].getAttribute('aria-checked')).toBe('true');
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

  it('disables the trigger button when disabled=true', () => {
    const { container, root } = renderControl({ disabled: true });
    roots.push(root);

    expect(getTrigger(container).disabled).toBe(true);
  });
});
