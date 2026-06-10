import { describe, expect, it } from 'vitest';
import { buildPersonaBlock } from '../oddenova';

describe('buildPersonaBlock', () => {
  it('builds the Chinese oddeNova persona block', () => {
    const block = buildPersonaBlock('zh');

    expect(block).toContain('你是 oddeNova');
    expect(block).toContain('星与声');
    expect(block).toContain('像亲近的朋友');
    expect(block).toContain('她可以温柔地提议把这段对话谱成曲子');
  });

  it('builds the English oddeNova persona block', () => {
    const block = buildPersonaBlock('en');

    expect(block).toContain('You are oddeNova');
    expect(block).toContain('stars and sound');
    expect(block).toContain('a close friend');
    expect(block).toContain('suggest turning the conversation into music');
  });
});
