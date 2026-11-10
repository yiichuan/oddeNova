import type { ChatMsg, LLMCaller, LLMUsage } from './loop';
import { loadSampleCatalog, type SampleQuery } from '../lib/sample-search';
import { serializeFullCatalog } from '../lib/sample-catalog-context';
import { MODEL_SEARCH_PROMPT, MODEL_SEARCH_TOOL, resolveModelCandidates } from '../lib/sample-model-candidates';

/** A fresh, tool-scoped conversation per lookup; never shares the composition history. */
export function createSampleRetriever(llm: LLMCaller, options: {
  signal?: AbortSignal;
  onUsage?: (usage: LLMUsage) => void;
  timeoutMs?: number;
} = {}) {
  let context: ReturnType<typeof serializeFullCatalog> | undefined;
  return async (input: SampleQuery) => {
    const signal = AbortSignal.any([options.signal ?? new AbortController().signal,
      AbortSignal.timeout(options.timeoutMs ?? 180_000)]);
    signal.throwIfAborted();
    // Catalog loading is shared, but an aborted caller must not cancel another run's load.
    const catalog = await abortable(loadSampleCatalog(), signal);
    signal.throwIfAborted();
    context ??= serializeFullCatalog(catalog);
    const messages: ChatMsg[] = [
      {role:'system',content:MODEL_SEARCH_PROMPT},
      {role:'user',content:`完整标注目录：\n${context.text}`,cachePrefix:true},
      {role:'user',content:JSON.stringify({...input,limit:input.limit ?? 5})},
    ];
    const response = await abortable(llm.chatWithTools(messages, [MODEL_SEARCH_TOOL], undefined, undefined, signal, false), signal);
    if (response.usage) options.onUsage?.(response.usage);
    signal.throwIfAborted();
    const call = response.toolCalls[0];
    if(response.toolCalls.length !== 1 || call.name !== 'returnCandidates') throw Error('Expected one returnCandidates call');
    const args: unknown = JSON.parse(call.arguments);
    if(!args || typeof args !== 'object' || !('candidates' in args)) throw Error('Missing candidates');
    return resolveModelCandidates(args.candidates, context.rows, input);
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
