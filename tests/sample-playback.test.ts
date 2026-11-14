// @vitest-environment happy-dom
import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
vi.mock('../src/lib/soundfont-loader',()=>({registerSoundfonts:vi.fn()}));
vi.mock('../src/lib/analytics',()=>({trackWavExportCompleted:vi.fn()}));
it('validates indexed and pitch-mapped playback using the actual code validator',async()=>{
  vi.stubGlobal('m',()=>({}));
  const core=await import('@strudel/core');
  await core.evalScope(core,await import('@strudel/mini'),await import('@strudel/tonal'),await import('@strudel/webaudio'));
  const {validateCodeRuntime,validateCodeTranspiler}=await import('../src/services/strudel');
  const catalog=JSON.parse(readFileSync('public/sample-annotations/catalog.json','utf8'));
  for(const key of ['RolandTR808_bd','piano','sax_stacc','hh','dirt_sd','cover360_camera_flash','gm_piano','sine','bytebeat']) {
    const sample=catalog.samples.find((r:{key:string})=>r.key===key);
    expect(sample).toBeDefined();
    const code=sample.variants[0].playback;
    expect(validateCodeTranspiler(code).ok).toBe(true);
    expect((await validateCodeRuntime(code)).ok,code).toBe(true);
  }
  vi.unstubAllGlobals();
});
