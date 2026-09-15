import { t } from '../../lib/i18n';

export const PRIVACY_URL = '/privacy';

/**
 * The privacy policy is a standalone document, never a workspace page: it
 * opens in a new tab so whatever is being generated, played or pending sync
 * keeps its state. Stateless on purpose — it must not hold session or auth
 * state, and it must stay clickable while a form it sits in is busy.
 */
export default function PrivacyPolicyLink({ className }: { className?: string }) {
  return (
    <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" className={className}>
      {t('privacyPolicy')}
      <span className="sr-only">{t('opensInNewTab')}</span>
    </a>
  );
}
