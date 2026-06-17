import { describe, it, expect, vi } from 'vitest';
import { commitPlayback } from '../playback-commit';

describe('commitPlayback', () => {
  it('plays the code, then persists it as the session code', async () => {
    const play = vi.fn(async () => true);
    const setCurrentCode = vi.fn();
    await commitPlayback('note("c3")', 'S1', { play, setCurrentCode });
    expect(play).toHaveBeenCalledWith('note("c3")');
    expect(setCurrentCode).toHaveBeenCalledWith('note("c3")', 'S1');
  });

  it('persists the code even when playback fails (latest code is always the truth)', async () => {
    const play = vi.fn(async () => false);
    const setCurrentCode = vi.fn();
    await commitPlayback('broken(', 'S1', { play, setCurrentCode });
    expect(setCurrentCode).toHaveBeenCalledWith('broken(', 'S1');
  });

  it('returns whether playback succeeded', async () => {
    expect(await commitPlayback('x', 'S1', { play: async () => true, setCurrentCode: () => {} })).toBe(true);
    expect(await commitPlayback('x', 'S1', { play: async () => false, setCurrentCode: () => {} })).toBe(false);
  });

  it('persists after playback resolves, not before', async () => {
    const order: string[] = [];
    const play = vi.fn(async () => {
      order.push('play');
      return true;
    });
    const setCurrentCode = vi.fn(() => order.push('persist'));
    await commitPlayback('x', 'S1', { play, setCurrentCode });
    expect(order).toEqual(['play', 'persist']);
  });
});
