import { describe, expect, it, vi } from 'vitest';
import { createLatestSaveQueue } from '../latest-save-queue';

interface Snapshot {
  id: string;
  content: string;
}

describe('createLatestSaveQueue', () => {
  it('serializes saves per session and coalesces pending snapshots to the latest state', async () => {
    let releaseFirst!: () => void;
    const save = vi.fn<(snapshot: Snapshot) => Promise<void>>()
      .mockImplementationOnce(() => new Promise<void>((resolve) => {
        releaseFirst = resolve;
      }))
      .mockResolvedValue(undefined);
    const queue = createLatestSaveQueue(save);

    void queue.enqueue({ id: 's-1', content: '构思' });
    void queue.enqueue({ id: 's-1', content: '中间进度' });
    void queue.enqueue({ id: 's-1', content: '最终回复和代码修改' });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenLastCalledWith({ id: 's-1', content: '构思' });

    releaseFirst();
    await queue.flush();

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith({
      id: 's-1',
      content: '最终回复和代码修改',
    });
  });

  it('retries a latest save that failed before flush was called', async () => {
    const snapshot = { id: 's-1', content: '最终回复' };
    const save = vi.fn<(value: Snapshot) => Promise<void>>()
      .mockRejectedValueOnce(new Error('temporary outage'))
      .mockResolvedValue(undefined);
    const queue = createLatestSaveQueue(save);

    await expect(queue.enqueue(snapshot)).rejects.toThrow('temporary outage');
    await queue.flush();

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(snapshot);
  });

  it('keeps retrying a settled latest-save failure on later flush attempts', async () => {
    const error = new Error('still offline');
    const save = vi.fn<(value: Snapshot) => Promise<void>>()
      .mockRejectedValue(error);
    const queue = createLatestSaveQueue(save);

    await expect(queue.enqueue({ id: 's-1', content: '最终回复' })).rejects.toBe(error);
    await expect(queue.flush()).rejects.toBe(error);
    await expect(queue.flush()).rejects.toBe(error);

    expect(save).toHaveBeenCalledTimes(3);
  });

  it('clears a settled failure after a newer snapshot saves successfully', async () => {
    const save = vi.fn<(value: Snapshot) => Promise<void>>()
      .mockRejectedValueOnce(new Error('temporary outage'))
      .mockResolvedValue(undefined);
    const queue = createLatestSaveQueue(save);

    await expect(queue.enqueue({ id: 's-1', content: '旧回复' })).rejects.toThrow();
    await queue.enqueue({ id: 's-1', content: '新回复' });
    await queue.flush();

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith({ id: 's-1', content: '新回复' });
  });

  it('discards a failed snapshot so a deleted session cannot be retried later', async () => {
    const save = vi.fn<(value: Snapshot) => Promise<void>>()
      .mockRejectedValueOnce(new Error('temporary outage'))
      .mockResolvedValue(undefined);
    const queue = createLatestSaveQueue(save);

    await expect(queue.enqueue({ id: 's-1', content: '即将删除' })).rejects.toThrow();
    await queue.discard('s-1');
    await queue.flush();

    expect(save).toHaveBeenCalledTimes(1);
  });
});
