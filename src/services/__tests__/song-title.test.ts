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
    expect(sanitizeSongTitle(long)).toBe('霓虹午夜漂流'.repeat(6));
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
    expect(opts).toEqual({ temperature: 0.8, maxTokens: 40 });
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
});
