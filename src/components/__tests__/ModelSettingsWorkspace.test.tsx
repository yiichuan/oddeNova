// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '../../lib/i18n';
import ModelSettingsPanel from '../ModelSettingsPanel';
import ProviderSidebar from '../ProviderSidebar';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function render(element: React.ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(element));
  return { container, root };
}

describe('model settings workspace components', () => {
  const roots: Root[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) act(() => root.unmount());
    document.body.innerHTML = '';
  });

  it('renders five provider logos and reports the active state', () => {
    const onSelect = vi.fn();
    const { container, root } = render(
      <ProviderSidebar
        activeProvider="official"
        onSelect={onSelect}
        selectedProvider="deepseek"
      />,
    );
    roots.push(root);

    const buttons = container.querySelectorAll('nav button');
    expect(buttons).toHaveLength(5);
    expect(container.querySelectorAll('[data-provider-logo]')).toHaveLength(5);
    expect(container.querySelector('header')?.textContent).toBe(t('chooseProvider'));
    expect(container.textContent).toContain(t('currentlyActive'));
    act(() => (buttons[2] as HTMLButtonElement).click());
    expect(onSelect).toHaveBeenCalledWith('glm');
  });

  it('shows the managed official state without an API key input', () => {
    const onSave = vi.fn(() => true);
    const { container, root } = render(
      <ModelSettingsPanel
        draft={{ apiKey: '', model: 'deepseek-v4-flash' }}
        isDirty
        onSave={onSave}
        onUpdate={vi.fn()}
        provider="official"
        saveStatus="idle"
      />,
    );
    roots.push(root);

    expect(container.querySelector('input')).toBeNull();
    expect(container.textContent).toContain(t('noApiKeyRequired'));
    const saveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === t('saveSettings'))!;
    act(() => saveButton.click());
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('masks third-party keys and disables save when the key is empty', () => {
    const { container, root } = render(
      <ModelSettingsPanel
        draft={{ apiKey: '', model: 'gpt-5.5' }}
        isDirty
        onSave={vi.fn(() => true)}
        onUpdate={vi.fn()}
        provider="openai"
        saveStatus="idle"
      />,
    );
    roots.push(root);

    expect(container.querySelector('input')?.type).toBe('password');
    const saveButton = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === t('saveSettings')) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(true);
  });

  it('opens a styled model listbox and selects a model', () => {
    const onUpdate = vi.fn();
    const { container, root } = render(
      <ModelSettingsPanel
        draft={{ apiKey: 'test-key', model: 'gpt-5.5' }}
        isDirty
        onSave={vi.fn(() => true)}
        onUpdate={onUpdate}
        provider="openai"
        saveStatus="idle"
      />,
    );
    roots.push(root);

    const trigger = container.querySelector('[aria-haspopup="listbox"]') as HTMLButtonElement;
    act(() => trigger.click());

    const selectedOption = container.querySelector('[role="option"][aria-selected="true"]') as HTMLButtonElement;
    expect(container.querySelector('[role="listbox"]')).not.toBeNull();
    expect(selectedOption.className).toContain('bg-white/[0.10]');

    const nextOption = Array.from(container.querySelectorAll('[role="option"]'))
      .find((option) => option.textContent === 'gpt-5.5-mini') as HTMLButtonElement;
    act(() => nextOption.click());
    expect(onUpdate).toHaveBeenCalledWith({ model: 'gpt-5.5-mini' });
    expect(container.querySelector('[role="listbox"]')).toBeNull();
  });

  it.each([
    ['deepseek', 'sk-…'],
    ['glm', 'id.secret'],
    ['anthropic', 'sk-ant-api…'],
    ['openai', 'sk-…'],
  ] as const)('shows the %s API key format', (provider, placeholder) => {
    const { container, root } = render(
      <ModelSettingsPanel
        draft={{ apiKey: '', model: '' }}
        isDirty
        onSave={vi.fn(() => true)}
        onUpdate={vi.fn()}
        provider={provider}
        saveStatus="idle"
      />,
    );
    roots.push(root);

    expect(container.querySelector('input')?.placeholder).toBe(placeholder);
  });
});
