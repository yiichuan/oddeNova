import {it,expect,vi,afterEach} from 'vitest';
import type { LLMCaller, ChatMsg } from '../loop';
vi.mock('../../services/strudel',()=>({validateCodeRuntime:vi.fn().mockResolvedValue({ok:true}),validateCodeTranspiler:vi.fn().mockReturnValue({ok:true}),normalizeCode:vi.fn((s:string)=>s)}));
const catalog={schemaVersion:1,samples:[{key:'piano',aliases:[],category:'钢琴 piano',summary:'piano',variants:[{id:'original-id',sha256:'secret-hash',index:2,rootNote:'C4',articulation:'soft',features:null,annotationStatus:'unavailable',playback:'note("C4").s("piano:2")'}]}]};
afterEach(()=>{vi.unstubAllGlobals();vi.resetModules();});
const reply=(variantId='v1')=>({content:null,toolCalls:[{id:'child',name:'returnCandidates',arguments:JSON.stringify({results:[{id:'keys',candidates:[{variantId,reason:'fits'}]}]})}],usage:{inputTokens:100,outputTokens:10}});
it('uses a new isolated conversation for each request, maps files, and counts child usage',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>catalog}));
 const {createSampleRetriever}=await import('../sample-retriever');
 const messages:ChatMsg[][]=[];const chat=vi.fn<LLMCaller['chatWithTools']>(async m=>{messages.push(m);return reply();});const onUsage=vi.fn();
 const search=createSampleRetriever({chatWithTools:chat},{onUsage});
 const first=await search({queries:[{id:'keys',query:'soft piano'}]});await search({queries:[{id:'keys',query:'dark piano',limit:2}]});
 expect(first[0]).toMatchObject({id:'keys',ok:true});
 expect(first[0].ok && first[0].candidates[0]).toMatchObject({name:'piano',index:2,rootNote:'C4',playback:'note("C4").s("piano:2")',selectionReason:'fits'});
 expect(messages[0].slice(0,2)).toEqual(messages[1].slice(0,2));
 expect(messages[0][1].cachePrefix).toBe(true);
 expect(JSON.parse(String(messages[0][2].content)).queries[0].limit).toBe(3);
 expect(JSON.parse(String(messages[1][2].content)).queries[0].limit).toBe(2);
 expect(messages[0]).not.toBe(messages[1]);expect(messages.map(m=>m.length)).toEqual([3,3]);
 expect(JSON.stringify(messages[1])).not.toContain('soft piano');expect(JSON.stringify(messages)).not.toContain('secret-hash');
 expect(chat.mock.calls[0][1].map(t=>t.function.name)).toEqual(['returnCandidates']);
 expect(chat.mock.calls[0][5]).toBe(false);expect(onUsage).toHaveBeenCalledTimes(2);
});
it('returns errors for invented files instead of falling back to local ranking',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>catalog}));
 const {createSampleRetriever}=await import('../sample-retriever');
 const results=await createSampleRetriever({chatWithTools:async()=>reply('hallucinated')})({queries:[{id:'keys',query:'piano'}]});
 expect(results).toEqual([{id:'keys',ok:false,error:'Unknown variantId: hallucinated'}]);
});
it('retrieves multiple roles in one model request with one catalog and one usage report',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>catalog}));
 const {createSampleRetriever}=await import('../sample-retriever');
 const chat=vi.fn<LLMCaller['chatWithTools']>().mockResolvedValue({
  ...reply(),toolCalls:[{id:'child',name:'returnCandidates',arguments:JSON.stringify({results:[
   {id:'drums',candidates:[]},{id:'keys',candidates:[{variantId:'v1',reason:'fits'}]},
  ]})}],
 });
 const onUsage=vi.fn();
 const results=await createSampleRetriever({chatWithTools:chat},{onUsage})({queries:[
  {id:'keys',query:'piano',category:'piano',features:{brightness:'dark'}},
  {id:'drums',query:'dry snare',category:'snare',features:{reverb:'dry'},limit:1},
 ]});
 expect(chat).toHaveBeenCalledTimes(1);expect(onUsage).toHaveBeenCalledTimes(1);
 expect(chat.mock.calls[0][0]).toHaveLength(3);
 expect(JSON.parse(String(chat.mock.calls[0][0][2].content))).toMatchObject({queries:[
  {id:'keys',limit:3,category:'piano',features:{brightness:'dark'}},
  {id:'drums',limit:1,category:'snare',features:{reverb:'dry'}},
 ]});
 expect(results).toMatchObject([{id:'keys',ok:true,candidates:[{name:'piano'}]},{id:'drums',ok:true,candidates:[]}]);
});
it('rejects malformed model responses and reports usage even on response validation failure',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>catalog}));
 const {createSampleRetriever}=await import('../sample-retriever');
 const onUsage=vi.fn();
 const malformed={...reply(),toolCalls:[{id:'child',name:'returnCandidates',arguments:'{"candidates":[]}'}]};
 await expect(createSampleRetriever({chatWithTools:async()=>malformed},{onUsage})({queries:[{id:'keys',query:'piano'}]})).rejects.toThrow('Missing results');
 expect(onUsage).toHaveBeenCalledTimes(1);
});
it('handles more than five groups and more than ten candidates per group in one model call',async()=>{
 const variants=Array.from({length:12},(_,i)=>({...catalog.samples[0].variants[0],id:String(i),index:i}));
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({...catalog,samples:[{...catalog.samples[0],variants}]})}));
 const {createSampleRetriever}=await import('../sample-retriever');
 const queries=Array.from({length:7},(_,i)=>({id:String(i),query:'piano',limit:20}));
 const candidates=variants.map((_,i)=>({variantId:`v${i+1}`,reason:'fits'}));
 const chat=vi.fn<LLMCaller['chatWithTools']>().mockResolvedValue({...reply(),toolCalls:[{
  id:'child',name:'returnCandidates',arguments:JSON.stringify({results:queries.map(q=>({id:q.id,candidates}))}),
 }]});
 const results=await createSampleRetriever({chatWithTools:chat})({queries});
 expect(chat).toHaveBeenCalledTimes(1);
 expect(results).toHaveLength(7);
 for(const result of results)expect(result.ok && result.candidates).toHaveLength(12);
 const schema=chat.mock.calls[0][1][0].function.parameters as {properties:{results:{items:{properties:{candidates:unknown}}}}};
 expect(schema.properties.results).not.toHaveProperty('maxItems');
 expect(schema.properties.results.items.properties.candidates).not.toHaveProperty('maxItems');
});
it('cancels an in-flight child call even if the caller ignores its signal',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>catalog}));
 const {createSampleRetriever}=await import('../sample-retriever');
 const controller=new AbortController();let started!:()=>void;const ready=new Promise<void>(r=>{started=r;});
 const chat:LLMCaller['chatWithTools']=async()=>{started();return new Promise(()=>{});};
 const result=createSampleRetriever({chatWithTools:chat},{signal:controller.signal})({queries:[{id:'keys',query:'piano'}]});
 await ready;controller.abort();await expect(result).rejects.toMatchObject({name:'AbortError'});
});
it('returns candidates to the same main agent, which resumes without receiving the catalog',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>catalog}));
 const {createSampleRetriever}=await import('../sample-retriever');const {runAgentLoop}=await import('../loop');
 const mains:ChatMsg[][]=[];let count=0;let retrievals=0;
 const llm:LLMCaller={async chatWithTools(messages,tools){
  if(tools.some(t=>t.function.name==='returnCandidates')){
   retrievals++;
   expect(JSON.parse(String(messages.at(-1)?.content)).queries.map((query:{id:string})=>query.id)).toEqual(['keys','drums']);
   return reply();
  }
  mains.push(JSON.parse(JSON.stringify(messages)));count++;
  return {content:null,toolCalls:count===1?[{id:'lookup',name:'searchSamples',arguments:'{"queries":[{"id":"keys","query":"soft piano"},{"id":"drums","query":"dry snare"}]}'}]:[{id:'done',name:'commit',arguments:'{"explanation":"done"}'}]};
 }};
 const result=await runAgentLoop({initialCode:'s("bd")',instruction:'scene',locale:'zh',systemPrompt:'main system',llm,sampleSearch:createSampleRetriever(llm)});
 expect(result.committed).toBe(true);expect(mains).toHaveLength(2);expect(retrievals).toBe(1);
 expect(JSON.stringify(mains)).not.toContain('每个 @ 行');expect(JSON.stringify(mains[1])).toContain('piano:2');
 expect(mains[1].filter(m=>m.role==='tool')).toHaveLength(1);
 const toolReply=mains[1].find(m=>m.role==='tool')!;
 expect(JSON.parse(String(toolReply.content))).toMatchObject({ok:true,results:[{id:'keys',ok:true},{id:'drums',ok:false}]});
});
