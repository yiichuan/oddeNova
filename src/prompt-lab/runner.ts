import { validateCommittedCode } from '../agent/tools';
import type { AgentTraceEvent, ConversationTurn, ProgressEvent } from '../agent/loop';
import { runAgentWithConfig, createLLMCaller } from '../services/llm';
import { createModelConfig } from '../services/llm-config';
import { renderPromptTemplate, type PromptTemplate } from '../prompts/lab/template';
import type { PromptLabCase, PromptLabConfig, PromptLabResult } from './types';

export interface RunPromptCaseOptions {
  testCase: PromptLabCase;
  template: PromptTemplate;
  config: PromptLabConfig;
  signal: AbortSignal;
  onProgress: (event: ProgressEvent) => void;
  onTrace: (event: AgentTraceEvent) => void;
}

export async function runPromptCase(options: RunPromptCaseOptions): Promise<PromptLabResult[]> {
  const { testCase, template, config, signal, onProgress, onTrace } = options;
  const locale = testCase.locale ?? template.locale;
  const systemPrompt = renderPromptTemplate(template, {
    personaName: config.personaName,
    personaPrompt: config.personaPrompt,
    moodContext: config.moodContext,
  });
  const llm = createLLMCaller(createModelConfig({
    provider: config.provider,
    model: config.model,
    apiKey: config.apiKey,
  }));
  const history: ConversationTurn[] = [];
  const results: PromptLabResult[] = [];
  let code = testCase.initialCode ?? '';

  for (let index = 0; index < testCase.turns.length; index++) {
    if (signal.aborted) break;
    const instruction = testCase.turns[index];
    const trace: AgentTraceEvent[] = [];
    const turnStartedAt = Date.now();
    try {
      const result = await runAgentWithConfig({
        instruction,
        initialCode: code,
        locale,
        systemPrompt,
        llm,
        signal,
        conversationHistory: history,
        thinkingLevel: config.thinkingLevel,
        onProgress,
        onTrace: (event) => {
          trace.push(event);
          onTrace(event);
        },
      });
      results.push({ ...result, instruction, trace, checks: [], durationMs: Date.now() - turnStartedAt });
      if (result.code) code = result.code;
      history.push(
        { role: 'user', content: instruction },
        { role: 'assistant', content: result.explanation },
      );
    } catch (error) {
      results.push({
        code,
        explanation: '',
        iterations: 0,
        committed: false,
        instruction,
        durationMs: Date.now() - turnStartedAt,
        trace,
        checks: [],
        error: error instanceof Error ? error.message : String(error),
      });
      break;
    }
  }

  const finalResult = results.at(-1);
  if (finalResult && code) {
    const validation = await validateCommittedCode(code, locale === 'zh');
    finalResult.checks = [
      { label: locale === 'zh' ? 'Strudel 校验' : 'Strudel validation', passed: validation.ok },
      ...(testCase.mustContain ?? []).map((fragment) => ({
        label: `${locale === 'zh' ? '包含' : 'Contains'}: ${fragment}`,
        passed: code.includes(fragment),
      })),
      ...(testCase.mustNotContain ?? []).map((fragment) => ({
        label: `${locale === 'zh' ? '不包含' : 'Omits'}: ${fragment}`,
        passed: !code.includes(fragment),
      })),
    ];
    if (!validation.ok && !finalResult.error) {
      finalResult.error = validation.error ?? (locale === 'zh' ? 'Strudel 校验失败' : 'Strudel validation failed');
    }
  }
  return results;
}
