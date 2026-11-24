import { useCallback, useEffect, useRef, useState } from 'react';
import type { MusicUnderstanding } from '../../shared/music-understanding';
import { t } from '../lib/i18n';
import { understandHumming } from '../services/music-understanding';
import type { LocalHummingDraft } from '../types/humming';

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

interface UnderstandingState {
  draft: LocalHummingDraft | null;
  pending: boolean;
  result: MusicUnderstanding | null;
  error: Parameters<typeof t>[0] | null;
}

function initialState(draft: LocalHummingDraft | null): UnderstandingState {
  return { draft, pending: false, result: null, error: null };
}

export function useHummingUnderstanding(draft: LocalHummingDraft | null) {
  const request = useRef<{ draft: LocalHummingDraft; controller: AbortController } | null>(null);
  const [state, setState] = useState(() => initialState(draft));
  const current = state.draft === draft ? state : initialState(draft);
  if (current !== state) setState(current);

  useEffect(() => () => {
    if (request.current && request.current.draft === draft) {
      request.current.controller.abort();
      request.current = null;
    }
  }, [draft]);

  const cancel = () => {
    request.current?.controller.abort();
    request.current = null;
    setState({ ...current, pending: false });
  };

  const analyze = useCallback(async (): Promise<MusicUnderstanding | null> => {
    if (!draft) return null;
    request.current?.controller.abort();
    const controller = new AbortController();
    request.current = { draft, controller };
    setState({ ...current, pending: true, error: null });
    const requestSignal = controller.signal;
    try {
      const result = await understandHumming(draft.blob, draft.ownerKey, requestSignal);
      if (requestSignal.aborted) return null;
      setState({ draft, result, pending: false, error: null });
      return result;
    } catch (cause) {
      if (!requestSignal.aborted) {
        const message = cause instanceof Error ? errorMessages[cause.message] : undefined;
        setState({ draft, result: null, pending: false, error: message ?? 'hummingUnderstandingFailed' });
      }
      return null;
    } finally {
      if (request.current?.controller === controller) {
        request.current = null;
        if (requestSignal.aborted) setState(state => ({ ...state, pending: false }));
      }
    }
  }, [current, draft]);

  return { analyze, cancel, pending: current.pending, result: current.result, error: current.error };
}
