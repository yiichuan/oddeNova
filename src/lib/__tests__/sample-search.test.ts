import { describe, it, expect, vi, afterEach } from 'vitest';
import { rankSamples } from '../../../scripts/sample-annotations/keyword-search';
import type { SearchCatalog, SampleVariant } from '../sample-search';
const variant = (id: string, brightness: string, status: SampleVariant['annotationStatus']='model_initial'): SampleVariant => ({
  id,sha256:id,index:0,rootNote:null,articulation:null,annotationStatus:status,playback:'s("kit:0")',
  features:{structure:{event_form:'single_event',pitchedness:'noise_like'},
    timbre:{brightness,body:'balanced',texture_tags:[],distortion:'not_obvious'},
    envelope:{attack:'sharp',shape:'decaying',tail:'short'},space:{reverb:'dry'}},
});
const catalog: SearchCatalog = {schemaVersion:1,samples:[
  {key:'snare_a',aliases:[],category:'军鼓 snare',summary:'明亮',variants:[variant('a','bright')]},
  {key:'snare_b',aliases:[],category:'军鼓 snare',summary:'明亮',variants:[variant('b','bright','expert_confirmed')]},
  {key:'piano',aliases:[],category:'钢琴 piano',summary:'偏暗',variants:[{...variant('c','dark'),rootNote:'C4',playback:'note("C4").s("piano:0")'}]},
]};
afterEach(()=>{vi.unstubAllGlobals();vi.resetModules();});
describe('sample search',()=>{
  it('filters bilingual categories and prioritizes expert feedback only for equal matches',()=>{
    const matches=rankSamples(catalog,{query:'bright',category:'军鼓',features:{brightness:'bright'}});
    expect(matches.map(s=>s.name)).toEqual(['snare_b','snare_a']);
    expect(rankSamples(catalog,{category:'snare',query:'',features:{brightness:'dark'}})).toHaveLength(2);
  });
  it('keeps pitch mappings separate from file index and reports no matches',()=>{
    expect(rankSamples(catalog,{query:'钢琴'})[0].playback).toBe('note("C4").s("piano:0")');
    expect(rankSamples(catalog,{query:'unlisted-zz'})).toEqual([]);
  });
  it('honors the requested count without a hard cap and ignores unavailable listening features',()=>{
    const many={...catalog,samples:Array.from({length:20},(_,i)=>({...catalog.samples[0],key:'snare_'+i}))};
    expect(rankSamples(many,{query:'snare',limit:99})).toHaveLength(20);
    const unknown={...catalog,samples:[{...catalog.samples[0],variants:[{...variant('x','unknown'),features:null}]}]};
    expect(rankSamples(unknown,{query:'snare',features:{brightness:'bright'}})[0].score).toBeGreaterThanOrEqual(0);
  });
  it('coalesces lazy loads and permits retry after load failure',async()=>{
    const fetch=vi.fn().mockRejectedValueOnce(Error('offline')).mockResolvedValue({
      ok:true,json:async()=>catalog,
    });
    vi.stubGlobal('fetch',fetch);
    const {loadSampleCatalog}=await import('../sample-search');
    await expect(loadSampleCatalog()).rejects.toThrow();
    await expect(Promise.all([loadSampleCatalog(), loadSampleCatalog()])).resolves.toEqual([catalog, catalog]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
