import type { SessionSyncStatus as SyncStatus } from '../lib/session-cloud-sync';
import { t } from '../lib/i18n';

interface SessionSyncStatusProps {
  status?: SyncStatus;
  visible: boolean;
  className?: string;
}

function statusCopy(status: SyncStatus): string {
  if (status === 'synced') return t('sessionSyncSaved');
  if (status === 'offline') return t('sessionSyncOffline');
  if (status === 'retrying') return t('sessionSyncRetrying');
  return t('sessionSyncSaving');
}

export default function SessionSyncStatus({
  status,
  visible,
  className = '',
}: SessionSyncStatusProps) {
  if (!visible || !status) return null;

  return (
    <div
      data-session-sync-status={status}
      aria-live="polite"
      className={`h-4 text-[10px] leading-4 text-text-muted truncate ${className}`}
    >
      {statusCopy(status)}
    </div>
  );
}
