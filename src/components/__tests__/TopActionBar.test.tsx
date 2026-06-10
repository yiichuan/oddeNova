// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Session } from '../../hooks/useSessions';
import { MOBILE_TOP_ACTIONS } from '../mobileTopActions';
import TopActionBar from '../TopActionBar';

const uploadShareMock = vi.hoisted(() => vi.fn());
const shareUrlMock = vi.hoisted(() => vi.fn());

vi.mock('../../services/share', () => ({
  uploadShare: uploadShareMock,
}));

vi.mock('../../services/share-target', () => ({
  shareUrl: shareUrlMock,
}));

vi.mock('../../lib/analytics', () => ({
  trackShare: vi.fn(),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function setDesktopViewport() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 's-1',
    title: 'Chat only',
    mode: 'chat',
    messages: [{ id: 'm-1', role: 'user', content: 'hello', timestamp: 1 }],
    code: '',
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function renderTopActionBar(session: Session) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <TopActionBar
        onOpenSettings={vi.fn()}
        session={session}
        code=""
        messages={session.messages}
        engineReady
        hasCode={false}
        exportState={{ status: 'idle', progress: 0 }}
        onExport={vi.fn()}
        onResetExportState={vi.fn()}
        bpm={120}
      />,
    );
  });

  return { container, root };
}

describe('TopActionBar mobile menu', () => {
  const roots: Root[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      act(() => root.unmount());
    }
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    uploadShareMock.mockReset();
    shareUrlMock.mockReset();
  });

  it('keeps the requested mobile menu actions in order', () => {
    expect(MOBILE_TOP_ACTIONS.map((action) => action.labelZh)).toEqual([
      '设置',
      '分享',
      '导出',
      '学习',
      'GitHub',
    ]);
  });

  it('shares chat-only sessions with messages even when they have no code', async () => {
    setDesktopViewport();
    uploadShareMock.mockResolvedValueOnce('share123');
    shareUrlMock.mockResolvedValueOnce('copied');
    const session = makeSession();
    const { container, root } = renderTopActionBar(session);
    roots.push(root);

    const shareButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent === 'Share');
    expect(shareButton).not.toBeUndefined();
    expect(shareButton?.disabled).toBe(false);

    await act(async () => {
      shareButton?.click();
    });

    expect(uploadShareMock).toHaveBeenCalledWith({
      title: 'Chat only',
      mode: 'chat',
      code: '',
      messages: session.messages,
    });
  });
});
