import type { SessionSyncStatus as SyncStatus } from '../../lib/session-cloud-sync';
import { t } from '../../lib/i18n';

interface SessionSyncStatusProps {
  status?: SyncStatus;
  visible: boolean;
  className?: string;
}

// Routine states ('dirty' / 'saving' / 'synced') stay silent — a successful
// autosave is the expectation, not news. Only unresolved problems get pixels,
// so anything on screen means the session is not safely in the cloud yet.
const PROBLEM_COPY: Partial<Record<SyncStatus, () => string>> = {
  offline: () => t('sessionSyncOffline'),
  retrying: () => t('sessionSyncRetrying'),
};

const TONE: Partial<Record<SyncStatus, string>> = {
  offline: 'border-warning/45 text-warning',
  retrying: 'border-error/55 text-error',
};

export default function SessionSyncStatus({
  status,
  visible,
  className = '',
}: SessionSyncStatusProps) {
  const copy = status && PROBLEM_COPY[status]?.();
  if (!visible || !status || !copy) return null;

  return (
    <div
      data-session-sync-status={status}
      role="status"
      aria-live="polite"
      className={`pointer-events-none max-w-full truncate rounded-full border bg-black/75 px-2.5 py-1 text-[11px] leading-none backdrop-blur-sm ${TONE[status] ?? ''} ${className}`}
    >
      {copy}
    </div>
  );
}
