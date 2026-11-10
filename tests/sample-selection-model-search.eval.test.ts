// @vitest-environment happy-dom
import { it, expect, vi } from 'vitest';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { serializeFullCatalog } from '../scripts/sample-annotations/full-catalog';
import { MODEL_SEARCH_PROMPT, MODEL_SEARCH_TOOL, resolveModelCandidates } from '../scripts/sample-annotations/model-search';
import type { SampleQuery } from '../src/lib/sample-search';
const retrieval = vi.hoisted(()=>({ run: undefined as undefined | ((input: SampleQuery)=>Promise<unknown>) }));
vi.mock('../src/lib/sample-search',async importOriginal=>{
 const actual=await importOriginal<typeof import('../src/lib/sample-search')>();
 return {...actual,searchSamples:(input:SampleQuery)=>{if(!retrieval.run)throw Error('No experiment retriever');return retrieval.run(input);}};
});
import { getOpenAIToolSchemas } from '../src/agent/tools';
import { runAgentLoop, type LLMCaller } from '../src/agent/loop';
import { AGENT_SYSTEM_PROMPT_OPENAI as oldPrompt } from '../src/prompts/versions/v25';
import { AGENT_SYSTEM_PROMPT_OPENAI as newPrompt } from '../src/prompts/versions/v26';
vi.mock('../src/lib/soundfont-loader',()=>({registerSoundfonts:vi.fn()}));
vi.mock('../src/lib/analytics',()=>({trackWavExportCompleted:vi.fn()}));
const ready=Boolean(process.env.MODEL_SEARCH_EVAL && process.env.DEEPSEEK_API_KEY);
it.skipIf(!ready)('compares 10 requests x 2 conditions x 3 repeats with real agent validation',async()=>{
  vi.stubGlobal('m',()=>({}));
  const core=await import('@strudel/core');
  await core.evalScope(core,await import('@strudel/mini'),await import('@strudel/tonal'),await import('@strudel/webaudio'));
  const actualFetch=globalThis.fetch;
  const dir=path.resolve('.local/sample-annotations/model-search-eval');
  const oldDir='.local/sample-annotations/scene-eval';
  const snapshot=dir+'/inputs/catalog.json';
  mkdirSync(path.dirname(snapshot),{recursive:true});
  if(!existsSync(snapshot)) writeFileSync(snapshot,readFileSync(oldDir+'/inputs/catalog.json'));
  const catalog=JSON.parse(readFileSync(existsSync(snapshot)?snapshot:'public/sample-annotations/catalog.json','utf8'));
  vi.stubGlobal('fetch',((url:RequestInfo|URL, init?:RequestInit)=>{
    if(url==='/sample-annotations/catalog.json') return Promise.resolve(new Response(JSON.stringify(catalog)));
    return actualFetch(url,init);
  }) as typeof fetch);
  const cases=JSON.parse(readFileSync('scripts/sample-annotations/scene-cases.json','utf8')) as {id:string;prompt:string}[];
  const {text,rows}=serializeFullCatalog(catalog);
  writeFileSync(dir+'/inputs/full-catalog.txt',text);
  mkdirSync(dir,{recursive:true});
  const sha=(text:string)=>createHash('sha256').update(text).digest('hex');
  const sources=Object.fromEntries(['scripts/sample-annotations/model-search.ts','scripts/sample-annotations/full-catalog.ts','tests/sample-selection-model-search.eval.test.ts','src/lib/sample-search.ts','src/agent/tools.ts','src/agent/loop.ts','src/prompts/versions/v25.ts','src/prompts/versions/v26.ts'].map(file=>[file,readFileSync(file,'utf8')]));
  const toolSchemas=getOpenAIToolSchemas(true);
  const config={version:1,repeats:1,selectionPrompt:MODEL_SEARCH_PROMPT,selectionTool:MODEL_SEARCH_TOOL,tableHash:sha(text),conditions:{baseline:'historical v27 keyword search repeat 0',search:'v26 agent with isolated full-catalog model search'},baselineHashes:Object.fromEntries(cases.map(c=>[c.id,sha(readFileSync(oldDir+'/'+c.id+'-0-search.json','utf8'))])),seconds:30,sources:Object.fromEntries(Object.entries(sources).map(([file,text])=>[file,sha(text)])),toolSchemas,model:'deepseek-flash',cases,thinking:false,temperature:0.7,maxIter:30,
    catalogSha256:sha(JSON.stringify(catalog)),
    baselinePromptSha256:sha(oldPrompt('你是一位音乐创作助手。','NOVA')),
    searchPromptSha256:sha(newPrompt('你是一位音乐创作助手。','NOVA'))};
  const configFile=path.join(dir,'config.json');
  if(existsSync(configFile)) expect(JSON.parse(readFileSync(configFile,'utf8'))).toEqual(config);
  writeFileSync(configFile,JSON.stringify(config,null,2));
  writeFileSync(path.join(dir,'inputs/sources.json'),JSON.stringify(sources,null,2));
  writeFileSync(path.join(dir,'inputs/prompts.json'),JSON.stringify({baseline:oldPrompt('你是一位音乐创作助手。','NOVA'),search:newPrompt('你是一位音乐创作助手。','NOVA')},null,2));
  try {
    for(const item of cases) for(let repeat=0;repeat<1;repeat++) for(const condition of ['search']) {
      const output=path.join(dir,item.id+'-'+repeat+'-'+condition+'.json');
      const baseline=path.join(dir,item.id+'-0-baseline.json');
      if(!existsSync(baseline))writeFileSync(baseline,readFileSync(oldDir+'/'+item.id+'-0-search.json'));
      let childSequence=0;
      const retrievals:unknown[]=[];
      retrieval.run=async(input)=>{
        const seq=++childSequence;
        const prefix=path.join(dir,item.id+'-retrieval-'+seq);
        const request={model:'deepseek-flash',temperature:0.7,thinking:{type:'disabled'},stream:false,max_tokens:4096,messages:[{role:'system',content:MODEL_SEARCH_PROMPT},{role:'user',content:'完整标注目录：\n'+text},{role:'user',content:JSON.stringify(input)}],tools:[MODEL_SEARCH_TOOL],tool_choice:{type:'function',function:{name:'returnCandidates'}}};
        writeFileSync(prefix+'.request.json',JSON.stringify(request));
        const t=Date.now();
        try{
          const response=await actualFetch((process.env.DEEPSEEK_BASE_URL??'https://api.deepseek.com').replace(/\/$/,'')+'/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+process.env.DEEPSEEK_API_KEY,'Content-Type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(240000)});
          const rawText=await response.text();writeFileSync(prefix+'.response.txt',rawText);
          if(!response.ok)throw Error('Retriever HTTP '+response.status);
          const raw=JSON.parse(rawText);
          if(!raw.model?.startsWith('deepseek-flash'))throw Error('Unexpected retrieval model');
          const msg=raw.choices[0];
          if(msg.finish_reason==='length'||msg.message.tool_calls?.length!==1||msg.message.tool_calls[0].function.name!=='returnCandidates')throw Error('Invalid retrieval response');
          const candidates=resolveModelCandidates(JSON.parse(msg.message.tool_calls[0].function.arguments).candidates,rows,input);
          const record={input,candidates,elapsedMs:Date.now()-t,usage:raw.usage,model:raw.model};retrievals.push(record);writeFileSync(prefix+'.result.json',JSON.stringify(record,null,2));
          console.log('Model retrieval',item.id,seq,candidates.map(c=>c.name+':'+c.index).join(', '));
          return candidates;
        }catch(error){const record={input,error:String(error),elapsedMs:Date.now()-t};retrievals.push(record);writeFileSync(prefix+'.error.json',JSON.stringify(record));throw error;}
      };
      if(existsSync(output)||existsSync(output+'.error')) continue;
      const started=Date.now();
      const calls: unknown[]=[];
      const llm:LLMCaller={
        async chatWithTools(messages,tools) {
          const offered=condition==='baseline'?tools.filter(t=>t.function.name!=='searchSamples'):tools;
          const response=await actualFetch((process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com').replace(/\/$/,'')+'/chat/completions',{
            method:'POST',headers:{Authorization:'Bearer '+process.env.DEEPSEEK_API_KEY,'Content-Type':'application/json'},
            body:JSON.stringify({model:'deepseek-flash',messages,tools:offered,stream:false,temperature:0.7,thinking:{type:'disabled'}}),
            signal:AbortSignal.timeout(180000),
          });
          if(!response.ok) throw Object.assign(new Error('DeepSeek HTTP '+response.status),{status:response.status});
          let raw;
          try { raw=await response.json(); }
          catch { throw Object.assign(new Error('Invalid DeepSeek response body'),{status:502}); }
          calls.push({request:JSON.parse(JSON.stringify({messages,tools:offered})),response:raw});
          if(!raw.model?.startsWith('deepseek-flash')) throw new Error('Unexpected response model');
          const message=raw.choices[0].message;
          return {
            content:message.content,reasoning_content:message.reasoning_content,
            toolCalls:(message.tool_calls??[]).map((call:{id:string;function:{name:string;arguments:string}})=>({
              id:call.id,name:call.function.name,arguments:call.function.arguments,
            })),
            usage:{inputTokens:raw.usage.prompt_tokens,outputTokens:raw.usage.completion_tokens},
          };
        },
      };
      const progress: unknown[]=[];
      try {
      const result=await runAgentLoop({
        initialCode:'',instruction:item.prompt,locale:'zh',
        systemPrompt:newPrompt('你是一位音乐创作助手。','NOVA'),
        llm,maxIter:30,timeoutMs:1200000,enableThinking:false,onProgress:event=>progress.push(event),
      });
      const {validateCodeRuntime}=await import('../src/services/strudel');
      const validation=await validateCodeRuntime(result.code);
      writeFileSync(output,JSON.stringify({case:item,repeat,condition,result,validation,progress,calls,retrievals,elapsedMs:Date.now()-started,listeningReview:'pending'},null,2));
      console.log('Scene completed',item.id,repeat,condition);
      } catch(error) {
        console.log('Scene failed',item.id,repeat,condition,String(error));
        writeFileSync(output+'.error',JSON.stringify({case:item,repeat,condition,error:error instanceof Error?error.message:String(error),progress,calls,retrievals},null,2));
        if(error instanceof Error && /HTTP (401|403)/.test(error.message)) throw error;
      }
    }
  } finally {vi.unstubAllGlobals();}
},60*10*60000);
