// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import ResultsExplorer from '../ResultsExplorer';
import { promptLabStorage } from '../storage';
import type { PromptLabExperiment, LabReview } from '../types';
vi.mock('../storage', () => ({ promptLabStorage: { listReviews: vi.fn(async () => []), getReview: vi.fn(async () => undefined), saveReview: vi.fn(async (review: LabReview) => ({ ...review, revision: review.revision + 1 })) } }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const host = document.createElement('div');
const root = createRoot(host);
const template = { id: 'baseline', name: 'baseline', locale: 'zh', basedOn: 'v25', revision: 0, createdAt: '', updatedAt: '', modules: [] };
const result = { instruction: 'lofi', code: 's("bd")', explanation: 'done', committed: true, iterations: 1, durationMs: 10, trace: [], checks: [], trialIndex: 0, turnIndex: 0, inputSnapshot: { code: '', history: [] } };
const experiment = { id: 'run-1', kind: 'debug', status: 'completed', name: 'debug', createdAt: '2026-10-31T00:00:00.000Z', repeats: 1, config: { provider: 'deepseek', model: 'test' }, leftTemplate: template, leftSystemPrompt: 'prompt snapshot', results: [{ caseId: 'one', caseSnapshot: { id: 'one', name: '一轮调试', turns: ['lofi'] }, left: [result], right: [] }] } as unknown as PromptLabExperiment;
const props = { onPlay: vi.fn(), playing: '', disabled: false, onReplay: vi.fn(), onRegression: vi.fn() };
afterEach(() => { act(() => root.render(null)); vi.clearAllMocks(); vi.mocked(promptLabStorage.getReview).mockResolvedValue(undefined); });
it('renders a focused debug result without A/B and evaluation labels', async () => {
  await act(async () => root.render(<ResultsExplorer experiment={experiment} {...props} />));
  expect(host.textContent).toContain('第 1 轮');
  expect(host.textContent).toContain('试听');
  expect(host.textContent).not.toContain('A ·');
  expect(host.textContent).not.toContain('已执行轮次');
  expect(host.textContent).not.toContain('探索性结果');
});
it('keeps legacy results in source order without inventing turn numbers', async () => {
  const old = structuredClone(experiment);
  const legacyTurns = structuredClone([result, result]) as PromptLabExperiment['results'][number]['left'];
  delete legacyTurns[0].turnIndex;
  delete legacyTurns[1].turnIndex;
  legacyTurns[0].instruction = 'first marker';
  legacyTurns[1].instruction = 'second marker';
  old.results[0].left = legacyTurns;
  await act(async () => root.render(<ResultsExplorer experiment={old} {...props} />));
  expect(host.textContent.indexOf('first marker')).toBeLessThan(host.textContent.indexOf('second marker'));
  expect(host.textContent).not.toContain('第 1 轮');
});
it('does not stringify transcripts until expanded', async () => {
  const next = structuredClone(experiment);
  next.results[0].left[0].trace = [{ kind: 'response', stage: 'agent', content: 'hidden-transcript-marker', toolCalls: [], durationMs: 2 }];
  await act(async () => root.render(<ResultsExplorer experiment={next} {...props} />));
  expect(host.textContent).not.toContain('hidden-transcript-marker');
});
it('keeps usage details collapsed while showing elapsed time', async () => {
  await act(async () => root.render(<ResultsExplorer experiment={experiment} {...props} />));
  expect(host.textContent).toContain('0.0 秒');
  const detail = [...host.querySelectorAll<HTMLDetailsElement>('.plab-debug-more')].find(item => item.querySelector(':scope > summary')?.textContent === '详情');
  expect(detail?.open).toBe(false);
  expect(detail?.textContent).toContain('历史用量不完整');
});
it('surfaces run errors and hides playback when no code was produced', async () => {
  const failed = structuredClone(experiment);
  failed.status = 'failed';
  failed.results[0].left[0] = { ...result, code: '', explanation: '', error: 'request failed' };
  failed.error = 'request failed';
  await act(async () => root.render(<ResultsExplorer experiment={failed} {...props} />));
  expect(host.textContent).toContain('request failed');
  expect(host.querySelector('.plab-debug-output')).toBeNull();
  expect(host.textContent).not.toContain('试听');
});
it('shows streaming state before the first turn completes', async () => {
  const running = { ...experiment, status: 'running', results: [] } as PromptLabExperiment;
  await act(async () => root.render(<ResultsExplorer experiment={running} {...props} />));
  expect(host.textContent).toContain('运行中');
  expect(host.textContent).toContain('等待 Agent 回复');
});
it('shows multiple turns in order and preserves cancelled status', async () => {
  const cancelled = structuredClone(experiment);
  cancelled.status = 'cancelled';
  cancelled.results[0].left = [
    { ...result, instruction: 'first turn', turnIndex: 0 },
    { ...result, instruction: 'second turn', turnIndex: 1 },
  ];
  await act(async () => root.render(<ResultsExplorer experiment={cancelled} {...props} />));
  expect(host.textContent).toContain('已取消');
  expect(host.textContent).toContain('第 2 轮');
  expect(host.textContent.indexOf('first turn')).toBeLessThan(host.textContent.indexOf('second turn'));
});
it('keeps playback, recompare and regression actions available', async () => {
  const actions = { onPlay: vi.fn(), onReplay: vi.fn(), onRegression: vi.fn() };
  await act(async () => root.render(<ResultsExplorer experiment={experiment} {...props} {...actions} />));
  const button = (label: string) => [...host.querySelectorAll('button')].find(item => item.textContent === label);
  await act(async () => button('试听')?.click());
  await act(async () => button('用这一步重新比较（重新运行）')?.click());
  await act(async () => button('保存为回归用例')?.click());
  expect(actions.onPlay).toHaveBeenCalledWith('run-1-0', 's("bd")');
  expect(actions.onReplay).toHaveBeenCalledWith(experiment.results[0].left[0]);
  expect(actions.onRegression).toHaveBeenCalledWith(experiment.results[0].left[0]);
});

it('aligns comparison rows by case and repeat including cases not yet executed', async () => {
  const compare = structuredClone(experiment);
  compare.kind = 'compare';
  compare.rightTemplate = template as PromptLabExperiment['leftTemplate'];
  compare.repeats = 2;
  compare.suiteSnapshot = { id: 'suite', name: 'suite', revision: 0, createdAt: '', updatedAt: '', cases: [
    { id: 'one', name: '已执行用例', category: '', turns: ['lofi'] },
    { id: 'two', name: '未执行用例', category: '', turns: ['ambient'] },
  ] };
  await act(async () => root.render(<ResultsExplorer experiment={compare} {...props} />));
  expect(host.querySelectorAll('tbody tr:not([hidden])')).toHaveLength(4);
  expect(host.textContent).toContain('未执行用例');
  expect(host.textContent).toContain('待评价');
});

it('keeps legacy comparison outputs in original order', async () => {
  const compare = structuredClone(experiment);
  compare.kind = 'compare';
  delete compare.results[0].left[0].trialIndex;
  await act(async () => root.render(<ResultsExplorer experiment={compare} {...props} />));
  expect(host.textContent).toContain('历史格式');
  expect(host.textContent).toContain('不推算实验边界');
});


it('persists blind mode for existing reviews and hides identifying feedback', async () => {
  const review: LabReview = { id: 'run-1-one-0', revision: 1, experimentId: 'run-1', caseId: 'one', trialIndex: 0, note: 'B identity marker', swapped: true, revealed: false, mode: 'standard', preference: 'right' };
  vi.mocked(promptLabStorage.getReview).mockResolvedValue(review);
  const compare = { ...experiment, kind: 'compare' as const, rightTemplate: experiment.leftTemplate };
  await act(async () => root.render(<ResultsExplorer experiment={compare} {...props} />));
  const click = async (label: string) => { await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === label)?.click()); };
  await click('试听与评价');
  await click('进入盲听');
  expect(promptLabStorage.saveReview).toHaveBeenCalledWith(expect.objectContaining({ mode: 'blind', swapped: true, revealed: false }));
  expect(host.textContent).not.toContain('B identity marker');
  expect(host.querySelector('select[aria-label="整体偏好"]')).toBeNull();
  await click('收起详情');
  await click('试听与评价');
  expect(host.textContent).toContain('样本 1');
  await click('揭示模板');
  expect(host.textContent).toContain('B identity marker');
});

it('retries a failed review read before allowing an inline vote', async () => {
  vi.mocked(promptLabStorage.getReview).mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined);
  const compare = { ...experiment, kind: 'compare' as const, rightTemplate: experiment.leftTemplate };
  await act(async () => root.render(<ResultsExplorer experiment={compare} {...props} />));
  expect(host.textContent).toContain('读取评价失败');
  expect(promptLabStorage.saveReview).not.toHaveBeenCalled();
  await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === '重新加载评价')?.click());
  const select = host.querySelector<HTMLSelectElement>('select[aria-label="整体偏好"]')!;
  expect(select.disabled).toBe(false);
  await act(async () => { select.value = 'left'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(promptLabStorage.saveReview).toHaveBeenCalledWith(expect.objectContaining({ preference: 'left' }));
});

it('renders batch results without comparison voting or an empty B column', async () => {
  const batch = { ...experiment, kind: 'batch' as const };
  await act(async () => root.render(<ResultsExplorer experiment={batch} {...props} />));
  expect(host.textContent).toContain('第 1 次重复');
  expect(host.textContent).toContain('lofi');
  expect(host.querySelector('select[aria-label="整体偏好"]')).toBeNull();
  expect(host.textContent).not.toContain('A/B 最终代码差异');
});
