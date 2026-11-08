import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import Ajv from 'ajv';
import { buildInventory } from './catalog.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const dir=path.join(root,'.local/sample-annotations');
const json=async file=>JSON.parse(await readFile(file,'utf8'));
async function optional(file) {
  try {return await json(file);} catch(error) {if(error.code!=='ENOENT') throw error;return null;}
}
const inventory=buildInventory(root);
const runs=await readdir(path.join(dir,'annotations')).catch(()=>[]);
const chosen=process.argv[2] ?? runs.sort().at(-1);
if(!chosen) throw Error('Specify annotation fingerprint');
const run=path.join(dir,'annotations',chosen);
const baseSchema=await json(path.join(root,'docs/sample-annotation-schema-v2.json'));
const validateFeatures=new Ajv().compile({
  type:'object', additionalProperties:false, required:['structure','timbre','envelope','space'],
  properties:Object.fromEntries(['structure','timbre','envelope','space'].map(key=>[key,baseSchema.properties[key]])),
});
const approved=await optional(path.join(dir,'expert-releases.json')) ?? {};
const groups=new Map();
const failures=[];
let annotated=0;
const hashes=new Set();
const labels={
  dark:'偏暗 dark',balanced:'均衡 balanced',bright:'明亮 bright',light:'轻薄 light',full:'厚实 full',
  sharp:'锐利 sharp',rounded:'圆润 rounded',gradual:'缓起 gradual',short:'短 short',medium:'中等 medium',long:'长 long',
  dry:'干声 dry',slight:'少量混响 slight reverb',pronounced:'明显混响 reverberant',held:'持续 held',decaying:'自然衰减 decaying',
  metallic:'金属感 metallic',woody:'木质 woody',breathy:'气息感 breathy',airy:'空气感 airy',hollow:'中空 hollow',
  rough:'粗糙 rough',smooth:'平滑 smooth',grainy:'颗粒感 grainy',ringing:'鸣响 ringing',
};
for(const file of inventory) {
  const download=await optional(path.join(dir,'downloads',file.id+'.json'));
  const annotation=download?.sha256 ? await optional(path.join(run,download.sha256+'.json')) : null;
  if(download?.sha256) hashes.add(download.sha256);
  const good=annotation?.status==='valid';
  if(good) annotated++;
  else failures.push({id:file.id,key:file.key,path:file.path,active:file.active,
    reason:download?.error ?? annotation?.errors ?? 'pending'});
  if(!file.active) continue;
  const a=good ? annotation.annotation : null;
  // The compiled catalog carries only structured observations, never guessed sources.
  const features=a ? {structure:a.structure,timbre:a.timbre,envelope:a.envelope,space:a.space} : null;
  // Expert releases are separately supplied, keyed by immutable audio hash.
  const expert=download?.sha256 && approved[download.sha256];
  const released=expert && expert.status==='expert_confirmed' && expert.features &&
    typeof expert.reviewer === 'string' && expert.reviewer.trim() && Number.isInteger(expert.version) && expert.version > 0 && validateFeatures(expert.features);
  const variant={
    id:file.id,sha256:download?.sha256 ?? null,index:file.index,rootNote:file.rootNote,
    articulation:file.articulation,
    features:released ? expert.features : features,
    annotationStatus:released ? 'expert_confirmed' : good ? 'model_initial' : 'unavailable',
    playback:file.rootNote ? 'note('+JSON.stringify(file.rootNote)+').s('+JSON.stringify(file.key+':'+file.index)+')' :
      's('+JSON.stringify(file.key+':'+file.index)+')',
  };
  if(!groups.has(file.key)) groups.set(file.key,{key:file.key,aliases:file.aliases,category:file.category,
    categoryEvidence:file.categoryEvidence,summary:'',variants:[]});
  groups.get(file.key).variants.push(variant);
}
for(const group of groups.values()) {
  const variants=group.variants.filter(v=>v.features);
  const summary=[];
  for(const [section,key] of [['timbre','brightness'],['timbre','body'],['envelope','attack'],['envelope','tail'],['space','reverb']]) {
    const values=new Set(variants.map(v=>v.features[section][key]).filter(value=>value!=='unknown'&&value!=='not_applicable'));
    if(values.size===1) summary.push(labels[[...values][0]] ?? [...values][0]);
    else if(values.size>1) summary.push(key+'有变体差异');
  }
  group.summary=summary.length ? summary.join('；') : '听感标注待补充';
}
const samples=[...groups.values()].sort((a,b)=>a.key.localeCompare(b.key));
const output=path.join(root,'public/sample-annotations');
await mkdir(output,{recursive:true});
await writeFile(path.join(output,'catalog.json'),JSON.stringify({schemaVersion:1,fingerprint:chosen,samples}));
const totals={references:inventory.length,uniqueDownloadedHashes:hashes.size,annotatedReferences:annotated,
  pendingOrFailed:failures.length,activeNames:samples.length};
await writeFile(path.join(dir,'summary.json'),JSON.stringify(totals,null,2));
await writeFile(path.join(dir,'review-queue.json'),JSON.stringify(failures,null,2));
await writeFile(path.join(dir,'names.json'),JSON.stringify(samples,null,2));
console.log(totals);
