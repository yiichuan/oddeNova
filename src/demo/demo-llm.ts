// src/demo/demo-llm.ts
//
// 实现 LLMCaller 接口的"剧本 LLM"。
// 每次调用 createDemoLLMCaller 得到一个新实例（step 计数器归零）。
// chatWithTools 按剧本推进：
//   step 0..N-1 → 模拟思考延迟后返回 addLayer 工具调用（content 触发 💭 气泡）
//   step N+     → 短暂延迟后返回 commit(targetCode)，结束 agent loop

import type { LLMCaller } from '../agent/loop';
import type { ToolCallRequest } from '../agent/executor';
import type { DemoStep } from './demo-config';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createDemoLLMCaller(targetCode: string, steps: DemoStep[]): LLMCaller {
  let step = 0;

  return {
    async chatWithTools(_messages, _tools) {
      // 还有 addLayer 步骤未播放 → 模拟思考后返回下一个
      if (step < steps.length) {
        const { name, code, thinking } = steps[step];
        // 首步多等一会儿，后续步骤稍短，模拟真实 LLM 响应节奏
        await sleep(step === 0 ? 2000 : 1500);
        const call: ToolCallRequest = {
          id: `demo-tool-${step}`,
          name: 'addLayer',
          arguments: JSON.stringify({ name, code }),
        };
        step++;
        return { content: thinking ?? null, toolCalls: [call] };
      }

      // 所有层已播放 → commit 最终代码，结束 agent loop
      await sleep(1000);
      step++;
      const call: ToolCallRequest = {
        id: 'demo-tool-commit',
        name: 'commit',
        arguments: JSON.stringify({ code: targetCode }),
      };
      return { content: '所有层都搭好了，准备播放。', toolCalls: [call] };
    },
  };
}

