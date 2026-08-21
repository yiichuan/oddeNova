// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const locale = vi.hoisted(() => ({ language: 'zh' as 'zh' | 'en' }));
const copy = {
  sessionSyncOffline: ['未同步到云端 · 联网后自动上传', 'Not synced to cloud · uploads when online'],
  sessionSyncRetrying: ['同步失败，正在重试', 'Sync failed; retrying'],
} as const;

vi.mock('../../../lib/i18n', () => ({
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
    ['offline', '未同步到云端 · 联网后自动上传'],
    ['retrying', '同步失败，正在重试'],
  ] as const)('renders Chinese copy for %s', (status, expected) => {
    const view = renderStatus({ status, visible: true });
    roots.push(view.root);

    expect(view.container.textContent).toBe(expected);
    expect(view.container.querySelector('[role="status"][aria-live="polite"]')).not.toBeNull();
  });

  it.each(['dirty', 'saving', 'synced'] as const)(
    'stays silent while sync is healthy (%s)',
    (status) => {
      const view = renderStatus({ status, visible: true });
      roots.push(view.root);

      expect(view.container.textContent).toBe('');
    },
  );

  it('renders the English offline copy', () => {
    locale.language = 'en';
    const view = renderStatus({ status: 'offline', visible: true });
    roots.push(view.root);

    expect(view.container.textContent).toBe('Not synced to cloud · uploads when online');
  });

  it('renders nothing when hidden or when status is unavailable', () => {
    const hidden = renderStatus({ status: 'offline', visible: false });
    const missing = renderStatus({ visible: true });
    roots.push(hidden.root, missing.root);

    expect(hidden.container.textContent).toBe('');
    expect(missing.container.textContent).toBe('');
  });
});
