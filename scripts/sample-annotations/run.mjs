import { createHash } from 'node:crypto';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);
import { readFile, writeFile, rename, mkdir, open, access, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import { buildInventory } from './catalog.ts';
import { estimatedCost, reserveCharge } from './budget.mjs';
import { annotationRequest } from '../sample-annotation-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dir = path.join(root, '.local/sample-annotations');
const hash = value => createHash('sha256').update(value).digest('hex');
const read = async p => JSON.parse(await readFile(p, 'utf8'));
async function optional(p) {
  try { return await read(p); } catch (error) { if (error.code !== 'ENOENT') throw error; return null; }
}
const writes = new Map();
function atomic(file, data) {
  const snapshot = JSON.stringify(data, null, 2);
  const operation = (writes.get(file) ?? Promise.resolve()).then(async () => {
    await writeFile(file + '.tmp', snapshot);
    await rename(file + '.tmp', file);
  });
  writes.set(file, operation.catch(() => {}));
  return operation;
}
await mkdir(dir, { recursive: true });
const stage = process.argv[2] ?? 'inventory';
const inventory = buildInventory(root);
await atomic(path.join(dir, 'inventory.json'), inventory);
const libraries = new Set((process.env.ANNOTATION_LIBRARIES ?? '').split(',').filter(Boolean));
const ids = new Set((process.env.ANNOTATION_IDS ?? '').split(',').filter(Boolean));
const files = inventory.filter(file => (!libraries.size || libraries.has(file.library))
  && (!ids.size || ids.has(file.id)));
if (stage === 'inventory') { console.log('Inventory references:', inventory.length); process.exit(0); }
if (!files.length) throw Error('No references match ANNOTATION_LIBRARIES');
await mkdir(path.join(dir, 'audio'), { recursive: true });
await mkdir(path.join(dir, 'downloads'), { recursive: true });
await mkdir(path.join(dir, 'annotations'), { recursive: true });
const audioFor = file => file.render
  ? path.join(dir, 'timbre-render', 'raw', file.path)
  : path.join(dir, 'audio', hash(file.url) + path.extname(file.path).toLowerCase());
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function download(file) {
  const stateFile = path.join(dir, 'downloads', file.id + '.json');
  const saved = await optional(stateFile);
  if (saved?.sha256) return saved;
  const audio = audioFor(file);
  const previousCache = '/tmp/oddenova-drum-timbre-cache/' + hash(file.url) + path.extname(file.path).toLowerCase();
  if (!file.render) {
    try { await writeFile(audio, await readFile(previousCache), {flag:'wx'}); }
    catch (error) { if (!['ENOENT','EEXIST'].includes(error.code)) throw error; }
  }
  try {
    try { await readFile(audio); } catch (error) {
      if (file.render) throw error;
      await execute('curl', ['--fail','--silent','--show-error','--location','--retry','3','--retry-all-errors','--retry-delay','1',
        '--max-time','120','--max-filesize','80000000','-o',audio + '.tmp', file.url], { maxBuffer: 1000000 });
      await rename(audio + '.tmp', audio);
    }
    const bytes = await readFile(audio);
    const probe = JSON.parse(execFileSync('ffprobe', ['-v','error','-show_entries','format=duration:stream=codec_type,sample_rate,channels',
      '-of','json', audio], {encoding:'utf8'}));
    const stream = probe.streams.find(s => s.codec_type === 'audio');
    if (!stream || !(Number(probe.format.duration) > 0)) throw Error('No decodable audio');
    const result = { sha256:hash(bytes), duration:Number(probe.format.duration),
      sampleRate:Number(stream.sample_rate), channels:stream.channels };
    await atomic(stateFile, result);
    return result;
  } catch (error) {
    const result = { error: String(error.message).slice(0,500) };
    await atomic(stateFile, result);
    return result;
  }
}
if (stage === 'download') {
  for (let i = 0; i < files.length; i++) {
    await download(files[i]);
    if (i % 50 === 0) console.log('Downloaded', i+1, '/', files.length);
  }
  console.log('Download pass complete'); process.exit(0);
}
if (stage !== 'annotate') throw Error('Expected inventory, download, or annotate');
const schema = await read(path.join(root, 'docs/sample-annotation-schema-v2.json'));
const prompt = await readFile(path.join(root, 'scripts/sample-annotations/prompt.txt'), 'utf8');
const ajv = new Ajv({ allErrors:true });
const model = 'qwen3.8-omni-flash';
const fingerprint = hash(JSON.stringify({ model, schema, prompt, policy: await readFile(path.join(root,'scripts/sample-annotation-policy.mjs'),'utf8') }));
const run = path.join(dir, 'annotations', fingerprint);
await mkdir(run, {recursive:true});
const ledgerFile = path.join(run, 'ledger.json');
const ledger = await optional(ledgerFile) ?? { inputTokens:0,outputTokens:0,reserved:0,attempts:0,uncertainCalls:0 };
const budget = Number(process.env.ANNOTATION_BUDGET_CNY ?? 40);
if (!Number.isFinite(budget) || budget <= 0) throw Error('Invalid budget');
const endpoint = new URL(process.env.DASHSCOPE_BASE_URL);
if (endpoint.protocol !== 'https:') throw Error('HTTPS required');
if (endpoint.pathname === '/') endpoint.pathname='/compatible-mode/v1';
if (!process.env.DASHSCOPE_API_KEY) throw Error('Missing API key');
const concurrency = Number(process.env.ANNOTATION_CONCURRENCY ?? 2);
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 10) throw Error('Concurrency must be between 1 and 10');
const lock = path.join(dir, 'annotation.lock');
const handle = await open(lock, 'wx');
await handle.writeFile(JSON.stringify({pid:process.pid,fingerprint,concurrency}));
const inflight = new Map();
console.log('Annotation workers:', concurrency);
let next = 0;
let stopping = false;
let completed = 0;
let authorizationError;
const watchRenders = stage === 'annotate' && process.env.ANNOTATION_WATCH_RENDERS === '1';
const waitingForRender = new Map();
let readyRenders = [];
let renderScan;
process.once('SIGTERM', () => { stopping = true; console.log('Stopping after active requests finish'); });
let consecutiveDownloadFailures = 0;
const cost = () => estimatedCost(ledger);
await atomic(path.join(run,'config.json'), {model,schema,prompt,fingerprint,budget,concurrency,inputPerMillion:.8,outputPerMillion:2.7});
async function annotate(file, audio) {
  const resultFile = path.join(run,audio.sha256+'.json');
  const prior=await optional(resultFile);
  if (prior && (prior.status === 'valid' || !process.env.ANNOTATION_RETRY_INVALID)) return prior;
  const request = annotationRequest(schema,prompt,{catalogCategory:file.category});
  const validate = ajv.compile(request.schema);
  const text = request.prompt+'\nJSON Schema\n'+JSON.stringify(request.schema);
  let bytes = await readFile(audioFor(file));
  let format = path.extname(file.path).slice(1).toLowerCase();
  let inputTransform = 'original';
  if (audio.duration < 0.1 || audio.duration > 30) {
    const converted = await execute('ffmpeg', ['-nostdin','-v','error','-i',audioFor(file),
      ...(audio.duration < 0.1 ? ['-af','apad=whole_dur=1'] : ['-t','30','-ar','24000','-ac','1']),
      '-c:a','pcm_s16le','-f','wav','pipe:1'], {encoding:'buffer',maxBuffer:5000000});
    bytes = converted.stdout;
    format = 'wav';
    inputTransform = audio.duration < 0.1 ? 'pad_tail_silence_to_1s_pcm16' : 'first_30s_mono_24khz_pcm16';
  }
  const inputSha256 = hash(bytes);
  const params={model,modalities:['text'],reasoning_effort:'none',stream:false,max_tokens:4096,
    messages:[{role:'user',content:[{type:'input_audio',input_audio:{format,data:'data:audio/'+(format==='mp3'?'mpeg':format)+';base64,'+bytes.toString('base64')}},
      {type:'text',text}]}]};
  for(let attempt=0;attempt<2;attempt++) {
    let response,raw,body;
    for(let retry=0;retry<4;retry++) {
      // Reserve a conservative charge for uncertain calls and concurrent requests.
      const reservation=(Math.ceil(text.length*2+audio.duration*10)*.8+4096*2.7)/1e6;
      if(!reserveCharge(ledger,reservation,budget)) return {status:'budget_exhausted'};
      await atomic(ledgerFile,ledger);
      try {
        response=await fetch(endpoint.href.replace(/\/$/,'')+'/chat/completions',{
          method:'POST',headers:{Authorization:'Bearer '+process.env.DASHSCOPE_API_KEY,'Content-Type':'application/json'},
          body:JSON.stringify(params),signal:AbortSignal.timeout(180000)});
        raw=await response.text();
        await atomic(path.join(run,audio.sha256+'-'+attempt+'-'+retry+'-raw.json'),{
          sampleId:file.id,category:file.category,sha256:audio.sha256,inputSha256,inputTransform,text,params:{model,max_tokens:4096},
          status:response.status,raw,time:new Date().toISOString()});
        body=JSON.parse(raw);
        if(body.usage) {
          ledger.inputTokens+=body.usage.prompt_tokens;ledger.outputTokens+=body.usage.completion_tokens;
          ledger.reserved-=reservation;
        } else if(response.ok) ledger.uncertainCalls++;
        else ledger.reserved-=reservation;
        await atomic(ledgerFile,ledger);
        if(response.ok) break;
        if(response.status===401 || response.status===403) {
          stopping=true;
          authorizationError ??= new Error('Annotation endpoint rejected access (HTTP '+response.status+')');
        }
        if(!(response.status===429 || response.status>=500)) throw Error('HTTP '+response.status);
      } catch(error) {
        if(response && response.status!==429 && response.status<500) throw error;
        if(retry===3) throw error;
      }
      if(retry===3) throw Error('Retries exhausted');
      await sleep(1000*2**retry+Math.random()*300);
    }
    let annotation=null,errors=[];
    try {
      annotation=JSON.parse(body.choices[0].message.content.trim().replace(/^\x60\x60\x60(?:json)?\s*|\s*\x60\x60\x60$/g,''));
      if(!validate(annotation)) errors=structuredClone(validate.errors);
      if(body.model!==model) errors.push({message:'Unexpected model'});
      if(body.choices[0].finish_reason!=='stop') errors.push({message:'Incomplete output'});
      if(annotation.rhythm) for(const [a,b] of [['straight','swung'],['sparse','dense']]) {
        if(annotation.rhythm.feel_tags.includes(a)&&annotation.rhythm.feel_tags.includes(b)) errors.push({message:'Conflicting rhythm tags'});
      }
      const roles=annotation.usage_suggestions.map(s=>s.role);
      if(new Set(roles).size!==roles.length) errors.push({message:'Duplicate use'});
    } catch(error) {errors.push({message:error.message});}
    const result={sha256:audio.sha256,model,actualModel:body.model,categoryContext:file.category,inputSha256,inputTransform,
      annotation,errors,status:errors.length?'invalid':'valid',humanReviewStatus:'pending',fingerprint};
    if(!errors.length || attempt===1) {await atomic(resultFile,result);return result;}
  }
}
async function nextFile() {
  while (!stopping) {
    const file = files[next++];
    if (!file) {
      if (readyRenders.length) return readyRenders.pop();
      if (!watchRenders || !waitingForRender.size) return;
      renderScan ??= readdir(path.join(dir, 'timbre-render', 'raw')).then(names => {
        for (const name of names) {
          const ready = waitingForRender.get(name);
          if (!ready) continue;
          waitingForRender.delete(name);
          readyRenders.push(ready);
        }
      }).finally(() => { renderScan = undefined; });
      await renderScan;
      if (!readyRenders.length) {
        await sleep(5000);
      }
      continue;
    }
    if(file.render) {
      try { await access(audioFor(file)); }
      catch(error) {
        if(error.code !== 'ENOENT') throw error;
        if(watchRenders) waitingForRender.set(file.path, file);
        continue;
      }
    }
    return file;
  }
}
async function worker() {
  while(!stopping) {
    const file = await nextFile();
    if (!file) return;
    const audio=await download(file);
    if(!audio.sha256) {
      consecutiveDownloadFailures++;
      if(consecutiveDownloadFailures>=5) {stopping=true;throw Error('Download circuit breaker: five consecutive failures. Inspect download records and resume.');}
      continue;
    }
    consecutiveDownloadFailures=0;
    if(audio.duration>1200) {await atomic(path.join(dir,'downloads',file.id+'.json'),{...audio,error:'Audio exceeds 20 minutes'});continue;}
    let pending=inflight.get(audio.sha256);
    if(!pending) {
      pending=annotate(file,audio).catch(error=>({status:'failed',error:error.message}));
      inflight.set(audio.sha256,pending);
    }
    const result=await pending;
    if(result.status==='budget_exhausted') {stopping=true;console.log('Budget reached');return;}
    if(result.status==='failed') await atomic(path.join(run,file.id+'-failure.json'),result);
    completed++;
    if(completed%10===0) console.log('Processed',completed,'/',files.length,'estimated CNY',cost().toFixed(3));
  }
}
try {
  const outcomes = await Promise.allSettled(Array.from({length:concurrency},()=>worker()));
  const failure = outcomes.find(result => result.status === 'rejected');
  if (failure) throw failure.reason;
  if (authorizationError) throw authorizationError;
  console.log('Annotation pass complete',run,ledger);
}
finally {await handle.close();await (await import('node:fs/promises')).unlink(lock);}
