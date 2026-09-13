import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSessionWriteThrottle } from '../session-write-throttle';

interface Snapshot {
  id: string;
  content: string;
}

const INTERVAL = 1000;

describe('createSessionWriteThrottle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('writes a streamed burst once at its start and once at the end of the window', async () => {
    const write = vi.fn<(snapshot: Snapshot) => Promise<void>>().mockResolvedValue(undefined);
    const throttle = createSessionWriteThrottle(write, INTERVAL);

    throttle.schedule({ id: 's-1', content: '构' });
    throttle.schedule({ id: 's-1', content: '构思' });
    throttle.schedule({ id: 's-1', content: '构思中' });

    // Leading edge only: a reload right now still finds the turn.
    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenLastCalledWith({ id: 's-1', content: '构' });

    await vi.advanceTimersByTimeAsync(INTERVAL);

    // The two deltas in between collapsed into the newest snapshot.
    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenLastCalledWith({ id: 's-1', content: '构思中' });
  });

  it('keeps the window shut for a full interval after each trailing write', async () => {
    const write = vi.fn<(snapshot: Snapshot) => Promise<void>>().mockResolvedValue(undefined);
    const throttle = createSessionWriteThrottle(write, INTERVAL);

    for (let tick = 0; tick < 40; tick++) {
      throttle.schedule({ id: 's-1', content: `delta-${tick}` });
      await vi.advanceTimersByTimeAsync(100);
    }

    // 4s of deltas at 10/s: the leading write plus one per elapsed window,
    // not one per delta.
    expect(write).toHaveBeenCalledTimes(5);
    expect(write).toHaveBeenLastCalledWith({ id: 's-1', content: 'delta-39' });
  });

  it('throttles each session separately', async () => {
    const write = vi.fn<(snapshot: Snapshot) => Promise<void>>().mockResolvedValue(undefined);
    const throttle = createSessionWriteThrottle(write, INTERVAL);

    throttle.schedule({ id: 's-1', content: 'a' });
    throttle.schedule({ id: 's-2', content: 'b' });

    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenNthCalledWith(1, { id: 's-1', content: 'a' });
    expect(write).toHaveBeenNthCalledWith(2, { id: 's-2', content: 'b' });
  });

  it('lets an authoritative write overtake the snapshot a stream had scheduled', async () => {
    const write = vi.fn<(snapshot: Snapshot) => Promise<void>>().mockResolvedValue(undefined);
    const throttle = createSessionWriteThrottle(write, INTERVAL);

    throttle.schedule({ id: 's-1', content: 'streamed' });
    throttle.schedule({ id: 's-1', content: 'streamed more' });
    await throttle.writeNow({ id: 's-1', content: 'committed reply' });

    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenLastCalledWith({ id: 's-1', content: 'committed reply' });

    // The dropped snapshot must not land afterwards and undo the commit.
    await vi.advanceTimersByTimeAsync(INTERVAL * 3);
    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenLastCalledWith({ id: 's-1', content: 'committed reply' });
  });

  it('flushes the scheduled tail and waits for the write it issues', async () => {
    const write = vi.fn<(snapshot: Snapshot) => Promise<void>>().mockResolvedValue(undefined);
    const throttle = createSessionWriteThrottle(write, INTERVAL);

    throttle.schedule({ id: 's-1', content: 'first' });
    throttle.schedule({ id: 's-1', content: 'tail' });
    await throttle.flush();

    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenLastCalledWith({ id: 's-1', content: 'tail' });

    await vi.advanceTimersByTimeAsync(INTERVAL * 3);
    expect(write).toHaveBeenCalledTimes(2);
  });

  it('drops a discarded session’s tail so a delete is not undone', async () => {
    const write = vi.fn<(snapshot: Snapshot) => Promise<void>>().mockResolvedValue(undefined);
    const throttle = createSessionWriteThrottle(write, INTERVAL);

    throttle.schedule({ id: 's-1', content: 'first' });
    throttle.schedule({ id: 's-1', content: 'tail' });
    throttle.discard('s-1');

    await vi.advanceTimersByTimeAsync(INTERVAL * 3);
    await throttle.flush();

    expect(write).toHaveBeenCalledTimes(1);
    expect(write).toHaveBeenLastCalledWith({ id: 's-1', content: 'first' });
  });

  it('keeps streaming after a failed write instead of stalling on it', async () => {
    const write = vi.fn<(snapshot: Snapshot) => Promise<void>>()
      .mockRejectedValueOnce(new Error('IDB put failed'))
      .mockResolvedValue(undefined);
    const throttle = createSessionWriteThrottle(write, INTERVAL);

    throttle.schedule({ id: 's-1', content: 'first' });
    throttle.schedule({ id: 's-1', content: 'tail' });
    await throttle.flush();

    expect(write).toHaveBeenCalledTimes(2);
    expect(write).toHaveBeenLastCalledWith({ id: 's-1', content: 'tail' });
  });
});
