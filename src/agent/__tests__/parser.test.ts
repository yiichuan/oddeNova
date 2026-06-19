// src/agent/__tests__/parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseScore, bpmToCps, summariseScore } from '../parser';

describe('parseScore — 基础结构', () => {
  it('空字符串返回空结果', () => {
    const r = parseScore('');
    expect(r.hasStack).toBe(false);
    expect(r.layers).toEqual([]);
    expect(r.cps).toBeNull();
  });

  it('只有 setcps 无 stack', () => {
    const r = parseScore('setcps(0.5)');
    expect(r.cps).toBeCloseTo(0.5);
    expect(r.bpm).toBe(120);
    expect(r.hasStack).toBe(false);
    expect(r.layers).toEqual([]);
  });

  it('标准结构：setcps + stack + 2 层', () => {
    const code = `setcps(0.5)
stack(
  /* @layer drums */
  s("bd ~ sd ~"),
  /* @layer bass */
  note("c2 e2")
)`;
    const r = parseScore(code);
    expect(r.hasStack).toBe(true);
    expect(r.layers).toHaveLength(2);
    expect(r.layers[0].name).toBe('drums');
    expect(r.layers[1].name).toBe('bass');
  });

  it('@layer 标记被识别，source 不含标记本身', () => {
    const code = `stack(\n  /* @layer pad */\n  note("c4")\n)`;
    const r = parseScore(code);
    expect(r.layers[0].name).toBe('pad');
    expect(r.layers[0].source).not.toContain('@layer');
    expect(r.layers[0].source).toContain('note("c4")');
  });

  it('无标记时自动命名 layer_0 / layer_1', () => {
    const code = `stack(\n  s("bd"),\n  s("sd")\n)`;
    const r = parseScore(code);
    expect(r.layers[0].name).toBe('layer_0');
    expect(r.layers[1].name).toBe('layer_1');
  });
});

describe('parseScore — 边界 case', () => {
  it('嵌套括号内的逗号不被误切为 layer 分隔符', () => {
    const code = `stack(
  /* @layer melody */
  note("c3 e3").lpf(note("c3 e3")),
  /* @layer drums */
  s("bd sd")
)`;
    const r = parseScore(code);
    expect(r.layers).toHaveLength(2);
    expect(r.layers[0].name).toBe('melody');
    expect(r.layers[1].name).toBe('drums');
  });

  it('字符串内的逗号不被误切', () => {
    const code = `stack(\n  /* @layer x */\n  s("bd, sd")\n)`;
    const r = parseScore(code);
    expect(r.layers).toHaveLength(1);
    expect(r.layers[0].source).toContain('"bd, sd"');
  });

  it('注释内的 stack 关键字不触发 hasStack', () => {
    const code = `// stack(s("bd"))\nnote("c4")`;
    const r = parseScore(code);
    expect(r.hasStack).toBe(false);
  });

  it('silence 裸代码 layers 为空', () => {
    const r = parseScore('setcps(0.5)\nsilence');
    expect(r.layers).toEqual([]);
  });
});

describe('bpmToCps', () => {
  it('120 BPM = 0.5 CPS', () => {
    expect(bpmToCps(120)).toBeCloseTo(0.5);
  });

  it('240 BPM = 1.0 CPS', () => {
    expect(bpmToCps(240)).toBeCloseTo(1.0);
  });

  it('极小 BPM 被限制在 0.05', () => {
    expect(bpmToCps(1)).toBeCloseTo(0.05);
  });
});

describe('summariseScore', () => {
  it('包含 bpm 和 layers 的 name', () => {
    const code = `setcps(0.5)\nstack(\n  /* @layer drums */\n  s("bd")\n)`;
    const r = summariseScore(parseScore(code));
    expect(r.bpm).toBe(120);
    expect(r.layers[0].name).toBe('drums');
  });

  it('超长 source 被截断为 80 字符以内', () => {
    const longSrc = 's("bd")' + '.gain(0.5)'.repeat(20); // >> 80 chars
    const code = `stack(\n  /* @layer x */\n  ${longSrc}\n)`;
    const r = summariseScore(parseScore(code));
    expect(r.layers[0].preview.length).toBeLessThanOrEqual(80);
  });
});

describe('envelope extraction', () => {
  it('从 .mask("<...>/N") 层提取出窗口', () => {
    const code = 'setcps(0.5)\nstack(\n  /* @layer drums */\n  s("bd*4").mask("<1 0 1 1>/16")\n)';
    const { layers } = parseScore(code);
    expect(layers[0].envelope).toBeDefined();
    expect(layers[0].envelope).toContain('16');
    expect(layers[0].envelope).toContain('mask');
  });

  it('从 pattern 内的 <...>/N 交替提取出窗口', () => {
    const code = 'setcps(0.5)\nstack(\n  /* @layer drums */\n  s("<bd*4 [bd*2 sd]>/8")\n)';
    const { layers } = parseScore(code);
    expect(layers[0].envelope).toContain('8');
  });

  it('静态层 envelope 为 undefined', () => {
    const code = 'setcps(0.5)\nstack(\n  /* @layer drums */\n  s("bd*4 sd")\n)';
    const { layers } = parseScore(code);
    expect(layers[0].envelope).toBeUndefined();
  });

  it('不带 /N 的 1-cycle <a b> 交替被排除', () => {
    const code = 'setcps(0.5)\nstack(\n  /* @layer drums */\n  s("bd <sd cp>")\n)';
    const { layers } = parseScore(code);
    expect(layers[0].envelope).toBeUndefined();
  });

  it('summariseScore 有包络时输出、无包络时省略', () => {
    const code =
      'setcps(0.5)\nstack(\n  /* @layer drums */\n  s("bd*4").mask("<1 1 0 1>/16"),\n  /* @layer bass */\n  note("c2*2")\n)';
    const { layers } = summariseScore(parseScore(code));
    expect(layers[0].envelope).toContain('16');
    expect(layers[1].envelope).toBeUndefined();
  });
});
