// src/demo/demo-llm.ts
//
// 实现 LLMCaller 接口的"剧本 LLM"。
// 每次调用 createDemoLLMCaller 得到一个新实例（step 计数器归零）。
// chatWithTools 按剧本推进：
//   step 0..N-1 → 逐步返回每个 addLayer 工具调用（进度动画可见）
//   step N+     → 返回 commit(targetCode)，结束 agent loop

import type { LLMCaller } from '../agent/loop';
import type { ToolCallRequest } from '../agent/executor';
import type { DemoStep } from './demo-config';

export function createDemoLLMCaller(targetCode: string, steps: DemoStep[]): LLMCaller {
  let step = 0;

  return {
    async chatWithTools(_messages, _tools) {
      // 还有 addLayer 步骤未播放 → 返回下一个
      if (step < steps.length) {
        const { name, code } = steps[step];
        const call: ToolCallRequest = {
          id: `demo-tool-${step}`,
          name: 'addLayer',
          arguments: JSON.stringify({ name, code }),
        };
        step++;
        return { content: null, toolCalls: [call] };
      }

      // 所有层已播放 → commit 最终代码，结束 agent loop
      step++;
      const call: ToolCallRequest = {
        id: 'demo-tool-commit',
        name: 'commit',
        arguments: JSON.stringify({ code: targetCode }),
      };
      return { content: null, toolCalls: [call] };
    },
  };
}
