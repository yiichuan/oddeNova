import { HUMMING_WAVEFORM_TOOL, hummingWaveformTool, parseHummingToolResult } from '../../shared/humming-waveform-tool';
import type { ChatMsg } from '../agent/loop';
import type { HummingMelodyResult, HummingModelRhythm } from '../types/humming';
import { measureHummingRecording } from './humming-measurement';
import { getActiveLLMCaller } from './llm';
import { getActiveModelConfig } from './llm-config';

const readWaveform = {
  type: 'function' as const,
  function: {
    name: HUMMING_WAVEFORM_TOOL,
    description: 'Measure the current recording and return the pitch and energy of each audio frame.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  },
};
const submitTranscription = {
  ...hummingWaveformTool,
  function: { ...hummingWaveformTool.function, name: 'submitHummingTranscription' },
};

export async function transcribeHumming(
  recording: Blob,
  signal: AbortSignal,
  onWaveformToolCall?: () => void,
): Promise<{ result: HummingMelodyResult; modelRhythm: HummingModelRhythm; modelVersion: string }> {
  const modelVersion = getActiveModelConfig().model;
  const llm = getActiveLLMCaller();
  const messages: ChatMsg[] = [{
    role: 'system',
    content: 'Transcribe solo humming from frame measurements. Read the recording using analyzeHummingWaveform, then submit the estimated notes using submitHummingTranscription. First call only the read tool. After reading, call only the submit tool. Keep notes in chronological, non-overlapping order, with timestamps from the start of the recording. Use fractional MIDI for interpreting the contour and whole MIDI pitches for the notes. Preserve separate attacks even when the pitch repeats. Treat a continuous slide or vibrato as one note unless there is evidence of a new attack. Energy dips and renewed high-frequency energy can mark reattacks. Leave silence and breaths out. Return empty notes when there is no clear melody and leave BPM or meter null when unsupported.',
  }, { role: 'user', content: 'Transcribe this humming recording.' }];

  const request = await llm.chatWithTools(messages, [readWaveform], undefined, undefined, signal, false);
  const [call] = request.toolCalls;
  if (request.toolCalls.length !== 1 || call.name !== HUMMING_WAVEFORM_TOOL) throw new Error('invalid_result');

  signal.throwIfAborted();
  onWaveformToolCall?.();
  const { csv, durationSeconds } = await measureHummingRecording(recording, signal);
  messages.push({
    role: 'assistant',
    content: request.content,
    reasoning_content: request.reasoning_content,
    thinking_blocks: request.thinking_blocks,
    tool_calls: [{ id: call.id, type: 'function', function: { name: call.name, arguments: call.arguments } }],
  }, {
    role: 'tool',
    name: call.name,
    tool_call_id: call.id,
    content: `Recording duration: ${durationSeconds} s. CSV columns: time in milliseconds, fractional MIDI pitch (blank if unvoiced), level dB, high-frequency energy dB. Convert milliseconds to seconds for the submitted notes.\n${csv}`,
  });

  const response = await llm.chatWithTools(messages, [submitTranscription], undefined, undefined, signal, false);
  const [submission] = response.toolCalls;
  if (response.toolCalls.length !== 1 || submission.name !== submitTranscription.function.name) {
    throw new Error('invalid_result');
  }

  let output: unknown;
  try {
    output = JSON.parse(submission.arguments);
  } catch {
    throw new Error('invalid_result');
  }
  const report = parseHummingToolResult(output, durationSeconds);
  if (!report) throw new Error('invalid_result');
  const first = report.notes[0];
  if (!first) throw new Error('no_melody_detected');

  return {
    result: {
      trimStartSeconds: first.startSeconds,
      melodyDurationSeconds: report.notes.at(-1)!.endSeconds - first.startSeconds,
      notes: report.notes.map(({ endSeconds, ...note }) => ({
        ...note,
        startSeconds: note.startSeconds - first.startSeconds,
        durationSeconds: endSeconds - note.startSeconds,
      })),
      warnings: report.notes.some(note => note.uncertain) ? ['ambiguous_melody'] : [],
    },
    modelRhythm: { bpm: report.bpm, timeSignature: report.timeSignature },
    modelVersion,
  };
}
