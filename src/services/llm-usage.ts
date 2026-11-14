import type { ChatMsg, LLMUsage } from '../agent/loop';

export function withoutCacheHints(messages: ChatMsg[]): Omit<ChatMsg,'cachePrefix'>[] {
  return messages.map(message=>{
    const copy={...message};
    delete copy.cachePrefix;
    return copy;
  });
}

export function openAIUsage(usage: {
  prompt_tokens: number; completion_tokens: number;
  prompt_tokens_details?: {cached_tokens?: number} | null;
  prompt_cache_hit_tokens?: number;
}): LLMUsage {
  return {inputTokens:usage.prompt_tokens,outputTokens:usage.completion_tokens,
    cachedInputTokens:usage.prompt_cache_hit_tokens ?? usage.prompt_tokens_details?.cached_tokens};
}

export function anthropicUsage(usage: {
  input_tokens: number; output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}): LLMUsage {
  const cached=usage.cache_read_input_tokens??undefined, created=usage.cache_creation_input_tokens??undefined;
  return {inputTokens:usage.input_tokens+(cached??0)+(created??0),outputTokens:usage.output_tokens,
    cachedInputTokens:cached,cacheCreationInputTokens:created};
}
