import os,hashlib,hmac,html,json,math,re,secrets,shutil,subprocess,zipfile
from pathlib import Path
root=Path(__file__).resolve().parents[2]
source=root/os.environ.get('EVAL_DIR','.local/sample-annotations/deepseek-eval')
folder=source/'blind'
review=folder/'review'
(review/'audio').mkdir(parents=True,exist_ok=True)
cases=json.loads((root/os.environ.get('EVAL_CASES','scripts/sample-annotations/eval-cases.json')).read_text())
keyfile=folder/'shuffle-key.txt'
if not keyfile.exists():keyfile.write_text(secrets.token_hex(32))
key=bytes.fromhex(keyfile.read_text().strip())
def loudness(file):
 proc=subprocess.run(['ffmpeg','-nostdin','-v','info','-i',str(file),'-af','loudnorm=I=-20:TP=-1:LRA=11:print_format=json','-f','null','-'],capture_output=True,text=True,check=True)
 data=json.JSONDecoder().raw_decode(proc.stderr[proc.stderr.rfind('{'):])[0]
 i,p=float(data['input_i']),float(data['input_tp'])
 if not math.isfinite(i) or not math.isfinite(p):raise ValueError('Silent audio')
 return i,p
repeats=int(os.environ.get("EVAL_REPEATS","3"))
pairs=[];answers=[];unavailable=[]
for n,item in enumerate(cases):
 for repeat in range(repeats):
  number=n*repeats+repeat+1
  pairid=str(number).zfill(2)
  rows=[]
  for condition in ['baseline','search']:
   id=item['id']+'-'+str(repeat)+'-'+condition
   meta=folder/'raw'/(id+'.json')
   if not meta.exists():
    unavailable.append({'pair':pairid,'reason':'等待创作或渲染完成'})
    break
   info=json.loads(meta.read_text())
   if info.get('error') or not (folder/'raw'/(id+'.wav')).exists():
    unavailable.append({'pair':pairid,'reason':'至少一边渲染失败','detail':info.get('error')})
    break
   i,p=loudness(folder/'raw'/(id+'.wav'))
   rows.append({'id':id,'condition':condition,'i':i,'p':p,'gain':-20-i,'meta':info})
  if len(rows)!=2:continue
  trim=max(0,max(row['p']+row['gain'] for row in rows)+1)
  if hmac.new(key,pairid.encode(),hashlib.sha256).digest()[0]%2:rows.reverse()
  clips={}
  for side,row in zip('AB',rows):
   output=review/'audio'/(pairid+'-'+side+'.wav')
   subprocess.run(['ffmpeg','-nostdin','-v','error','-y','-i',str(folder/'raw'/(row['id']+'.wav')),
    '-af','volume='+str(row['gain']-trim)+'dB','-c:a','pcm_s16le',str(output)],check=True)
   clips[side]={'file':'audio/'+output.name,'seconds':row['meta']['seconds'],'sha256':hashlib.sha256(output.read_bytes()).hexdigest()}
   answers.append({'pair':pairid,'side':side,'condition':row['condition'],'source':row['id'],
    'gainDb':row['gain']-trim,'inputLufs':row['i'],'outputPeakDb':row['p']+row['gain']-trim})
  pairs.append({'id':pairid,'prompt':item['prompt'],'repeat':repeat+1,'clips':clips})
