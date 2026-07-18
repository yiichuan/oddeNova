export const ODDENOVA_IMPORT_PROTOCOL_VERSION = 1 as const;
export const ODDENOVA_IMPORT_SOURCE = 'oddenova-strudel-skill' as const;

export interface OddeNovaImportMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface OddeNovaImportPayload {
  protocolVersion: typeof ODDENOVA_IMPORT_PROTOCOL_VERSION;
  source: typeof ODDENOVA_IMPORT_SOURCE;
  projectId: string;
  title: string;
  code: string;
  messages: OddeNovaImportMessage[];
  locale?: 'zh-CN' | 'en';
}

export type OddeNovaImportParseResult =
  | { kind: 'none' }
  | { kind: 'payload'; payload: OddeNovaImportPayload }
  | { kind: 'error'; reason: 'invalid' | 'unsupported-version' };

function isMessage(value: unknown): value is OddeNovaImportMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Record<string, unknown>;
  return (message.role === 'user' || message.role === 'assistant') && typeof message.content === 'string';
}

export const ODDENOVA_IMPORT_HASH_PREFIX = '#oddenova=';

function decodeBase64Url(encoded: string): Uint8Array {
  const normalized = encoded.replaceAll('-', '+').replaceAll('_', '/');
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function parseOddeNovaImportHash(hash: string): Promise<OddeNovaImportParseResult> {
  if (!hash.startsWith(ODDENOVA_IMPORT_HASH_PREFIX)) return { kind: 'none' };
  try {
    const encoded = hash.slice(ODDENOVA_IMPORT_HASH_PREFIX.length);
    // `z:` marks a deflate-raw compressed payload; the bare base64url form is
    // the legacy uncompressed encoding from older helper versions.
    const bytes = encoded.startsWith('z:')
      ? await inflateRaw(decodeBase64Url(encoded.slice(2)))
      : decodeBase64Url(encoded);
    const value = JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
    if (typeof value.protocolVersion !== 'number') {
      return { kind: 'error', reason: 'invalid' };
    }
    if (value.protocolVersion !== ODDENOVA_IMPORT_PROTOCOL_VERSION) {
      return { kind: 'error', reason: 'unsupported-version' };
    }
    if (
      value.source !== ODDENOVA_IMPORT_SOURCE ||
      typeof value.projectId !== 'string' || !value.projectId ||
      typeof value.title !== 'string' ||
      typeof value.code !== 'string' ||
      !Array.isArray(value.messages) || !value.messages.every(isMessage) ||
      (value.locale !== undefined && value.locale !== 'zh-CN' && value.locale !== 'en')
    ) return { kind: 'error', reason: 'invalid' };
    return { kind: 'payload', payload: value as unknown as OddeNovaImportPayload };
  } catch {
    return { kind: 'error', reason: 'invalid' };
  }
}

export function hashImportedContent<T extends Pick<OddeNovaImportPayload, 'title' | 'code' | 'messages'>>(content: T): string {
  const canonical = JSON.stringify({ title: content.title, code: content.code, messages: content.messages });
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
