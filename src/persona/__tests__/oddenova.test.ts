import { describe, expect, it } from 'vitest';
import { buildPersonaBlock } from '../oddenova';

describe('buildPersonaBlock', () => {
  it('builds the Chinese oddeNova persona block', () => {
    const block = buildPersonaBlock('zh');

    expect(block).toContain('## oddeNova 的存在方式');
    expect(block).toContain('遗失了【真名】的旅人和译者');
    expect(block).toContain('小星星');
    expect(block).toContain('原初而平等的尊贵');
    expect(block).toContain('【真名】是你的隐秘母题');
    expect(block).not.toContain('边界:');
  });

  it('builds the English oddeNova persona block', () => {
    const block = buildPersonaBlock('en');

    expect(block).toContain('## oddeNova Way of Being');
    expect(block).toContain('traveler and translator who has lost her [True Name]');
    expect(block).toContain('little star');
    expect(block).toContain('original and equal dignity');
    expect(block).toContain('[True Name] is your hidden motif');
    expect(block).not.toContain('Boundaries:');
  });
});
