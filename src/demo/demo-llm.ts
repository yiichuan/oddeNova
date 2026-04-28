// src/demo/demo-llm.ts
//
// 实现 LLMCaller 接口的"剧本 LLM"。
// 每次调用 createDemoLLMCaller 得到一个新实例（round 计数器归零）。
// chatWithTools 按剧本逐轮推进，每轮返回 thinking + 一组工具调用，
// 直到 commit 被触发（由 agent loop 捕获 CommitSignal 结束）。

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
    async chatWithTools(_messages, _tools, onTextDelta, signal) {
      if (round < scenario.rounds.length) {
        const { thinking, toolCalls } = scenario.rounds[round];
        // 首轮多等一会儿，后续轮次稍短，模拟真实 LLM 响应节奏
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

      // 安全兜底：正常情况下 commit 在最后一轮已触发 CommitSignal
      return { content: null, toolCalls: [] };
    },
  };
}

/**
 * 心情模式专用剧本 LLM。
 * 按 scenario.rounds 依次推进，每轮返回 thinking + 多个工具调用，
 * 完整还原「感知心情 → 即兴生成 → 装配 → 修正 → 提交」的思考过程。
 */
export function createDemoMoodLLMCaller(scenario: DemoMoodScenario): LLMCaller {
  let round = 0;

  return {
    async chatWithTools(_messages, _tools, onTextDelta, signal) {
      if (round < scenario.rounds.length) {
        const { thinking, toolCalls } = scenario.rounds[round];
        // 首轮稍长，后续轮次稍短，模拟真实 LLM 思考节奏
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

      // 安全兜底：正常情况下 commit 在最后一轮已经触发 CommitSignal
      return { content: null, toolCalls: [] };
    },
  };
}

