import type { ChatMsg, LLMCaller, LLMUsage } from './loop';
import { loadSampleCatalog } from '../lib/sample-search';
import { createSampleGuide, loadSampleOverviews } from '../lib/sample-guide';
import { MODEL_BATCH_SEARCH_TOOL, READ_SAMPLE_DETAILS_TOOL, SAMPLE_GUIDE_SEARCH_PROMPT, resolveModelSearchResults } from '../lib/sample-model-candidates';
import { parseSampleSearchInput, type SampleBatchQuery } from '../lib/sample-search-batch';

/** A fresh, tool-scoped conversation per lookup; never shares the composition history. */
export function createSampleRetriever(llm: LLMCaller, options: {
  signal?: AbortSignal;
  onUsage?: (usage: LLMUsage) => void;
  timeoutMs?: number;
} = {}) {
  let context: ReturnType<typeof createSampleGuide> | undefined;
  return async (input: SampleBatchQuery) => {
    const { queries } = parseSampleSearchInput(input);
    const signal = AbortSignal.any([options.signal ?? new AbortController().signal,
      AbortSignal.timeout(options.timeoutMs ?? 180_000)]);
    signal.throwIfAborted();
    // These loads are shared; an aborted lookup must not cancel another caller's load.
    const [catalog, overviews] = await abortable(Promise.all([loadSampleCatalog(), loadSampleOverviews()]), signal);
    signal.throwIfAborted();
    context ??= createSampleGuide(catalog, overviews);
    const lookup = context.startLookup();
    const messages: ChatMsg[] = [
      {role:'system',content:SAMPLE_GUIDE_SEARCH_PROMPT},
      {role:'user',content:context.guide,cachePrefix:true},
      {role:'user',content:JSON.stringify({ queries })},
    ];
    const tools = [READ_SAMPLE_DETAILS_TOOL, MODEL_BATCH_SEARCH_TOOL];
    while (true) {
      signal.throwIfAborted();
      const response = await abortable(llm.chatWithTools([...messages], tools, undefined, undefined, signal, false), signal);
      if (response.usage) options.onUsage?.(response.usage);
      signal.throwIfAborted();

      const calls = response.toolCalls;
      if (calls.length === 1 && calls[0].name === 'returnCandidates') {
        const args: unknown = JSON.parse(calls[0].arguments);
        if (!args || typeof args !== 'object' || !('results' in args)) throw Error('Missing results');
        return resolveModelSearchResults(args.results, lookup.allowed, queries);
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
      for (const call of calls) {
        let args: unknown;
        try { args = JSON.parse(call.arguments); } catch { args = null; }
        messages.push({
          role: 'tool', tool_call_id: call.id, name: call.name, content: lookup.read(args),
        });
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
