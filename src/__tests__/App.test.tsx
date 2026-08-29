// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Session } from '../hooks/useSessions';
import type { FavoriteConversation } from '../lib/favorite-conversations';
import { t } from '../lib/i18n';

const mocks = vi.hoisted(() => ({
  getAllSessions: vi.fn(),
  deleteSession: vi.fn(async () => undefined),
  importSession: vi.fn(async () => undefined),
  strudel: {
    code: '',
    play: vi.fn(async () => true),
    stop: vi.fn(),
    setCode: vi.fn(),
    setRoot: vi.fn(),
    isPlaying: false,
    engineReady: true,
    engineStatus: 'ready',
    error: '',
    exportState: { status: 'idle', progress: 0 },
    exportWav: vi.fn(),
    resetExportState: vi.fn(),
    setError: vi.fn(),
  },
  session: {
    id: 's-1',
    title: 'Session',
    code: 's("bd")',
    messages: [],
    createdAt: 1,
    updatedAt: 1,
  } as Session,
  sessions: {
    isLoading: false,
    isPersistent: true,
    sessions: [] as Session[],
    currentId: 's-1' as string | null,
    currentSession: null as Session | null,
    currentSyncStatus: 'synced' as 'synced' | 'dirty' | 'saving' | 'offline' | 'retrying',
    currentManualSyncStatus: undefined as
      | 'synced'
      | 'dirty'
      | 'saving'
      | 'offline'
      | 'retrying'
      | undefined,
    importSession: vi.fn(async () => undefined),
    importOddeNovaSession: vi.fn(),
    setSuggestions: vi.fn(),
    setCurrentCode: vi.fn(),
    setManualCode: vi.fn(async () => undefined),
    checkpointSession: vi.fn(async () => undefined),
    flushCloudSaves: vi.fn(async () => undefined),
    newSession: vi.fn(),
    switchTo: vi.fn(),
    branchFromMessage: vi.fn(),
    truncateAndEdit: vi.fn(),
    truncate: vi.fn(),
    deleteSession: vi.fn(),
    renameSession: vi.fn(),
  },
  favorites: {
    favorites: [] as FavoriteConversation[],
    sourceSessionIds: new Set<string>(),
    isLoading: false,
    error: null,
    create: vi.fn(),
    remove: vi.fn(async () => undefined),
  },
  codePanelProps: null as Record<string, unknown> | null,
  sidebarProps: null as Record<string, unknown> | null,
  accountModalProps: null as Record<string, unknown> | null,
  agentRunnerConfig: null as Record<string, unknown> | null,
  isMobile: true,
  auth: {
    user: { id: 'user-1', email: 'listener@example.com' },
    configured: true,
    loading: false,
    recoveringPassword: false,
    oauthErrorKey: null,
    dismissOAuthError: vi.fn(),
  },
}));

vi.mock('../hooks/useAuth', () => ({
  useAuth: () => mocks.auth,
}));

vi.mock('../hooks/useStrudel', () => ({
  useStrudel: () => mocks.strudel,
}));

vi.mock('../hooks/useSessions', () => ({
  useSessions: () => mocks.sessions,
  // The featured session draft mints message ids through the store's own
  // helper rather than growing a second id convention.
  newMessageId: () => `msg-${Math.random()}`,
}));

vi.mock('../hooks/useFavorites', () => ({
  useFavorites: () => mocks.favorites,
}));

