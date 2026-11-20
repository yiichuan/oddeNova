import {readFile,writeFile,access,copyFile} from 'node:fs/promises';
const dir='.local/sample-annotations/full-catalog-eval';
const read=async f=>JSON.parse(await readFile(`${dir}/${f}`,'utf8'));
const key=await read('blind/answer-key.json'),manifest=await read('blind/blind-manifest.json');
const labels={baseline:'上一轮 v27 · searchSamples 搜索选样',search:'本轮 · 全量标注选样后创作'};
const payload={};
for(const pair of manifest){payload[pair.id]={};for(const side of ['A','B']){
 const mapping=key.find(k=>k.pair===pair.id&&k.side===side);if(!mapping)throw Error('Missing mapping');
 const record=await read(mapping.source+'.json'),render=await read(`blind/raw/${mapping.source}.json`);
 const sounds=[...new Set(render.sounds.map(s=>`${s.bank?s.bank+'_':''}${s.s}:${s.n??0}`))];
 const searches=[],seen=new Set();const calls=new Map();
 for(const c of record.calls??[])for(const t of c.response.choices[0].message.tool_calls??[])if(t.function.name==='searchSamples')calls.set(t.id,JSON.parse(t.function.arguments));
 for(const c of record.calls??[])for(const m of c.request.messages)if(m.name==='searchSamples'&&!seen.has(m.tool_call_id)){seen.add(m.tool_call_id);const r=JSON.parse(m.content);searches.push({query:calls.get(m.tool_call_id),candidates:(r.candidates??[]).map(v=>({name:v.name,index:v.index,category:v.category,alternatives:v.alternatives.map(a=>a.index)}))});}
 payload[pair.id][side]={method:labels[mapping.condition],condition:mapping.condition,sounds,selections:record.selection?.resolved??[],searches,code:record.result.code,tools:record.progress.filter(e=>e.kind==='tool_call').map(e=>e.name),errors:record.progress.filter(e=>e.kind==='tool_result'&&!e.ok)};
}}
const file=`${dir}/blind/review/index.html`,backup=`${dir}/blind/index-before-reveal.html`;
try{await access(backup);}catch{await copyFile(file,backup);}
let page=await readFile(backup,'utf8');
const injected=`
const reviewDetails=${JSON.stringify(payload).replaceAll('<','\\u003c')};
const ratingLabel=(value,pair)=>value==='A'||value==='B'?value+' · '+reviewDetails[pair][value].method:value==='tie'?'平局':value==='unknown'?'无法判断':'未评分';
function refreshResults(){
 let summary=document.getElementById('result-summary');
 if(!summary){summary=el('div');summary.id='result-summary';document.getElementById('coverage').after(summary);}
 const fields=[['scene','场景贴合度'],['timbre','乐器与音色'],['overall','个人偏好']];summary.replaceChildren();
 for(const [field,title] of fields){const n={baseline:0,search:0,tie:0,unknown:0,missing:0};for(const p of data.pairs){const v=state[p.id]?.[field];if(v==='A'||v==='B')n[reviewDetails[p.id][v].condition]++;else if(v==='tie'||v==='unknown')n[v]++;else n.missing++;}summary.append(el('p',title+'：全量选样胜 '+n.search+'，旧搜索胜 '+n.baseline+'，平局 '+n.tie+'，无法判断 '+n.unknown+'，未评分 '+n.missing));}
 const result=document.getElementById('pair-original-result');if(result){result.replaceChildren();const pair=data.pairs[index];for(const [field,title] of fields)result.append(el('p',title+'：'+ratingLabel(state[pair.id]?.[field],pair.id)));}
}
function addReviewDetails(pair){
 const result=el('div');result.id='pair-original-result';panel.append(el('h3','本组评分结果'),result);
 for(const side of ['A','B']){
  const info=reviewDetails[pair.id][side],section=el('section');section.className='process-detail';
  section.append(el('h3','作品 '+side+' · '+info.method),el('p','30 秒试听中实际触发：'+info.sounds.join('、')));
  section.append(el('p','工具调用：'+info.tools.join(' → ')));
  if(info.selections.length){section.append(el('h4','全量目录选样方案'));
   for(const s of info.selections){const card=el('div');card.className='choice-card';const used=info.sounds.includes(s.name+':'+s.index);card.append(el('strong',s.role+' → '+s.name+':'+s.index),el('p','计划音区：'+s.register+'；参考标注根音：'+(s.rootNote??'无')+'；'+(used?'该名称/编号在试听中触发':'该名称/编号在前 30 秒未触发，可能被省略、改写或安排在后段')),el('p',s.reason),el('p',s.evidence==='catalog'?'依据：目录及文件级标注':'依据：未标注音源回退'));
   const feature=el('details');feature.append(el('summary','标注与播放方式'));const pre=el('pre',JSON.stringify({category:s.category,features:s.features,playback:s.playback},null,2));feature.append(pre);card.append(feature);section.append(card);}
   const selected=new Set(info.selections.map(s=>s.name+':'+s.index)),extra=info.sounds.filter(s=>!selected.has(s));if(extra.length)section.append(el('p','与选样方案名称/编号不一致的实际音源：'+extra.join('、')));
  }
  if(info.searches.length){section.append(el('h4','旧方案的实际搜索过程'));for(const [i,s] of info.searches.entries()){const box=el('details');box.append(el('summary','查询 '+(i+1)+'：'+(s.query?.query??'')));box.append(el('pre',JSON.stringify(s,null,2)));section.append(box);}}
  if(info.errors.length){const box=el('details');box.append(el('summary','校验失败记录（'+info.errors.length+' 次）'),el('pre',JSON.stringify(info.errors,null,2)));section.append(box);}
  const code=el('details');code.append(el('summary','最终代码'),el('pre',info.code));section.append(code);panel.append(section);
 }
 refreshResults();
}
`;
page=page.replace("const pick=document.getElementById('pick');",injected+"\nconst pick=document.getElementById('pick');");
page=page.replace("box.append(el('h3','作品 '+side));","box.append(el('h3','作品 '+side),el('p',reviewDetails[pair.id][side].method));");
page=page.replace("if(data.pairs.length)show(0);", "if(data.pairs.length)show(0);");
page=page.replace("document.getElementById('prev').disabled=index===0;", "addReviewDetails(pair);\n document.getElementById('prev').disabled=index===0;");
page=page.replace("function save(){", "function save(){\n refreshResults();");
page=page.replace('<h1>先听，再选。</h1>','<h1>全量选样 · 逐组复盘</h1><p>已揭晓 A/B 方法。下方统计读取本浏览器已有评分；每组展示选样方案、实际触发音色及调用过程。刷新保留评分，揭晓后调整评分属于复盘评价。</p>');
page=page.replace('schemaVersion:1,studyId:',"schemaVersion:1,reviewMode:'revealed',studyId:").replace("a.download='oddenova-full-catalog-ratings.json'","a.download='oddenova-full-catalog-review-ratings.json'");
page=page.replace('</style>','pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px}.process-detail{margin:24px 0;padding-top:16px;border-top:1px solid #b6b09f}.choice-card{padding:12px;margin:10px 0;border:1px solid #b6b09f}.choice-card p{margin:8px 0}details{margin:12px 0}</style>');
await writeFile(`${dir}/review-details.json`,JSON.stringify(payload,null,2));await writeFile(file,page);console.log('Revealed details for '+manifest.length+' pairs; existing browser storage unchanged.');
