import type { PromptTemplate } from '../prompts/lab/template';
import type { PromptLabExperiment, PromptLabSuite } from './types';

type Collection = 'templates' | 'suites' | 'runs';

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
  listTemplates: () => request<PromptTemplate[]>('templates'),
  saveTemplate: (value: PromptTemplate) => saveResource('templates', value),
  deleteTemplate: (id: string) => request<{ ok: true }>('templates', id, { method: 'DELETE' }),
  listSuites: () => request<PromptLabSuite[]>('suites'),
  saveSuite: (value: PromptLabSuite) => saveResource('suites', value),
  listRuns: () => request<PromptLabExperiment[]>('runs'),
  saveRun: (value: PromptLabExperiment) => saveResource('runs', value),
};