vi.mock('../hooks/useSuggestions', () => ({ useSuggestions: () => ({ suggestions: [] }) }));
vi.mock('../hooks/useImportShare', () => ({ useImportShare: () => ({ status: 'idle' }) }));
vi.mock('../hooks/useOddeNovaImport', () => ({ useOddeNovaImport: () => ({ status: 'idle' }) }));
vi.mock('../hooks/useReplay', () => ({ useReplay: () => ({ isReplaying: false, replayMessages: [], replayInputText: '', startReplay: vi.fn() }) }));
vi.mock('../hooks/useAgentRunner', () => ({
  useAgentRunner: (config: Record<string, unknown>) => {
    mocks.agentRunnerConfig = config;
    return vi.fn();
  },
}));
vi.mock('../hooks/useVideoDemo', () => ({ useVideoDemo: () => ({ isVideoMode: false, videoDemoMsgs: [], videoConvScrollBottom: false, videoTitle: '' }) }));
vi.mock('../hooks/useModelSettingsDraft', () => ({
  useModelSettingsDraft: () => ({
    activeProvider: 'official',
    dirtyProviders: new Set(),
    draft: { apiKey: '', model: 'deepseek-v4-flash' },
    drafts: {},
    saveSelectedProvider: vi.fn(() => true),
    saveStatus: 'idle',
    selectedIsDirty: false,
    selectProvider: vi.fn(),
    selectedProvider: 'official',
    updateDraft: vi.fn(),
  }),
}));
vi.mock('../hooks/useLayout', () => ({
  VIZ_DIVIDER_HEIGHT: 6,
  useLayout: () => ({
    isMobile: mocks.isMobile, keyboardHeight: 0, sidebarWidth: 0, vizHeight: 0, isDragging: false,
    vizCollapsed: false, toggleVizCollapsed: vi.fn(),
    mainRef: { current: null }, topActionsRef: { current: null }, hDragHandlers: {}, vDragHandlers: {},
    historyOpen: false, setHistoryOpen: vi.fn(), drawerOpen: false, setDrawerOpen: vi.fn(),
    mobileFocusedArea: null, shouldLiftBottomBar: false, mobileDrawerHeight: 0,
    handleChatFocusChange: vi.fn(), handleCodeFocusChange: vi.fn(),
  }),
}));
vi.mock('../lib/session-storage', () => ({
  getAllSessions: mocks.getAllSessions,
  deleteSession: mocks.deleteSession,
  normalizeGuestSessionForImport: vi.fn(async (session: Session) => session),
}));
vi.mock('../lib/soundfont-loader', () => ({ registerSoundfonts: vi.fn() }));
vi.mock('../services/llm-config', () => ({ hasApiKeyConfigured: () => true }));
vi.mock('../services/llm', () => ({ resetClient: vi.fn() }));
vi.mock('../lib/community-invite', () => ({
  hasSeenCommunityInvite: () => true,
  markCommunityInviteSeen: vi.fn(),
  shouldAutoOpenApiKeyModal: () => false,
}));

vi.mock('../components/studio/CodePanel', () => ({
  default: (props: Record<string, unknown>) => {
    mocks.codePanelProps = props;
    return null;
  },
}));
vi.mock('../components/settings/SettingsSidebar', () => ({ default: () => null }));
vi.mock('../components/settings/ModelSettingsPanel', () => ({ default: () => null }));
vi.mock('../components/settings/AppearanceSettingsPanel', () => ({ default: () => null }));
vi.mock('../components/conversation/Sidebar', () => ({
  default: (props: Record<string, unknown>) => {
    mocks.sidebarProps = props;
    return null;
  },
}));
vi.mock('../components/studio/VizPlaceholder', () => ({ default: () => null }));
vi.mock('../components/overlays/ApiKeyModal', () => ({ default: () => null }));
// ArchivedConversationView (rendered under the Favorites tab) imports these
// named exports from the real module; the mock must carry them too or it
// throws on any render that reaches the favorites workspace.
vi.mock('../components/conversation/ConversationView', () => ({
  default: () => null,
  MarkdownText: ({ content }: { content: string }) => content,
  UserMessageBubble: ({ content }: { content: string }) => content,
}));
vi.mock('../components/conversation/HistoryPanel', () => ({ default: () => null }));
vi.mock('../components/conversation/ChatInput', () => ({ default: () => null }));
// ShareButton too: the featured player bar shares a piece on the studio's own
// button, so it comes through this module.
vi.mock('../components/studio/TopActionBar', () => ({
  default: () => null,
  ShareButton: () => null,
}));
vi.mock('../components/overlays/AccountModal', () => ({
  default: (props: Record<string, unknown>) => {
    mocks.accountModalProps = props;
    return <div data-testid="account-modal" />;
  },
}));
vi.mock('../components/overlays/PersonaModal', () => ({ default: () => null }));
vi.mock('../components/overlays/OddeNovaImportNotice', () => ({ default: () => null }));

