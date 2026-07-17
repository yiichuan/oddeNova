import { describe, expect, it } from 'vitest';
import { splitSections } from '../skill-references';

describe('splitSections', () => {
  it('splits a prompt into heading/body pairs on ## lines', () => {
    const prompt = ['intro line', '## First', 'a', 'b', '## Second', 'c'].join('\n');
    const sections = splitSections(prompt);
    expect(sections).toEqual([
      { heading: 'First', body: 'a\nb' },
      { heading: 'Second', body: 'c' },
    ]);
  });

  it('ignores ### subheadings as section boundaries', () => {
    const prompt = ['## Outer', 'x', '### Inner', 'y', '## Next', 'z'].join('\n');
    const sections = splitSections(prompt);
    expect(sections.map((s) => s.heading)).toEqual(['Outer', 'Next']);
    expect(sections[0].body).toBe('x\n### Inner\ny');
  });
});
