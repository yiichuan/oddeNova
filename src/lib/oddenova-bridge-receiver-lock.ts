import { normalizeOddeNovaBridgeBaseUrl } from './oddenova-bridge';

export interface OddeNovaBridgeLock {
  name: string;
}

export interface OddeNovaBridgeLockManager {
  request<T>(
    name: string,
    options: { mode: 'exclusive'; ifAvailable: true },
    callback: (lock: OddeNovaBridgeLock | null) => Promise<T> | T,
  ): Promise<T>;
}

export type OddeNovaBridgeReceiverLockResult = 'completed' | 'occupied' | 'unsupported';

interface ReceiverIdentity {
  projectId: string;
  baseUrl: string;
  bindingId?: string;
}

const RECEIVER_LOCK_PREFIX = 'oddenova-bridge-receiver';

export function oddeNovaBridgeReceiverLockName(identity: ReceiverIdentity): string {
  const projectKey = `${normalizeOddeNovaBridgeBaseUrl(identity.baseUrl)}\0${identity.projectId}`;
  return `${RECEIVER_LOCK_PREFIX}:${projectKey}\0${identity.bindingId ?? 'legacy'}`;
}

function browserLockManager(): OddeNovaBridgeLockManager | undefined {
  if (typeof navigator === 'undefined' || !navigator.locks) return undefined;
  return navigator.locks as OddeNovaBridgeLockManager;
}

export async function runWithOddeNovaBridgeReceiverLock(
  lockName: string,
  task: () => Promise<void>,
  lockManager: OddeNovaBridgeLockManager | null | undefined = browserLockManager(),
): Promise<OddeNovaBridgeReceiverLockResult> {
  if (!lockManager) return 'unsupported';
  let acquired = false;
  await lockManager.request(lockName, { mode: 'exclusive', ifAvailable: true }, async (lock) => {
    if (!lock) return;
    acquired = true;
    await task();
  });
  return acquired ? 'completed' : 'occupied';
}
