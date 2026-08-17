import { useCallback, useState } from 'react';

export interface ExportParams {
  filename: string;
  beginCycle: number;
  endCycle: number;
  sampleRate: number;
}

export function useExportPopoverController(
  onExport: (params: ExportParams) => Promise<boolean>,
  onResetExportState: () => void,
) {
  const [exportOpen, setExportOpen] = useState(false);
  const handleExport = useCallback(async (params: ExportParams) => {
    const ok = await onExport(params);
    if (ok) {
      window.setTimeout(() => {
        setExportOpen(false);
        onResetExportState();
      }, 800);
    }
    return ok;
  }, [onExport, onResetExportState]);

  return { exportOpen, setExportOpen, handleExport };
}
