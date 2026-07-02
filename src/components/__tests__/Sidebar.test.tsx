// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isDemoMode } from '../../demo/demo-config';
import type { Session } from '../../hooks/useSessions';
import { t } from '../../lib/i18n';
import Sidebar from '../Sidebar';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock('../../services/airjelly', () => ({
  checkAirJellyAvailable: vi.fn(async () => false),
}));

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
        onMoodGenerate={vi.fn()}
        onReinitEngine={vi.fn()}
        onSwitchSession={vi.fn()}
        onDeleteSession={vi.fn()}
        onRenameSession={vi.fn()}
        onRollback={vi.fn()}
        onBranch={vi.fn()}
        onRetry={vi.fn()}
        onOpenPersonaModal={vi.fn()}
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
    expect(input?.parentElement?.className).toContain('gap-3');
  });

  it('keeps the fill suggestion action visible when suggestions are empty', () => {
    const onSendText = vi.fn();
    const { container, root } = renderSidebar({
      suggestions: [],
      fillSuggestion: 'make a bright intro',
      onSendText,
    });
    roots.push(root);

    const button = Array.from(container.querySelectorAll('button')).find((candidate) =>
      candidate.textContent?.includes(t('playSong')),
    );

    expect(button).not.toBeUndefined();

    act(() => {
      button?.click();
    });

    expect(onSendText).toHaveBeenCalledWith('make a bright intro');
  });

  it('keeps the demo mood action visible when suggestions are empty', () => {
    vi.mocked(isDemoMode).mockReturnValue(true);
    const { container, root } = renderSidebar({ suggestions: [] });
    roots.push(root);

    expect(container.textContent).toContain(t('moodGenerate'));
  });

  it('opens persona selection when the logo is clicked', () => {
    const onOpenPersonaModal = vi.fn();
    const { container, root } = renderSidebar({ onOpenPersonaModal });
    roots.push(root);

    const logoButton = container.querySelector<HTMLButtonElement>(`button[aria-label="${t('choosePersona')}"]`);
    expect(logoButton).not.toBeNull();

    act(() => {
      logoButton?.click();
    });

    expect(onOpenPersonaModal).toHaveBeenCalledTimes(1);
  });
});
