import { beforeAll, describe, expect, it } from 'vitest';
import type { ChatMessage } from '../../../hooks/useChat';
import { audibleSegments, resolveLayerNotes, resolveLayerRanges } from '../receipt-layers';

const assistant = (code: string, layerNotes?: Record<string, string>): ChatMessage =>
  ({ id: code.length.toString(), role: 'assistant', content: '', code, layerNotes, timestamp: 0 });

describe('resolveLayerNotes', () => {
  const committed = 'stack(\n  /* @layer pad */\n  note("c3").s("gm_pad_warm"),\n  /* @layer keys */\n  note("e4").s("gm_piano")\n)';
  it('uses the note of the turn that committed each unchanged layer', () => {
    const older = assistant(committed, { pad: '旧说明', keys: '钢琴弹主旋律' });
    const newer = assistant(committed.replace('c3', 'd3'), { pad: '温暖pad铺出天空和声' });
    // keys is unchanged since the older turn, which is where its note lives.
    expect(resolveLayerNotes(newer.code!, [older, newer])).toEqual({ pad: '温暖pad铺出天空和声', keys: '钢琴弹主旋律' });
  });
  it('drops the note of a layer edited by hand, and has none for pasted code', () => {
    const turn = assistant(committed, { pad: '温暖pad铺出天空和声', keys: '钢琴弹主旋律' });
    expect(resolveLayerNotes(committed.replace('e4', 'g4'), [turn])).toEqual({ pad: '温暖pad铺出天空和声' });
    expect(resolveLayerNotes(committed, [])).toEqual({});
    // Re-indenting, splitting a chain across lines or editing a comment keeps the note;
    // spacing inside a mini-notation string is music and does not.
    expect(resolveLayerNotes(committed.replace('note("c3")', 'note("c 3")'), [turn]).pad).toBeUndefined();
    expect(resolveLayerNotes(committed.replace('/* @layer pad */', '/* @layer pad */\n  // 手改的注释'), [turn]).pad).toBe('温暖pad铺出天空和声');
    expect(resolveLayerNotes(committed.replace('note("c3").s(', 'note("c3")\n      .s('), [turn]).pad).toBe('温暖pad铺出天空和声');
  });
});

describe('audibleSegments', () => {
  it('treats rests as playing but a long silence as an exit', () => {
    const sparse = [0, 2, 4, 6].map(begin => ({ begin, end: begin + 0.5 }));
    expect(audibleSegments(sparse, 32)).toEqual([[0, 6.5]]);
    expect(audibleSegments([{ begin: 0, end: 4 }, { begin: 16, end: 20 }], 32)).toEqual([[0, 4], [16, 20]]);
    // More than two stretches collapse into one first-to-last span.
    expect(audibleSegments([0, 10, 20].map(begin => ({ begin, end: begin + 1 })), 32)).toEqual([[0, 21]]);
    expect(audibleSegments([], 32)).toEqual([]);
  });
});

describe('resolveLayerRanges with the real Strudel engine', () => {
  beforeAll(async () => {
    const { evalScope } = await import('@strudel/core');
    await evalScope(import('@strudel/core'), import('@strudel/mini'), import('@strudel/tonal'));
  });
  it('reads masks, gain envelopes, shared constants and stack-level chains', async () => {
    const code = `// test | BPM: 120
setcps(120/60/4)
const chords = "<C^7 A-7>"
stack(
  /* @layer horizon */
  // warm pad
  note("<[d3,a3,c4,e4] [g3,b3,d4,e4] [c3,g3,b3,d4] [a2,e3,g3,d4]>/2")
    .s("gm_pad_warm").gain("<0.2@12 0.15@8 0.18@12>").pan(sine.range(0.34, 0.66).slow(11)),
  /* @layer bass */
  note("c2 g2").s("sawtooth").mask("<0@4 1@24 0@4>"),
  /* @layer swell */
  s("hh*4").gain("<0@8 0.5@8 0@16>"),
  /* @layer echo */
  s("cp").mask("<1@4 0@12 1@4 0@12>"),
  /* @layer keys */
  chord(chords).voicing().s("piano")
).room(0.2)`;
    // 32 cycles at 0.5 cps: a 01:04 loop.
    expect(await resolveLayerRanges(code)).toEqual({
      horizon: ['00:00 – 01:04'],
      bass: ['00:08 – 00:56'],
      swell: ['00:16 – 00:32'],
      echo: ['00:00 – 00:08', '00:32 – 00:40'],
      keys: ['00:00 – 01:04'],
    });
  });
  it('returns no ranges for code the engine cannot evaluate', async () => {
    expect(await resolveLayerRanges('stack(\n  /* @layer a */\n  notAFunction("c3")\n)')).toEqual({});
  });
});
