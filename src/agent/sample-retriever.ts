import type { ChatMsg, LLMCaller, LLMUsage } from './loop';
import { loadSampleCatalog } from '../lib/sample-search';
import { createSampleGuide, loadSampleOverviews } from '../lib/sample-guide';
import { READ_SAMPLE_DETAILS_TOOL, SAMPLE_GUIDE_RESULT_TOOL, SAMPLE_GUIDE_SEARCH_PROMPT, resolveModelSearchResults } from '../lib/sample-model-candidates';
import { parseSampleSearchInput, type SampleBatchQuery } from '../lib/sample-search-batch';
import { elapsedMs, timingErrorStatus, type SampleTiming } from '../lib/sample-timing';

/** A fresh, tool-scoped conversation per lookup; never shares the composition history. */
export function createSampleRetriever(llm: LLMCaller, options: {
  signal?: AbortSignal;
  onUsage?: (usage: LLMUsage) => void;
  timeoutMs?: number;
} = {}) {
  let context: ReturnType<typeof createSampleGuide> | undefined;
  return async (input: SampleBatchQuery, timing?: SampleTiming) => {
    const { queries } = parseSampleSearchInput(input);
    const signal = AbortSignal.any([options.signal ?? new AbortController().signal,
      AbortSignal.timeout(options.timeoutMs ?? 180_000)]);
    const logOutput = import.meta.env.DEV && typeof location !== 'undefined' &&
      new URLSearchParams(location.search).get('sampleOutput') === '1';
    const started = performance.now();
    let round = 0;
    let status = 'ok';
    try {
      return await retrieve();
    } catch (error) {
      status = timingErrorStatus(error, signal);
      throw error;
    } finally {
      timing?.('retrieval_finished', {
        status, durationMs: elapsedMs(started), queryCount: queries.length, rounds: round,
      });
    }

    async function retrieve() {
      signal.throwIfAborted();
      // These loads are shared; an aborted lookup must not cancel another caller's load.
      const [catalog, overviews] = timing
        ? await timedWait('assets', () => Promise.all([
          timedWait('catalog', loadSampleCatalog),
          timedWait('guide', loadSampleOverviews),
        ]))
        : await abortable(Promise.all([loadSampleCatalog(), loadSampleOverviews()]), signal);
      signal.throwIfAborted();
      const indexStarted = performance.now();
      const reused = context !== undefined;
      context ??= createSampleGuide(catalog, overviews);
      timing?.('index', { durationMs: elapsedMs(indexStarted), reused, guideChars: context.guide.length });
      const lookup = context.startLookup();
      const messages: ChatMsg[] = [
        {role:'system',content:SAMPLE_GUIDE_SEARCH_PROMPT},
        {role:'user',content:context.guide,cachePrefix:true},
        {role:'user',content:JSON.stringify({ queries })},
      ];
      const tools = [READ_SAMPLE_DETAILS_TOOL, SAMPLE_GUIDE_RESULT_TOOL];
      while (true) {
        signal.throwIfAborted();
        round++;
        const response = await requestRound();
        if (response.usage) options.onUsage?.(response.usage);
        signal.throwIfAborted();

        const calls = response.toolCalls;
        if (calls.length === 1 && calls[0].name === 'returnCandidates') {
          const parseStarted = performance.now();
          try {
            const args: unknown = JSON.parse(calls[0].arguments);
            if (!args || typeof args !== 'object' || !('results' in args)) throw Error('Missing results');
            const results = resolveModelSearchResults(args.results, lookup.allowed, queries, 'variantIds');
            timing?.('candidates', {
              round, durationMs: elapsedMs(parseStarted), status: 'ok',
              candidateCount: results.reduce((count, result) => count + (result.ok ? result.candidates.length : 0), 0),
              failedQueries: results.filter(result => !result.ok).length,
            });
            return results;
          } catch (error) {
            timing?.('candidates', { round, durationMs: elapsedMs(parseStarted), status: 'error' });
            throw error;
          }
        }
        if (!calls.length || calls.some(call => call.name !== 'readSampleDetails')) {
          throw Error('Expected readSampleDetails calls or one returnCandidates call');
        }
        messages.push({
          role: 'assistant',
          content: response.content,
          reasoning_content: response.reasoning_content,
          thinking_blocks: response.thinking_blocks,
          tool_calls: calls.map(call => ({
            id: call.id,
            type: 'function',
            function: { name: call.name, arguments: call.arguments },
          })),
        });
        const detailsStarted = performance.now();
        let expandedNames = 0;
        let addedVariants = 0;
        let detailChars = 0;
        for (const call of calls) {
          let args: unknown;
          try { args = JSON.parse(call.arguments); } catch { args = null; }
          const details = lookup.read(args);
          messages.push({
            role: 'tool', tool_call_id: call.id, name: call.name, content: details.content,
          });
          expandedNames += details.expandedNames;
          addedVariants += details.addedVariants;
          detailChars += details.content.length;
        }
        timing?.('details', { round, durationMs: elapsedMs(detailsStarted), expandedNames, addedVariants, detailChars });
      }

      async function requestRound() {
        const requestStarted = performance.now();
        let firstOutputMs: number | undefined;
        const onFirstOutput = timing ? () => { firstOutputMs ??= elapsedMs(requestStarted); } : undefined;
        try {
          const request = llm.chatWithTools([...messages], tools, undefined, undefined, signal, false, undefined, onFirstOutput);
          const response = await abortable(request, signal);
          const calls = response.toolCalls;
          const result = calls.length === 1 && calls[0].name === 'returnCandidates' ? 'candidates'
            : calls.length && calls.every(call => call.name === 'readSampleDetails') ? 'details' : 'unexpected';
          timing?.('retrieval_request', {
            round, durationMs: elapsedMs(requestStarted), firstOutputMs, status: 'ok', result,
            toolCalls: calls.length,
            inputTokens: response.usage?.inputTokens,
            outputTokens: response.usage?.outputTokens,
            cachedInputTokens: response.usage?.cachedInputTokens,
            cacheCreationInputTokens: response.usage?.cacheCreationInputTokens,
            reasoningChars: response.reasoning_content?.length ??
              response.thinking_blocks?.reduce((count, block) => count + block.thinking.length, 0) ?? 0,
            textChars: response.content?.length ?? 0,
            toolArgumentChars: calls.reduce((count, call) => count + call.arguments.length, 0),
          });
          if (logOutput) {
            console.info(`[sample-output] ${JSON.stringify({
              round, reasoning: response.reasoning_content ?? response.thinking_blocks?.map(block => block.thinking),
              text: response.content, toolCalls: calls,
            })}`);
          }
          return response;
        } catch (error) {
          timing?.('retrieval_request', {
            round, durationMs: elapsedMs(requestStarted), firstOutputMs, status: timingErrorStatus(error, signal),
          });
          throw error;
        }
      }
    }

    async function timedWait<T>(stage: string, load: () => Promise<T>) {
      const waitStarted = performance.now();
      try {
        const value = await abortable(load(), signal);
        timing?.(stage, { durationMs: elapsedMs(waitStarted), status: 'ok' });
        return value;
      } catch (error) {
        timing?.(stage, { durationMs: elapsedMs(waitStarted), status: timingErrorStatus(error, signal) });
        throw error;
      }
    }
  };
}

function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve,reject)=>{
    const aborted=()=>reject(signal.reason ?? new DOMException('Aborted','AbortError'));
    signal.addEventListener('abort',aborted,{once:true});
    if(signal.aborted)aborted();
    promise.then(resolve,reject).finally(()=>signal.removeEventListener('abort',aborted));
  });
}
