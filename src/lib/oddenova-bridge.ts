export const ODDENOVA_BRIDGE_HASH_PREFIX = '#oddenova-connect=';
export const ODDENOVA_BRIDGE_BOOTSTRAP_KEY = 'oddenova_bridge_bootstrap_v2';
export const ODDENOVA_BRIDGE_CONNECTION_KEY = 'oddenova_bridge_connection_v2';

/** The browser-side representation of the identity owned by one bridge. */
export interface OddeNovaBridgeIdentity {
  ownerKey: string;
  projectId: string;
  baseUrl: string;
  bindingId?: string;
}

export interface OddeNovaBridgeBootstrap {
  protocolVersion: 2 | 3;
  projectId: string;
  baseUrl: string;
  serviceOrigin: string;
  pairingToken: string;
}

export interface OddeNovaBridgePairResponse {
  pageToken: string;
  bindingId?: string;
  /** The binding that was active immediately before this pair, if any. */
  previousBindingId?: string;
  /** New helpers make the initial/rebind branch explicit. */
  pairingKind?: 'initial' | 'rebind';
  revision?: number;
  skillRevision?: number;
}

export interface OddeNovaBridgeMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  receivedAt: number;
}

export interface OddeNovaBridgeMessageV3 {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  order: number;
  updatedRevision: number;
}

export interface OddeNovaBridgeSnapshot {
  protocolVersion: 2;
  source: 'oddenova-strudel-skill';
  projectId: string;
  revision: number;
  title: string;
  code: string;
  messages: OddeNovaBridgeMessage[];
  locale?: 'zh-CN' | 'en';
  contentHash: string;
}

export interface OddeNovaBridgeSnapshotV3 {
  protocolVersion: 3;
  source: 'oddenova-strudel-skill';
  projectId: string;
  baseUrl: string;
  revision: number;
  skillRevision: number;
  bindingId?: string;
  title: string;
  code: string;
  messages: OddeNovaBridgeMessageV3[];
  locale?: 'zh-CN' | 'en';
  contentHash: string;
}

export type AnyOddeNovaBridgeSnapshot = OddeNovaBridgeSnapshot | OddeNovaBridgeSnapshotV3;

export interface StoredOddeNovaBridgeConnection {
  projectId: string;
  baseUrl: string;
  serviceOrigin: string;
  pageToken: string;
  ownerKey: string;
  clientId: string;
  lastRevision: number;
  lastSkillRevision?: number;
  bindingId?: string;
  /** The local session explicitly paired with this bridge, when known. */
  sessionId?: string;
}

/**
 * Keep this deliberately equivalent to bridge-core.mjs's normalizeBaseUrl.
 * It is kept here instead of sharing a Node module so browser code does not
 * acquire a Node dependency merely to compare two page identities.
 */
export function normalizeOddeNovaBridgeBaseUrl(value: string): string {
  const url = new URL(value);
  url.hash = '';
  url.search = '';
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url.toString().replace(/\/$/, '');
}

export function oddeNovaBridgeProjectKey(baseUrl: string, projectId: string): string {
  return `${normalizeOddeNovaBridgeBaseUrl(baseUrl)}\0${projectId}`;
}

export function oddeNovaBridgeIdentityMatches(
  left: Pick<OddeNovaBridgeIdentity, 'projectId' | 'baseUrl'>,
  right: Pick<OddeNovaBridgeIdentity, 'projectId' | 'baseUrl'>,
): boolean {
  try {
    return left.projectId === right.projectId
      && normalizeOddeNovaBridgeBaseUrl(left.baseUrl) === normalizeOddeNovaBridgeBaseUrl(right.baseUrl);
  } catch {
    return false;
  }
}

export function parseOddeNovaBridgePairResponse(
  value: unknown,
  protocolVersion: 2 | 3,
): OddeNovaBridgePairResponse | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.pageToken !== 'string' || candidate.pageToken.length === 0) return undefined;
  if (protocolVersion === 3 && (typeof candidate.bindingId !== 'string' || candidate.bindingId.length === 0)) return undefined;
  if (candidate.bindingId !== undefined && (typeof candidate.bindingId !== 'string' || candidate.bindingId.length === 0)) return undefined;
  if (candidate.previousBindingId !== undefined && (typeof candidate.previousBindingId !== 'string' || candidate.previousBindingId.length === 0)) return undefined;
  if (candidate.pairingKind !== undefined && candidate.pairingKind !== 'initial' && candidate.pairingKind !== 'rebind') return undefined;
  if (candidate.pairingKind === 'initial' && candidate.previousBindingId !== undefined) return undefined;
  if (candidate.pairingKind === 'rebind' && candidate.previousBindingId === undefined) return undefined;
  for (const key of ['revision', 'skillRevision'] as const) {
    if (candidate[key] !== undefined && (!Number.isInteger(candidate[key]) || Number(candidate[key]) < 0)) return undefined;
  }
  return {
    pageToken: candidate.pageToken,
    ...(candidate.bindingId !== undefined ? { bindingId: candidate.bindingId } : {}),
    ...(candidate.previousBindingId !== undefined ? { previousBindingId: candidate.previousBindingId } : {}),
    ...(candidate.pairingKind !== undefined ? { pairingKind: candidate.pairingKind } : {}),
    ...(candidate.revision !== undefined ? { revision: candidate.revision as number } : {}),
    ...(candidate.skillRevision !== undefined ? { skillRevision: candidate.skillRevision as number } : {}),
  };
}

