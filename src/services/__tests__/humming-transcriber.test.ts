import { beforeEach, expect, it, vi } from 'vitest';
import { transcribeHumming } from '../humming-transcriber';
import { measureHummingRecording } from '../humming-measurement';
import { getActiveLLMCaller } from '../llm';
import type { LLMCaller } from '../../agent/loop';

vi.mock('../humming-measurement', () => ({ measureHummingRecording: vi.fn() }));
vi.mock('../llm', () => ({ getActiveLLMCaller: vi.fn() }));
vi.mock('../llm-config', () => ({ getActiveModelConfig: () => ({ model: 'deepseek-flash' }) }));

const chatWithTools = vi.fn<LLMCaller['chatWithTools']>();

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getActiveLLMCaller).mockReturnValue({ chatWithTools });
  vi.mocked(measureHummingRecording).mockResolvedValue({ csv: '0,60.1,-20,-30', durationSeconds: 2 });
  chatWithTools.mockResolvedValueOnce({
    content: null, toolCalls: [{ id: 'read', name: 'analyzeHummingWaveform', arguments: '{}' }],
  });
});

it('measures audio through the chat tool and uses the agent’s note boundaries', async () => {
  chatWithTools.mockResolvedValueOnce({ content: null, toolCalls: [{
    id: 'submit', name: 'submitHummingTranscription', arguments: JSON.stringify({
      notes: [
        { pitchMidi: 60, startSeconds: 0.25, endSeconds: 0.50 },
        { pitchMidi: 60, startSeconds: 0.75, endSeconds: 1.25, uncertain: true },
      ],
      bpm: 120,
    }),
  }] });
  const recording = new Blob(['recording']);
  const { signal } = new AbortController();
  const onWaveformToolCall = vi.fn();
  await expect(transcribeHumming(recording, signal, onWaveformToolCall)).resolves.toEqual({
    result: {
      trimStartSeconds: 0.25, melodyDurationSeconds: 1,
      notes: [
        { pitchMidi: 60, startSeconds: 0, durationSeconds: 0.25 },
        { pitchMidi: 60, startSeconds: 0.50, durationSeconds: 0.50, uncertain: true },
      ],
      warnings: ['ambiguous_melody'],
    },
    modelRhythm: { bpm: 120, timeSignature: null },
    modelVersion: 'deepseek-flash',
  });
  expect(onWaveformToolCall).toHaveBeenCalledOnce();
  expect(measureHummingRecording).toHaveBeenCalledWith(recording, signal);
  expect(chatWithTools.mock.calls[1][0].at(-1)).toMatchObject({
    role: 'tool', tool_call_id: 'read', content: expect.stringContaining('0,60.1,-20,-30'),
  });
});

it('reports no melody when the agent submits no notes', async () => {
  chatWithTools.mockResolvedValueOnce({ content: null, toolCalls: [{
    id: 'submit', name: 'submitHummingTranscription', arguments: '{"notes":[]}',
  }] });
  await expect(transcribeHumming(new Blob(), new AbortController().signal)).rejects.toThrow('no_melody_detected');
});
