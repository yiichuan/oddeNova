// src/demo/demo-llm.ts
//
// 实现 LLMCaller 接口的"剧本 LLM"。
// 每次调用 createDemoLLMCaller 得到一个新实例（step 计数器归零）。
// chatWithTools 按两步剧本推进：
//   step 0 → 返回一个 addLayer 工具调用（让进度动画可见）
//   step 1+ → 返回 commit(targetCode)

import type { LLMCaller } from '../agent/loop';
import type { ToolCallRequest } from '../agent/executor';

export function createDemoLLMCaller(targetCode: string): LLMCaller {
  let step = 0;

  return {
    async chatWithTools(_messages, _tools) {
      // step 0：假装在思考并调用 addLayer，给用户看到进度动画
      if (step === 0) {
        step++;
        const call: ToolCallRequest = {
          id: 'demo-tool-0',
          name: 'addLayer',
          arguments: JSON.stringify({ name: 'demo', code: '-- 演示层' }),
        };
        return { content: null, toolCalls: [call] };
      }

      // step 1+：直接 commit 目标代码，结束 agent loop
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
