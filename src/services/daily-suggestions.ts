interface DailyResponse {
  requestedDate: string;
  sourceDate: string;
  items: Array<{ zh: string; en: string }>;
}

function parseResponse(value: unknown): DailyResponse | null {
  if (!value || typeof value !== 'object') return null;

  const candidate = value as Partial<DailyResponse>;
  if (typeof candidate.requestedDate !== 'string' || typeof candidate.sourceDate !== 'string') {
    return null;
  }
  if (!Array.isArray(candidate.items) || candidate.items.length !== 10) return null;
  if (!candidate.items.every((item) => (
    item
    && typeof item.zh === 'string'
    && item.zh.trim()
    && typeof item.en === 'string'
    && item.en.trim()
  ))) {
    return null;
  }

  return candidate as DailyResponse;
}

export async function fetchDailySuggestions(
  isChinese: boolean,
  signal?: AbortSignal,
): Promise<string[] | null> {
  try {
    const response = await fetch('/api/daily-suggestions', { signal });
    if (!response.ok) return null;

    const parsed = parseResponse(await response.json());
    return parsed
      ? parsed.items.map((item) => (isChinese ? item.zh : item.en).trim())
      : null;
  } catch {
    return null;
  }
}

export function pickSuggestions(
  pool: readonly string[],
  limit = 5,
  random = Math.random,
): string[] {
  const copy = [...new Set(pool.filter(Boolean))];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy.slice(0, Math.min(5, Math.max(0, limit)));
}
