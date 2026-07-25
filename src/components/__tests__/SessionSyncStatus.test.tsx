// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const locale = vi.hoisted(() => ({ language: 'zh' as 'zh' | 'en' }));
const copy = {
  sessionSyncSaving: ['保存中…', 'Saving…'],
  sessionSyncSaved: ['已保存', 'Saved'],
  sessionSyncOffline: ['已保存到本机，联网后同步', 'Saved locally; will sync when online'],
  sessionSyncRetrying: ['同步失败，正在重试', 'Sync failed; retrying'],
} as const;

vi.mock('../../lib/i18n', () => ({
  t: (key: keyof typeof copy) => copy[key][locale.language === 'zh' ? 0 : 1],
}));

import SessionSyncStatus from '../SessionSyncStatus';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function renderStatus(
  props: React.ComponentProps<typeof SessionSyncStatus>,
) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<SessionSyncStatus {...props} />));
  return { container, root };
}

describe('SessionSyncStatus', () => {
  const roots: ReturnType<typeof createRoot>[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) act(() => root.unmount());
    document.body.innerHTML = '';
    locale.language = 'zh';
  });

  it.each([
    ['dirty', '保存中…'],
    ['saving', '保存中…'],
    ['synced', '已保存'],
    ['offline', '已保存到本机，联网后同步'],
    ['retrying', '同步失败，正在重试'],
  ] as const)('renders Chinese copy for %s', (status, expected) => {
    const view = renderStatus({ status, visible: true });
    roots.push(view.root);

    expect(view.container.textContent).toBe(expected);
    expect(view.container.querySelector('[aria-live="polite"]')).not.toBeNull();
  });

  it('renders the English offline copy', () => {
    locale.language = 'en';
    const view = renderStatus({ status: 'offline', visible: true });
    roots.push(view.root);

    expect(view.container.textContent).toBe('Saved locally; will sync when online');
  });

  it('renders nothing when hidden or when status is unavailable', () => {
    const hidden = renderStatus({ status: 'synced', visible: false });
    const missing = renderStatus({ visible: true });
    roots.push(hidden.root, missing.root);

    expect(hidden.container.textContent).toBe('');
    expect(missing.container.textContent).toBe('');
  });
});
