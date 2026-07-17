// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import OddeNovaImportNotice from '../OddeNovaImportNotice';
import type { OddeNovaImportResult } from '../../hooks/useOddeNovaImport';

const copy: Record<string, string> = {
  importSucceeded: '导入成功',
  importUpdated: '已更新',
  importBranched: '当前版本已保留，新导入的更新已创建为新分支',
  importUnsupported: '导入链接版本不受支持，请更新 oddeNova 或 oddenova-strudel skill',
  importInvalid: '导入链接无效',
  importMemoryWarning: '当前无法持久保存，刷新后可能丢失',
};

vi.mock('../../lib/i18n', () => ({ t: (key: string) => copy[key] ?? key }));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function renderNotice(result: OddeNovaImportResult) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<OddeNovaImportNotice result={result} />);
  });
  return { container, root };
}

describe('OddeNovaImportNotice', () => {
  const roots: Root[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => root.unmount());
    }
    document.body.innerHTML = '';
  });

  it.each([
    ['created', '导入成功'],
    ['updated', '已更新'],
    ['branched', '当前版本已保留，新导入的更新已创建为新分支'],
  ] as const)('shows the exact localized %s outcome', (outcome, expected) => {
    const rendered = renderNotice({ status: 'success', outcome, persistent: true });
    roots.push(rendered.root);

    expect(rendered.container.textContent).toBe(expected);
  });

  it('shows a persistence warning only for successful in-memory imports', () => {
    const rendered = renderNotice({ status: 'success', outcome: 'created', persistent: false });
    roots.push(rendered.root);

    expect(rendered.container.textContent).toBe('导入成功当前无法持久保存，刷新后可能丢失');
  });

  it.each([
    ['unsupported-version', '导入链接版本不受支持，请更新 oddeNova 或 oddenova-strudel skill'],
    ['invalid', '导入链接无效'],
  ] as const)('shows the localized %s error', (reason, expected) => {
    const rendered = renderNotice({ status: 'error', reason });
    roots.push(rendered.root);

    expect(rendered.container.textContent).toBe(expected);
  });

  it.each([{ status: 'idle' }, { status: 'loading' }] as const)('renders nothing while $status', (result) => {
    const rendered = renderNotice(result);
    roots.push(rendered.root);

    expect(rendered.container.textContent).toBe('');
  });
});
