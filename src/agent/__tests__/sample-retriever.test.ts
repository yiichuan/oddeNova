import {it,expect,vi,afterEach} from 'vitest';
import type { LLMCaller, ChatMsg } from '../loop';
vi.mock('../../services/strudel',()=>({validateCodeRuntime:vi.fn().mockResolvedValue({ok:true}),validateCodeTranspiler:vi.fn().mockReturnValue({ok:true}),normalizeCode:vi.fn((s:string)=>s)}));
const catalog={schemaVersion:1,samples:[{key:'piano',aliases:[],category:'钢琴 piano',summary:'piano',variants:[{id:'original-id',sha256:'secret-hash',index:2,rootNote:'C4',articulation:'soft',features:null,soundDescription:{text:'soft original recording',associations:['felt']},annotationStatus:'unavailable',playback:'note("C4").s("piano:2")'}]}]};
function mockCatalog(value = catalog) {
 vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
  ok:true,json:async()=>url.endsWith('/guide.json') ? {piano:'rounded attack'} : value,
 })));
}
const expand = (names = ['piano']) => ({
 content:null, toolCalls:[{id:'details', name:'readSampleDetails', arguments:JSON.stringify({names})}],
 usage:{inputTokens:50,outputTokens:5},
});
afterEach(()=>{vi.unstubAllGlobals();vi.resetModules();});
const reply=(variantId='v1')=>({content:null,toolCalls:[{id:'child',name:'returnCandidates',arguments:JSON.stringify({results:[{id:'keys',variantIds:[variantId]}]})}],usage:{inputTokens:100,outputTokens:10}});
it('uses a new isolated conversation for each request, maps files, and counts child usage',async()=>{
 mockCatalog();
 const {createSampleRetriever}=await import('../sample-retriever');
 const messages:ChatMsg[][]=[];const chat=vi.fn<LLMCaller['chatWithTools']>(async m=>{messages.push(m);return m.length===3 ? expand() : reply();});const onUsage=vi.fn();
 const search=createSampleRetriever({chatWithTools:chat},{onUsage});
 const first=await search({queries:[{id:'keys',query:'soft piano'}]});await search({queries:[{id:'keys',query:'dark piano',limit:2}]});
 expect(first[0]).toMatchObject({id:'keys',ok:true});
 expect(first[0].ok && first[0].candidates[0]).toMatchObject({name:'piano',index:2,rootNote:'C4',playback:'note("C4").s("piano:2")'});
 expect(messages[0].slice(0,2)).toEqual(messages[2].slice(0,2));
 expect(first[0].ok && first[0].candidates[0]).not.toHaveProperty('selectionReason');
 expect(messages[0][1].cachePrefix).toBe(true);
 expect(JSON.parse(String(messages[0][2].content)).queries[0].limit).toBe(3);
 expect(JSON.parse(String(messages[2][2].content)).queries[0].limit).toBe(2);
 expect(messages[0]).not.toBe(messages[2]);expect(messages.map(m=>m.length)).toEqual([3,5,3,5]);
 expect(JSON.stringify(messages[2])).not.toContain('soft piano');expect(JSON.stringify(messages)).not.toContain('secret-hash');
 expect(chat.mock.calls[0][1].map(t=>t.function.name)).toEqual(['readSampleDetails','returnCandidates']);
 expect(chat.mock.calls[0][5]).toBe(false);expect(onUsage).toHaveBeenCalledTimes(4);
 expect(messages[0][1].content).toContain('piano|rounded attack');
 expect(JSON.stringify(messages[0])).not.toContain('soft original recording');
 expect(messages[1][4]).toMatchObject({role:'tool',tool_call_id:'details'});
 expect(messages[1][4].content).toContain('soft original recording|felt');
});
it('rejects real files that were not read in this lookup',async()=>{
 mockCatalog();
 const {createSampleRetriever}=await import('../sample-retriever');
 const results=await createSampleRetriever({chatWithTools:async()=>reply('v1')})({queries:[{id:'keys',query:'piano'}]});
 expect(results).toEqual([{id:'keys',ok:false,error:'Unknown variantId: v1'}]);
});
it('links tool results and lists previously expanded names without repeating file details', async () => {
 mockCatalog();
 const {createSampleRetriever}=await import('../sample-retriever');
 const repeated = expand(['piano','unknown']);
 repeated.toolCalls[0].id = 'details-again';
 const chat = vi.fn<LLMCaller['chatWithTools']>()
  .mockResolvedValueOnce(expand()).mockResolvedValueOnce(repeated).mockResolvedValueOnce(reply());
 await createSampleRetriever({chatWithTools:chat})({queries:[{id:'keys',query:'piano'}]});
 const messages = chat.mock.calls[2][0];
 expect(messages[5].tool_calls?.[0].id).toBe('details-again');
 expect(messages[6]).toMatchObject({role:'tool',tool_call_id:'details-again'});
 expect(messages[6].content).toContain('全部已读音色：["piano"]');
 expect(messages[6].content).toContain('unknown');
 expect(messages[6].content).not.toContain('soft original recording');
});
it('shares expanded details across roles and records usage for each model request',async()=>{
 mockCatalog();
 const {createSampleRetriever}=await import('../sample-retriever');
 const chat=vi.fn<LLMCaller['chatWithTools']>().mockResolvedValueOnce(expand()).mockResolvedValue({
  ...reply(),toolCalls:[{id:'child',name:'returnCandidates',arguments:JSON.stringify({results:[
   {id:'drums',variantIds:[]},{id:'keys',variantIds:['v1']},
  ]})}],
 });
 const onUsage=vi.fn();
 const results=await createSampleRetriever({chatWithTools:chat},{onUsage})({queries:[
  {id:'keys',query:'piano',category:'piano',features:{brightness:'dark'}},
  {id:'drums',query:'dry snare',category:'snare',features:{reverb:'dry'},limit:1},
 ]});
 expect(chat).toHaveBeenCalledTimes(2);expect(onUsage).toHaveBeenCalledTimes(2);
 expect(chat.mock.calls[0][0]).toHaveLength(3);
 expect(JSON.parse(String(chat.mock.calls[0][0][2].content))).toMatchObject({queries:[
  {id:'keys',limit:3,category:'piano',features:{brightness:'dark'}},
  {id:'drums',limit:1,category:'snare',features:{reverb:'dry'}},
 ]});
 expect(results).toMatchObject([{id:'keys',ok:true,candidates:[{name:'piano'}]},{id:'drums',ok:true,candidates:[]}]);
});
it('rejects malformed model responses and reports usage even on response validation failure',async()=>{
 mockCatalog();
 const {createSampleRetriever}=await import('../sample-retriever');
 const onUsage=vi.fn();
 const malformed={...reply(),toolCalls:[{id:'child',name:'returnCandidates',arguments:'{"candidates":[]}'}]};
 await expect(createSampleRetriever({chatWithTools:async()=>malformed},{onUsage})({queries:[{id:'keys',query:'piano'}]})).rejects.toThrow('Missing results');
 expect(onUsage).toHaveBeenCalledTimes(1);
});
it('preserves large batches and candidate lists',async()=>{
 const variants=Array.from({length:12},(_,i)=>({...catalog.samples[0].variants[0],id:String(i),index:i}));
 mockCatalog({...catalog,samples:[{...catalog.samples[0],variants}]});
 const {createSampleRetriever}=await import('../sample-retriever');
 const queries=Array.from({length:7},(_,i)=>({id:String(i),query:'piano',limit:20}));
 const variantIds=variants.map((_,i)=>`v${i+1}`);
 const chat=vi.fn<LLMCaller['chatWithTools']>().mockResolvedValueOnce(expand()).mockResolvedValue({...reply(),toolCalls:[{
  id:'child',name:'returnCandidates',arguments:JSON.stringify({results:queries.map(q=>({id:q.id,variantIds}))}),
 }]});
 const results=await createSampleRetriever({chatWithTools:chat})({queries});
 expect(chat).toHaveBeenCalledTimes(2);
 expect(results).toHaveLength(7);
 for(const result of results)expect(result.ok && result.candidates).toHaveLength(12);
 const schema=chat.mock.calls[0][1][1].function.parameters as {properties:{results:{items:{properties:{variantIds:unknown}}}}};
 expect(schema.properties.results).not.toHaveProperty('maxItems');
 expect(schema.properties.results.items.properties.variantIds).not.toHaveProperty('maxItems');
});
it('cancels an in-flight child call even if the caller ignores its signal',async()=>{
 mockCatalog();
 const {createSampleRetriever}=await import('../sample-retriever');
 const controller=new AbortController();let started!:()=>void;const ready=new Promise<void>(r=>{started=r;});
 const chat:LLMCaller['chatWithTools']=async()=>{started();return new Promise(()=>{});};
 const result=createSampleRetriever({chatWithTools:chat},{signal:controller.signal})({queries:[{id:'keys',query:'piano'}]});
 await ready;controller.abort();await expect(result).rejects.toMatchObject({name:'AbortError'});
});

