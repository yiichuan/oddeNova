// @vitest-environment happy-dom
import { it, expect, vi } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runAgentLoop, type LLMCaller } from '../src/agent/loop';
import { AGENT_SYSTEM_PROMPT_OPENAI } from '../src/prompts/versions/v27';
import { GM_INSTRUMENTS, BUILTIN_SYNTHS } from '../src/lib/sample-allowlist';
import { getOpenAIToolSchemas } from '../src/agent/tools';
import type { SearchCatalog } from '../src/lib/sample-search';
import { serializeFullCatalog, resolveFullChoices, FULL_SELECTION_PROMPT, FULL_SELECT_TOOL, fullCompositionPrompt } from '../scripts/sample-annotations/full-catalog';
vi.mock('../src/lib/soundfont-loader',()=>({registerSoundfonts:vi.fn()}));
vi.mock('../src/lib/analytics',()=>({trackWavExportCompleted:vi.fn()}));
const ready = Boolean(process.env.FULL_CATALOG_EVAL && process.env.DEEPSEEK_API_KEY);

it.skipIf(!ready)('selects from full annotations then composes ten scene pieces',async()=>{
  const dir='.local/sample-annotations/full-catalog-eval';
  const oldDir='.local/sample-annotations/scene-eval';
  mkdirSync(`${dir}/inputs`,{recursive:true});
  const json=(file:string)=>JSON.parse(readFileSync(file,'utf8'));
  const save=(file:string,data:unknown)=>writeFileSync(file,JSON.stringify(data,null,2));
  const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
  const catalog=json(`${oldDir}/inputs/catalog.json`) as SearchCatalog;
  const {text,rows}=serializeFullCatalog(catalog);
  const cases=json('scripts/sample-annotations/scene-cases.json') as {id:string;prompt:string}[];
  const fallbackNames=new Set([...GM_INSTRUMENTS,...BUILTIN_SYNTHS].filter(n=>!catalog.samples.some(s=>s.key===n)));
  const base=AGENT_SYSTEM_PROMPT_OPENAI('你是一位音乐创作助手。','NOVA');
  const oldConfig=json(`${oldDir}/config.json`);
  expect(hash(base)).toBe(oldConfig.searchPromptSha256);
  const sources=Object.fromEntries(['scripts/sample-annotations/full-catalog.ts','tests/sample-selection-full.eval.test.ts','src/agent/loop.ts','src/agent/tools.ts','src/lib/sample-allowlist.ts','src/prompts/versions/v27.ts'].map(f=>[f,readFileSync(f,'utf8')]));
  const baselines=Object.fromEntries(cases.map(c=>[c.id,hash(readFileSync(`${oldDir}/${c.id}-0-search.json`,'utf8'))]));
  const config={version:1,model:'deepseek-flash',temperature:0.7,thinking:false,repeats:1,seconds:30,cases,
    baseline:'historical scene-eval v27 repeat 0; previously heard, exploratory comparison',baselines,
    conditions:{baseline:'historical_v27_search',search:'full_catalog_selection_then_v27_composition'},
    catalogHash:hash(JSON.stringify(catalog)),tableHash:hash(text),variantRows:Object.keys(rows).length,
    selectionPrompt:FULL_SELECTION_PROMPT,selectionTool:FULL_SELECT_TOOL,compositionTools:getOpenAIToolSchemas(true).filter(t=>t.function.name!=='searchSamples'),
    fallbackNames:[...fallbackNames],sources:Object.fromEntries(Object.entries(sources).map(([f,t])=>[f,hash(t)]))};
  if(existsSync(`${dir}/config.json`))expect(json(`${dir}/config.json`)).toEqual(config);
  save(`${dir}/config.json`,config);save(`${dir}/inputs/sources.json`,sources);
  save(`${dir}/inputs/catalog.json`,catalog);writeFileSync(`${dir}/inputs/full-catalog.txt`,text);
  save(`${dir}/inputs/cases.json`,cases);
  vi.stubGlobal('m',()=>({}));
  const core=await import('@strudel/core');
  await core.evalScope(core,await import('@strudel/mini'),await import('@strudel/tonal'),await import('@strudel/webaudio'));
  const {validateCodeRuntime}=await import('../src/services/strudel');
  const actualFetch=globalThis.fetch;
  try {
    for(const item of cases) {
      const stem=`${dir}/${item.id}-0-search`, baseline=`${dir}/${item.id}-0-baseline.json`;
      if(!existsSync(baseline))copyFileSync(`${oldDir}/${item.id}-0-search.json`,baseline);
      if(existsSync(`${stem}.json`)||existsSync(`${stem}.json.error`))continue;
      const started=Date.now();
      const selectionFile=`${stem}.selection.json`;
      const progress:unknown[]=[];
      let requestNumber=0;
      const request=async(body:Record<string,unknown>,phase:string)=>{
        const seq=++requestNumber;
        const prefix=`${stem}.${phase}-${seq}`;
        save(`${prefix}.request.json`,body);
        const t=Date.now();
        try {
          const response=await actualFetch((process.env.DEEPSEEK_BASE_URL??'https://api.deepseek.com').replace(/\/$/,'')+'/chat/completions',{
            method:'POST',headers:{Authorization:`Bearer ${process.env.DEEPSEEK_API_KEY}`,'Content-Type':'application/json'},
            body:JSON.stringify(body),signal:AbortSignal.timeout(240000),
          });
          const responseText=await response.text();
          writeFileSync(`${prefix}.response.txt`,responseText);
          save(`${prefix}.timing.json`,{elapsedMs:Date.now()-t,httpStatus:response.status});
          if(!response.ok)throw Object.assign(Error(`DeepSeek HTTP ${response.status}: ${responseText.slice(0,500)}`),{status:response.status});
          const raw=JSON.parse(responseText);
          if(!raw.model?.startsWith('deepseek-flash'))throw Error('Unexpected response model');
          return raw;
        }catch(error){save(`${prefix}.error.json`,{error:String(error),elapsedMs:Date.now()-t});throw error;}
      };
      const common={model:'deepseek-flash',temperature:0.7,thinking:{type:'disabled'},stream:false,max_tokens:8192};
      try {
        let selected;
        if(existsSync(selectionFile))selected=json(selectionFile);
        else {
          const messages:Record<string,unknown>[]=[{role:'system',content:FULL_SELECTION_PROMPT},
            {role:'user',content:`完整标注目录：\n${text}\n\n可选未标注音源（仅合法名称，不能视作已验证听感）：\n${[...fallbackNames].join(', ')}`},
            {role:'user',content:item.prompt}];
          for(let turn=0;turn<2;turn++) {
            let raw;
            for(let attempt=0;attempt<3;attempt++) {
              try {raw=await request({...common,messages,tools:[FULL_SELECT_TOOL],tool_choice:{type:'function',function:{name:'selectSamples'}}},'selection');break;}
              catch(error){const status=(error as {status?:number}).status;if(attempt===2 || (status!==undefined&&status!==429&&status<500))throw error;await new Promise(r=>setTimeout(r,1500*(attempt+1)));}
            }
            const message=raw.choices[0].message;
            const calls=message.tool_calls??[];
            try {
              if(raw.choices[0].finish_reason==='length'||calls.length!==1||calls[0].function.name!=='selectSamples')throw Error('Expected one complete selectSamples call');
              const choices=JSON.parse(calls[0].function.arguments).selections;
              const resolved=resolveFullChoices(choices,rows,fallbackNames);
              selected={choices,resolved,raw,elapsedMs:Date.now()-started};
              save(selectionFile,selected);break;
            }catch(error){
              if(turn===1||calls.length!==1)throw error;
              messages.push(message,{role:'tool',tool_call_id:calls[0].id,content:JSON.stringify({ok:false,error:String(error)})});
            }
          }
        }
        if(!selected)throw Error('No valid selection');
        console.log('Full catalog selected',item.id,selected.resolved.map((s:{name:string})=>s.name).join(', '));
        const llm:LLMCaller={async chatWithTools(messages,tools){
          const raw=await request({...common,messages,tools:tools.filter(t=>t.function.name!=='searchSamples')},'composition');
          const m=raw.choices[0].message;
          return {content:m.content,reasoning_content:m.reasoning_content,
            toolCalls:(m.tool_calls??[]).map((c:{id:string;function:{name:string;arguments:string}})=>({id:c.id,name:c.function.name,arguments:c.function.arguments})),
            usage:{inputTokens:raw.usage?.prompt_tokens??0,outputTokens:raw.usage?.completion_tokens??0}};
        }};
        const systemPrompt=fullCompositionPrompt(base,selected.resolved);
        writeFileSync(`${stem}.composition-system.txt`,systemPrompt);
        const result=await runAgentLoop({initialCode:'',instruction:item.prompt,locale:'zh',systemPrompt,llm,maxIter:30,timeoutMs:600000,enableThinking:false,onProgress:e=>progress.push(e)});
        const validation=await validateCodeRuntime(result.code);
        save(`${stem}.json`,{case:item,condition:'full_catalog',repeat:0,result,validation,progress,selection:selected,elapsedMs:Date.now()-started,listeningReview:'pending'});
        console.log('Full catalog completed',item.id,validation.ok);
      }catch(error){save(`${stem}.json.error`,{case:item,error:String(error),progress,elapsedMs:Date.now()-started});console.error('Full catalog failed',item.id,String(error));if(/HTTP (401|403)/.test(String(error)))throw error;}
    }
  }finally{vi.unstubAllGlobals();}
},60*60*1000);
