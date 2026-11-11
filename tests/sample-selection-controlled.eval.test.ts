// @vitest-environment happy-dom
import { it, expect, vi } from 'vitest';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { AGENT_SYSTEM_PROMPT_OPENAI as baselinePrompt } from '../src/prompts/versions/v25';
import { AGENT_SYSTEM_PROMPT_OPENAI as searchPrompt } from '../src/prompts/versions/v26';
import { rankSamples } from '../scripts/sample-annotations/keyword-search';
import type { SearchCatalog } from '../src/lib/sample-search';
import { getOpenAIToolSchemas } from '../src/agent/tools';
vi.mock('../src/lib/soundfont-loader',()=>({registerSoundfonts:vi.fn()}));
vi.mock('../src/lib/analytics',()=>({trackWavExportCompleted:vi.fn()}));
const ready=Boolean(process.env.CONTROLLED_EVAL && process.env.DEEPSEEK_API_KEY);
it.skipIf(!ready)('selects samples for 30 controlled pairs with mandatory candidate retrieval',async()=>{
  const dir='.local/sample-annotations/controlled-eval';
  mkdirSync(dir+'/inputs',{recursive:true});
  const snapshot=dir+'/inputs/catalog.json';
  if(!existsSync(snapshot)) writeFileSync(snapshot,readFileSync('public/sample-annotations/catalog.json'));
  const catalog=JSON.parse(readFileSync(snapshot,'utf8')) as SearchCatalog;
  // Match superdough's nearest-root mapping for the fixed C4 probe.
  const midi=(note:string)=>{const m=note.match(/^([A-G])([#bsf]?)(-?\d+)$/i);if(!m)throw Error('Invalid catalog root');return (Number(m[3])+1)*12+({C:0,D:2,E:4,F:5,G:7,A:9,B:11}[m[1].toUpperCase()]??0)+(['#','s'].includes(m[2])?1:['b','f'].includes(m[2])?-1:0);};
  const playbackCatalog:SearchCatalog={...catalog,samples:catalog.samples.map(sample=>{
    const roots=[...new Set(sample.variants.flatMap(v=>v.rootNote?[v.rootNote]:[]))];
    if(!roots.length)return sample;
    const root=roots.reduce((best,note)=>Math.abs(midi(note)-60)<Math.abs(midi(best)-60)?note:best);
    return {...sample,variants:sample.variants.filter(v=>v.rootNote===root)};
  })};
  const cases=JSON.parse(readFileSync('scripts/sample-annotations/controlled-cases.json','utf8')) as {id:string;prompt:string;roles:string[];template:string}[];
  const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
  const config={version:2,model:'deepseek-flash',temperature:0.7,thinking:false,repeats:3,
    catalogSha256:sha(JSON.stringify(catalog)),cases,baselinePromptSha256:sha(baselinePrompt('你是一位音乐创作助手。','NOVA')),
    searchPromptSha256:sha(searchPrompt('你是一位音乐创作助手。','NOVA')),scope:'same six libraries; GM excluded; selection-only; fixed C4 probe; gain-only loudness matching'};
  if(existsSync(dir+'/config.json'))expect(JSON.parse(readFileSync(dir+'/config.json','utf8'))).toEqual(config);
  writeFileSync(dir+'/config.json',JSON.stringify(config,null,2));
  vi.stubGlobal('m',()=>({}));
  const core=await import('@strudel/core');
  await core.evalScope(core,await import('@strudel/mini'),await import('@strudel/tonal'),await import('@strudel/webaudio'));
  const {validateCodeRuntime}=await import('../src/services/strudel');
  const searchTool=getOpenAIToolSchemas(true).find(t=>t.function.name==='searchSamples')!;
  const names=catalog.samples.map(s=>`${s.key} [${[...new Set(s.variants.map(v=>v.index))].join(',')}]`).join('\n');
  for(const item of cases)for(let repeat=0;repeat<3;repeat++)for(const condition of ['baseline','search']) {
    const file=`${dir}/${item.id}-${repeat}-${condition}.json`;
    if(existsSync(file))continue;
    const calls:unknown[]=[],retrievals:{query:unknown;candidates:ReturnType<typeof rankSamples>}[]=[];
    const permitted=new Set<string>();
    const selectTool={type:'function',function:{name:'selectSamples',description:'提交固定试听中每个声部的采样选择；不创作或修改代码。',parameters:{type:'object',properties:{selections:{type:'array',items:{type:'object',properties:{role:{type:'string',enum:item.roles},name:{type:'string'},index:{type:'integer',minimum:0},reason:{type:'string'}},required:['role','name','index','reason'],additionalProperties:false}}},required:['selections'],additionalProperties:false}}};
    const messages:Record<string,unknown>[]=[{role:'system',content:(condition==='baseline'?baselinePrompt:searchPrompt)('你是一位音乐创作助手。','NOVA')},
      {role:'user',content:`目标：为受控试听选择音色。${item.prompt}\n原则：仅选择采样，不生成代码；节奏、音高 C4、速度、增益及效果器由实验固定。\n知识：本轮两边均限定六份音频索引，GM 和合成器排除。可调用名称与有效变体编号如下（音高映射中的编号表示同一音区的变体，不是琴键）：\n${names}\n引导：声部为 ${item.roles.join(', ')}。${condition==='search'?'为每个声部调用 searchSamples 查候选，再从实际返回的候选或 alternatives 中选名称和变体。':'直接依据现有采样名称与目录知识选样。'}\n约束：最终用 selectSamples 提交所有声部的选择，禁止改动试听音乐。\n自检：名称和编号合法、声部齐全、音色贴合需求。`}];
    try {
      let saved=false;
      for(let step=0;step<16;step++) {
        const mustSearch=condition==='search'&&retrievals.length<item.roles.length;
        const tools=condition==='search'?[searchTool,selectTool]:[selectTool];
        let raw: {model:string;choices:{message:{role:string;content:string|null;tool_calls?:{id:string;function:{name:string;arguments:string}}[]}}[]};
        for(let attempt=0;attempt<4;attempt++){
          try {
            const response=await fetch('https://api.deepseek.com/chat/completions',{method:'POST',headers:{Authorization:'Bearer '+process.env.DEEPSEEK_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({model:'deepseek-flash',messages,tools,tool_choice:{type:'function',function:{name:mustSearch?'searchSamples':'selectSamples'}},temperature:0.7,thinking:{type:'disabled'},stream:false}),signal:AbortSignal.timeout(180000)});
            if(!response.ok)throw Object.assign(new Error('DeepSeek HTTP '+response.status),{status:response.status});
            raw=await response.json();break;
          }catch(error){if(attempt===3||[401,403].includes((error as {status?:number}).status??0))throw error;await new Promise(r=>setTimeout(r,1500*(attempt+1)));}
        }
        calls.push(raw);
        expect(raw.model).toMatch(/^deepseek-flash/);
        const message=raw.choices[0].message;messages.push(message);
        for(const call of message.tool_calls??[]) {
          let result:unknown;
          try {
            const args=JSON.parse(call.function.arguments);
            if(call.function.name==='searchSamples') {
              const candidates=rankSamples(playbackCatalog,args);retrievals.push({query:args,candidates});
              for(const c of candidates){permitted.add(c.name+':'+c.index);for(const a of c.alternatives)permitted.add(c.name+':'+a.index);}
              result={ok:true,data:{candidates}};
            } else {
              const selections=args.selections as {role:string;name:string;index:number;reason:string}[];
              if(!Array.isArray(selections)||selections.length!==item.roles.length||new Set(selections.map(s=>s.role)).size!==item.roles.length)throw Error('每个声部必须恰好选一次');
              if(condition==='search'&&retrievals.length<item.roles.length)throw Error('先为所有声部完成检索');
              let code=item.template;
              for(const s of selections){
                if(!item.roles.includes(s.role)||!catalog.samples.some(c=>c.key===s.name&&c.variants.some(v=>v.index===s.index)))throw Error('非法名称或变体');
                if(condition==='search'&&!permitted.has(s.name+':'+s.index))throw Error('选择必须来自检索返回候选');
                code=code.replaceAll('{{'+s.role+'}}',s.name+':'+s.index);
              }
              if(code.includes('{{'))throw Error('声部缺失');
              const validation=await validateCodeRuntime(code);if(!validation.ok)throw Error(JSON.stringify(validation));
              writeFileSync(file,JSON.stringify({case:item,repeat,condition,selections,retrievals,result:{code},validation,calls,controls:{templateSha256:sha(item.template),onlySampleSelectorsChanged:true}},null,2));
              saved=true;break;
            }
          }catch(error){result={ok:false,error:String(error)};}
          messages.push({role:'tool',tool_call_id:call.id,content:JSON.stringify(result)});
        }
        if(saved)break;
      }
      if(!saved)throw Error('Selection step limit');
      console.log('Controlled completed',item.id,repeat,condition);
    }catch(error){writeFileSync(file+'.error',JSON.stringify({error:String(error),calls,retrievals},null,2));console.error('Controlled failed',item.id,repeat,condition,String(error));if(/ENOTFOUND|HTTP (401|403)/.test(String(error)))throw error;}
  }
  vi.unstubAllGlobals();
},60*60*1000);
