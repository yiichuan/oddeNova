import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildPersonaBlock } from '../src/persona/oddenova.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);
function option(name,fallback){const i=args.indexOf(name);if(i<0)return fallback;if(!args[i+1]||args[i+1].startsWith('--'))throw Error('缺少参数 '+name);return args[i+1];}
const from=option('--from','v25'),to=option('--to','v26');
if(!/^v[1-9]\d*$/.test(from)||!/^v[1-9]\d*$/.test(to))throw Error('版本必须类似 v25');
const output=path.resolve(root,option('--out',`.local/prompt-diffs/${from}-${to}.html`));
const modules=await Promise.all([from,to].map(v=>import(pathToFileURL(path.join(root,'src/prompts/versions',v+'.ts')).href)));
const temp=mkdtempSync(path.join(tmpdir(),'oddenova-prompt-diff-'));
function diff(a,b){
 const files=['before.txt','after.txt'].map(n=>path.join(temp,n));
 files.forEach((f,i)=>writeFileSync(f,i?b:a));
 try{return execFileSync('git',['diff','--no-index','--no-ext-diff','--no-color','--unified=4','--',...files],{encoding:'utf8'});}
 catch(error){if(error.status===1)return error.stdout;throw error;}
}
function render(module,lang){
 const entry=module[lang==='zh'?'AGENT_SYSTEM_PROMPT_OPENAI':'AGENT_SYSTEM_PROMPT_EN'];
 if(entry===undefined)return null;
 return typeof entry==='function'?entry(buildPersonaBlock(lang),'oddeNova'):String(entry);
}
const content={};
try{
 for(const lang of ['zh','en']){
  const [a,b]=modules.map(m=>render(m,lang));
  content[lang]=a===null||b===null?null:{a,b,diff:diff(a,b)};
 }
}finally{rmSync(temp,{recursive:true,force:true});}
const source=modules.map((_,i)=>readFileSync(path.join(root,'src/prompts/versions',(i?to:from)+'.ts'),'utf8'));
const payload=JSON.stringify({from,to,content,source}).replaceAll('<','\\u003c');
const page=String.raw`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>提示词版本对比</title>
<style>
:root{color-scheme:light;--paper:#f5f3ec;--ink:#242a27;--line:#d6dad0;--green:#e2efdb;--red:#f9e2dd}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font-family:"PingFang SC","Microsoft YaHei",sans-serif}header,main{max-width:1400px;margin:auto;padding:30px 36px}header{padding-bottom:16px}.eyebrow{font:12px ui-monospace,monospace;letter-spacing:.13em;color:#626d60}h1{font-family:"Songti SC",serif;font-weight:500;font-size:38px;margin:16px 0}h1 span{color:#87917f;margin:0 14px}.hint{font-size:13px;color:#626d60;line-height:1.8}.toolbar{display:flex;align-items:center;gap:16px;flex-wrap:wrap;position:sticky;top:0;background:var(--paper);padding:14px 0;border-bottom:1px solid var(--line);z-index:1}select,button{font:inherit;font-size:13px;color:inherit;background:transparent;border:1px solid #b9c1b4;padding:8px 12px;border-radius:3px}button{cursor:pointer}button:hover{background:#e4e9dc}button:focus-visible,select:focus-visible{outline:2px solid #456447;outline-offset:3px}#stats{margin-left:auto;font:13px ui-monospace,monospace}main{padding-top:0}table{border-collapse:collapse;width:100%;table-layout:fixed;background:#fcfcf8}td{vertical-align:top;border-bottom:1px solid #edf0e7}.number{width:52px;text-align:right;color:#8a9287;user-select:none;padding:7px 10px;font:12px ui-monospace,monospace}.sign{width:26px;padding:7px 4px;font:13px ui-monospace,monospace}.text{padding:7px 14px 7px 4px;white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.8 ui-monospace,"PingFang SC",monospace}.add{background:var(--green)}.remove{background:var(--red)}.hunk td{background:#e9edE2;color:#5c6b58;padding:12px;font:12px ui-monospace,monospace}.empty{padding:40px;text-align:center;color:#626d60}.panels{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--line)}.panels section{background:#fcfcf8;min-width:0;padding:20px}.panels h2{margin:0 0 16px;font-size:16px}.panels pre{white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.8 ui-monospace,"PingFang SC",monospace}[hidden]{display:none!important}@media(max-width:700px){header,main{padding-left:14px;padding-right:14px}.panels{grid-template-columns:1fr}.number{width:34px;padding:7px 3px}#stats{margin-left:0}}
</style><header><div class="eyebrow">ODDENOVA / PROMPT DIFF</div><h1 id="title"></h1><p class="hint">默认比较实际展开后的系统提示词：固定内置 oddeNova 人设，不添加心情或会话上下文。采样清单按当前代码展开，历史版本不代表历史提交中的全部依赖。工具定义独立于提示词，不在本页对比范围。</p></header><main><div class="toolbar"><label>语言 <select id="lang"><option value="zh">中文</option><option value="en">English</option></select></label><label>查看 <select id="mode"><option value="diff">差异与上下文</option><option value="full">完整文本并排</option><option value="source">TypeScript 源码并排</option></select></label><button id="download">下载当前 diff</button><span id="stats" role="status"></span></div><div id="view"></div></main><script>
const data=/*PAYLOAD*/;
const title=document.getElementById('title');title.append(document.createTextNode(data.from));const arrow=document.createElement('span');arrow.textContent='→';title.append(arrow,document.createTextNode(data.to));
const lang=document.getElementById('lang'),mode=document.getElementById('mode'),view=document.getElementById('view');
const node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
function show(){
 view.replaceChildren();const entry=data.content[lang.value];
 if(!entry){view.append(node('p','这两个版本没有共同的该语言提示词导出。'));document.getElementById('stats').textContent='';return;}
 let add=0,remove=0;for(const line of entry.diff.split('\n')){if(line.startsWith('+')&&!line.startsWith('+++'))add++;if(line.startsWith('-')&&!line.startsWith('---'))remove++;}
 document.getElementById('stats').textContent='+'+add+' / −'+remove+' 行';
 if(mode.value!=='diff'){
  const panels=node('div','');panels.className='panels';
  const texts=mode.value==='source'?data.source:[entry.a,entry.b];
  for(let i=0;i<2;i++){const s=node('section','');s.append(node('h2',i?data.to:data.from),node('pre',texts[i]));panels.append(s);}view.append(panels);return;
 }
 if(!entry.diff){const p=node('p','两份展开后的提示词完全一致。');p.className='empty';view.append(p);return;}
 const table=node('table','');table.setAttribute('aria-label','提示词差异，红色删除，绿色新增');let old=0,next=0,started=false;
 for(const line of entry.diff.split('\n')){
  const hunk=line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
  if(hunk){old=Number(hunk[1]);next=Number(hunk[2]);started=true;const tr=node('tr','');tr.className='hunk';const td=node('td',line);td.colSpan=4;tr.append(td);table.append(tr);continue;}
  if(!started||![' ','+','-'].includes(line[0]))continue;
  const sign=line[0],tr=node('tr','');tr.className=sign==='+'?'add':sign==='-'?'remove':'context';
  for(const [text,cls] of [[sign==='+'?'':String(old++),'number'],[sign==='-'?'':String(next++),'number'],[sign,'sign'],[line.slice(1),'text']]){const td=node('td',text);td.className=cls;tr.append(td);}table.append(tr);
 }view.append(table);
}
lang.onchange=show;mode.onchange=show;
document.getElementById('download').onclick=()=>{const entry=data.content[lang.value];if(!entry)return;const url=URL.createObjectURL(new Blob([entry.diff],{type:'text/plain;charset=utf-8'}));const a=node('a','');a.href=url;a.download=data.from+'-'+data.to+'.'+lang.value+'.diff';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};show();
</script></html>`;
mkdirSync(path.dirname(output),{recursive:true});
writeFileSync(output,page.replace('/*PAYLOAD*/',()=>payload));
for(const [lang,entry] of Object.entries(content))if(entry)writeFileSync(output.replace(/\.html$/, '')+'.'+lang+'.diff',entry.diff);
console.log(output);
