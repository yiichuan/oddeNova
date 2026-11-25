import { expect, it, vi } from 'vitest';
import { createRouterProgress } from '../router-progress';
import type { LLMCaller } from '../loop';

it('presents all four kinds in source order and rejects ungrounded indexes', async () => {
  const chatWithTools = vi.fn().mockResolvedValue({ toolCalls: [], content: JSON.stringify([
    { index: 3, title: 'Piano melody', detail: 'Release 3.2 connects the notes.', summary: 'Let the notes flow.', application: 'Ignore this field on operations.' },
    { index: 2, title: 'Musical thinking', detail: 'A piano gives the theme a clear center.', summary: '  Let the piano lead.  ' },
    { index: 8, title: 'Unrelated', detail: 'Discard this.' },
    { index: 1, title: 'Checking audio', detail: 'The waveform analysis returned notes.',
      application: '  Keep the rising contour in the keyboard melody.  ' },
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
  expect(publish.mock.calls[1][0]).toMatchObject({
    toolAction: 'analyzeHummingWaveform',
    detail: 'The waveform analysis returned notes.',
    application: 'Keep the rising contour in the keyboard melody.',
  });
  expect(publish.mock.calls[2][0]).toMatchObject({ durationMs: 3200, summary: 'Let the piano lead.' });
  expect(publish.mock.calls[3][0]).toMatchObject({ summary: 'Let the notes flow.' });
  expect(publish.mock.calls[3][0]).not.toHaveProperty('application');
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

it('publishes complete streamed rows before the narration request ends and spaces rows that arrive together', async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  try {
    const publish = vi.fn();
    let send!: (delta: string) => void;
    let finishNarration!: () => void;
    const chatWithTools = vi.fn<LLMCaller['chatWithTools']>();
    chatWithTools.mockImplementation((_messages, _tools, onText) => {
      send = onText!;
      return new Promise(resolve => {
        finishNarration = () => resolve({ toolCalls: [], content: JSON.stringify([
          { index: 0, title: 'Listen for the beat' },
          { index: 1, title: 'Check the "C" notes' },
          { index: 2, title: 'Sketch the bass' },
        ]) });
      });
    });
    const progress = createRouterProgress({ chatWithTools }, 'Arrange it', { name: 'Test' }, controller.signal, publish);
    for (const nextStep of ['listen', 'check', 'sketch']) progress.add({ kind: 'plan', facts: { nextStep } });
    const finished = progress.finish();

    const first = JSON.stringify({ index: 0, title: 'Listen for the beat' });
    const second = JSON.stringify({ index: 1, title: 'Check the "C" notes' });
    send('[' + first.slice(0, -1));
    await vi.advanceTimersByTimeAsync(0);
    expect(publish).not.toHaveBeenCalled();
    send(first.slice(-1) + ',' + second + ',{"index":2,"title":"Sketch the bass"}]');
    await vi.advanceTimersByTimeAsync(0);
    expect(publish.mock.calls.map(([entry]) => entry.title)).toEqual(['Listen for the beat']);
    await vi.advanceTimersByTimeAsync(350);
    expect(publish.mock.calls.map(([entry]) => entry.title)).toEqual(['Listen for the beat', 'Check the "C" notes']);

    controller.abort();
    finishNarration();
    await finished;
    await vi.advanceTimersByTimeAsync(1000);
    expect(publish).toHaveBeenCalledTimes(2);
  } finally {
    controller.abort();
    vi.useRealTimers();
  }
});
