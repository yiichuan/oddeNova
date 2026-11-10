# coding: utf-8
import json,html,math,subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[2]
old=root/'.local/sample-annotations/scene-eval'
new=root/'.local/sample-annotations/model-search-eval'
review=new/'blind/review'
audio=review/'audio-v25';audio.mkdir(exist_ok=True)
cases=json.loads((root/'scripts/sample-annotations/scene-cases.json').read_text())
def loudness(p):
 r=subprocess.run(['ffmpeg','-nostdin','-v','info','-i',str(p),'-af','loudnorm=I=-20:TP=-1:LRA=11:print_format=json','-f','null','-'],capture_output=True,text=True,check=True)
 d=json.JSONDecoder().raw_decode(r.stderr[r.stderr.rfind('{'):])[0]
 return float(d['input_i']),float(d['input_tp'])
pairs=[]
for i,c in enumerate(cases):
 rows=[]
 for label,folder,condition in [('v25',old,'baseline'),('当前 · v27 + 工具内全库模型检索',new,'search')]:
  stem=c['id']+'-0-'+condition
  data=json.loads((folder/(stem+'.json')).read_text())
  meta=json.loads((folder/'blind/raw'/(stem+'.json')).read_text())
  wav=folder/'blind/raw'/(stem+'.wav')
  row=dict(label=label,code=data['result']['code'],error=meta.get('error'),sounds=[*dict.fromkeys(str(x.get('bank','')+'_')*bool(x.get('bank'))+str(x['s'])+':'+str(x.get('n',0)) for x in meta.get('sounds',[]))],tools=[e['name'] for e in data['progress'] if e['kind']=='tool_call'],data=dict(retrievals=data.get('retrievals',[])))
  if not row['error'] and wav.exists():
   l,p=loudness(wav)
   if not math.isfinite(l):raise ValueError('Silent audio')
   row.update(wav=wav,gain=-20-l,peak=p)
  rows.append(row)
 trim=max([0]+[r['peak']+r['gain']+1 for r in rows if 'wav' in r])
 for side,r in zip('AB',rows):
  if 'wav' in r:
   target=audio/(str(i+1).zfill(2)+'-'+side+'.wav')
   subprocess.run(['ffmpeg','-nostdin','-v','error','-y','-i',str(r['wav']),'-af','volume='+str(r['gain']-trim)+'dB','-c:a','pcm_s16le',str(target)],check=True)
   r['file']='audio-v25/'+target.name
  r.pop('wav',None)
 pairs.append(dict(id=str(i+1).zfill(2),prompt=c['prompt'],rows=rows))
 print('Prepared',c['id'],flush=True)
