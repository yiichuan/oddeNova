import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {serializeFullCatalog} from '../scripts/sample-annotations/full-catalog';
import {resolveModelCandidates} from '../scripts/sample-annotations/model-search';
const {rows}=serializeFullCatalog(JSON.parse(readFileSync('public/sample-annotations/catalog.json','utf8')));
it('resolves only existing exact file variants, retaining root, playback and model ordering',()=>{
 const ids=Object.keys(rows).slice(0,2).reverse();
 const result=resolveModelCandidates(ids.map(variantId=>({variantId,reason:'符合本次需求'})),rows,{limit:2});
 expect(result.map(r=>r.playback)).toEqual(ids.map(id=>rows[id].variant.playback));
 expect(result.map(r=>r.rootNote)).toEqual(ids.map(id=>rows[id].variant.rootNote));
 expect(resolveModelCandidates([],rows,{})).toEqual([]);
});
it('rejects hallucinated files, duplicate files and excessive candidates',()=>{
 const c={variantId:Object.keys(rows)[0],reason:'test'};
 expect(()=>resolveModelCandidates([{...c,variantId:'invalid'}],rows,{})).toThrow();
 expect(()=>resolveModelCandidates([c,c],rows,{})).toThrow();
 expect(()=>resolveModelCandidates([c],rows,{limit:0})).toThrow();
});
