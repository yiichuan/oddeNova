// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isDemoMode } from '../../demo/demo-config';
import type { CodeRevision, Session } from '../../hooks/useSessions';
import { t } from '../../lib/i18n';
import Sidebar from '../Sidebar';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

// lottie-web crashes at import time in happy-dom (no canvas 2D context)
vi.mock('lottie-react', () => ({ default: () => null }));

vi.mock('../../demo/demo-config', () => ({
  isDemoMode: vi.fn(() => false),
  isPresentationMode: vi.fn(() => false),
}));

type SidebarTestSession = Omit<Session, 'mode'>;

function makeSession(overrides: Partial<SidebarTestSession> = {}): SidebarTestSession {
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
        sessions={[session as Session]}
        currentId={session.id}
        suggestions={[]}
        onSendText={vi.fn()}
        onNewSession={vi.fn()}
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

describe('Sidebar code revisions', () => {
  const roots: Root[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => root.unmount());
    }
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('forwards revisions so assistant messages render the diff toggle', () => {
    const messages: Session['messages'] = [
      { id: 'm-1', role: 'user', content: '改鼓点', timestamp: 1 },
      {
        id: 'm-2',
        role: 'assistant',
        content: '完成',
        code: 's("bd*2")',
        revisionId: 'rev-1',
        timestamp: 2,
      },
    ];
    const revisions: CodeRevision[] = [{
      id: 'rev-1',
      beforeCode: 's("bd")',
      afterCode: 's("bd*2")',
      playbackStatus: 'played',
      createdAt: 2,
    }];
    const { container, root } = renderSidebar({ messages, revisions });
    roots.push(root);

    const toggle = container.querySelector('[data-code-diff-toggle="m-2"]');
    expect(toggle).not.toBeNull();
  });
});

describe('Sidebar session title editing layout', () => {
  const roots: Root[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => root.unmount());
    }
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.mocked(isDemoMode).mockReturnValue(false);
  });

  it('keeps space between the edit input and the history actions', () => {
    const { container, root } = renderSidebar();
    roots.push(root);

    act(() => {
      container.querySelector<HTMLButtonElement>('button[data-session-title-edit]')?.click();
    });

    const input = container.querySelector<HTMLInputElement>('input[aria-label="Edit session title"]');
    expect(input).not.toBeNull();
    expect(input?.closest('[data-session-title-shell]')).not.toBeNull();
    expect(input?.closest('[data-session-title-shell]')?.parentElement?.className).toContain('flex-1');
  });

  it('keeps the demo mood suggestion in the input rotation when suggestions are empty', () => {
    vi.mocked(isDemoMode).mockReturnValue(true);
    vi.useFakeTimers();
    try {
      const { container, root } = renderSidebar({ suggestions: [], onMoodGenerate: vi.fn() });
      roots.push(root);

      // The mood entry now lives in ChatInput's placeholder carousel; let the
      // typewriter reveal it (first token after 400ms, then 80ms per token).
      for (let i = 0; i < 30; i++) {
        act(() => {
          vi.advanceTimersByTime(100);
        });
      }

      expect(container.textContent).toContain(t('moodGenerate'));
    } finally {
      vi.useRealTimers();
    }
  });

  it('ends the Sidebar outline at the top edge of ChatInput', () => {
    const { container, root } = renderSidebar();
    roots.push(root);

    expect(container.querySelector(`button[aria-label="${t('choosePersona')}"]`)).toBeNull();
    const sidebar = container.querySelector('aside');
    expect(sidebar?.className).toContain('rounded-region');
    expect(sidebar?.className).toContain('overflow-hidden');
    const messageRegion = container.querySelector('[data-sidebar-message-region]');
    expect(messageRegion?.className).toContain('rounded-t-region');
    expect(messageRegion?.className).toContain('rounded-b-none');
    expect(messageRegion?.className).toContain('border');
    expect(container.querySelector('form')?.parentElement?.className).toContain('-mt-px');
    expect(container.querySelector('form')?.parentElement?.className).toContain('w-full');
    expect(container.querySelector('form')?.parentElement?.className).not.toContain('px-region');
    expect(container.querySelector('form')?.parentElement?.className).not.toContain('pb-3');
  });
});
