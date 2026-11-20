import { describe,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { serializeFullCatalog,resolveFullChoices,fullCompositionPrompt } from '../scripts/sample-annotations/full-catalog';
import { AGENT_SYSTEM_PROMPT_OPENAI } from '../src/prompts/versions/v26';
import type { SearchCatalog } from '../src/lib/sample-search';
describe('full catalog experiment contracts',()=>{
  const catalog=JSON.parse(readFileSync('public/sample-annotations/catalog.json','utf8')) as SearchCatalog;
  const {text,rows}=serializeFullCatalog(catalog);
  it('retains every file-level annotation and distinct root mapping',()=>{
    expect(Object.keys(rows)).toHaveLength(catalog.samples.reduce((n,s)=>n+s.variants.length,0));
    expect(text.split('\n').filter(l=>l.startsWith('@ '))).toHaveLength(catalog.samples.length);
    for(const [id,row] of Object.entries(rows)) {
      const resolved=resolveFullChoices([{role:'test',variantId:id,fallbackName:null,register:'C4',reason:'test'}],rows,new Set());
      expect(resolved[0]).toMatchObject({name:row.sample.key,index:row.variant.index,rootNote:row.variant.rootNote,features:row.variant.features,playback:row.variant.playback});
    }
  });
  it('rejects invented rows and unapproved fallback names',()=>{
    const c={role:'test',variantId:'not-a-row',fallbackName:null,register:'C4',reason:'test'};
    expect(()=>resolveFullChoices([c],rows,new Set())).toThrow();
    expect(()=>resolveFullChoices([{...c,variantId:null,fallbackName:'invented'}],rows,new Set())).toThrow();
    expect(resolveFullChoices([{...c,variantId:null,fallbackName:'sine'}],rows,new Set(['sine']))[0]).toMatchObject({name:'sine',features:null,evidence:'unannotated_fallback'});
  });
  it('replaces only the v26 selection section, preserving the composition instructions',()=>{
    const base=AGENT_SYSTEM_PROMPT_OPENAI('persona','NOVA');
    const result=fullCompositionPrompt(base,[]);
    expect(result.endsWith(base.slice(base.indexOf('\n\n')+2))).toBe(true);
    expect(result).not.toContain('新增或替换已标注库中的音色时，先调用 searchSamples');
  });
});
