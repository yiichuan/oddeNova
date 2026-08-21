import type { OddeNovaImportResult } from '../../hooks/useOddeNovaImport';
import { t } from '../../lib/i18n';

interface OddeNovaImportNoticeProps {
  result: OddeNovaImportResult;
}

function getNoticeCopy(result: OddeNovaImportResult): string | null {
  if (result.status === 'success') {
    if (result.outcome === 'updated') return t('importUpdated');
    if (result.outcome === 'branched') return t('importBranched');
    return t('importSucceeded');
  }
  if (result.status === 'error') {
    return t(result.reason === 'unsupported-version' ? 'importUnsupported' : 'importInvalid');
  }
  return null;
}

export default function OddeNovaImportNotice({ result }: OddeNovaImportNoticeProps) {
  const copy = getNoticeCopy(result);
  if (!copy) return null;

  const isError = result.status === 'error';
  return (
    <div
      className={`fixed top-4 left-1/2 z-[60] max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-lg border px-4 py-3 text-center text-sm shadow-lg ${
        isError
          ? 'border-red-400/30 bg-bg-primary text-red-400'
          : 'border-border bg-bg-secondary text-text-primary'
      }`}
      role={isError ? 'alert' : 'status'}
    >
      <p>{copy}</p>
      {result.status === 'success' && !result.persistent ? (
        <p className="mt-1 text-xs text-amber-300">{t('importMemoryWarning')}</p>
      ) : null}
    </div>
  );
}
