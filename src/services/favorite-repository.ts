import type { ChatMessage, InputMode } from '../hooks/useChat';
import type { CodeRevision } from '../hooks/useSessions';
import type { FavoriteConversation, FavoriteTurn } from '../lib/favorite-conversations';
import { getAccessToken } from './auth-service';

interface FavoriteSummaryResponse {
  id: string;
  sourceSessionId?: string;
  title: string;
  createdAt: number;
}

interface FavoriteDetailResponse extends FavoriteSummaryResponse {
  code: string;
  messages: ChatMessage[];
  inputMode?: InputMode;
  revisions?: CodeRevision[];
  suggestions?: { forCode: string; items: string[] };
}

async function headers(contentType = false, expectedUserId?: string): Promise<HeadersInit> {
  const token = await getAccessToken(expectedUserId);
  if (!token) throw new Error('Not signed in');
  return {
    Authorization: `Bearer ${token}`,
    ...(contentType ? { 'Content-Type': 'application/json' } : {}),
  };
}

async function responseError(response: Response): Promise<Error> {
  try {
    const body = await response.json() as { error?: string };
    return new Error(body.error || `Favorite request failed: ${response.status}`);
  } catch {
    return new Error(`Favorite request failed: ${response.status}`);
  }
}

function isExchange(message: ChatMessage): boolean {
  return (message.role === 'user' || message.role === 'assistant') && message.isGreeting !== true;
}

function turnsFromMessages(messages: readonly ChatMessage[]): FavoriteTurn[] {
  return messages.filter(isExchange).map((message) => ({
    id: message.id,
    role: message.role as 'user' | 'assistant',
    text: message.content,
    ...(message.code === undefined ? {} : { code: message.code }),
  }));
}

function detailToFavorite(detail: FavoriteDetailResponse): FavoriteConversation {
  const messages = detail.messages.map((message) => ({ ...message }));
  return {
    id: detail.id,
    sourceSessionId: detail.sourceSessionId,
    sessionId: detail.sourceSessionId,
    title: detail.title,
    favoritedAt: detail.createdAt,
    messages,
    turns: turnsFromMessages(messages),
    code: detail.code,
  };
}

export async function listCloudFavorites(expectedUserId?: string): Promise<FavoriteConversation[]> {
  const response = await fetch('/api/favorites?limit=50', {
    headers: await headers(false, expectedUserId),
  });
  if (!response.ok) throw await responseError(response);
  const body = await response.json() as { favorites: FavoriteSummaryResponse[] };
  const details = await Promise.all(body.favorites.map(async (summary) => {
    const detailResponse = await fetch(`/api/favorites/${encodeURIComponent(summary.id)}`, {
      headers: await headers(false, expectedUserId),
    });
    if (!detailResponse.ok) throw await responseError(detailResponse);
    const detailBody = await detailResponse.json() as { favorite: FavoriteDetailResponse };
    return detailToFavorite(detailBody.favorite);
  }));
  return details.sort((a, b) => b.favoritedAt - a.favoritedAt);
}

export async function createCloudFavorite(
  sessionId: string,
  expectedUserId?: string,
): Promise<FavoriteConversation> {
  const response = await fetch('/api/favorites', {
    method: 'POST',
    headers: await headers(true, expectedUserId),
    body: JSON.stringify({ sessionId }),
  });
  if (!response.ok) throw await responseError(response);
  const body = await response.json() as { favorite: FavoriteSummaryResponse };
  const detailResponse = await fetch(`/api/favorites/${encodeURIComponent(body.favorite.id)}`, {
    headers: await headers(false, expectedUserId),
  });
  if (!detailResponse.ok) throw await responseError(detailResponse);
  const detailBody = await detailResponse.json() as { favorite: FavoriteDetailResponse };
  return detailToFavorite(detailBody.favorite);
}

export async function deleteCloudFavorite(id: string, expectedUserId?: string): Promise<void> {
  const response = await fetch(`/api/favorites/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: await headers(false, expectedUserId),
  });
  if (!response.ok) throw await responseError(response);
}
