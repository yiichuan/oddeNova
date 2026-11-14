import * as core from '@strudel/core';
import * as mini from '@strudel/mini';
import * as tonal from '@strudel/tonal';
import * as webaudio from '@strudel/webaudio';
import * as draw from '@strudel/draw';
import { transpiler } from '@strudel/transpiler';
import {
  samples, aliasBank, registerSynthSounds, setAudioContext, setSuperdoughAudioController,
  getSuperdoughAudioController, initAudio, superdough, clearNodePools,
} from 'superdough';
import { registerSoundfonts } from '../../src/lib/soundfont-loader';

const originalFetch = window.fetch.bind(window);
window.fetch = (input, options) => {
  if (typeof input === 'string' && input.startsWith('https://felixroos.github.io/webaudiofontdata/sound/')) {
    return originalFetch('/font/' + input.split('/').at(-1), options);
  }
  return originalFetch(input, options);
};
await core.evalScope(core, mini, tonal, webaudio, draw);
const indexes = ['dirt-samples','tidal-drum-machines','piano','vcsl','mridangam','uzu-drumkit'];
const renderTimbres = location.search === '?timbres';
if (!renderTimbres) {
  for (const library of indexes) await samples(await fetch('/index/' + library).then(r => r.json()));
  await aliasBank('/alias.json');
}

function wav(buffer: AudioBuffer) {
  const frames = buffer.length;
  const data = new ArrayBuffer(44 + frames * 8);
  const view = new DataView(data);
  const text = (offset: number, value: string) => [...value].forEach((c,i)=>view.setUint8(offset+i,c.charCodeAt(0)));
  text(0,'RIFF');view.setUint32(4,data.byteLength-8,true);text(8,'WAVE');text(12,'fmt ');
  view.setUint32(16,16,true);view.setUint16(20,3,true);view.setUint16(22,2,true);
  view.setUint32(24,buffer.sampleRate,true);view.setUint32(28,buffer.sampleRate*8,true);
  view.setUint16(32,8,true);view.setUint16(34,32,true);text(36,'data');view.setUint32(40,frames*8,true);
  for(let channel=0;channel<2;channel++) {
    const values=buffer.getChannelData(channel);
    for(let i=0;i<frames;i++) view.setFloat32(44+(i*2+channel)*4,values[i],true);
  }
  return data;
}

Object.assign(window, {renderClip: async (id: string, code: string, cycles: number, fixedSeconds?: number) => {
  let cps = 0.5;
  Object.assign(globalThis, {
    setcps: (value: number) => {cps = Number(value);},
    setCps: (value: number) => {cps = Number(value);},
    setbpm: (value: number) => {cps = Number(value)/240;},
    setBpm: (value: number) => {cps = Number(value)/240;},
  });
  Object.defineProperty(core.Pattern.prototype,'p',{configurable:true,value(){return this;}});
  clearNodePools();
  const context = new OfflineAudioContext(2,48000 * (renderTimbres ? 2 : 120),48000);
  setAudioContext(context);
  setSuperdoughAudioController(null);
  await initAudio({maxPolyphony:1024,multiChannelOrbits:false});
  registerSynthSounds();
  registerSoundfonts();
  const evaluated = await core.evaluate(code,transpiler,{id:undefined,emitMiniLocations:false});
  if(!Number.isFinite(cps)||cps<=0)throw Error('Invalid tempo');
  if(fixedSeconds !== undefined) cycles=fixedSeconds*cps;
  const seconds=cycles/cps;
  if(seconds>117)throw Error('Excerpt exceeds 117s');
  const haps=evaluated.pattern.queryArc(0,cycles,{_cps:cps}).sort((a,b)=>Number(a.whole.begin)-Number(b.whole.begin));
  for(const hap of haps) {
    if(!hap.hasOnset())continue;
    hap.ensureObjectValue();
    await superdough(hap.value,Number(hap.whole.begin)/cps,Number(hap.duration)/cps,cps,Number(hap.whole.begin)/cps);
  }
  const controller=getSuperdoughAudioController();
  const deadline=Date.now()+6000;
  while(Object.values(controller.nodes).some(node=>node.reverbNode&&!node.reverbNode.buffer)) {
    if(Date.now()>deadline)throw Error('Reverb impulse response not ready');
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  const rendered=await context.startRendering();
  const length=Math.min(rendered.length,Math.ceil((fixedSeconds ?? (seconds+2))*48000));
  const excerpt=new AudioBuffer({numberOfChannels:2,length,sampleRate:48000});
  let peak=0,energy=0;
  for(let channel=0;channel<2;channel++) {
    const values=rendered.getChannelData(channel).subarray(0,length);
    excerpt.copyToChannel(values,channel);
    for(const value of values) {peak=Math.max(peak,Math.abs(value));energy+=value*value;}
  }
  if(!Number.isFinite(peak)||peak<1e-5)throw Error('Silent or invalid render');
  const response=await fetch('/save/'+id,{method:'POST',body:wav(excerpt)});
  if(!response.ok)throw Error('Unable to save audio');
  return {cps,cycles,seconds:excerpt.duration,haps:haps.length,sounds:[...new Map(haps.filter(h=>h.hasOnset()).map(h=>[JSON.stringify([h.value.s,h.value.bank,h.value.n,h.value.note]),{s:h.value.s,bank:h.value.bank,n:h.value.n,note:h.value.note}])).values()],peak,rms:Math.sqrt(energy/(length*2))};
}});
