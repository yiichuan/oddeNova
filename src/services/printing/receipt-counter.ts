// The creation number on a printed receipt counts this browser's prints for the
// local calendar day: the first print of the day is 001, and the count starts
// over after midnight.
export const RECEIPT_COUNTER_KEY = 'oddenova_receipt_counter';

interface StoredCount { day: string; count: number }

function localDay(now: number): string {
  const date = new Date(now);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function readCount(now: number): number {
  try {
    const stored = JSON.parse(localStorage.getItem(RECEIPT_COUNTER_KEY) ?? 'null') as StoredCount | null;
    return stored?.day === localDay(now) && Number.isInteger(stored.count) && stored.count > 0 ? stored.count : 0;
  } catch { return 0; }
}

/** The number the next print today will carry. */
export function nextReceiptNumber(now = Date.now()): number {
  return readCount(now) + 1;
}

/** Records that a receipt carrying `number` was printed. */
export function recordReceiptPrinted(number: number, now = Date.now()): void {
  try {
    const count = Math.max(readCount(now), number);
    localStorage.setItem(RECEIPT_COUNTER_KEY, JSON.stringify({ day: localDay(now), count } satisfies StoredCount));
  } catch { /* Storage unavailable: the next print repeats this number. */ }
}

export function formatReceiptNumber(number: number): string {
  return String(number).padStart(3, '0');
}
