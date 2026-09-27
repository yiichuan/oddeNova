import {
  normalizeOddeNovaBridgeBaseUrl,
  oddeNovaBridgeIdentityMatches,
  type OddeNovaBridgeIdentity,
  type OddeNovaBridgeSnapshotV3,
  type StoredOddeNovaBridgeConnection,
} from './oddenova-bridge';
import { diffCreativeMessages, projectCreativeMessages } from './oddenova-bridge-messages';
import type { ChatMessage } from '../hooks/useChat';

export interface BridgeSessionSource {
  type?: string;
  projectId?: string;
  protocolVersion?: 2 | 3;
  baseUrl?: string;
  revision?: number;
  bindingId?: string;
  bridgeContentHash?: string;
}

export interface BridgeSessionCandidate {
  id: string;
  title: string;
  code: string;
  messages: ChatMessage[];
  externalSource?: BridgeSessionSource;
}

export interface OddeNovaBridgeBinding extends OddeNovaBridgeIdentity {
  sessionId?: string;
  clientId: string;
  serviceOrigin: string;
}

export interface BridgePageState {
  sessionId: string;
  projectId: string;
  baseUrl: string;
  revision: number;
  title: string;
  code: string;
  messages: ChatMessage[];
  bridgeContentHash?: string;
  bridgeProtocolVersion?: 2 | 3;
  /** Persisted session values, kept separate from a possibly dirty editor. */
  storedTitle?: string;
  storedCode?: string;
  storedMessages?: ChatMessage[];
}

export interface BridgePageStateReady {
  status: 'ready';
  binding: OddeNovaBridgeBinding;
  pageState: BridgePageState;
  /** The session currently visible in the editor, if any. */
  visibleSessionId?: string;
  /** The code currently observed in the visible editor. */
  editorCode?: string;
}

export type BridgePageStateResolution =
  | BridgePageStateReady
  | { status: 'loading' | 'missing' | 'ambiguous'; candidates?: string[]; reason?: string };

export type BridgeBindingResolution =
  | { status: 'ready'; binding: OddeNovaBridgeBinding; session: BridgeSessionCandidate }
  | { status: 'missing'; reason: string }
  | { status: 'ambiguous'; candidates: BridgeSessionCandidate[] };

function sourceMatchesConnection(
  source: BridgeSessionSource | undefined,
  connection: Pick<StoredOddeNovaBridgeConnection, 'projectId' | 'baseUrl' | 'bindingId'>,
): boolean {
  if (
    !source
    || source.type !== 'oddenova-strudel-skill'
    || source.projectId !== connection.projectId
  ) return false;
  if (connection.bindingId !== undefined && source.bindingId !== connection.bindingId) return false;
  if (source.baseUrl === undefined) return true;
  try {
    return normalizeOddeNovaBridgeBaseUrl(source.baseUrl) === normalizeOddeNovaBridgeBaseUrl(connection.baseUrl);
  } catch {
    return false;
  }
}

function makeBinding(
  connection: Pick<StoredOddeNovaBridgeConnection, 'projectId' | 'baseUrl' | 'ownerKey' | 'bindingId' | 'sessionId' | 'clientId' | 'serviceOrigin'>,
  sessionId?: string,
): OddeNovaBridgeBinding {
  return {
    ownerKey: connection.ownerKey,
    projectId: connection.projectId,
    baseUrl: normalizeOddeNovaBridgeBaseUrl(connection.baseUrl),
    ...(connection.bindingId ? { bindingId: connection.bindingId } : {}),
    ...(sessionId ? { sessionId } : {}),
    clientId: connection.clientId,
    serviceOrigin: connection.serviceOrigin,
  };
}

/**
 * Resolve a bridge to an exact local session. A stored session id is an
 * invariant, not a hint: if it disappeared, the caller must stop/recover and
 * may not silently borrow another project with the same title or project id.
 */
export function resolveBridgeBinding(
  sessions: readonly BridgeSessionCandidate[],
  connection: Pick<StoredOddeNovaBridgeConnection, 'projectId' | 'baseUrl' | 'ownerKey' | 'bindingId' | 'sessionId' | 'clientId' | 'serviceOrigin'>,
): BridgeBindingResolution {
  const candidates = sessions.filter((session) => sourceMatchesConnection(session.externalSource, connection));

  if (connection.sessionId) {
    const bound = sessions.find((session) => session.id === connection.sessionId);
    if (!bound) return { status: 'missing', reason: 'The explicitly bound session no longer exists' };
    if (!sourceMatchesConnection(bound.externalSource, connection)) {
      return { status: 'missing', reason: 'The explicitly bound session has a different bridge identity' };
    }
    return { status: 'ready', binding: makeBinding(connection, bound.id), session: bound };
  }

  if (candidates.length === 0) {
    return { status: 'missing', reason: 'No local session is paired with this bridge' };
  }
  if (candidates.length > 1) {
    return { status: 'ambiguous', candidates };
  }
  const [session] = candidates;
  return { status: 'ready', binding: makeBinding(connection, session.id), session };
}

