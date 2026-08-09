// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useModelSettingsDraft } from '../useModelSettingsDraft';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function Probe({
  onSaved,
  onValue,
}: {
  onSaved: () => void;
  onValue: (value: ReturnType<typeof useModelSettingsDraft>) => void;
}) {
  onValue(useModelSettingsDraft(onSaved));
  return null;
}

describe('useModelSettingsDraft', () => {
  const roots: Root[] = [];

  beforeEach(() => localStorage.clear());

  afterEach(() => {
    for (const root of roots.splice(0)) act(() => root.unmount());
    document.body.innerHTML = '';
  });

  it('retains independent drafts while switching providers', () => {
    let latest!: ReturnType<typeof useModelSettingsDraft>;
    const container = document.createElement('div');
    const root = createRoot(container);
    roots.push(root);
    act(() => root.render(<Probe onSaved={vi.fn()} onValue={(value) => { latest = value; }} />));

    act(() => latest.updateDraft('deepseek', { apiKey: 'deepseek-draft' }));
    act(() => latest.selectProvider('openai'));
    act(() => latest.updateDraft('openai', { apiKey: 'openai-draft' }));
    act(() => latest.selectProvider('deepseek'));

    expect(latest.draft.apiKey).toBe('deepseek-draft');
    expect(latest.dirtyProviders).toEqual(new Set(['deepseek', 'openai']));
    expect(localStorage.getItem('vibe_api_key_deepseek')).toBeNull();
  });

  it('persists only when saving and resets the client once', () => {
    const onSaved = vi.fn();
    let latest!: ReturnType<typeof useModelSettingsDraft>;
    const container = document.createElement('div');
    const root = createRoot(container);
    roots.push(root);
    act(() => root.render(<Probe onSaved={onSaved} onValue={(value) => { latest = value; }} />));

    act(() => latest.selectProvider('deepseek'));
    act(() => latest.updateDraft('deepseek', { apiKey: 'new-key', model: 'deepseek-v4-pro' }));
    expect(localStorage.getItem('vibe_provider')).toBeNull();

    act(() => expect(latest.saveSelectedProvider()).toBe(true));

    expect(localStorage.getItem('vibe_provider')).toBe('deepseek');
    expect(localStorage.getItem('vibe_api_key')).toBe('new-key');
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(latest.activeProvider).toBe('deepseek');
    expect(latest.selectedIsDirty).toBe(false);
    expect(latest.saveStatus).toBe('saved');
  });

  it('falls back to the official panel when the persisted provider is not visible', () => {
    localStorage.setItem('vibe_provider', 'kimi');
    let latest!: ReturnType<typeof useModelSettingsDraft>;
    const container = document.createElement('div');
    const root = createRoot(container);
    roots.push(root);
    act(() => root.render(<Probe onSaved={vi.fn()} onValue={(value) => { latest = value; }} />));

    expect(latest.activeProvider).toBe('kimi');
    expect(latest.selectedProvider).toBe('official');
  });
});
