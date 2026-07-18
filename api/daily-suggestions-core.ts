const DAY_MS = 86_400_000;
const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PATH_RE = /^daily-suggestions\/(\d{4}-\d{2}-\d{2})\.json$/;
const LOCK_PATH_RE = /^daily-suggestions\/locks\/(\d{4}-\d{2}-\d{2})\.lock$/;
const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const LIST_PREFIX_RE = /^\s*(?:[-*]|\d+[.)])\s+/;

export interface DailySuggestionItem { zh: string; en: string }
export interface DailySuggestionBatch {
  date: string;
  generatedAt: string;
  items: DailySuggestionItem[];
}
export interface DailySuggestionBlob {
  pathname: string;
  url: string;
  etag?: string;
  uploadedAt?: Date | string;
}
export interface DailySuggestionCleanup {
  batchUrls: string[];
  locks: Array<{ url: string; etag: string }>;
}

export function beijingDate(now = new Date()): string {
  return new Date(now.getTime() + BEIJING_OFFSET_MS).toISOString().slice(0, 10);
}

function validDate(date: string): boolean {
  if (!DATE_RE.test(date)) return false;
  const timestamp = Date.parse(`${date}T00:00:00.000Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === date;
}

export function addDateDays(date: string, days: number): string {
  if (!validDate(date)) throw new Error(`Invalid date: ${date}`);
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function tomorrowInBeijing(now = new Date()): string {
  return addDateDays(beijingDate(now), 1);
}

export function dailySuggestionPath(date: string): string {
  if (!validDate(date)) throw new Error(`Invalid date: ${date}`);
  return `daily-suggestions/${date}.json`;
}

export function readCandidateDates(date: string): string[] {
  return Array.from({ length: 8 }, (_, index) => addDateDays(date, -index));
}

export function secondsUntilNextBeijingMidnight(now = new Date()): number {
  const shifted = now.getTime() + BEIJING_OFFSET_MS;
  return Math.max(1, Math.ceil((DAY_MS - (shifted % DAY_MS)) / 1000));
}

function normalized(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

// Length is guided by the generation prompt, not gated here — an occasional
// over-length item degrades chip display but is not worth discarding a whole
// valid batch. Only structural garbage (empty, code fences, list numbering) is
// rejected.
function validText(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const text = value.trim();
  return text.length > 0 && !text.includes('```') && !LIST_PREFIX_RE.test(text);
}

function validIsoUtcTimestamp(value: string): boolean {
  if (!ISO_UTC_RE.test(value)) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

export function parseGeneratedItems(value: unknown): DailySuggestionItem[] | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = (value as { items?: unknown }).items;
  if (!Array.isArray(candidate) || candidate.length !== 10) return null;
  const items: DailySuggestionItem[] = [];
  for (const item of candidate) {
    if (!item || typeof item !== 'object') return null;
    const { zh, en } = item as { zh?: unknown; en?: unknown };
    if (!validText(zh) || !validText(en)) return null;
    items.push({ zh: zh.trim(), en: en.trim() });
  }
  if (new Set(items.map((item) => normalized(item.zh))).size !== 10) return null;
  if (new Set(items.map((item) => normalized(item.en))).size !== 10) return null;
  return items;
}

export function parseStoredBatch(value: unknown, expectedDate: string): DailySuggestionBatch | null {
  if (!value || typeof value !== 'object') return null;
  const batch = value as Partial<DailySuggestionBatch>;
  if (batch.date !== expectedDate || typeof batch.generatedAt !== 'string') return null;
  if (!validIsoUtcTimestamp(batch.generatedAt)) return null;
  const items = parseGeneratedItems({ items: batch.items });
  return items ? { date: expectedDate, generatedAt: batch.generatedAt, items } : null;
}

export function expiredDailySuggestionUrls(
  blobs: DailySuggestionBlob[],
  today: string,
  now = new Date(),
): string[] {
  return expiredDailySuggestionCleanup(blobs, today, now).batchUrls;
}

export function expiredDailySuggestionCleanup(
  blobs: DailySuggestionBlob[],
  today: string,
  now = new Date(),
): DailySuggestionCleanup {
  const oldestRetainedDate = addDateDays(today, -29);
  const lockCutoff = now.getTime() - DAY_MS;
  const cleanup: DailySuggestionCleanup = { batchUrls: [], locks: [] };
  for (const blob of blobs) {
    const date = PATH_RE.exec(blob.pathname)?.[1];
    if (date) {
      if (validDate(date) && date < oldestRetainedDate) cleanup.batchUrls.push(blob.url);
      continue;
    }

    const lockDate = LOCK_PATH_RE.exec(blob.pathname)?.[1];
    if (!lockDate || !validDate(lockDate) || blob.uploadedAt === undefined || !blob.etag) continue;
    const uploadedAt = blob.uploadedAt instanceof Date
      ? blob.uploadedAt.getTime()
      : Date.parse(blob.uploadedAt);
    if (Number.isFinite(uploadedAt) && uploadedAt < lockCutoff) {
      cleanup.locks.push({ url: blob.url, etag: blob.etag });
    }
  }
  return cleanup;
}