payload=json.dumps({'studyId':hashlib.sha256(key).hexdigest()[:16],'pairs':pairs,'unavailable':[{'pair':x['pair'],'reason':x['reason']} for x in unavailable]},ensure_ascii=False).replace('<','\\u003c')
template=(root/'scripts/drum-timbre-review/index.html')
# The standalone renderer reuses the project's established review colors and layout.
if template.exists():css=template.read_text().split('<style>')[1].split('</style>')[0]
else:css='body{font-family:"PingFang SC",sans-serif;background:#f4efe4;color:#20221c;margin:0}.wrap{max-width:1040px;margin:auto;padding:24px}.duo{display:grid;grid-template-columns:1fr 1fr;gap:20px}.player{padding:18px;border:1px solid #b6b09f}button,select,textarea{font:inherit;padding:8px}h1{font-family:"Songti SC",serif;font-size:48px}.tools,.controls{display:flex;gap:12px;flex-wrap:wrap;margin:16px 0}.mark{padding:16px;background:#e5edb6}.hint{color:#54564a}.panel{padding:20px;border:1px solid #b6b09f}button[aria-pressed=true]{background:#34451e;color:white}button{cursor:pointer}'
page='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>作品盲听 · oddeNova</title><style>'''+css+'''
audio{width:100%}textarea{width:100%;box-sizing:border-box}fieldset{border:0;padding:0;margin:20px 0}legend{font-weight:600}button:focus-visible,select:focus-visible{outline:3px solid #657e2d;outline-offset:3px}@media(max-width:600px){.duo{grid-template-columns:1fr}}
</style><header><div class="wrap"><p>oddeNova / BLIND LISTENING</p><h1>先听，再选。</h1><p id="coverage"></p><p class="hint">同一请求、同一轮次配对。每组 A/B 顺序独立打乱，已做成对响度匹配。代码保持原样，试听前 8 小节；Funk 鼓组试听前 16 小节，各保留 2 秒尾音。作品整体也会因生成随机性而不同。</p><p class="hint">评分暂存在当前浏览器，请导出 JSON 留存或交回。请先用较低的系统音量试听。</p><button id="export">导出我的评分</button></div></header><main class="wrap"><div class="tools"><button id="prev">上一组</button><label>盲听组 <select id="pick"></select></label><button id="next">下一组</button><span id="progress" aria-live="polite"></span></div><section id="review" class="panel"></section><p id="status" role="status"></p><details><summary>未纳入本页的组</summary><p id="excluded"></p></details></main><script>
const data=/*DATA*/;
const pick=document.getElementById('pick');
const panel=document.getElementById('review');
const storageKey='oddenova-sample-selection-blind-v1:'+data.studyId;
let state={};
let persistent=true;
try{state=JSON.parse(localStorage.getItem(storageKey)||'{}');}catch{persistent=false;}
let index=0;
const el=(tag,text)=>{const n=document.createElement(tag);if(text)n.textContent=text;return n;};
for(const p of data.pairs){const o=el('option','组 '+p.id);o.value=p.id;pick.append(o);}
document.getElementById('coverage').textContent='当前可听 '+data.pairs.length+' / 30 组，每组两段完整配对。';
document.getElementById('excluded').textContent=data.unavailable.map(p=>'组 '+p.pair+' · '+p.reason).join('；')||'全部配对已纳入。';
function save(){
 try{localStorage.setItem(storageKey,JSON.stringify(state));}catch{persistent=false;}
 document.getElementById('status').textContent=persistent?'已保存在当前浏览器，请导出评分留存。':'浏览器无法保存，请及时导出评分。';
 document.getElementById('progress').textContent=Object.values(state).filter(r=>r.timbre||r.overall).length+' 组已评分';
}
function show(next){
 for(const a of panel.querySelectorAll('audio'))a.pause();
 index=next;panel.replaceChildren();
 const pair=data.pairs[index];pick.value=pair.id;
 panel.append(el('h2','盲听组 '+pair.id),el('p',pair.prompt));
 const players=el('div');players.className='duo';
 for(const side of ['A','B']){
  const box=el('div');box.className='player';box.append(el('h3','作品 '+side));
  const audio=el('audio');audio.controls=true;audio.preload='none';audio.src=pair.clips[side].file;
  audio.addEventListener('play',()=>{for(const other of panel.querySelectorAll('audio'))if(other!==audio)other.pause();});
  box.append(audio);players.append(box);
 }
 panel.append(players);
 function choices(field,label){
  const f=el('fieldset');f.append(el('legend',label));const controls=el('div');controls.className='controls';
  for(const [value,text] of [['A','A 更好'],['B','B 更好'],['tie','差不多'],['neither','两者都不贴合']]){
   const b=el('button',text);b.type='button';b.setAttribute('aria-pressed',String(state[pair.id]?.[field]===value));
   b.onclick=()=>{state[pair.id]={...state[pair.id],[field]:value};for(const n of controls.children)n.setAttribute('aria-pressed',String(n===b));save();};
   controls.append(b);
  }
  f.append(controls);panel.append(f);
 }
 choices('timbre','哪段音色更符合请求？');choices('overall','哪段整体更喜欢？');
 const label=el('label','备注');const note=el('textarea');note.rows=3;note.maxLength=2000;note.value=state[pair.id]?.note||'';
 note.oninput=()=>{state[pair.id]={...state[pair.id],note:note.value};save();};label.append(note);panel.append(label);
 document.getElementById('prev').disabled=index===0;document.getElementById('next').disabled=index===data.pairs.length-1;
}
pick.onchange=()=>show(data.pairs.findIndex(p=>p.id===pick.value));
document.getElementById('prev').onclick=()=>show(index-1);
document.getElementById('next').onclick=()=>show(index+1);
document.getElementById('export').onclick=()=>{
 const blob=new Blob([JSON.stringify({schemaVersion:1,studyId:data.studyId,exportedAt:new Date().toISOString(),clips:data.pairs.map(p=>({id:p.id,clips:p.clips})),ratings:state},null,2)],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download='oddenova-blind-ratings.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
if(data.pairs.length)show(0);else panel.append(el('p','暂无完整音频配对。'));save();
</script></html>'''.replace('/*DATA*/',payload)
if os.environ.get('CONTROLLED_EVAL'):
 page=page.replace('代码保持原样，试听前 8 小节；Funk 鼓组试听前 16 小节，各保留 2 秒尾音。作品整体也会因生成随机性而不同。','两边使用完全相同的固定试听片段，仅采样名称或变体不同。旋律乐器使用同音 C4，便于比较音色。试听 8 小节（Funk 16 小节），保留 2 秒尾音。').replace('作品盲听','选样盲听').replace('oddenova-blind-ratings.json','oddenova-controlled-ratings.json')