import App from '../App';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('App password recovery', () => {
  let root: Root | undefined;

  beforeEach(() => {
    mocks.strudel.code = '';
    mocks.session.code = 's("bd")';
    mocks.session.messages = [];
    mocks.sessions.currentId = 's-1';
    mocks.sessions.currentSession = mocks.session;
    mocks.sessions.sessions = [mocks.session];
    mocks.sessions.isLoading = false;
    mocks.sessions.isPersistent = true;
    mocks.sessions.currentSyncStatus = 'synced';
    mocks.sessions.currentManualSyncStatus = undefined;
    mocks.importSession.mockImplementation(async () => undefined);
    mocks.sessions.importSession = mocks.importSession;
    mocks.codePanelProps = null;
    mocks.sidebarProps = null;
    mocks.accountModalProps = null;
    mocks.agentRunnerConfig = null;
    mocks.favorites.create.mockResolvedValue({
      id: 'favorite-1',
      sourceSessionId: 's-1',
      sessionId: 's-1',
      title: 'Session',
      favoritedAt: 100,
      turns: [],
      messages: [],
      code: 's("bd")',
    });
    mocks.favorites.favorites = [];
    mocks.favorites.sourceSessionIds = new Set<string>();
    mocks.isMobile = true;
  });

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

  it('waits for the account sessions to load before offering the guest import', async () => {
    const guestSession: Session = {
      id: 'guest-session',
      title: 'Guest history',
      code: 'sound("bd")',
      messages: [],
      createdAt: 1,
      updatedAt: 1,
    };
    mocks.getAllSessions.mockResolvedValue([guestSession]);
    mocks.sessions.isLoading = true;
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<App />);
      await Promise.resolve();
    });

    // Importing into a half-loaded account drops the imported session: the
    // in-flight load replaces the session list once it lands.
    expect(container.textContent).not.toContain('Sync local history?');

    mocks.sessions.isLoading = false;
    await act(async () => {
      root?.render(<App />);
      await Promise.resolve();
    });

    expect(container.textContent).toContain('Sync local history?');
  });

  it('imports a guest source once when the confirm button is clicked twice', async () => {
    const guestSession: Session = {
      id: 'guest-session',
      title: '来个简单的鼓点',
      code: 'sound("bd")',
      messages: [],
      createdAt: 1,
      updatedAt: 1,
    };
    mocks.getAllSessions.mockResolvedValue([guestSession]);
    let finishImport!: () => void;
    mocks.importSession.mockImplementation(
      () => new Promise<undefined>((resolve) => { finishImport = () => resolve(undefined); }),
    );
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<App />);
      await Promise.resolve();
    });

    const importButton = [...container.querySelectorAll('button')]
      .find((button) => button.textContent === 'Import and sync');
    expect(importButton).toBeDefined();

    // The cloud save keeps the dialog up for as long as the request takes, so
    // an impatient second click must not import the same history twice.
    await act(async () => {
      importButton?.click();
      await Promise.resolve();
    });
    await act(async () => {
      importButton?.click();
      await Promise.resolve();
    });

    expect(mocks.importSession).toHaveBeenCalledTimes(1);

    await act(async () => {
      finishImport();
      await Promise.resolve();
    });
  });

  it('removes a guest source after importing it to the signed-in account', async () => {
    const guestSession: Session = {
      id: 'guest-session',
      title: 'Guest history',
      code: 'sound("bd")',
      messages: [],
      createdAt: 1,
      updatedAt: 1,
    };
    mocks.getAllSessions.mockResolvedValue([guestSession]);
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<App />);
      await Promise.resolve();
    });

    const importButton = [...container.querySelectorAll('button')]
      .find((button) => button.textContent === 'Import and sync');
    expect(importButton).toBeDefined();

    await act(async () => {
      importButton?.click();
      await Promise.resolve();
    });

    // Syncing guest history must not pull the user off the session they are on.
    expect(mocks.importSession).toHaveBeenCalledWith(guestSession, { activate: false, awaitCloud: true });
    expect(mocks.deleteSession).toHaveBeenCalledWith('guest-session', 'guest');
  });
});

