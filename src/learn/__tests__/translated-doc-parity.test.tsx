import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import Pwa from '../chapters/more/Pwa';
import FirstEffects from '../chapters/workshop/FirstEffects';
import FirstNotes from '../chapters/workshop/FirstNotes';
import FirstSounds from '../chapters/workshop/FirstSounds';
import PatternEffects from '../chapters/workshop/PatternEffects';

vi.mock('../mini-repl-engine', () => ({
  getMiniReplPrebake: vi.fn(),
}));

vi.mock('@strudel/core', () => ({
  midi2note: (note: number) => {
    const pitchClasses = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
    return `${pitchClasses[note % 12]}${Math.floor(note / 12) - 1}`;
  },
}));

function countMatches(value: string, pattern: RegExp) {
  return value.match(pattern)?.length ?? 0;
}

function countPlayableTableExamples(markup: string) {
  const tables = markup.match(/<table[\s\S]*?<\/table>/g) ?? [];
  return countMatches(tables.join(''), /aria-label="play"/g);
}

describe('translated workshop parity with strudel.cc', () => {
  it.each([
    ['First Sounds', FirstSounds, 12],
    ['First Notes', FirstNotes, 7],
    ['First Effects', FirstEffects, 9],
    ['Pattern Effects', PatternEffects, 5],
  ])('keeps all %s recap examples editable and playable', (_name, Chapter, expected) => {
    expect(countPlayableTableExamples(renderToStaticMarkup(<Chapter />))).toBe(expected);
  });

  it('keeps the two First Effects solutions collapsed and includes the ADSR diagram', () => {
    const markup = renderToStaticMarkup(<FirstEffects />);

    expect(countMatches(markup, /<details/g)).toBe(2);
    expect(countMatches(markup, /<summary/g)).toBe(2);
    expect(markup).toContain('点击查看答案');
    expect(markup).toContain('src="/learn-img/adsr.png"');
  });

  it('renders the two official standalone-app screenshots from local assets', () => {
    const markup = renderToStaticMarkup(<Pwa />);

    expect(markup).toContain('src="/learn-img/strudel-macos.png"');
    expect(markup).toContain('src="/learn-img/strudel-linux.png"');
    expect(markup).toContain('Strudel 在 macOS 上的独立应用');
    expect(markup).toContain('Strudel 在 Linux 上的独立应用');
    expect(existsSync(resolve('public/learn-img/strudel-macos.png'))).toBe(true);
    expect(existsSync(resolve('public/learn-img/strudel-linux.png'))).toBe(true);
  });
});
