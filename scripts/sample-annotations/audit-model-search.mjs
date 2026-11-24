import {readFile,writeFile} from 'node:fs/promises';
const dir='.local/sample-annotations/model-search-eval';
const read=async f=>JSON.parse(await readFile(`${dir}/${f}`,'utf8'));
const config=await read('config.json'),records=[];
for(const c of config.cases){let r;try{r=await read(`${c.id}-0-search.json`);}catch{let error;try{error=await read(`${c.id}-0-search.json.error`);}catch{}records.push({case:c.id,error,pending:!error});continue;}
 let render=null;try{render=await read(`blind/raw/${c.id}-0-search.json`);}catch{}
 const retrievals=r.retrievals??[];const allowed=new Set(retrievals.flatMap(x=>(x.candidates??[]).map(v=>`${v.name}:${v.index}`)));
 const used=[...new Set((render?.sounds??[]).map(s=>`${s.bank?s.bank+'_':''}${s.s}:${s.n??0}`))];
 const add=(a,u)=>({input:a.input+(u?.prompt_tokens??0),output:a.output+(u?.completion_tokens??0)});
 records.push({case:c.id,committed:r.result.committed,validation:r.validation,elapsedMs:r.elapsedMs,
  toolCalls:r.progress.filter(e=>e.kind==='tool_call').map(e=>e.name),retrievals,used,notInCandidates:used.filter(s=>!allowed.has(s)),
  mainContextContainsCatalog:r.calls.some(c=>JSON.stringify(c.request.messages).includes('每个 @ 行为合法采样名称和目录类别')),
  mainUsage:r.calls.reduce((a,c)=>add(a,c.response.usage),{input:0,output:0}),retrievalUsage:retrievals.reduce((a,r)=>add(a,r.usage),{input:0,output:0}),
  validationErrors:r.progress.filter(e=>e.kind==='tool_result'&&!e.ok),render:render?{seconds:render.seconds,error:render.error}:null});
}
const completed=records.filter(r=>r.validation).length,valid=records.filter(r=>r.validation?.ok).length,rendered=records.filter(r=>r.render&&!r.render.error).length;
await writeFile(`${dir}/audit.json`,JSON.stringify({completed,valid,rendered,records},null,2));
let text=`# 主 Agent 按需调用全库模型检索\n\n完成 ${completed}/10，校验通过 ${valid}，新作品渲染成功 ${rendered}。\n\n主流程保持 v27；只在实验中替换 searchSamples 的实现。每次工具请求使用独立上下文读取全库表格与该次查询，返回真实目录行映射的候选、根音、标注、播放方式和选择理由。不提前决定整首配器。主 Agent 自主采用或继续查询。主上下文不包含全库表格。\n\n历史对照是上一轮各场景第一次 v27 作品，已被听过；生成随机性及历史运行差异仍存在。这是探索性对照。产品实现不变。\n\n`;
for(const r of records){text+=`## ${r.case}\n\n`;if(!r.validation){text+=JSON.stringify(r.error??'pending')+'\n\n';continue;}text+=`工具调用：${r.toolCalls.join(' → ')}。检索请求 ${r.retrievals.length} 次。主上下文包含全库：${r.mainContextContainsCatalog}。耗时 ${(r.elapsedMs/1000).toFixed(1)} 秒。\n\n主流程输入/输出 Token：${r.mainUsage.input}/${r.mainUsage.output}；独立检索输入/输出 Token：${r.retrievalUsage.input}/${r.retrievalUsage.output}。\n\n实际触发：${r.used.join('、')||'等待渲染'}。未在候选出现的名称/编号：${r.notInCandidates.join('、')||'无'}（不自动判错，可能是允许的回退）。\n\n`;for(const [i,q]of r.retrievals.entries()){text+=`查询 ${i+1}：${JSON.stringify(q.input)}\n\n`;for(const c of q.candidates??[])text+=`- ${c.name}:${c.index}（根音 ${c.rootNote??'无'}）：${c.selectionReason}\n`;if(q.error)text+=`错误：${q.error}\n`;text+='\n';}}
await writeFile(`${dir}/report.md`,text);console.log(JSON.stringify({completed,valid,rendered,retrievalCalls:records.reduce((n,r)=>n+(r.retrievals?.length??0),0)}));
