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
  trialIndex?: number;
  onTurnCompleted?: (results: PromptLabResult[]) => Promise<void>;
}

export async function runPromptCase(options: RunPromptCaseOptions): Promise<PromptLabResult[]> {
  const { testCase, template, config, signal, onProgress, onTrace } = options;
  const locale = testCase.locale ?? template.locale;
  const systemPrompt = renderPromptTemplate(template, {
    personaName: config.personaName,
    personaPrompt: config.personaPrompt,
    moodContext: config.moodContext,
  });
  const baseLLM = createLLMCaller(createModelConfig({
    provider: config.provider,
    model: config.model,
    apiKey: config.apiKey,
  }));
  const history: ConversationTurn[] = structuredClone(testCase.initialHistory ?? []);
  const results: PromptLabResult[] = [];
  let code = testCase.initialCode ?? '';

  for (let index = 0; index < testCase.turns.length; index++) {
    if (signal.aborted) break;
    const instruction = testCase.turns[index];
    const trace: AgentTraceEvent[] = [];
    const turnStartedAt = Date.now();
    const inputSnapshot = { code, history: structuredClone(history) };
    const usage: NonNullable<PromptLabResult['usage']> = { inputTokens: 0, outputTokens: 0, requestCount: 0, measured: 0, completeness: 'unknown' };
    const llm: typeof baseLLM = { async chatWithTools(...args) {
      usage.requestCount++;
      try {
        const response = await baseLLM.chatWithTools(...args);
        if (response.usage) {
          usage.inputTokens += response.usage.inputTokens;
          usage.outputTokens += response.usage.outputTokens;
          usage.measured++;
        }
        return response;
      } finally {
        usage.completeness = usage.measured === usage.requestCount ? 'complete' : usage.measured ? 'partial' : 'unknown';
      }
    } };
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
      const checks: PromptLabResult['checks'] = [];
      const expected = testCase.turnChecks?.[index]?.expectedDelivery ?? 'commit';
      checks.push({ label: `交付预期：${expected}`, passed: expected === 'either' ? result.committed || !!result.explanation.trim() : expected === 'commit' ? result.committed : !result.committed && !!result.explanation.trim() });
      let validationError: string | undefined;
      if (result.committed && !signal.aborted) {
        const validation = await validateCommittedCode(result.code, locale === 'zh');
        checks.push({ label: 'Strudel 校验', passed: validation.ok });
        if (validation.ok) code = result.code;
        else validationError = validation.error ?? 'Strudel 校验失败';
      }
      const assertions = testCase.turnChecks?.[index];
      for (const fragment of assertions?.mustContain ?? []) checks.push({ label: `包含：${fragment}`, passed: result.committed && code.includes(fragment) });
      for (const fragment of assertions?.mustNotContain ?? []) checks.push({ label: `不包含：${fragment}`, passed: result.committed && !code.includes(fragment) });
      if (index === testCase.turns.length - 1) {
        for (const fragment of testCase.mustContain ?? []) checks.push({ label: `最终包含：${fragment}`, passed: result.committed && code.includes(fragment) });
        for (const fragment of testCase.mustNotContain ?? []) checks.push({ label: `最终不包含：${fragment}`, passed: result.committed && !code.includes(fragment) });
      }
      results.push({ ...result, code, instruction, trace, checks, usage, inputSnapshot, trialIndex: options.trialIndex ?? 0, turnIndex: index, durationMs: Date.now() - turnStartedAt, ...(validationError ? { error: validationError } : {}) });
      history.push(
        { role: 'user', content: instruction },
        { role: 'assistant', content: result.explanation },
      );
      if (options.onTurnCompleted) {
        try { await options.onTurnCompleted([...results]); } catch (cause) { throw new StorageFailure(cause); }
      }
      if (validationError || (expected === 'commit' && !result.committed)) break;
    } catch (error) {
      if (error instanceof StorageFailure) throw error;
      results.push({
        code, usage, inputSnapshot, trialIndex: options.trialIndex ?? 0, turnIndex: index,
        explanation: '',
        iterations: 0,
        committed: false,
        instruction,
        durationMs: Date.now() - turnStartedAt,
        trace,
        checks: [],
        error: error instanceof Error ? error.message : String(error),
      });
      if (options.onTurnCompleted) await options.onTurnCompleted([...results]);
      break;
    }
  }

  return results;
}

class StorageFailure extends Error { constructor(cause: unknown) { super(`本地保存失败：${String(cause)}`); } }
