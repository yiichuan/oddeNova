// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '../../hooks/useSessions';
import Sidebar from '../Sidebar';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock('../../services/airjelly', () => ({
  checkAirJellyAvailable: vi.fn(async () => false),
}));

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 's-1',
    title: '+++快节奏鼓点++++++++++++',
    messages: [{ id: 'm-1', role: 'user', content: 'hello', timestamp: 1 }],
    code: '',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function renderSidebar(props: Partial<React.ComponentProps<typeof Sidebar>> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const session = makeSession();

  act(() => {
    root.render(
      <Sidebar
        title={session.title}
        messages={session.messages}
        isLoading={false}
        engineReady={true}
        sessions={[session]}
        currentId={session.id}
        suggestions={[]}
        onSendText={vi.fn()}
        onNewSession={vi.fn()}
        onMoodGenerate={vi.fn()}
        onReinitEngine={vi.fn()}
        onSwitchSession={vi.fn()}
        onDeleteSession={vi.fn()}
        onRenameSession={vi.fn()}
        onRollback={vi.fn()}
        onBranch={vi.fn()}
        onRetry={vi.fn()}
        {...props}
      />,
    );
  });

  return { container, root };
}

describe('Sidebar session title editing layout', () => {
  const roots: Root[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => root.unmount());
    }
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('keeps space between the edit input and the history actions', () => {
    const { container, root } = renderSidebar();
    roots.push(root);

    act(() => {
      container.querySelector<HTMLButtonElement>('button[data-session-title-edit]')?.click();
    });

    const input = container.querySelector<HTMLInputElement>('input[aria-label="Edit session title"]');
    expect(input).not.toBeNull();
    expect(input?.parentElement?.className).toContain('gap-3');
  });
});
