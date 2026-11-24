import { expect, it, vi } from 'vitest';
import { createRouterProgress } from '../router-progress';

it('presents all four kinds in source order and rejects ungrounded indexes', async () => {
  const chatWithTools = vi.fn().mockResolvedValue({ toolCalls: [], content: JSON.stringify([
    { index: 3, title: 'Piano melody', detail: 'Release 3.2 connects the notes.' },
    { index: 2, title: 'Musical thinking', detail: 'A piano gives the theme a clear center.' },
    { index: 8, title: 'Unrelated', detail: 'Discard this.' },
    { index: 1, title: 'Checking audio', detail: 'The waveform analysis returned notes.' },
    { index: 0, title: '下一步', detail: '我会先听清旋律的起伏。' },
  ]) });
  const publish = vi.fn();
  const progress = createRouterProgress({ chatWithTools }, 'Use my humming', { name: 'Test persona' },
    new AbortController().signal, publish);
  progress.add({ kind: 'plan', facts: { nextStep: 'check melody' } });
  progress.add({ kind: 'tool', facts: { action: 'analyzeHummingWaveform' } });
  progress.add({ kind: 'strategy', facts: { instrument: 'piano' }, durationMs: 3200 });
  progress.add({ kind: 'operation', facts: { layer: 'piano', after: '.release(3.2)' } });
  await progress.finish();
  expect(publish.mock.calls.map(([entry]) => entry.kind)).toEqual(['plan', 'tool', 'strategy', 'operation']);
  expect(publish.mock.calls[0][0]).toEqual({ kind: 'plan', title: '我会先听清旋律的起伏。' });
  expect(publish.mock.calls[1][0]).toMatchObject({ toolAction: 'analyzeHummingWaveform' });
  expect(publish.mock.calls[2][0]).toMatchObject({ durationMs: 3200 });
  expect(chatWithTools.mock.calls[0][0][0].content).toContain('Test persona');
  expect(chatWithTools.mock.calls[0][0][1].content).toContain('.release(3.2)');
});

it('does not publish an update after cancellation', async () => {
  const controller = new AbortController();
  const publish = vi.fn();
  const chatWithTools = vi.fn(async () => {
    controller.abort();
    return { toolCalls: [], content: '[{"index":0,"title":"late"}]' };
  });
  const progress = createRouterProgress({ chatWithTools }, 'Edit', { name: 'Test' }, controller.signal, publish);
  progress.add({ kind: 'plan', facts: { nextStep: 'edit' } });
  await progress.finish();
  expect(publish).not.toHaveBeenCalled();
});
