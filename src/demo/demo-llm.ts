// src/demo/demo-llm.ts
//
// A "scripted LLM" that implements the LLMCaller interface.
// Each call to createDemoLLMCaller returns a fresh instance (round counter reset to zero).
// chatWithTools advances through the script round by round, returning thinking + a set of tool calls each round,
// until commit is triggered (the agent loop catches CommitSignal and exits).

import type { LLMCaller } from '../agent/loop';
import type { ToolCallRequest } from '../agent/executor';
import type { DemoScenario, DemoMoodScenario } from './demo-config';

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  return new Promise((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(id); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
  });
}

async function streamText(text: string, onTextDelta: (delta: string) => void, signal?: AbortSignal): Promise<void> {
  for (const char of text) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    onTextDelta(char);
    await sleep(18, signal);
  }
}

export function createDemoLLMCaller(scenario: DemoScenario): LLMCaller {
  let round = 0;

  return {
    async chatWithTools(_messages, _tools, onTextDelta, _onReasoningDelta, signal) {
      if (round < scenario.rounds.length) {
        const { thinking, toolCalls } = scenario.rounds[round];
        // Wait longer on the first round, shorter on subsequent rounds, simulating realistic LLM response pacing
        await sleep(round === 0 ? 2000 : 1500, signal);
        if (thinking && onTextDelta) await streamText(thinking, onTextDelta, signal);
        const calls: ToolCallRequest[] = toolCalls.map((tc, i) => ({
          id: `demo-tool-${round}-${i}`,
          name: tc.name,
          arguments: JSON.stringify(tc.args),
        }));
        round++;
        return { content: thinking ?? null, toolCalls: calls };
      }

      // Safety fallback: under normal conditions commit should have triggered CommitSignal on the last round
      return { content: null, toolCalls: [] };
    },
  };
}

/**
 * Scripted LLM dedicated to mood mode.
 * Advances through scenario.rounds in order, returning thinking + multiple tool calls each round,
 * fully reproducing the thought process of "sense mood → improvise → assemble → refine → commit".
 */
export function createDemoMoodLLMCaller(scenario: DemoMoodScenario): LLMCaller {
  let round = 0;

  return {
    async chatWithTools(_messages, _tools, onTextDelta, _onReasoningDelta, signal) {
      if (round < scenario.rounds.length) {
        const { thinking, toolCalls } = scenario.rounds[round];
        // Slightly longer on the first round, shorter on subsequent rounds, simulating realistic LLM thinking pacing
        await sleep(round === 0 ? 3000 : 2200, signal);
        if (thinking && onTextDelta) await streamText(thinking, onTextDelta, signal);
        const calls: ToolCallRequest[] = toolCalls.map((tc, i) => ({
          id: `demo-mood-${round}-${i}`,
          name: tc.name,
          arguments: JSON.stringify(tc.args),
        }));
        round++;
        return { content: thinking ?? null, toolCalls: calls };
      }

      // Safety fallback: under normal conditions commit should have triggered CommitSignal on the last round
      return { content: null, toolCalls: [] };
    },
  };
}