function decodeJson(encoded: string): unknown {
  const normalized = encoded.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

function isLoopbackServiceOrigin(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' && url.hostname === '127.0.0.1' && Boolean(url.port) && url.pathname === '/';
  } catch {
    return false;
  }
}

export function parseOddeNovaBridgeBootstrap(value: unknown): OddeNovaBridgeBootstrap | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Record<string, unknown>;
  if (
    (candidate.protocolVersion !== 2 && candidate.protocolVersion !== 3)
    || typeof candidate.projectId !== 'string' || !candidate.projectId
    || typeof candidate.baseUrl !== 'string'
    || typeof candidate.pairingToken !== 'string' || !candidate.pairingToken
    || !isLoopbackServiceOrigin(candidate.serviceOrigin)
  ) return undefined;
  try {
    const baseUrl = normalizeOddeNovaBridgeBaseUrl(candidate.baseUrl);
    if (new URL(baseUrl).origin !== window.location.origin) return undefined;
    candidate.baseUrl = baseUrl;
  } catch {
    return undefined;
  }
  return candidate as unknown as OddeNovaBridgeBootstrap;
}

/** Remove pairing credentials before analytics or React initialization can observe the URL. */
export function consumeOddeNovaBridgeBootstrapHash(): boolean {
  const hash = window.location.hash;
  if (!hash.startsWith(ODDENOVA_BRIDGE_HASH_PREFIX)) return false;
  history.replaceState(null, '', window.location.pathname + window.location.search);
  try {
    const parsed = parseOddeNovaBridgeBootstrap(decodeJson(hash.slice(ODDENOVA_BRIDGE_HASH_PREFIX.length)));
    if (parsed) sessionStorage.setItem(ODDENOVA_BRIDGE_BOOTSTRAP_KEY, JSON.stringify(parsed));
  } catch {
    sessionStorage.removeItem(ODDENOVA_BRIDGE_BOOTSTRAP_KEY);
  }
  return true;
}

export function readStoredBridgeConnection(): StoredOddeNovaBridgeConnection | undefined {
  try {
    const value = JSON.parse(sessionStorage.getItem(ODDENOVA_BRIDGE_CONNECTION_KEY) ?? 'null') as StoredOddeNovaBridgeConnection | null;
    if (
      !value
      || typeof value.projectId !== 'string' || !value.projectId
      || typeof value.baseUrl !== 'string'
      || !value.pageToken
      || !isLoopbackServiceOrigin(value.serviceOrigin)
      || typeof value.ownerKey !== 'string' || !value.ownerKey
      || typeof value.clientId !== 'string' || !value.clientId
      || !Number.isInteger(value.lastRevision) || value.lastRevision < 0
      || (value.lastSkillRevision !== undefined && (!Number.isInteger(value.lastSkillRevision) || value.lastSkillRevision < 0))
      || (value.bindingId !== undefined && (typeof value.bindingId !== 'string' || !value.bindingId))
      || (value.sessionId !== undefined && (typeof value.sessionId !== 'string' || !value.sessionId))
    ) return undefined;
    const baseUrl = normalizeOddeNovaBridgeBaseUrl(value.baseUrl);
    return { ...value, baseUrl };
  } catch {
    return undefined;
  }
}

export function isOddeNovaBridgeSnapshot(value: unknown): value is AnyOddeNovaBridgeSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Record<string, unknown>;
  const version = snapshot.protocolVersion;
  return (version === 2 || version === 3)
    && snapshot.source === 'oddenova-strudel-skill'
    && typeof snapshot.projectId === 'string'
    && (version === 2 || (typeof snapshot.baseUrl === 'string' && (() => {
      try { return normalizeOddeNovaBridgeBaseUrl(snapshot.baseUrl) === snapshot.baseUrl; } catch { return false; }
    })()))
    && (version === 2 || snapshot.bindingId === undefined || typeof snapshot.bindingId === 'string')
    && Number.isInteger(snapshot.revision) && Number(snapshot.revision) > 0
    && typeof snapshot.title === 'string'
    && typeof snapshot.code === 'string'
    && typeof snapshot.contentHash === 'string'
    && Array.isArray(snapshot.messages)
    && snapshot.messages.every((message) => {
      if (!message || typeof message !== 'object') return false;
      const item = message as Record<string, unknown>;
      return typeof item.id === 'string'
        && (item.role === 'user' || item.role === 'assistant')
        && typeof item.content === 'string'
        && (version === 2
          ? typeof item.receivedAt === 'number'
          : typeof item.createdAt === 'number'
            && Number.isInteger(item.order)
            && Number.isInteger(item.updatedRevision));
    });
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function stableSha256(value: unknown): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stableJson(value)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function digestOddeNovaBridgeMessage(message: OddeNovaBridgeMessage | OddeNovaBridgeMessageV3): Promise<string> {
  return stableSha256(message);
}

export async function verifyOddeNovaBridgeSnapshot(snapshot: AnyOddeNovaBridgeSnapshot): Promise<boolean> {
  const content: Record<string, unknown> = {
    projectId: snapshot.projectId,
    revision: snapshot.revision,
    title: snapshot.title,
    code: snapshot.code,
    messages: snapshot.messages,
  };
  if (snapshot.protocolVersion === 3) {
    content.baseUrl = snapshot.baseUrl;
    content.skillRevision = snapshot.skillRevision;
  }
  if (snapshot.locale !== undefined) content.locale = snapshot.locale;
  return await stableSha256(content) === snapshot.contentHash;
}
