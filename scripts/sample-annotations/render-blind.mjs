import { build } from 'vite';
import { createServer } from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, access, readdir, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { buildInventory } from './catalog.ts';
const execute = promisify(execFile);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const timbres=process.argv.includes('--timbres');
const dir=path.resolve(root,process.env.EVAL_DIR||'.local/sample-annotations/deepseek-eval');
const output=timbres?path.join(root,'.local/sample-annotations/timbre-render'):path.join(dir,'blind');
const raw=path.join(output,'raw');
const renderLibrary=timbres?process.env.RENDER_LIBRARY:undefined;
const bundle=path.join(output,renderLibrary?'bundle-'+renderLibrary:'bundle');
await mkdir(raw,{recursive:true});
await mkdir(path.join(output,'fonts'),{recursive:true});
const hash=value=>createHash('sha256').update(value).digest('hex');
const inventory=timbres?buildInventory(root):JSON.parse(await readFile(path.join(root,'.local/sample-annotations/inventory.json'),'utf8'));
const lookup=new Map(inventory.map(f=>[[f.library,f.key,f.rootNote,f.index].join('|'),f]));
const cases=JSON.parse(await readFile(path.join(root,process.env.EVAL_CASES||'scripts/sample-annotations/eval-cases.json'),'utf8'));
await build({configFile:false,root,logLevel:'error',base:'/bundle/',define:{'process.env.NODE_ENV':JSON.stringify('production')},build:{
  outDir:bundle,emptyOutDir:true,target:'esnext',
  lib:{entry:path.join(root,'scripts/sample-annotations/render-client.ts'),formats:['es'],fileName:()=> 'renderer.js'},
  rollupOptions:{output:{inlineDynamicImports:true}},
}});
const permitted=new Set();
const runs=['scene-eval','deepseek-eval','full-catalog-eval','model-search-eval'];
const cachedFonts=await Promise.all(runs.map(
  name=>readdir(path.join(root,'.local/sample-annotations',name,'blind/fonts')).catch(()=>[])));