if os.environ.get('SCENE_EVAL'):
 page=page.replace('代码保持原样，试听前 8 小节；Funk 鼓组试听前 16 小节，各保留 2 秒尾音。作品整体也会因生成随机性而不同。','每段试听从开头截取 30 秒，两组均自由创作。请分别判断场景贴合度、乐器音色和个人偏好。')
 page=page.replace("choices('timbre','哪段音色更符合请求？');", "choices('scene','哪段更符合场景、更容易进入画面？');choices('timbre','哪段乐器和音色更贴切？');")
 page=page.replace("['neither','两者都不贴合']", "['unknown','无法判断']")
 page=page.replace('r.timbre||r.overall','r.scene&&r.timbre&&r.overall').replace('oddenova-blind-ratings.json','oddenova-scene-ratings.json')
page=page.replace(' / 30 组', ' / '+str(len(cases)*repeats)+' 组')
if os.environ.get('FULL_CATALOG_EVAL'):
 page=page.replace('同一请求、同一轮次配对。每组 A/B 顺序独立打乱，已做成对响度匹配。','同一场景的新旧作品配对，A/B 随机排列并做响度匹配。对照作品来自上一轮、你已听过，本轮是探索性复听，不能视为独立盲测。')
 page=page.replace('oddenova-scene-ratings.json','oddenova-full-catalog-ratings.json')
if os.environ.get('MODEL_SEARCH_EVAL'):
 page=page.replace('oddenova-full-catalog-ratings.json','oddenova-model-search-ratings.json')
(review/'index.html').write_text(page)
(folder/'answer-key.json').write_text(json.dumps(answers,ensure_ascii=False,indent=2))
(folder/'unavailable.json').write_text(json.dumps(unavailable,ensure_ascii=False,indent=2))
(folder/'blind-manifest.json').write_text(json.dumps(pairs,ensure_ascii=False,indent=2))
with zipfile.ZipFile(folder/'blind-listening.zip','w',zipfile.ZIP_DEFLATED) as archive:
 for f in review.rglob('*'):
  if f.is_file():archive.write(f,Path('blind-listening')/f.relative_to(review))
print('Ready pairs',len(pairs),'unavailable',len(unavailable))
