import { readFile,writeFile,readdir } from 'node:fs/promises';
const dir='.local/sample-annotations/full-catalog-eval';
const read=async f=>JSON.parse(await readFile(`${dir}/${f}`,'utf8'));
const config=await read('config.json'),files=await readdir(dir),records=[];
for(const item of config.cases){
 const stem=`${item.id}-0-search`;let data;
 try{data=await read(`${stem}.json`);}catch{let error=null;try{error=(await read(`${stem}.json.error`)).error;}catch{}records.push({case:item.id,pending:!error,error});continue;}
 const selected=data.selection.resolved;
 let render=null;try{render=await read(`blind/raw/${stem}.json`);}catch{}
 const used=[...new Set((render?.sounds??[]).map(s=>`${s.bank?s.bank+'_':''}${s.s}:${s.n??0}`))];
 const chosen=new Set(selected.map(s=>`${s.name}:${s.index}`));
 const requests=[];
 for(const f of files.filter(f=>f.startsWith(stem+'.')&&f.endsWith('.response.txt'))){try{const raw=JSON.parse(await readFile(`${dir}/${f}`,'utf8'));requests.push({file:f,model:raw.model,usage:raw.usage});}catch{}}
 records.push({case:item.id,committed:data.result.committed,validation:data.validation,elapsedMs:data.elapsedMs,selection: selected.map(s=>({role:s.role,name:s.name,index:s.index,rootNote:s.rootNote,register:s.register,reason:s.reason,evidence:s.evidence})),used,unselected:used.filter(s=>!chosen.has(s)),unused:selected.filter(s=>!used.includes(`${s.name}:${s.index}`)).map(s=>s.name),render:render?{seconds:render.seconds,error:render.error}:null,requests,validationErrors:data.progress.filter(e=>e.kind==='tool_result'&&!e.ok)});
}
const usage=records.flatMap(r=>r.requests??[]).reduce((a,r)=>({input:a.input+(r.usage?.prompt_tokens??0),output:a.output+(r.usage?.completion_tokens??0)}),{input:0,output:0});
const result={completed:records.filter(r=>r.validation).length,valid:records.filter(r=>r.validation?.ok).length,rendered:records.filter(r=>r.render&&!r.render.error).length,usage,records};
await writeFile(`${dir}/audit.json`,JSON.stringify(result,null,2));
let report=`# 全量标注选样试跑\n\n完成 ${result.completed}/10；代码校验通过 ${result.valid}；新作品渲染成功 ${result.rendered}。输入 ${usage.input} Token，输出 ${usage.output} Token（含实际记录的选样与创作请求）。\n\n对照固定为上一轮 v27 各场景第一次作品；这些作品已听过。新流程还增加了独立选样阶段，因此只能作为探索性对照，不能将差异单独归因于读取全量标注。\n\n`;
for(const r of records){report+=`## ${r.case}\n\n`;if(!r.selection){report+=`${r.error??'等待生成'}\n\n`;continue;}report+=r.selection.map(s=>`- ${s.role}：\`${s.name}:${s.index}\`，标注根音 ${s.rootNote??'无'}，计划音区 ${s.register}。${s.reason}（${s.evidence}）`).join('\n')+`\n\n最终实际音源：${r.used.join('、')||'等待渲染'}。\n\n`;if(r.unselected.length)report+=`未按原选择名称/编号使用：${r.unselected.join('、')}（需结合代码判断合法回退或偏差）。\n\n`;if(r.validationErrors.length)report+=`校验失败后修复 ${r.validationErrors.length} 次。\n\n`;if(r.render?.error)report+=`渲染错误：${r.render.error}\n\n`;}
await writeFile(`${dir}/report.md`,report);console.log(JSON.stringify({completed:result.completed,valid:result.valid,rendered:result.rendered,usage}));
