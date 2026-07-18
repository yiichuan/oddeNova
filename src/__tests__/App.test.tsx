// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Session } from '../hooks/useSessions';

const mocks = vi.hoisted(() => ({
  getAllSessions: vi.fn(),
  auth: {
    user: { id: 'user-1', email: 'listener@example.com' },
    configured: true,
    loading: false,
    recoveringPassword: false,
  },
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => mocks.auth,
}));

vi.mock('../hooks/useStrudel', () => ({
  useStrudel: () => ({
    code: '',
    play: vi.fn(),
    stop: vi.fn(),
    setCode: vi.fn(),
    setRoot: vi.fn(),
    isPlaying: false,
    engineReady: true,
    engineStatus: 'ready',
    error: '',
    exportState: 'idle',
    exportWav: vi.fn(),
    resetExportState: vi.fn(),
    setError: vi.fn(),
  }),
}));

vi.mock('../hooks/useSessions', () => ({
  useSessions: () => ({
    isLoading: false,
    isPersistent: true,
    sessions: [],
    currentId: null,
    currentSession: null,
    importSession: vi.fn(),
    importOddeNovaSession: vi.fn(),
    setSuggestions: vi.fn(),
    setCurrentCode: vi.fn(),
    newSession: vi.fn(),
    switchTo: vi.fn(),
    branchFromMessage: vi.fn(),
    truncateAndEdit: vi.fn(),
    truncate: vi.fn(),
  }),
}));

vi.mock('../hooks/useSuggestions', () => ({ useSuggestions: () => ({ suggestions: [] }) }));
vi.mock('../hooks/useImportShare', () => ({ useImportShare: () => ({ status: 'idle' }) }));
vi.mock('../hooks/useOddeNovaImport', () => ({ useOddeNovaImport: () => ({ status: 'idle' }) }));
vi.mock('../hooks/useReplay', () => ({ useReplay: () => ({ isReplaying: false, replayMessages: [], replayInputText: '', startReplay: vi.fn() }) }));
vi.mock('../hooks/useAgentRunner', () => ({ useAgentRunner: () => vi.fn() }));
vi.mock('../hooks/useVideoDemo', () => ({ useVideoDemo: () => ({ isVideoMode: false, videoDemoMsgs: [], videoConvScrollBottom: false, videoTitle: '' }) }));
vi.mock('../hooks/useLayout', () => ({
  useLayout: () => ({
    isMobile: true, keyboardHeight: 0, sidebarWidth: 0, vizHeight: 0, isDragging: false,
    mainRef: { current: null }, topActionsRef: { current: null }, hDragHandlers: {}, vDragHandlers: {},
    historyOpen: false, setHistoryOpen: vi.fn(), drawerOpen: false, setDrawerOpen: vi.fn(),
    mobileFocusedArea: null, shouldLiftBottomBar: false, mobileDrawerHeight: 0,
    handleChatFocusChange: vi.fn(), handleCodeFocusChange: vi.fn(),
  }),
}));
vi.mock('../lib/session-storage', () => ({ getAllSessions: mocks.getAllSessions }));
vi.mock('../lib/soundfont-loader', () => ({ registerSoundfonts: vi.fn() }));
vi.mock('../services/llm-config', () => ({ hasApiKeyConfigured: () => true }));
vi.mock('../services/llm', () => ({ resetClient: vi.fn() }));
vi.mock('../lib/community-invite', () => ({
  hasSeenCommunityInvite: () => true,
  markCommunityInviteSeen: vi.fn(),
  shouldAutoOpenApiKeyModal: () => false,
}));

vi.mock('../components/CodePanel', () => ({ default: () => null }));
vi.mock('../components/Sidebar', () => ({ default: () => null }));
vi.mock('../components/VizPlaceholder', () => ({ default: () => null }));
vi.mock('../components/ApiKeyModal', () => ({ default: () => null }));
vi.mock('../components/ConversationView', () => ({ default: () => null }));
vi.mock('../components/HistoryPanel', () => ({ default: () => null }));
vi.mock('../components/ChatInput', () => ({ default: () => null }));
vi.mock('../components/TopActionBar', () => ({ default: () => null }));
vi.mock('../components/AccountModal', () => ({ default: () => null }));
vi.mock('../components/PersonaModal', () => ({ default: () => null }));
vi.mock('../components/OddeNovaImportNotice', () => ({ default: () => null }));

import App from '../App';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('App password recovery', () => {
  let root: Root | undefined;

  afterEach(() => {
    if (root) act(() => root?.unmount());
    root = undefined;
    document.body.innerHTML = '';
    mocks.auth.recoveringPassword = false;
    vi.clearAllMocks();
  });

  it('does not show the guest-history import dialog during password recovery', async () => {
    mocks.auth.recoveringPassword = true;
    mocks.getAllSessions.mockResolvedValue([{
      id: 'guest-session',
      title: 'Guest history',
      code: 'sound("bd")',
      messages: [],
      createdAt: 1,
      updatedAt: 1,
    } satisfies Session]);
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<App />);
      await Promise.resolve();
    });

    expect(container.textContent).not.toContain('Sync local history?');
  });

  it('does not show the guest-history import dialog when recovery starts during guest-session loading', async () => {
    const guestSession: Session = {
      id: 'guest-session',
      title: 'Guest history',
      code: 'sound("bd")',
      messages: [],
      createdAt: 1,
      updatedAt: 1,
    };
    let resolveGuestSessions!: (sessions: Session[]) => void;
    mocks.getAllSessions.mockImplementation(() => new Promise<Session[]>((resolve) => {
      resolveGuestSessions = resolve;
    }));
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<App />);
      await Promise.resolve();
    });

    expect(mocks.getAllSessions).toHaveBeenCalledWith('guest');

    mocks.auth.recoveringPassword = true;
    await act(async () => {
      root?.render(<App />);
      await Promise.resolve();
    });

    await act(async () => {
      resolveGuestSessions([guestSession]);
      await Promise.resolve();
    });

    expect(container.textContent).not.toContain('Sync local history?');
  });
});
