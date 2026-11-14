import {it,expect} from 'vitest';
import {openAIUsage,anthropicUsage,withoutCacheHints} from '../llm-usage';
it('records automatic OpenAI and DeepSeek cache reads without double-counting total input',()=>{
 expect(openAIUsage({prompt_tokens:100,completion_tokens:2,prompt_cache_hit_tokens:80})).toEqual({inputTokens:100,outputTokens:2,cachedInputTokens:80});
 expect(openAIUsage({prompt_tokens:100,completion_tokens:2,prompt_tokens_details:{cached_tokens:70}}).cachedInputTokens).toBe(70);
});
it('includes Anthropic cache writes and reads in total context occupancy',()=>{
 expect(anthropicUsage({input_tokens:10,output_tokens:2,cache_read_input_tokens:90,cache_creation_input_tokens:20})).toEqual({inputTokens:120,outputTokens:2,cachedInputTokens:90,cacheCreationInputTokens:20});
});
it('does not leak internal cache hints to OpenAI or mutate the reusable prefix',()=>{
 const message={role:'user' as const,content:'catalog',cachePrefix:true};
 expect(withoutCacheHints([message])).toEqual([{role:'user',content:'catalog'}]);expect(message.cachePrefix).toBe(true);
});
