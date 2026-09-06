// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CustomPersona } from '../../../lib/persona-storage';
import { t } from '../../../lib/i18n';
import PersonaModal from '../PersonaModal';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const personas: CustomPersona[] = [];
let activePersonaId = 'oddenova';

vi.mock('../../../lib/persona-storage', () => ({
  BUILTIN_PERSONA_ID: 'oddenova',
  getActivePersonaId: vi.fn(async () => activePersonaId),
  getAllPersonas: vi.fn(async () => [...personas]),
  setActivePersonaId: vi.fn(async (id: string) => {
    activePersonaId = id;
  }),
  putPersona: vi.fn(async (persona: CustomPersona) => {
    const index = personas.findIndex((existing) => existing.id === persona.id);
    if (index >= 0) personas[index] = persona;
    else personas.push(persona);
  }),
  deletePersona: vi.fn(async (id: string) => {
    const index = personas.findIndex((existing) => existing.id === id);
    if (index >= 0) personas.splice(index, 1);
    if (activePersonaId === id) activePersonaId = 'oddenova';
  }),
}));

function renderModal(props: Partial<React.ComponentProps<typeof PersonaModal>> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const onClose = vi.fn();

  act(() => {
    root.render(<PersonaModal onClose={onClose} {...props} />);
  });

  return { container, root, onClose };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

function changeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  act(() => {
    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value');
    descriptor?.set?.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

describe('PersonaModal', () => {
  const roots: Root[] = [];

  beforeEach(() => {
    personas.splice(0);
    activePersonaId = 'oddenova';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-19T00:00:00Z'));
    vi.stubGlobal('crypto', { randomUUID: () => 'persona-new' });
  });

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => root.unmount());
    }
    document.body.innerHTML = '';
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('selects a custom persona and closes', async () => {
    personas.push({
      id: 'persona-1',
      name: 'Nocturne',
      prompt: 'Quiet prompt',
      createdAt: 1,
      updatedAt: 1,
    });
    const { container, root, onClose } = renderModal();
    roots.push(root);
    await flush();

    const button = Array.from(container.querySelectorAll('button')).find((candidate) =>
      candidate.textContent?.includes('Nocturne'),
    );

    await act(async () => {
      button?.click();
    });

    expect(activePersonaId).toBe('persona-1');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('creates a custom persona from the form', async () => {
    const { container, root } = renderModal();
    roots.push(root);
    await flush();

    await act(async () => {
      Array.from(container.querySelectorAll('button')).find((candidate) =>
        candidate.textContent?.includes(t('newPersona')),
      )?.click();
    });

    const nameInput = container.querySelector<HTMLInputElement>('input[name="persona-name"]');
    const promptInput = container.querySelector<HTMLTextAreaElement>('textarea[name="persona-prompt"]');
    expect(nameInput).not.toBeNull();
    expect(promptInput).not.toBeNull();

    changeValue(nameInput!, 'Nocturne');
    changeValue(promptInput!, 'Quiet prompt');

    await act(async () => {
      Array.from(container.querySelectorAll('button')).find((candidate) =>
        candidate.textContent === t('save'),
      )?.click();
    });

    expect(personas).toEqual([
      {
        id: 'persona-new',
        name: 'Nocturne',
        prompt: 'Quiet prompt',
        createdAt: Date.parse('2026-06-19T00:00:00Z'),
        updatedAt: Date.parse('2026-06-19T00:00:00Z'),
      },
    ]);
    expect(container.textContent).toContain('Nocturne');
  });

  it('deletes the active custom persona and falls back to oddeNova', async () => {
    activePersonaId = 'persona-1';
    personas.push({
      id: 'persona-1',
      name: 'Nocturne',
      prompt: 'Quiet prompt',
      createdAt: 1,
      updatedAt: 1,
    });
    const { container, root } = renderModal();
    roots.push(root);
    await flush();

    await act(async () => {
      container.querySelector<HTMLButtonElement>(`button[aria-label="${t('delete')} Nocturne"]`)?.click();
    });

    expect(personas).toEqual([]);
    expect(activePersonaId).toBe('oddenova');
  });
});