async function fetchFont(name) {
  const file=path.join(output,'fonts',name);
  try {await access(file);return file;} catch {}
  const cached=cachedFonts.findIndex(names=>names.includes(name));
  if(cached>=0) return path.join(root,'.local/sample-annotations',runs[cached],'blind/fonts',name);
  const sources=[
    'https://felixroos.github.io/webaudiofontdata/sound/',
    'https://raw.githubusercontent.com/felixroos/webaudiofontdata/master/sound/',
  ];
  for(const base of sources) {
    try {
      await execute('curl',['--fail','--silent','--show-error','--location','--connect-timeout','10','--max-time','90','-o',file+'.tmp',base+name]);
      await rename(file+'.tmp',file);
      return file;
    } catch(error) {if(base===sources.at(-1)) throw error;}
  }
}
const fontDownloads=new Map();
function ensureFont(name) {
  if(!fontDownloads.has(name)) fontDownloads.set(name,fetchFont(name).finally(()=>fontDownloads.delete(name)));
  return fontDownloads.get(name);
}
const server=createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    const send=(type,data)=>{res.writeHead(200,{'Content-Type':type});res.end(data);};
    if(url.pathname==='/')return send('text/html','<script type="module" src="/bundle/renderer.js"></script>');
    if(url.pathname==='/bundle/renderer.js')return send('application/javascript',await readFile(path.join(bundle,'renderer.js')));
    if(url.pathname==='/alias.json')return send('application/json',await readFile(path.join(root,'public/sample-index/tidal-drum-machines-alias.json')));
    if(url.pathname.startsWith('/index/')) {
      const library=url.pathname.slice(7);
      if(!['dirt-samples','tidal-drum-machines','piano','vcsl','mridangam','uzu-drumkit'].includes(library))throw Error('Unknown index');
      const index=JSON.parse(await readFile(path.join(root,'public/sample-index/'+library+'.json')));
      const base='http://127.0.0.1:'+server.address().port;
      const convert=(entry,key,note=null)=>{
        const leaf=n=>{
          const f=lookup.get([library,key,note,n].join('|'));
          if(!f)throw Error('Missing file mapping');
          return 'audio/'+hash(f.url)+path.extname(f.path).toLowerCase();
        };
        if(typeof entry==='string')return leaf(0);
        if(Array.isArray(entry))return entry.map((_,n)=>leaf(n));
        return Object.fromEntries(Object.entries(entry).map(([note,v])=>[note,convert(v,key,note)]));
      };
      const result={_base:base+'/'};
      for(const [key,entry] of Object.entries(index))if(!key.startsWith('_'))result[key]=convert(entry,key);
      return send('application/json',JSON.stringify(result));
    }
    if(/^\/audio\/[a-f0-9]{64}\.(wav|mp3)$/.test(url.pathname))
      return send('application/octet-stream',await readFile(path.join(root,'.local/sample-annotations',url.pathname.slice(1))));
    if(/^\/font\/[a-zA-Z0-9_.-]+\.js$/.test(url.pathname)) {
      const name=url.pathname.slice(6),file=await ensureFont(name);
      return send('application/javascript',await readFile(file));
    }
    if(req.method==='POST'&&url.pathname.startsWith('/save/')) {
      const id=url.pathname.slice(6);
      if(!permitted.has(id))throw Error('Invalid output');
      const buffers=[];for await(const chunk of req)buffers.push(chunk);
      const file=path.join(raw,id+'.wav');
      await writeFile(file+'.tmp',Buffer.concat(buffers));
      await rename(file+'.tmp',file);
      return send('text/plain','saved');
    }
    console.error('Missing resource',url.pathname);res.writeHead(404);res.end();
  } catch(error){console.error('Resource error',req.url,error.message);res.writeHead(500);res.end(error.message);}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const chrome=spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',[
  '--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',
  '--user-data-dir='+path.join(output,'chrome-profile-'+Date.now()),'about:blank',
],{stdio:['ignore','ignore','pipe']});
let stderr='';
const wsUrl=await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('Chrome startup timeout')),30000);
  chrome.stderr.on('data',chunk=>{
    stderr+=chunk;
    const match=stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
    if(match){clearTimeout(timer);resolve(match[1]);}
  });
  chrome.on('exit',code=>reject(Error('Chrome exited '+code)));
});
const socket=new WebSocket(wsUrl);
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
let sequence=0;
const requests=new Map();
socket.onmessage=event=>{
  const data=JSON.parse(event.data);
  if(data.method==='Runtime.exceptionThrown') console.error('Browser exception:',JSON.stringify(data.params));
  if(data.method==='Runtime.consoleAPICalled' && ['error','warning'].includes(data.params.type))
    console.error('Browser:',data.params.args.map(a=>a.value??a.description).join(' '));
  if(data.id&&requests.has(data.id)) {
    const {resolve,reject,timer}=requests.get(data.id);requests.delete(data.id);clearTimeout(timer);
    if(data.error)reject(Error(JSON.stringify(data.error)));else resolve(data.result);
  }
};
function command(method,params={},sessionId) {
  const id=++sequence;
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{requests.delete(id);reject(Error('CDP timeout '+method));},180000);
    requests.set(id,{resolve,reject,timer});
    socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));
  });
}
const {targetId}=await command('Target.createTarget',{url:'about:blank'});
const {sessionId}=await command('Target.attachToTarget',{targetId,flatten:true});
async function evaluate(expression) {
  const result=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true},sessionId);
  if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description??result.exceptionDetails.text);
  return result.result?.value;
}
const results=[];
try {
  await command('Runtime.enable',{},sessionId);
  await command('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/' +(timbres?'?timbres':'')},sessionId);
  for(let i=0;i<120;i++) {
    if(await evaluate('typeof window.renderClip === "function"'))break;
    if(i===119)throw Error('Renderer initialization failed');
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  if(timbres) {
    const pending=[];
    for(const item of inventory.filter(item=>item.render && (!renderLibrary || item.library===renderLibrary))) {
      try {await access(path.join(raw,item.id+'.wav'));} catch {pending.push(item);}
    }
    let next=0;
    const prefetched=new Map();
    function prefetch(item) {
      const ready=item.render.font?ensureFont(item.render.font+'.js'):Promise.resolve();
      prefetched.set(item.id,ready.then(()=>null,error=>error));
    }
    const ordered=[...pending.filter(item=>!item.render.font),...pending.filter(item=>item.render.font)];
    for(const item of ordered.slice(0,24)) {prefetch(item);next++;}
    for(const item of ordered) {
      try {
        const error=await prefetched.get(item.id);
        prefetched.delete(item.id);
        if(next<ordered.length) prefetch(ordered[next++]);
        if(error) throw error;
        permitted.add(item.id);
        const key=item.render.variant===undefined?item.key:item.key+':'+item.index;
        const sound='s('+JSON.stringify(key)+')';
        const code='setcps(1); '+(item.rootNote?'note('+JSON.stringify(item.rootNote)+').'+sound:sound)+'.struct("x ~")';
        const rendered=await evaluate('window.renderClip('+JSON.stringify(item.id)+','+JSON.stringify(code)+',2,2)');
        results.push({id:item.id,key:item.key,index:item.index,...rendered});
        console.log('Rendered',item.key,item.index);
      } catch(error) {
        results.push({id:item.id,key:item.key,index:item.index,error:error.message});
        console.log('Render failed',item.key,item.index,error.message.slice(0,150));
      }
    }
  } else for(const item of cases.filter(item=>!process.env.RENDER_CASE||item.id===process.env.RENDER_CASE))for(let repeat=0;repeat<Number(process.env.EVAL_REPEATS||3);repeat++) {
    const pair=[];
    for(const condition of ['baseline','search']) {
      const id=item.id+'-'+repeat+'-'+condition;
      try{pair.push({id,data:JSON.parse(await readFile(path.join(dir,id+'.json'),'utf8'))});}
      catch{pair.length=0;break;}
    }
    if(pair.length!==2)continue;
    for(const {id,data} of pair) {
      permitted.add(id);
      const file=path.join(raw,id+'.json');
      try {
        const codeHash=hash(data.result.code);
        let metadata;
        try {
          metadata=JSON.parse(await readFile(file,'utf8'));
          if(metadata.codeHash!==codeHash||metadata.fixedSeconds!==(Number(process.env.RENDER_SECONDS)||null)||metadata.error)metadata=null;
        }catch{}
        if(!metadata) {
          const rendered=await evaluate('window.renderClip('+JSON.stringify(id)+','+JSON.stringify(data.result.code)+','+(item.id==='funk-drums'?16:8)+','+(Number(process.env.RENDER_SECONDS)||'undefined')+')');
          metadata={id,codeHash,fixedSeconds:Number(process.env.RENDER_SECONDS)||null,...rendered};
          await writeFile(file,JSON.stringify(metadata,null,2));
        }
        results.push(metadata);
        console.log('Rendered',id);
      } catch(error) {
        const record={id,error:error.message};
        results.push(record);await writeFile(file,JSON.stringify(record,null,2));
        console.log('Render failed',id,error.message.slice(0,120));
      }
    }
  }
  await writeFile(path.join(output,renderLibrary?'render-results-'+renderLibrary+'.json':'render-results.json'),JSON.stringify(results,null,2));
} finally {socket.close();chrome.kill();server.close();}
