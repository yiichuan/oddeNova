// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import OddeNovaBridgeNotice from '../OddeNovaBridgeNotice';
import type { OddeNovaBridgeStatus } from '../../../hooks/useOddeNovaBridge';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function renderNotice(status: OddeNovaBridgeStatus) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<OddeNovaBridgeNotice status={status} />);
  });
  return { container, root };
}

describe('OddeNovaBridgeNotice', () => {
  const roots: Root[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => root.unmount());
    }
    document.body.innerHTML = '';
  });

  it.each(['created', 'updated', 'unchanged'] as const)('renders nothing for a persistent %s application', (outcome) => {
    const rendered = renderNotice({ status: 'applied', revision: 2, outcome, persistent: true });
    roots.push(rendered.root);

    expect(rendered.container.textContent).toBe('');
    expect(document.body.textContent).not.toContain('已应用第 2 版');
  });

  it('keeps the persistent branched notice with a status role', () => {
    const rendered = renderNotice({ status: 'applied', revision: 3, outcome: 'branched', persistent: true });
    roots.push(rendered.root);

    expect(rendered.container.textContent).toBe('网页修改已保留，第 3 版已导入为新分支');
    expect(rendered.container.querySelector('[role="status"]')).not.toBeNull();
  });

  it('warns about in-memory-only updates without a revision', () => {
    const rendered = renderNotice({ status: 'applied', revision: 2, outcome: 'updated', persistent: false });
    roots.push(rendered.root);

    expect(rendered.container.textContent).toBe('页面已更新，但当前仅保存在内存');
    expect(rendered.container.textContent).not.toContain('第 2 版');
    expect(rendered.container.querySelector('[role="status"]')).not.toBeNull();
  });

  it('combines the branched outcome with the in-memory risk', () => {
    const rendered = renderNotice({ status: 'applied', revision: 4, outcome: 'branched', persistent: false });
    roots.push(rendered.root);

    expect(rendered.container.textContent).toBe('网页修改已保留，第 4 版已导入为新分支，但当前仅保存在内存');
  });

  it('keeps showing queued revisions', () => {
    const rendered = renderNotice({ status: 'queued', revision: 5 });
    roots.push(rendered.root);

    expect(rendered.container.textContent).toBe('第 5 版已排队，当前操作完成后应用');
  });

  it('keeps alerts for errors', () => {
    const rendered = renderNotice({ status: 'error', message: '本机连接中断，正在重试。' });
    roots.push(rendered.root);

    expect(rendered.container.textContent).toBe('本机连接中断，正在重试。');
    expect(rendered.container.querySelector('[role="alert"]')).not.toBeNull();
  });
});
