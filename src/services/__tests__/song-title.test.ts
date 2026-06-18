import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../llm', () => ({
  chatOnce: vi.fn(),
}));

import { chatOnce } from '../llm';
import { generateSongTitle, sanitizeSongTitle } from '../song-title';

const mockedChatOnce = vi.mocked(chatOnce);

describe('sanitizeSongTitle', () => {
  it('removes quotes, file extensions, unsafe filename characters, and extra whitespace', () => {
    expect(sanitizeSongTitle('  "Neon / Midnight: Drift.wav"  ')).toBe('Neon Midnight Drift');
  });

  it('preserves Chinese characters and trims to 60 visible characters', () => {
    const long = '霓虹午夜漂流'.repeat(12);
    const sanitized = sanitizeSongTitle(long);

    expect(sanitized).toHaveLength(60);
    expect(sanitized).toBe('霓虹午夜漂流'.repeat(10));
    expect(long.startsWith(sanitized)).toBe(true);
  });

  it('trims emoji titles to 60 code points without splitting surrogate pairs', () => {
    const sanitized = sanitizeSongTitle(`${'A'.repeat(59)}🎵Z`);

    expect(Array.from(sanitized)).toHaveLength(60);
    expect(sanitized).toBe(`${'A'.repeat(59)}🎵`);
    expect(sanitized).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/u);
    expect(sanitized).not.toMatch(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u);
  });

  it('collapses multiline model output to spaces', () => {
    expect(sanitizeSongTitle('Neon\nMidnight\r\nDrift')).toBe('Neon Midnight Drift');
  });

  it('throws when sanitization leaves no usable title', () => {
    expect(() => sanitizeSongTitle('////\\\\****')).toThrow('No usable song title');
  });
});

describe('generateSongTitle', () => {
  beforeEach(() => {
    mockedChatOnce.mockReset();
  });

  it('asks for a localized title and returns a sanitized model response', async () => {
    mockedChatOnce.mockResolvedValue('「霓虹/午夜:漂流」');

    await expect(generateSongTitle({
      code: 'setcps(0.5)\ns("bd*4")',
      sessionTitle: '夜晚 lo-fi',
      messages: [
        { role: 'user', content: '做一个夜晚感的 lofi', timestamp: 1 },
        { role: 'assistant', content: '已经加入柔和鼓组', timestamp: 2 },
      ],
      locale: 'zh-CN',
    })).resolves.toBe('霓虹午夜漂流');

    expect(mockedChatOnce).toHaveBeenCalledTimes(1);
    const [system, user, opts] = mockedChatOnce.mock.calls[0];
    expect(system).toContain('Chinese');
    expect(user).toContain('夜晚 lo-fi');
    expect(user).toContain('setcps(0.5)');
    expect(user).toContain('做一个夜晚感的 lofi');
    expect(opts).toEqual({ temperature: 0.8, maxTokens: 2000 });
  });

  it('reserves enough completion tokens for reasoning models to still emit a title', async () => {
    mockedChatOnce.mockResolvedValue('反叛引擎');

    await generateSongTitle({
      code: '// CLASSIC ROCK | BPM: 130\nsetcps(0.5417)\nstack(s("bd ~ bd [bd bd]"), note("<[e3,b3] [c3,g3]>/4").s("supersaw"))',
      sessionTitle: 'A rebellious, fist-pumping classic rock anthem',
      messages: [
        { role: 'assistant', content: 'Built a full classic rock arrangement in E minor at 130 BPM.', timestamp: 1 },
      ],
      locale: 'zh-CN',
    });

    const opts = mockedChatOnce.mock.calls[0][2];
    expect(opts?.maxTokens).toBeGreaterThanOrEqual(200);
  });

  it('uses only the latest 6 messages', async () => {
    mockedChatOnce.mockResolvedValue('Late Night Signals');

    await generateSongTitle({
      code: 's("bd")',
      sessionTitle: 'Session',
      messages: Array.from({ length: 8 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `message-${i + 1}`,
        timestamp: i + 1,
      })),
      locale: 'en',
    });

    const userPrompt = mockedChatOnce.mock.calls[0][1];
    expect(userPrompt).not.toContain('message-1');
    expect(userPrompt).not.toContain('message-2');
    expect(userPrompt).toContain('message-3');
    expect(userPrompt).toContain('message-8');
  });

  it('treats a session with only a greeting message as having no chat context', async () => {
    mockedChatOnce.mockResolvedValue('Late Night Signals');

    await generateSongTitle({
      code: 's("bd")',
      sessionTitle: 'Session',
      messages: [
        { role: 'assistant', content: '嗨，我在这儿。', timestamp: 1, isGreeting: true },
      ],
      locale: 'zh-CN',
    });

    const userPrompt = mockedChatOnce.mock.calls[0][1];
    expect(userPrompt).not.toContain('嗨，我在这儿。');
    expect(userPrompt).toContain('No chat context.');
  });

  it('excludes the greeting message from chat context when real messages follow it', async () => {
    mockedChatOnce.mockResolvedValue('Late Night Signals');

    await generateSongTitle({
      code: 's("bd")',
      sessionTitle: 'Session',
      messages: [
        { role: 'assistant', content: '嗨，我在这儿。', timestamp: 1, isGreeting: true },
        { role: 'user', content: '做一个夜晚感的 lofi', timestamp: 2 },
        { role: 'assistant', content: '已经加入柔和鼓组', timestamp: 3 },
      ],
      locale: 'zh-CN',
    });

    const userPrompt = mockedChatOnce.mock.calls[0][1];
    expect(userPrompt).not.toContain('嗨，我在这儿。');
    expect(userPrompt).toContain('做一个夜晚感的 lofi');
    expect(userPrompt).toContain('已经加入柔和鼓组');
  });

  it('truncates huge session titles in the prompt', async () => {
    mockedChatOnce.mockResolvedValue('Late Night Signals');
    const sessionTitle = 'Session '.repeat(40);

    await generateSongTitle({
      code: 's("bd")',
      sessionTitle,
      locale: 'en',
    });

    const userPrompt = mockedChatOnce.mock.calls[0][1];
    const sessionTitleLine = userPrompt.split('\n')[0];
    const promptTitle = sessionTitleLine.replace('Session title: ', '');

    expect(Array.from(promptTitle)).toHaveLength(120);
    expect(promptTitle).toBe(Array.from(sessionTitle.trim()).slice(0, 120).join(''));
    expect(userPrompt).not.toContain(sessionTitle.trim());
  });

  it('uses an untitled session fallback for whitespace-only session titles', async () => {
    mockedChatOnce.mockResolvedValue('Late Night Signals');

    await generateSongTitle({
      code: 's("bd")',
      sessionTitle: '   ',
      locale: 'en',
    });

    const userPrompt = mockedChatOnce.mock.calls[0][1];
    expect(userPrompt).toContain('Session title: Untitled session');
  });
});
