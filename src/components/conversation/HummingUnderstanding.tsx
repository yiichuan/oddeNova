import { LoaderCircle } from 'lucide-react';
import type { useHummingUnderstanding } from '../../hooks/useHummingUnderstanding';
import { t } from '../../lib/i18n';

type Props = ReturnType<typeof useHummingUnderstanding> & {
  disabled?: boolean;
};

export default function HummingUnderstanding({ analyze, cancel, pending, result, error, disabled }: Props) {
  return (
    <div className="min-w-0 flex-1 text-xs text-text-secondary">
      <div className="flex flex-wrap items-center gap-x-2">
        <button type="button" onClick={() => { void analyze(); }} disabled={pending || disabled} className="rounded-md px-2 py-1 underline hover:text-text-primary disabled:opacity-50">
          {t('hummingUnderstand')}
        </button>
        {pending ? (
          <>
            <span role="status" className="inline-flex items-center gap-1.5">
              <LoaderCircle size={12} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
              {t('hummingUnderstandingPending')}
            </span>
            <button type="button" onClick={cancel} className="rounded-md px-2 py-1 underline hover:text-text-primary">
              {t('hummingCancelRecognition')}
            </button>
          </>
        ) : <span className="text-text-muted">{t('hummingUnderstandingUpload')}</span>}
      </div>
      {error && <p role="alert" className="mt-1 text-error">{t(error)}</p>}
      {result && (
        <dl aria-label={t('hummingUnderstandingResult')} className="mt-2 max-h-44 space-y-2 overflow-y-auto break-words border-t border-border pt-2">
          <div><dt className="font-medium text-text-primary">{t('hummingUnderstandingMelodyStyle')}</dt><dd>{result.melodyStyle}</dd></div>
        </dl>
      )}
    </div>
  );
}