it('times out even when a model request never settles', async () => {
  mockCatalog();
  const { createSampleRetriever } = await import('../sample-retriever');
  const deadline = new AbortController();
  vi.spyOn(AbortSignal, 'timeout').mockReturnValueOnce(deadline.signal);
  try {
    const search = createSampleRetriever({
      chatWithTools: async () => {
        deadline.abort(new DOMException('Deadline exceeded', 'TimeoutError'));
        return new Promise(() => {});
      },
    });
    await expect(search({ queries: [{ id: 'keys', query: 'piano' }] })).rejects.toMatchObject({ name: 'TimeoutError' });
  } finally {
    vi.mocked(AbortSignal.timeout).mockRestore();
  }
});

it('returns candidates to the same main agent, which resumes without receiving the catalog',async()=>{
 mockCatalog();
 const {createSampleRetriever}=await import('../sample-retriever');const {runAgentLoop}=await import('../loop');
 const mains:ChatMsg[][]=[];let count=0;let retrievals=0;
 const llm:LLMCaller={async chatWithTools(messages,tools){
  if(tools.some(t=>t.function.name==='returnCandidates')){
   retrievals++;
   expect(JSON.parse(String(messages[2].content)).queries.map((query:{id:string})=>query.id)).toEqual(['keys','drums']);
   if (messages.length===3) return expand();
   return reply();
  }
  mains.push(JSON.parse(JSON.stringify(messages)));count++;
  return {content:null,toolCalls:count===1?[{id:'lookup',name:'searchSamples',arguments:'{"queries":[{"id":"keys","query":"soft piano"},{"id":"drums","query":"dry snare"}]}'}]:[{id:'done',name:'commit',arguments:'{"explanation":"done"}'}]};
 }};
 const result=await runAgentLoop({initialCode:'s("bd")',instruction:'scene',locale:'zh',systemPrompt:'main system',llm,sampleSearch:createSampleRetriever(llm)});
 expect(result.committed).toBe(true);expect(mains).toHaveLength(2);expect(retrievals).toBe(2);
 expect(JSON.stringify(mains)).not.toContain('rounded attack');expect(JSON.stringify(mains)).not.toContain('soft original recording');expect(JSON.stringify(mains[1])).toContain('piano:2');
 expect(mains[1].filter(m=>m.role==='tool')).toHaveLength(1);
 const toolReply=mains[1].find(m=>m.role==='tool')!;
 expect(JSON.parse(String(toolReply.content))).toMatchObject({ok:true,results:[{id:'keys',ok:true},{id:'drums',ok:false}]});
});