export function bridgeCheckpointMatchesBinding(
  checkpoint: { ownerKey: string; projectKey: string; bindingId: string; sessionId: string; snapshot: OddeNovaBridgeSnapshotV3 },
  binding: Pick<OddeNovaBridgeBinding, 'ownerKey' | 'projectId' | 'baseUrl' | 'bindingId'>,
): boolean {
  if (!binding.bindingId || checkpoint.bindingId !== binding.bindingId || checkpoint.ownerKey !== binding.ownerKey) return false;
  if (checkpoint.snapshot.protocolVersion !== 3 || checkpoint.snapshot.bindingId !== binding.bindingId) return false;
  if (!oddeNovaBridgeIdentityMatches(checkpoint.snapshot, binding)) return false;
  return checkpoint.projectKey === `${normalizeOddeNovaBridgeBaseUrl(binding.baseUrl)}\0${binding.projectId}`;
}

/**
 * Compare a pre-checkpoint local session with a verified v3 snapshot. Older
 * local sessions may carry a v2 hash, so a protocol transition can only use
 * the semantic creative projection; an explicitly recorded v3 hash remains a
 * hard check.
 */
export function bridgePageMatchesSnapshot(
  page: BridgePageState,
  snapshot: OddeNovaBridgeSnapshotV3,
): boolean {
  if (page.revision !== snapshot.revision || !oddeNovaBridgeIdentityMatches(page, snapshot)) return false;
  if (page.bridgeContentHash === snapshot.contentHash) return true;
  if (page.bridgeProtocolVersion === 3 && page.bridgeContentHash !== undefined) return false;
  const pageMessages = projectCreativeMessages(page.storedMessages ?? page.messages).map(({ id, role, content }) => ({ id, role, content }));
  const snapshotMessages = snapshot.messages.map(({ id, role, content }) => ({ id, role, content }));
  return (page.storedTitle ?? page.title) === snapshot.title
    && (page.storedCode ?? page.code) === snapshot.code
    && JSON.stringify(pageMessages) === JSON.stringify(snapshotMessages);
}

export interface BridgePageChangeInput {
  connection: Pick<StoredOddeNovaBridgeConnection, 'projectId' | 'baseUrl' | 'clientId' | 'bindingId'>;
  baseline: OddeNovaBridgeSnapshotV3;
  page: BridgePageState;
  changeId: string;
}

export interface OddeNovaBridgePageChange {
  protocolVersion: 3;
  projectId: string;
  baseUrl: string;
  bindingId: string;
  clientId: string;
  changeId: string;
  baseRevision: number;
  baseSkillRevision: number;
  title?: string;
  code?: string;
  upsertMessages: ReturnType<typeof diffCreativeMessages>['upsertMessages'];
  deleteMessageIds: string[];
}

/** Build the one canonical page-change shape used by debounce and read flushes. */
export function makeOddeNovaBridgePageChange({ connection, baseline, page, changeId }: BridgePageChangeInput): OddeNovaBridgePageChange | undefined {
  if (!connection.bindingId) return undefined;
  if (!oddeNovaBridgeIdentityMatches(connection, page)) return undefined;
  const messages = projectCreativeMessages(page.messages);
  const difference = diffCreativeMessages(baseline.messages, messages);
  const titleChanged = page.title !== baseline.title;
  const codeChanged = page.code !== baseline.code;
  if (!titleChanged && !codeChanged && difference.upsertMessages.length === 0 && difference.deleteMessageIds.length === 0) {
    return undefined;
  }
  return {
    protocolVersion: 3,
    projectId: connection.projectId,
    baseUrl: normalizeOddeNovaBridgeBaseUrl(connection.baseUrl),
    bindingId: connection.bindingId,
    clientId: connection.clientId,
    changeId,
    baseRevision: baseline.revision,
    baseSkillRevision: baseline.skillRevision,
    ...(titleChanged ? { title: page.title } : {}),
    ...(codeChanged ? { code: page.code } : {}),
    upsertMessages: difference.upsertMessages,
    deleteMessageIds: difference.deleteMessageIds,
  };
}
