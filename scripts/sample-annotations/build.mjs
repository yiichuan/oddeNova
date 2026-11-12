import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { applyExpertRelease, extractSoundDescription, summarizeSample, validRelease } from './listening-features.ts';
import { buildInventory, categoryFromBrowseDirectory } from './catalog.ts';

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
const approved=await optional(path.join(dir,'expert-releases.json')) ?? {};
const output=path.join(root,'public/sample-annotations');
const catalogPath=path.join(output,'catalog.json');
const previous=await optional(catalogPath);
const categoryOverrides=new Map((previous?.samples ?? [])
  .filter(sample=>Object.hasOwn(sample,'originalCategory'))
  .map(sample=>[sample.key,sample.category]));
const groups=new Map();
const failures=[];
let annotated=0;
const hashes=new Set();
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
  // Descriptions are for human review only; retrieval serializes structured features explicitly.
  const features=a ? {structure:a.structure,timbre:a.timbre,envelope:a.envelope,space:a.space} : null;
  // Expert releases are separately supplied, keyed by immutable audio hash.
  const expert=download?.sha256 && approved[download.sha256];
  const variant={
    id:file.id,sha256:download?.sha256 ?? null,index:file.index,rootNote:file.rootNote,
    articulation:file.articulation,
    features,
    ...(a && extractSoundDescription(a) && { soundDescription: extractSoundDescription(a), descriptionStatus: 'model_initial' }),
    annotationStatus:good ? 'model_initial' : 'unavailable',
    playback:file.rootNote ? 'note('+JSON.stringify(file.rootNote)+').s('+JSON.stringify(file.key+':'+file.index)+')' :
      's('+JSON.stringify(file.key+':'+file.index)+')',
  };
  if(!groups.has(file.key)) groups.set(file.key,{key:file.key,aliases:file.aliases,category:file.category,
    categoryEvidence:file.categoryEvidence,summary:'',variants:[]});
  groups.get(file.key).variants.push(validRelease(expert) ? applyExpertRelease(variant, expert) : variant);
}
for(const group of groups.values()) {
  group.summary=summarizeSample(group.variants);
  if(group.category===null) Object.assign(group, categoryFromBrowseDirectory(group.key));
  if(categoryOverrides.has(group.key) && categoryOverrides.get(group.key)!==group.category) {
    group.originalCategory=group.category;
    group.category=categoryOverrides.get(group.key);
  }
}
const samples=[...groups.values()].sort((a,b)=>a.key.localeCompare(b.key));
await mkdir(output,{recursive:true});
await writeFile(catalogPath,JSON.stringify({schemaVersion:1,fingerprint:chosen,samples}));
const totals={references:inventory.length,uniqueDownloadedHashes:hashes.size,annotatedReferences:annotated,
  pendingOrFailed:failures.length,activeNames:samples.length};
await writeFile(path.join(dir,'summary.json'),JSON.stringify(totals,null,2));
await writeFile(path.join(dir,'review-queue.json'),JSON.stringify(failures,null,2));
await writeFile(path.join(dir,'names.json'),JSON.stringify(samples,null,2));
console.log(totals);
