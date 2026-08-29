export const FAVORITE_SUMMARY_SELECT = 'id,source_session_id,title,created_at';
export const FAVORITE_DETAIL_SELECT = 'id,source_session_id,title,code,messages,input_mode,revisions,suggestions,created_at';
export const SESSION_SOURCE_SELECT = 'id,title,code,messages,input_mode,revisions,suggestions';
export const SESSION_CONTINUE_SELECT = 'id,title,code,messages,input_mode,revisions,suggestions,external_source,created_at,updated_at';

export interface FavoriteRow {
  id: string;
  source_session_id?: string | null;
  user_id?: string;
  title: string;
  code: string;
  messages: unknown[];
  input_mode: unknown;
  revisions: unknown[] | null;
  suggestions: Record<string, unknown> | null;
  created_at: string | number;
}

export interface FavoriteSummary {
  id: string;
  sourceSessionId?: string;
  title: string;
  createdAt: number;
}

export interface FavoriteDetail extends FavoriteSummary {
  code: string;
  messages: unknown[];
  inputMode?: 'normal' | 'choice';
  revisions?: unknown[];
  suggestions?: Record<string, unknown>;
}

export interface FavoriteCursor {
  createdAt: string;
  id: string;
}

export interface FavoriteSnapshot {
  title: string;
  code: string;
  messages: unknown[];
  inputMode: 'normal' | 'choice' | null;
  revisions: unknown[] | null;
  suggestions: Record<string, unknown> | null;
}

function toEpochMillis(value: string | number): number {
  return typeof value === 'number' ? value : new Date(value).getTime();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeFavoriteSnapshot(row: {
  title: unknown;
  code: unknown;
  messages: unknown;
  input_mode: unknown;
  revisions: unknown;
  suggestions: unknown;
}): FavoriteSnapshot {
  return {
    title: typeof row.title === 'string' ? row.title : '',
    code: typeof row.code === 'string' ? row.code : '',
    messages: Array.isArray(row.messages) ? row.messages : [],
    inputMode: row.input_mode === 'normal' || row.input_mode === 'choice' ? row.input_mode : null,
    revisions: Array.isArray(row.revisions) ? row.revisions : null,
    suggestions: isRecord(row.suggestions) ? row.suggestions : null,
  };
}

export function rowToFavoriteSummary(
  row: Pick<FavoriteRow, 'id' | 'source_session_id' | 'title' | 'created_at'>,
): FavoriteSummary {
  const summary: FavoriteSummary = {
    id: row.id,
    title: row.title,
    createdAt: toEpochMillis(row.created_at),
  };
  if ('source_session_id' in row && typeof row.source_session_id === 'string') {
    summary.sourceSessionId = row.source_session_id;
  }
  return summary;
}

export function rowToFavorite(row: FavoriteRow): FavoriteDetail {
  const detail: FavoriteDetail = {
    ...rowToFavoriteSummary(row),
    code: row.code,
    messages: Array.isArray(row.messages) ? row.messages : [],
  };

  if (row.input_mode === 'normal' || row.input_mode === 'choice') detail.inputMode = row.input_mode;
  if (Array.isArray(row.revisions)) detail.revisions = row.revisions;
  if (isRecord(row.suggestions)) detail.suggestions = row.suggestions;
  return detail;
}

export function encodeFavoriteCursor(row: Pick<FavoriteRow, 'id' | 'created_at'>): string {
  return Buffer.from(JSON.stringify({
    // Supabase returns timestamptz values as strings. Keep that exact string so
    // PostgreSQL microseconds survive the round trip; converting through Date
    // would truncate values such as .123456 to .123Z.
    createdAt: typeof row.created_at === 'string'
      ? row.created_at
      : new Date(row.created_at).toISOString(),
    id: row.id,
  })).toString('base64url');
}

export function decodeFavoriteCursor(value: string): FavoriteCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as Partial<FavoriteCursor>;
    if (typeof parsed.createdAt !== 'string' || Number.isNaN(Date.parse(parsed.createdAt))) return null;
    if (typeof parsed.id !== 'string' || !isUuid(parsed.id)) return null;
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function parseFavoriteLimit(value: string | null): number | null {
  if (value === null) return 50;
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 50) return null;
  return parsed;
}
