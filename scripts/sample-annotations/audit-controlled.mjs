import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const dir=path.resolve('.local/sample-annotations/controlled-eval');
const config=JSON.parse(await readFile(path.join(dir,'config.json'),'utf8'));
const catalog=JSON.parse(await readFile(path.join(dir,'inputs/catalog.json'),'utf8'));
const midi=note=>{const m=note.match(/^([A-G])([#bsf]?)(-?\d+)$/i);if(!m)throw Error('Invalid root note');return (Number(m[3])+1)*12+({C:0,D:2,E:4,F:5,G:7,A:9,B:11}[m[1].toUpperCase()])+({'':0,'#':1,s:1,b:-1,f:-1}[m[2]]);};
const records=[];
const failures=[];
for(const item of config.cases)for(let repeat=0;repeat<3;repeat++)for(const condition of ['baseline','search']) {
  const id=`${item.id}-${repeat}-${condition}`;
  let data;
  try{data=JSON.parse(await readFile(path.join(dir,id+'.json'),'utf8'));}catch{continue;}
  const problems=[];
  let expected=item.template;
  for(const s of data.selections)expected=expected.replaceAll('{{'+s.role+'}}',s.name+':'+s.index);
  if(expected!==data.result.code||expected.includes('{{'))problems.push('template mismatch');
  for(const choice of data.selections){
    const sample=catalog.samples.find(s=>s.key===choice.name);
    if(!sample){problems.push('sample missing');continue;}
    const roots=[...new Set(sample.variants.flatMap(v=>v.rootNote?[v.rootNote]:[]))];
    const root=roots.length?roots.reduce((best,note)=>Math.abs(midi(note)-60)<Math.abs(midi(best)-60)?note:best):null;
    if(!sample.variants.some(v=>v.rootNote===root&&v.index===choice.index))problems.push('variant not available at C4');
  }
  if(!data.validation.ok)problems.push('validation failed');
  const candidates=new Set(data.retrievals.flatMap(r=>r.candidates.flatMap(c=>[c.name+':'+c.index,...c.alternatives.map(a=>c.name+':'+a.index)])));
  if(condition==='search'&&(data.retrievals.length<item.roles.length||data.selections.some(s=>!candidates.has(s.name+':'+s.index))))problems.push('retrieval not used');
  if(condition==='baseline'&&data.retrievals.length)problems.push('baseline retrieved');
  if(data.calls.some(c=>!c.model.startsWith('deepseek-flash')))problems.push('unexpected model');
  if(problems.length)failures.push({id,problems});
  records.push({id,case:item.id,repeat,condition,searchCalls:data.retrievals.length,selections:data.selections,
    codeSha256:createHash('sha256').update(data.result.code).digest('hex'),
    usage:data.calls.reduce((a,c)=>({input:a.input+(c.usage?.prompt_tokens??0),output:a.output+(c.usage?.completion_tokens??0)}),{input:0,output:0})});
}
const pairs=[];
for(const item of config.cases)for(let repeat=0;repeat<3;repeat++){
 const a=records.find(r=>r.case===item.id&&r.repeat===repeat&&r.condition==='baseline');
 const b=records.find(r=>r.case===item.id&&r.repeat===repeat&&r.condition==='search');
 if(a&&b)pairs.push({case:item.id,repeat,identical:a.codeSha256===b.codeSha256});
}
const files=await readdir(dir);
const pendingErrors=files.filter(f=>f.endsWith('.json.error')&&!files.includes(f.slice(0,-6)));
const result={completed:records.length,total:60,completePairs:pairs.length,identicalPairs:pairs.filter(p=>p.identical).length,failures,pendingErrors,pairs,records};
await writeFile(path.join(dir,'audit.json'),JSON.stringify(result,null,2));
await writeFile(path.join(dir,'progress.md'),`# 受控选样实验进度\n\n已完成 ${records.length}/60 次选样，${pairs.length}/30 组完整配对。\n\n实验组已完成 ${records.filter(r=>r.condition==='search').length} 次，全部要求检索并从返回候选选样。\n\n控制检查失败：${failures.length}；尚待补跑错误：${pendingErrors.length}；相同选样配对：${result.identicalPairs}。\n\n更新：${new Date().toISOString()}\n`);
console.log(JSON.stringify({completed:result.completed,pairs:result.completePairs,identical:result.identicalPairs,failures,pendingErrors}));
if(failures.length)process.exitCode=1;
