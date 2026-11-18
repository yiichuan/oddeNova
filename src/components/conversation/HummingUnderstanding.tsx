import { useEffect, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import type { MusicUnderstanding } from '../../../shared/music-understanding';
import { t } from '../../lib/i18n';
import { understandHumming } from '../../services/music-understanding';
import type { LocalHummingDraft } from '../../types/humming';

const errorMessages: Partial<Record<string, Parameters<typeof t>[0]>> = {
  sign_in_required: 'hummingUnderstandingSignIn',
  not_configured: 'hummingUnderstandingUnavailable',
  invalid_provider_url: 'hummingUnderstandingProviderUrl',
  provider_endpoint_failed: 'hummingUnderstandingProviderUrl',
  provider_auth_failed: 'hummingUnderstandingProviderAuth',
  provider_rejected_audio: 'hummingUnderstandingProviderInput',
  invalid_result: 'hummingUnderstandingInvalidResult',
  session_check_failed: 'hummingUnderstandingSessionCheck',
  invalid_audio: 'hummingUnderstandingInvalidAudio',
  audio_too_large: 'hummingUnderstandingInvalidAudio',
  rate_limited: 'hummingUnderstandingRateLimited',
  timeout: 'hummingUnderstandingTimeout',
};

export default function HummingUnderstanding({ draft }: { draft: LocalHummingDraft }) {
  const request = useRef<AbortController | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<MusicUnderstanding | null>(null);
  const [error, setError] = useState<Parameters<typeof t>[0] | null>(null);

  useEffect(() => () => request.current?.abort(), []);

  const cancel = () => {
    request.current?.abort();
    request.current = null;
    setPending(false);
  };

  const analyze = async () => {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setError(null);
    try {
      const next = await understandHumming(draft.blob, draft.ownerKey, controller.signal);
      if (!controller.signal.aborted) setResult(next);
    } catch (cause) {
      if (!controller.signal.aborted) {
        const message = cause instanceof Error ? errorMessages[cause.message] : undefined;
        setError(message ?? 'hummingUnderstandingFailed');
      }
    } finally {
      if (request.current === controller) {
        request.current = null;
        setPending(false);
      }
    }
  };

  return (
    <div className="min-w-0 flex-1 text-xs text-text-secondary">
      <div className="flex flex-wrap items-center gap-x-2">
        <button type="button" onClick={() => { void analyze(); }} disabled={pending} className="rounded-md px-2 py-1 underline hover:text-text-primary disabled:opacity-50">
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
          <div><dt className="font-medium text-text-primary">{t('hummingUnderstandingMelody')}</dt><dd>{result.melody}</dd></div>
          <div><dt className="font-medium text-text-primary">{t('hummingUnderstandingRhythm')}</dt><dd>{result.rhythm}</dd></div>
          <div><dt className="font-medium text-text-primary">{t('hummingUnderstandingSuggestions')}</dt><dd>{result.suggestions}</dd></div>
          {result.uncertainty && <div><dt className="font-medium text-text-primary">{t('hummingUnderstandingUncertainty')}</dt><dd>{result.uncertainty}</dd></div>}
        </dl>
      )}
    </div>
  );
}