css='body{font-family:system-ui,"PingFang SC",sans-serif;margin:0;background:#f4efe4;color:#20221c}main{max-width:1400px;margin:auto;padding:24px}h1{font-family:"Songti SC",serif}select,button{font:inherit;padding:8px}audio{width:100%}.duo{display:grid;grid-template-columns:1fr 1fr;gap:20px}.panel{border:1px solid #b6b09f;padding:18px;min-width:0}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;background:#eae5d9;padding:14px;line-height:1.6}.hint{color:#666}.error{color:#9c3525}@media(max-width:800px){.duo{grid-template-columns:1fr}}'
payload=json.dumps(pairs,ensure_ascii=False,default=str).replace('<','\\u003c')
page='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>v25 与模型检索方案对比</title><style>'''+css+'''</style><main><h1>v25 与当前方案 · 逐组对比</h1><p>A 固定为 v25（无采样搜索），B 固定为当前 v27 主流程＋searchSamples 内独立模型读取全库标注。每场景均使用各轮第一次作品，试听前 30 秒，仅恒定增益匹配响度。</p><p class="hint">9 组可完整试听；太空场景的 v25 原作品播放失败，保留错误与代码，不替换抽样。此前 v27 对照的评分不适用于这里；此页展示方法标签，用于复盘。</p><p><a href="index.html">返回原 v27 对照页面</a></p><button id="prev">上一组</button> <select id="pick"></select> <button id="next">下一组</button><h2 id="title"></h2><p id="prompt"></p><div id="content" class="duo"></div></main><script>
const pairs=/*DATA*/;
const el=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
const pick=document.getElementById('pick'),content=document.getElementById('content');let index=0;
for(const p of pairs){const o=el('option','组 '+p.id+' · '+p.prompt);o.value=p.id;pick.append(o);}
function show(n){for(const a of content.querySelectorAll('audio'))a.pause();index=n;const p=pairs[n];pick.value=p.id;document.getElementById('title').textContent='组 '+p.id;document.getElementById('prompt').textContent=p.prompt;content.replaceChildren();
for(const [i,r] of p.rows.entries()){
const box=el('section');box.className='panel';box.append(el('h2',(i?'B':'A')+' · '+r.label));
if(r.file){const a=el('audio');a.controls=true;a.preload='none';a.src=r.file;a.onplay=()=>{for(const other of content.querySelectorAll('audio'))if(other!==a)other.pause();};box.append(a);}else{const e=el('p','原作品导出失败：'+r.error);e.className='error';box.append(e);}
box.append(el('p','实际音源：'+(r.sounds.join('、')||'未成功渲染')),el('p','工具调用：'+r.tools.join(' → ')));
const retrievals=r.data.retrievals??[];if(retrievals.length){const details=el('details');details.append(el('summary','查看 '+retrievals.length+' 次模型检索的条件与候选'));for(const q of retrievals){details.append(el('h4',q.input.query),el('pre',JSON.stringify({input:q.input,candidates:q.candidates?.map(c=>({name:c.name,index:c.index,rootNote:c.rootNote,reason:c.selectionReason})),error:q.error},null,2)));}box.append(details);}
box.append(el('h3','Strudel 代码'));const copy=el('button','复制代码');copy.onclick=async()=>{try{await navigator.clipboard.writeText(r.code);copy.textContent='已复制';}catch{copy.textContent='请选中下方代码复制';}};box.append(copy,el('pre',r.code));content.append(box);
}document.getElementById('prev').disabled=n===0;document.getElementById('next').disabled=n===pairs.length-1;}
pick.onchange=()=>show(pairs.findIndex(p=>p.id===pick.value));document.getElementById('prev').onclick=()=>show(index-1);document.getElementById('next').onclick=()=>show(index+1);show(0);
</script></html>'''.replace('/*DATA*/',payload)
(review/'v25.html').write_text(page)
# Add the comparison entry and per-side code to the existing study without changing its data or storage key.
p=review/'index.html';s=p.read_text()
if 'id="v25-comparison-link"' not in s:s=s.replace('<h1>先听，再选。</h1>','<h1>先听，再选。</h1><p id="v25-comparison-link"><a href="v25.html">查看 v25 与当前方案的对比及双方 Strudel 代码</a></p>')
key=json.loads((new/'blind/answer-key.json').read_text());code_map={}
for a in key:
 data=json.loads((new/(a['source']+'.json')).read_text());code_map.setdefault(a['pair'],{})[a['side']]=data['result']['code']
if 'const comparisonCodes=' not in s:
 s=s.replace('const pick=document.getElementById', 'const comparisonCodes='+json.dumps(code_map,ensure_ascii=False).replace('<','\\u003c')+';\nconst pick=document.getElementById',1)
 s=s.replace('box.append(audio);players.append(box);',"box.append(audio);const codeDetails=el('details');codeDetails.append(el('summary','Strudel 代码'),el('pre',comparisonCodes[pair.id][side]));box.append(codeDetails);players.append(box);")
 s=s.replace('</style>','pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:13px;line-height:1.6}</style>')
p.write_text(s)
print('Built v25 comparison and added Strudel code to existing page')
