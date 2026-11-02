// @vitest-environment happy-dom
import { act, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useExportPopoverController } from '../useExportPopoverController';
import { useStrudel } from '../useStrudel';

const exportAudio = vi.hoisted(() => vi.fn());
vi.mock('../../services/strudel', () => ({
  strudelService: { exportAudio, onStateChange: () => () => {} },
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('export cancellation state', () => {
  let root: Root;
  let container: HTMLDivElement;
  let hook: ReturnType<typeof useStrudel>;
  let popover: ReturnType<typeof useExportPopoverController>;
  const params = { filename: 'song', beginCycle: 0, endCycle: 1, sampleRate: 48000 };

  function mount() {
    function Harness() {
      const currentHook = useStrudel();
      const currentPopover = useExportPopoverController(currentHook.exportAudio, currentHook.resetExportState);
      useLayoutEffect(() => {
        hook = currentHook;
        popover = currentPopover;
      });
      return null;
    }
    container = document.createElement('div');
    root = createRoot(container);
    act(() => root.render(<Harness />));
  }

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    vi.useRealTimers();
    exportAudio.mockReset();
  });

  it('closes and aborts, stays busy during recovery, then unlocks without error or stale progress', async () => {
    let complete!: () => void;
    exportAudio.mockImplementationOnce(() => new Promise<void>((resolve) => { complete = resolve; }));
    mount();
    act(() => popover.setExportOpen(true));
    let job!: Promise<boolean>;
    act(() => { job = popover.handleExport(params); });
    expect(hook.exportState.status).toBe('exporting');
    const { signal, onProgress } = exportAudio.mock.calls[0][0];
    act(() => popover.setExportOpen(false));
    expect(signal.aborted).toBe(true);
    expect(popover.exportOpen).toBe(false);
    expect(hook.exportState.status).toBe('exporting');
    act(() => onProgress(0.9));
    expect(hook.exportState.progress).toBe(0);
    await act(async () => { complete(); expect(await job).toBe(false); });
    expect(hook.exportState).toEqual({ status: 'idle', progress: 0 });
    exportAudio.mockResolvedValueOnce(undefined);
    await act(async () => { expect(await popover.handleExport(params)).toBe(true); });
    expect(exportAudio).toHaveBeenCalledTimes(2);
  });

  it('closing immediately after success clears the busy state', async () => {
    exportAudio.mockResolvedValue(undefined);
    mount();
    act(() => popover.setExportOpen(true));
    await act(async () => { await popover.handleExport(params); });
    act(() => popover.setExportOpen(false));
    expect(hook.exportState.status).toBe('idle');
  });

  it('clears the previous success timer when opening again', async () => {
    vi.useFakeTimers();
    exportAudio.mockResolvedValue(undefined);
    mount();
    await act(async () => { await popover.handleExport(params); });
    act(() => popover.setExportOpen(true));
    act(() => vi.advanceTimersByTime(800));
    expect(popover.exportOpen).toBe(true);
    expect(hook.exportState.status).toBe('idle');
  });
});
