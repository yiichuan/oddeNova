import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';

export interface ExportParams {
  filename: string;
  beginCycle: number;
  endCycle: number;
  sampleRate: number;
  format?: 'wav' | 'mp3' | 'm4a';
  signal?: AbortSignal;
}

export function useExportPopoverController(
  onExport: (params: ExportParams) => Promise<boolean>,
  onResetExportState: () => void,
) {
  const [exportOpen, updateExportOpen] = useState(false);
  const active = useRef<AbortController | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const setExportOpen = useCallback((value: SetStateAction<boolean>) => {
    // All close paths, including the rendering Cancel button, cancel the job.
    const open = typeof value === 'function' ? value(exportOpen) : value;
    if (!open) active.current?.abort();
    clearTimeout(closeTimer.current);
    if (!active.current) onResetExportState();
    updateExportOpen(open);
  }, [exportOpen, onResetExportState]);

  useEffect(() => () => {
    active.current?.abort();
    clearTimeout(closeTimer.current);
  }, []);

  const handleExport = useCallback(async (params: ExportParams) => {
    if (active.current) return false;
    clearTimeout(closeTimer.current);
    const controller = new AbortController();
    active.current = controller;
    try {
      const ok = await onExport({ ...params, signal: controller.signal });
      if (ok && !controller.signal.aborted) {
        closeTimer.current = setTimeout(() => {
          updateExportOpen(false);
          onResetExportState();
        }, 800);
      }
      return ok && !controller.signal.aborted;
    } finally {
      if (active.current === controller) active.current = null;
    }
  }, [onExport, onResetExportState]);

  return { exportOpen, setExportOpen, handleExport };
}
