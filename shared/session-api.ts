export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 50;

export interface SessionSummary {
  id: string;
  title: string;
  updatedAt: number;
}

export interface FavoriteSummary extends SessionSummary {
  favoritedAt: number;
}

export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
}
