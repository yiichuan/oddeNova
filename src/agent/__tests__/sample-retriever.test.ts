import {it,expect,vi,afterEach} from 'vitest';
import type { LLMCaller, ChatMsg } from '../loop';
vi.mock('../../services/strudel',()=>({validateCodeRuntime:vi.fn().mockResolvedValue({ok:true}),validateCodeTranspiler:vi.fn().mockReturnValue({ok:true}),normalizeCode:vi.fn((s:string)=>s)}));
const catalog={schemaVersion:1,samples:[{key:'piano',aliases:[],category:'钢琴 piano',summary:'piano',variants:[{id:'original-id',sha256:'secret-hash',index:2,rootNote:'C4',articulation:'soft',features:null,annotationStatus:'unavailable',playback:'note("C4").s("piano:2")'}]}]};
afterEach(()=>{vi.unstubAllGlobals();vi.resetModules();});
const reply=(variantId='v1')=>({content:null,toolCalls:[{id:'child',name:'returnCandidates',arguments:JSON.stringify({candidates:[{variantId,reason:'fits'}]})}],usage:{inputTokens:100,outputTokens:10}});
it('uses a new isolated conversation for each request, maps files, and counts child usage',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>catalog}));
 const {createSampleRetriever}=await import('../sample-retriever');
 const messages:ChatMsg[][]=[];const chat=vi.fn<LLMCaller['chatWithTools']>(async m=>{messages.push(m);return reply();});const onUsage=vi.fn();
 const search=createSampleRetriever({chatWithTools:chat},{onUsage});
 const first=await search({query:'soft piano'});await search({query:'dark piano',limit:3});
 expect(first[0]).toMatchObject({name:'piano',index:2,rootNote:'C4',playback:'note("C4").s("piano:2")',selectionReason:'fits'});
 expect(messages[0].slice(0,2)).toEqual(messages[1].slice(0,2));
 expect(messages[0][1].cachePrefix).toBe(true);
 expect(JSON.parse(String(messages[0][2].content)).limit).toBe(5);
 expect(JSON.parse(String(messages[1][2].content)).limit).toBe(3);
 expect(messages[0]).not.toBe(messages[1]);expect(messages.map(m=>m.length)).toEqual([3,3]);
 expect(JSON.stringify(messages[1])).not.toContain('soft piano');expect(JSON.stringify(messages)).not.toContain('secret-hash');
 expect(chat.mock.calls[0][1].map(t=>t.function.name)).toEqual(['returnCandidates']);
 expect(chat.mock.calls[0][5]).toBe(false);expect(onUsage).toHaveBeenCalledTimes(2);
});
it('returns errors for invented files instead of falling back to local ranking',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>catalog}));
 const {createSampleRetriever}=await import('../sample-retriever');
 await expect(createSampleRetriever({chatWithTools:async()=>reply('hallucinated')})({query:'piano'})).rejects.toThrow('Unknown variantId');
});
it('cancels an in-flight child call even if the caller ignores its signal',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>catalog}));
 const {createSampleRetriever}=await import('../sample-retriever');
 const controller=new AbortController();let started!:()=>void;const ready=new Promise<void>(r=>{started=r;});
 const chat:LLMCaller['chatWithTools']=async()=>{started();return new Promise(()=>{});};
 const result=createSampleRetriever({chatWithTools:chat},{signal:controller.signal})({query:'piano'});
 await ready;controller.abort();await expect(result).rejects.toMatchObject({name:'AbortError'});
});
it('returns candidates to the same main agent, which resumes without receiving the catalog',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>catalog}));
 const {createSampleRetriever}=await import('../sample-retriever');const {runAgentLoop}=await import('../loop');
 const mains:ChatMsg[][]=[];let count=0;
 const llm:LLMCaller={async chatWithTools(messages,tools){
  if(tools.some(t=>t.function.name==='returnCandidates'))return reply();
  mains.push(JSON.parse(JSON.stringify(messages)));count++;
  return {content:null,toolCalls:count===1?[{id:'lookup',name:'searchSamples',arguments:'{"query":"soft piano"}'}]:[{id:'done',name:'commit',arguments:'{"explanation":"done"}'}]};
 }};
 const result=await runAgentLoop({initialCode:'s("bd")',instruction:'scene',locale:'zh',systemPrompt:'main system',llm,sampleSearch:createSampleRetriever(llm)});
 expect(result.committed).toBe(true);expect(mains).toHaveLength(2);
 expect(JSON.stringify(mains)).not.toContain('每个 @ 行');expect(JSON.stringify(mains[1])).toContain('piano:2');
 expect(mains[1].filter(m=>m.role==='tool')).toHaveLength(1);
});
