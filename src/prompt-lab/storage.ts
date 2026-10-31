import type { PromptTemplate } from '../prompts/lab/template';
import type { LabReview, PromptLabExperiment, PromptLabSuite } from './types';

type Collection = 'templates' | 'suites' | 'runs' | 'reviews' | 'traces' | 'comparisons';

async function request<T>(collection: Collection, id?: string, init: RequestInit = {}): Promise<T> {
  const path = `/__lab/api/${collection}${id ? `/${encodeURIComponent(id)}` : ''}`;
  const response = await fetch(path, {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
    cache: 'no-store',
  });
  const payload = await response.json() as T | { error?: string };
  if (!response.ok) {
    const error = payload && typeof payload === 'object' && 'error' in payload ? payload.error : undefined;
    throw new Error(error || `Local storage request failed (${response.status})`);
  }
  return payload as T;
}

function saveResource<T extends { id: string }>(collection: Collection, value: T): Promise<T> {
  return request<T>(collection, value.id, { method: 'PUT', body: JSON.stringify(value) });
}

export const promptLabStorage = {
  getTrace: async (id: string) => (await request<{ events: import('../agent/loop').AgentTraceEvent[] }>('traces', id)).events,
  getReview: async (id: string): Promise<LabReview | undefined> => {
    const response = await fetch(`/__lab/api/reviews/${encodeURIComponent(id)}`, { cache: 'no-store' });
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error('无法读取评审');
    return response.json() as Promise<LabReview>;
  },
  listReviews: () => request<LabReview[]>('reviews'),
  saveReview: (value: LabReview) => saveResource('reviews', value),
  meta: async (): Promise<{ version: string; commit: string | null; dirty: boolean }> => {
    const response = await fetch('/__lab/api/meta', { cache: 'no-store' });
    if (!response.ok) throw new Error('无法读取实验环境信息');
    return response.json();
  },
  listTemplates: () => request<PromptTemplate[]>('templates'),
  saveTemplate: (value: PromptTemplate) => saveResource('templates', value),
  deleteTemplate: (id: string) => request<{ ok: true }>('templates', id, { method: 'DELETE' }),
  listSuites: () => request<PromptLabSuite[]>('suites'),
  saveSuite: (value: PromptLabSuite) => saveResource('suites', value),
  listRuns: async () => (await Promise.all([request<PromptLabExperiment[]>('runs'), request<PromptLabExperiment[]>('comparisons')])).flat(),
  saveRun: (value: PromptLabExperiment) => saveResource(value.historySources ? 'comparisons' : 'runs', value),
};
