import type { StrudelState } from '../services/strudel';
import { t } from './i18n';

export function getEngineUnavailableMessage(
  status: StrudelState['engineStatus'],
): string | null {
  if (status === 'failed') return t('engineFailedRetry');
  if (status === 'initializing') return t('engineStarting');
  return null;
}
