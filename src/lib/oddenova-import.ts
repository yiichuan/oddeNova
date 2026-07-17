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

export function parseOddeNovaImportHash(hash: string): OddeNovaImportParseResult {
  if (!hash.startsWith('#oddenova=')) return { kind: 'none' };
  try {
    const encoded = hash.slice('#oddenova='.length).replaceAll('-', '+').replaceAll('_', '/');
    const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=');
    const bytes = Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
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
