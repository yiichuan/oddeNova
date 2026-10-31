// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';
import CaseContext, { CaseInputSummary } from '../CaseContext';
import { COVERAGE_CASES } from '../coverage-cases';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const host = document.createElement('div');
const root = createRoot(host);
afterEach(() => act(() => root.render(null)));

it.each(['CV-STEP-002', 'CV-STEP-003'])('shows the numbered options preceding %s and distinguishes them from executed turns', async id => {
  const testCase = COVERAGE_CASES.find(c => c.id === id)!;
  await act(async () => root.render(<><CaseInputSummary testCase={testCase} /><CaseContext testCase={testCase} /></>));
  expect(host.textContent).toContain('执行 1 轮 · 预置 2 条消息 · 含初始代码');
  expect(host.textContent).toContain('以下消息直接传给模型');
  expect(host.querySelectorAll('ol li')).toHaveLength(2);
  expect(host.textContent).toContain('1. 加入轻柔的贝斯支撑');
  expect(host.textContent).toContain('3. 按这个方向直接写完');
  expect(host.querySelector('pre')?.textContent).toBe(testCase.initialCode);
  expect(host.querySelector('details')?.open).toBe(false);
});

it('explains the starting state for cases without fixtures', async () => {
  const testCase = COVERAGE_CASES.find(c => c.id === 'CV-STEP-001')!;
  await act(async () => root.render(<><CaseInputSummary testCase={testCase} /><CaseContext testCase={testCase} /></>));
  expect(host.textContent).toContain('从空白对话和空代码开始');
  expect(host.textContent).not.toContain('预置');
  expect(host.querySelector('ol')).toBeNull();
});