describe('App session sync boundaries', () => {
  let root: Root | undefined;
  let container: HTMLDivElement;

  beforeEach(() => {
    mocks.getAllSessions.mockResolvedValue([]);
    mocks.strudel.code = 's("bd")';
    mocks.session.code = 's("bd")';
    mocks.session.messages = [];
    mocks.sessions.currentId = 's-1';
    mocks.sessions.currentSession = mocks.session;
    mocks.sessions.sessions = [mocks.session];
    mocks.sessions.isLoading = false;
    mocks.sessions.isPersistent = true;
    mocks.sessions.currentSyncStatus = 'synced';
    mocks.sessions.currentManualSyncStatus = undefined;
    mocks.codePanelProps = null;
    mocks.sidebarProps = null;
    mocks.accountModalProps = null;
    mocks.agentRunnerConfig = null;
    mocks.favorites.create.mockResolvedValue({
      id: 'favorite-1',
      sourceSessionId: 's-1',
      sessionId: 's-1',
      title: 'Session',
      favoritedAt: 100,
      turns: [],
      messages: [],
      code: 's("bd")',
    });
    mocks.favorites.favorites = [];
    mocks.favorites.sourceSessionIds = new Set<string>();
    mocks.isMobile = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) act(() => root?.unmount());
    root = undefined;
    document.body.innerHTML = '';
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  async function renderApp(): Promise<void> {
    await act(async () => {
      root?.render(<App />);
      await Promise.resolve();
    });
  }

  it('opens the account modal from desktop navigation without changing the selected workspace', async () => {
    mocks.isMobile = false;
    await renderApp();

    const accountButton = container.querySelector<HTMLButtonElement>(
      `button[aria-label="${t('navAccount')}"]`,
    );
    const homeButton = container.querySelector<HTMLButtonElement>(
      `button[aria-label="${t('navHome')}"]`,
    );

    expect(accountButton).not.toBeNull();
    expect(container.querySelector('[data-testid="account-modal"]')).toBeNull();

    await act(async () => {
      accountButton?.click();
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="account-modal"]')).not.toBeNull();
    expect(mocks.accountModalProps).not.toBeNull();
    expect(homeButton?.getAttribute('aria-current')).toBe('page');
    expect(accountButton?.getAttribute('aria-current')).toBeNull();
  });

  it('stops the studio when the workspace it plays in is left behind', async () => {
    mocks.isMobile = false;
    await renderApp();
    mocks.strudel.stop.mockClear();

    const navButton = (labelKey: 'navFeatured' | 'navHome' | 'navSettings') =>
      container.querySelector<HTMLButtonElement>(`button[aria-label="${t(labelKey)}"]`);

    // A transport belongs to the page its controls are on: walking off the
    // studio silences it rather than leaving it playing out of reach.
    await act(async () => {
      navButton('navFeatured')?.click();
      await Promise.resolve();
    });
    expect(mocks.strudel.stop).toHaveBeenCalled();

    mocks.strudel.stop.mockClear();
    await act(async () => {
      navButton('navHome')?.click();
      await Promise.resolve();
    });
    // Coming back is not leaving.
    expect(mocks.strudel.stop).not.toHaveBeenCalled();

    await act(async () => {
      navButton('navSettings')?.click();
      await Promise.resolve();
    });
    expect(mocks.strudel.stop).toHaveBeenCalled();
  });

  it.each(['s("bd sd")', ''])(
    'routes a manual editor change (%s) through setManualCode',
    async (code) => {
      await renderApp();
      mocks.sessions.setManualCode.mockClear();
      mocks.strudel.code = code;

      await renderApp();

      expect(mocks.sessions.setManualCode).toHaveBeenCalledWith(code, 's-1');
    },
  );

  it('does not route editor changes through the manual path while the Agent is loading', async () => {
    await renderApp();
    const setLoadingSessions = mocks.agentRunnerConfig?.setLoadingSessions as
      | ((value: Set<string>) => void)
      | undefined;
    expect(setLoadingSessions).toBeDefined();

    act(() => {
      setLoadingSessions?.(new Set(['s-1']));
    });
    mocks.sessions.setManualCode.mockClear();
    mocks.strudel.code = 's("hh")';
    await renderApp();

    expect(mocks.sessions.setManualCode).not.toHaveBeenCalled();
  });

  it('persists and flushes the latest editor code before playing', async () => {
    await renderApp();
    mocks.strudel.code = 's("bd sd")';
    await renderApp();
    mocks.sessions.setManualCode.mockClear();
    mocks.sessions.flushCloudSaves.mockClear();
    mocks.strudel.play.mockClear();

    await act(async () => {
      await (mocks.codePanelProps?.onPlay as (() => Promise<void>))();
    });

    expect(mocks.sessions.setManualCode).toHaveBeenCalledWith('s("bd sd")', 's-1');
    expect(mocks.sessions.flushCloudSaves).toHaveBeenCalledWith('s-1');
    const manualOrder = mocks.sessions.setManualCode.mock.invocationCallOrder[0];
    const flushOrder = mocks.sessions.flushCloudSaves.mock.invocationCallOrder[0];
    const playOrder = mocks.strudel.play.mock.invocationCallOrder[0];
    expect(manualOrder).toBeLessThan(flushOrder);
    expect(flushOrder).toBeLessThan(playOrder);
  });

  it('checkpoints the live editor code before creating a favorite snapshot', async () => {
    mocks.isMobile = false;
    await renderApp();
    mocks.strudel.code = 's("bd, hh*8")';
    await renderApp();
    mocks.sessions.setManualCode.mockClear();
    mocks.sessions.flushCloudSaves.mockClear();
    mocks.favorites.create.mockClear();
    mocks.sessions.newSession.mockClear();

    await act(async () => {
      await (mocks.sidebarProps?.onFavoriteSession as ((id: string) => Promise<void>))('s-1');
    });

    expect(mocks.sessions.setManualCode).toHaveBeenCalledWith('s("bd, hh*8")', 's-1');
    expect(mocks.sessions.flushCloudSaves).toHaveBeenCalledWith('s-1');
    expect(mocks.favorites.create).toHaveBeenCalledWith(mocks.session, 's("bd, hh*8")');
    expect(mocks.sessions.flushCloudSaves.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.favorites.create.mock.invocationCallOrder[0]);
    expect(mocks.sessions.newSession).toHaveBeenCalledOnce();
  });

  it('does not replace the Studio conversation when favoriting another history entry', async () => {
    const other = {
      ...mocks.session,
      id: 's-2',
      title: 'Other session',
      code: 's("hh")',
    };
    mocks.sessions.sessions = [mocks.session, other];
    mocks.favorites.create.mockResolvedValueOnce({
      id: 'favorite-2',
      sourceSessionId: 's-2',
      sessionId: 's-2',
      title: 'Other session',
      favoritedAt: 101,
      turns: [],
      messages: [],
      code: 's("hh")',
    });
    mocks.isMobile = false;
    await renderApp();
    mocks.sessions.newSession.mockClear();

    await act(async () => {
      await (mocks.sidebarProps?.onFavoriteSession as ((id: string) => Promise<void>))('s-2');
    });

    expect(mocks.favorites.create).toHaveBeenCalledWith(other, 's("hh")');
    expect(mocks.sessions.newSession).not.toHaveBeenCalled();
  });

  it('commits an unfavorite when View returns to the source session', async () => {
    vi.useFakeTimers();
    const favorite = {
      id: 'favorite-1',
      sourceSessionId: 's-1',
      sessionId: 's-1',
      title: 'Session',
      favoritedAt: 100,
      turns: [{ id: 'a-1', role: 'assistant' as const, text: '完成', code: 's("bd")' }],
      messages: [{ id: 'a-1', role: 'assistant' as const, content: '完成', code: 's("bd")', timestamp: 1 }],
      code: 's("bd")',
    };
    mocks.favorites.favorites = [favorite];
    mocks.favorites.sourceSessionIds = new Set(['s-1']);
    mocks.favorites.remove.mockResolvedValue(undefined);
    mocks.isMobile = false;
    await renderApp();

    await act(async () => {
      container.querySelector<HTMLButtonElement>(`button[aria-label="${t('navFavorites')}"]`)?.click();
      await Promise.resolve();
    });
    const unfavorite = container.querySelector<HTMLButtonElement>('[data-favorites-unfavorite]');
    expect(unfavorite).not.toBeNull();
    act(() => { unfavorite?.click(); });
    const view = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === t('favoriteActionView'));
    expect(view).toBeDefined();
    act(() => { view?.click(); });
    await act(async () => { await Promise.resolve(); });
    act(() => { vi.advanceTimersByTime(200); });
    await act(async () => { await Promise.resolve(); });

    expect(mocks.favorites.remove).toHaveBeenCalledWith(favorite);
    expect(mocks.sessions.switchTo).toHaveBeenCalledWith('s-1');
    vi.useRealTimers();
  });

  it('persists and flushes the outgoing code when creating a new session', async () => {
    mocks.isMobile = false;
    await renderApp();
    mocks.strudel.code = '';
    await renderApp();
    mocks.sessions.setManualCode.mockClear();

    act(() => {
      (mocks.sidebarProps?.onNewSession as (() => void))();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.sessions.setManualCode).toHaveBeenCalledWith('', 's-1');
    expect(mocks.sessions.flushCloudSaves).toHaveBeenCalledWith('s-1');
    expect(mocks.sessions.newSession).toHaveBeenCalledOnce();
  });

  it('waits for the outgoing flush before creating a new session', async () => {
    let releaseFlush!: () => void;
    mocks.sessions.flushCloudSaves.mockImplementationOnce(
      () => new Promise<undefined>((resolve) => {
        releaseFlush = () => resolve(undefined);
      }),
    );
    mocks.isMobile = false;
    await renderApp();

    let transition!: Promise<void>;
    act(() => {
      transition = (mocks.sidebarProps?.onNewSession as (() => Promise<void>))();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.sessions.newSession).not.toHaveBeenCalled();

    await act(async () => {
      releaseFlush();
      await transition;
    });
    expect(mocks.sessions.newSession).toHaveBeenCalledOnce();
  });

  it('persists and flushes the outgoing code when switching sessions', async () => {
    mocks.isMobile = false;
    await renderApp();
    mocks.strudel.code = 's("hh")';
    await renderApp();
    mocks.sessions.setManualCode.mockClear();

    act(() => {
      (mocks.sidebarProps?.onSwitchSession as ((id: string) => void))('s-2');
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(mocks.sessions.setManualCode).toHaveBeenCalledWith('s("hh")', 's-1');
    expect(mocks.sessions.flushCloudSaves).toHaveBeenCalledWith('s-1');
    expect(mocks.sessions.switchTo).toHaveBeenCalledWith('s-2');
  });

  it('waits for the outgoing flush before switching sessions', async () => {
    let releaseFlush!: () => void;
    mocks.sessions.flushCloudSaves.mockImplementationOnce(
      () => new Promise<undefined>((resolve) => {
        releaseFlush = () => resolve(undefined);
      }),
    );
    mocks.isMobile = false;
    await renderApp();

    let transition!: Promise<void>;
    act(() => {
      transition = (mocks.sidebarProps?.onSwitchSession as ((id: string) => Promise<void>))('s-2');
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.sessions.switchTo).not.toHaveBeenCalled();

    await act(async () => {
      releaseFlush();
      await transition;
    });
    expect(mocks.sessions.switchTo).toHaveBeenCalledWith('s-2');
  });

  it('checkpoints rollback after restoring code and truncating messages', async () => {
    mocks.isMobile = false;
    mocks.session.messages = [
      { id: 'assistant-code', role: 'assistant', content: 'old', code: 's("bd")', timestamp: 1 },
      { id: 'user-turn', role: 'user', content: 'change it', timestamp: 2 },
    ];
    await renderApp();

    await act(async () => {
      await (mocks.sidebarProps?.onRollback as ((id: string) => Promise<void>))('user-turn');
    });

    expect(mocks.sessions.truncate).toHaveBeenCalledWith('user-turn');
    expect(mocks.sessions.checkpointSession).toHaveBeenCalledWith('s-1');
    expect(mocks.sessions.truncate.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.sessions.checkpointSession.mock.invocationCallOrder[0]);
  });

  it('passes only manual save state to Code Plane without overstating fallback storage', async () => {
    mocks.sessions.currentSyncStatus = 'synced';
    mocks.sessions.currentManualSyncStatus = 'offline';
    mocks.sessions.isPersistent = false;
    await renderApp();

    expect(mocks.codePanelProps).toMatchObject({
      syncStatus: 'retrying',
      showSyncStatus: true,
    });
  });

  it('hides manual save state while the Agent is loading', async () => {
    mocks.sessions.currentManualSyncStatus = 'saving';
    await renderApp();
    const setLoadingSessions = mocks.agentRunnerConfig?.setLoadingSessions as
      | ((value: Set<string>) => void)
      | undefined;
    expect(setLoadingSessions).toBeDefined();

    act(() => {
      setLoadingSessions?.(new Set(['s-1']));
    });

    expect(mocks.codePanelProps).toMatchObject({
      syncStatus: 'saving',
      showSyncStatus: false,
    });
  });
});
