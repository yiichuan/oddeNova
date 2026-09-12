// @vitest-environment happy-dom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FavoriteSummary, SessionSummary } from '../../shared/session-api';
import type { Session } from '../hooks/useSessions';
import type { FavoriteConversation } from '../lib/favorite-conversations';
import { t } from '../lib/i18n';
import { LEAVING_MS, REPORT_LINGER_MS } from '../components/overlays/FavoriteActionDialog';
import { resetDeviceTiltStateForTests } from '../components/featured/featured-device-tilt';

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
    acceptCloudDetail: vi.fn(async (_session: Session): Promise<Session | undefined> => undefined),
    newSession: vi.fn(),
    switchTo: vi.fn(),
    branchFromMessage: vi.fn(),
    truncateAndEdit: vi.fn(),
    truncate: vi.fn(),
    deleteSession: vi.fn(),
    renameSession: vi.fn(),
    setSessionFavorite: vi.fn(),
  },
  favorites: {
    favorites: [] as FavoriteConversation[],
    sourceSessionIds: new Set<string>(),
    isLoading: false,
    error: null,
    create: vi.fn(),
    remove: vi.fn(async () => undefined),
  },
  deleteCloudSession: vi.fn(),
  cloudLibrary: {
    history: {
      items: [] as { id: string; title: string; updatedAt: number }[],
      nextCursor: null as string | null,
      initialStatus: 'idle' as 'idle' | 'loading' | 'ready' | 'error',
      moreStatus: 'idle' as 'idle' | 'loading' | 'ready' | 'error',
      initialError: null as Error | null,
      moreError: null as Error | null,
      retryInitial: vi.fn(),
      retryMore: vi.fn(),
    },
    favorites: {
      items: [] as { id: string; title: string; updatedAt: number; favoritedAt: number }[],
      nextCursor: null as string | null,
      initialStatus: 'idle' as 'idle' | 'loading' | 'ready' | 'error',
      moreStatus: 'idle' as 'idle' | 'loading' | 'ready' | 'error',
      initialError: null as Error | null,
      moreError: null as Error | null,
      retryInitial: vi.fn(),
      retryMore: vi.fn(),
    },
    details: new Map(),
    detailError: null,
    retryDetail: vi.fn(async () => undefined),
    loadHistory: vi.fn(async () => undefined),
    loadMoreHistory: vi.fn(async () => undefined),
    ensureFavorites: vi.fn(async () => undefined),
    loadMoreFavorites: vi.fn(async () => undefined),
    openSession: vi.fn(async () => undefined),
    readSession: vi.fn(async (summary: SessionSummary): Promise<Session> => ({
      ...summary, code: '', messages: [], createdAt: 1,
    })),
    openFavorite: vi.fn(async () => undefined),
    favoriteSession: vi.fn(async (summary: SessionSummary): Promise<FavoriteSummary> => ({
      ...summary,
      favoritedAt: summary.updatedAt,
    })),
    unfavoriteSession: vi.fn(async () => undefined),
    removeSummary: vi.fn(),
    upsertHistorySummary: vi.fn(),
    historySearch: {
      query: '',
      setQuery: vi.fn(),
      active: false,
      collection: {
        items: [] as { id: string; title: string; updatedAt: number }[],
        nextCursor: null as string | null,
        initialStatus: 'idle' as 'idle' | 'loading' | 'ready' | 'error',
        moreStatus: 'idle' as 'idle' | 'loading' | 'ready' | 'error',
        initialError: null as Error | null,
        moreError: null as Error | null,
        retryInitial: vi.fn(),
        retryMore: vi.fn(),
      },
      loadMore: vi.fn(async () => undefined),
      invalidate: vi.fn(),
    },
    favoritesSearch: {
      query: '',
      setQuery: vi.fn(),
      active: false,
      collection: {
        items: [] as { id: string; title: string; updatedAt: number; favoritedAt: number }[],
        nextCursor: null as string | null,
        initialStatus: 'idle' as 'idle' | 'loading' | 'ready' | 'error',
        moreStatus: 'idle' as 'idle' | 'loading' | 'ready' | 'error',
        initialError: null as Error | null,
        moreError: null as Error | null,
        retryInitial: vi.fn(),
        retryMore: vi.fn(),
      },
      loadMore: vi.fn(async () => undefined),
      invalidate: vi.fn(),
    },
    refreshSearches: vi.fn(),
  },
  codePanelProps: null as Record<string, unknown> | null,
  sidebarProps: null as Record<string, unknown> | null,
  historyProps: null as Record<string, unknown> | null,
  accountModalProps: null as Record<string, unknown> | null,
  agentRunnerConfig: null as Record<string, unknown> | null,
  isMobile: true,
  auth: {
    user: { id: 'user-1', email: 'listener@example.com' } as
      | { id: string; email: string }
      | null,
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
  // What a favorite opened in the studio arrives on: the code, and the
  // studio's own opening line above it.
  makeGreetingMessage: () => ({
    id: `msg-${Math.random()}`,
    role: 'assistant',
    content: 'greeting',
    timestamp: 1,
    isGreeting: true,
  }),
}));

vi.mock('../hooks/useFavorites', () => ({
  useFavorites: () => mocks.favorites,
}));

vi.mock('../hooks/useCloudSessionLibrary', () => ({
  useCloudSessionLibrary: () => mocks.cloudLibrary,
}));

vi.mock('../services/cloud-session-repository', () => ({
  deleteCloudSession: mocks.deleteCloudSession,
  saveCloudSession: vi.fn(),
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
    isMobile: mocks.isMobile, keyboardHeight: 0, sidebarWidth: 0, sidebarCollapsed: false, vizHeight: 0, isDragging: false,
    vizCollapsed: false, toggleVizCollapsed: vi.fn(),
    mainRef: { current: null }, topActionsRef: { current: null }, hDragHandlers: {}, vDragHandlers: {},
    codeSheetOpen: false, setCodeSheetOpen: vi.fn(), navDrawerOpen: false, setNavDrawerOpen: vi.fn(),
    mobileFocusedArea: null, shouldLiftBottomBar: false,
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
vi.mock('../lib/welcome-modal', () => ({
  hasSeenWelcome: () => true,
  markWelcomeSeen: vi.fn(),
  shouldAutoOpenWelcomeModal: () => false,
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
vi.mock('../components/conversation/HistoryPanel', () => ({ default: (props: Record<string, unknown>) => {
  mocks.historyProps = props;
  return null;
} }));
vi.mock('../components/conversation/ChatInput', () => ({ default: () => null }));
// ShareButton too: the featured player bar shares a piece on the studio's own
// button, so it comes through this module.
vi.mock('../components/studio/TopActionBar', () => ({
  default: () => null,
  ShareButton: () => null,
  ExportPopover: () => null,
}));
vi.mock('../components/overlays/AccountModal', () => ({
  default: (props: Record<string, unknown>) => {
    mocks.accountModalProps = props;
    return <div data-testid="account-modal" />;
  },
}));
vi.mock('../components/overlays/WelcomeModal', () => ({ default: () => null }));
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

  it('does not start the guest-history import during password recovery', async () => {
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

    expect(mocks.importSession).not.toHaveBeenCalled();
  });

  it('does not start the guest-history import when recovery begins during inspection', async () => {
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

    expect(mocks.importSession).not.toHaveBeenCalled();
  });

  it('waits for the account sessions to load before importing guest history', async () => {
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
    expect(mocks.importSession).not.toHaveBeenCalled();

    mocks.sessions.isLoading = false;
    await act(async () => {
      root?.render(<App />);
      await Promise.resolve();
    });

    expect(mocks.importSession).toHaveBeenCalledWith(
      guestSession,
      { activate: false, awaitCloud: true },
    );
  });

  it('keeps the guest-history sync dialog above the playback layer', async () => {
    mocks.isMobile = false;
    const guestSession: Session = {
      id: 'guest-session',
      title: 'Guest history',
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

    const importDialog = [...container.querySelectorAll('div.fixed.inset-0')].find((element) =>
      element.textContent?.includes('Syncing local history'),
    );
    expect(importDialog?.classList.contains('z-[300]')).toBe(true);
    expect(importDialog?.classList.contains('items-center')).toBe(true);
    expect(importDialog?.classList.contains('backdrop-blur-[2px]')).toBe(true);

    await act(async () => {
      finishImport();
      await Promise.resolve();
    });
  });

  it('automatically imports once and shows progress until cloud sync finishes', async () => {
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

    expect(mocks.importSession).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Syncing local history');
    expect(container.textContent).not.toContain('Sync local history?');
    expect(container.textContent).not.toContain('Import and sync');

    await act(async () => {
      finishImport();
      await Promise.resolve();
    });

    expect(container.textContent).not.toContain('Syncing local history');
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

    // Syncing guest history must not pull the user off the session they are on.
    expect(mocks.importSession).toHaveBeenCalledWith(guestSession, { activate: false, awaitCloud: true });
    expect(mocks.deleteSession).toHaveBeenCalledWith('guest-session', 'guest');
  });

  /* The bug: a cloud save that fails once used to be retried under the same
     item forever, and the dialog's only door was that retry button — so a
     server that would never accept one particular payload parked the whole
     app in front of it. These four cover the fix: the app gives up asking
     after a second failure in a row, a reader can leave sooner than that on
     their own, and the two reasons a save can fail get told apart. */
  it('gives up asking after a second consecutive failure, instead of leaving the app stuck in the dialog', async () => {
    const guestSession: Session = {
      id: 'guest-session',
      title: 'Guest history',
      code: 'sound("bd")',
      messages: [],
      createdAt: 1,
      updatedAt: 1,
    };
    mocks.getAllSessions.mockResolvedValue([guestSession]);
    // Every attempt fails — a payload the server will never accept, say.
    mocks.importSession.mockRejectedValue(new Error('rejected'));
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<App />);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // First failure: the dialog stays up and offers a retry.
    expect(container.textContent).toContain(t('syncLocalHistoryFailed'));
    const retryButton = () => [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === t('retry'));
    expect(retryButton()).not.toBeUndefined();
    // The cloud library reads as still loading while the dialog holds it shut
    // — see cloudLibraryEnabled in App.tsx.
    expect(mocks.historyProps?.isLoading).toBe(false);

    await act(async () => {
      retryButton()?.click();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Second consecutive failure: no third prompt, and the app is not left
    // parked on it. The old code either stayed here forever or, if the
    // dialog were simply dismissed, left the account's own history
    // permanently unloaded — this checks both did not happen.
    expect(container.textContent).not.toContain(t('syncLocalHistoryFailed'));
    expect(container.textContent).not.toContain(t('syncingLocalHistory'));
    expect(mocks.historyProps?.isLoading).toBe(false);
    // Never having succeeded, the guest copy is left in place for next time.
    expect(mocks.deleteSession).not.toHaveBeenCalled();
  });

  it('opens the cloud library the moment the reader chooses to leave it for later', async () => {
    const guestSession: Session = {
      id: 'guest-session',
      title: 'Guest history',
      code: 'sound("bd")',
      messages: [],
      createdAt: 1,
      updatedAt: 1,
    };
    mocks.getAllSessions.mockResolvedValue([guestSession]);
    mocks.importSession.mockRejectedValueOnce(new Error('rejected'));
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<App />);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    const laterButton = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === t('syncLocalHistoryLater'));
    expect(laterButton).not.toBeUndefined();
    expect(mocks.historyProps?.isLoading).toBe(false);

    await act(async () => {
      laterButton?.click();
      await Promise.resolve();
    });

    expect(container.textContent).not.toContain(t('syncLocalHistoryFailed'));
    // Closing the dialog alone reopens no gate; this is the second half of the
    // fix, not just "the dialog goes away."
    expect(mocks.historyProps?.isLoading).toBe(false);
  });

  it('tells a rejected save apart from a lost connection', async () => {
    const guestSession: Session = {
      id: 'guest-session',
      title: 'Guest history',
      code: 'sound("bd")',
      messages: [],
      createdAt: 1,
      updatedAt: 1,
    };
    mocks.getAllSessions.mockResolvedValue([guestSession]);
    mocks.importSession.mockRejectedValueOnce(new Error('rejected'));
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<App />);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain(t('syncLocalHistoryRejected'));
    expect(container.textContent).not.toContain(t('syncLocalHistoryOffline'));
  });

  it('names a lost connection as one, while the device is offline', async () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const guestSession: Session = {
      id: 'guest-session',
      title: 'Guest history',
      code: 'sound("bd")',
      messages: [],
      createdAt: 1,
      updatedAt: 1,
    };
    mocks.getAllSessions.mockResolvedValue([guestSession]);
    mocks.importSession.mockRejectedValueOnce(new Error('network request failed'));
    const container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<App />);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain(t('syncLocalHistoryOffline'));
    expect(container.textContent).not.toContain(t('syncLocalHistoryRejected'));
    onLine.mockRestore();
  });
});

describe('App session sync boundaries', () => {
  let root: Root | undefined;
  let container: HTMLDivElement;

  beforeEach(() => {
    mocks.auth.user = null;
    mocks.cloudLibrary.history.items = [];
    mocks.cloudLibrary.history.initialStatus = 'idle';
    mocks.cloudLibrary.history.nextCursor = null;
    mocks.cloudLibrary.historySearch.query = '';
    mocks.cloudLibrary.historySearch.active = false;
    mocks.cloudLibrary.historySearch.collection.items = [];
    mocks.cloudLibrary.historySearch.collection.initialStatus = 'idle';
    mocks.cloudLibrary.historySearch.collection.nextCursor = null;
    mocks.cloudLibrary.favorites.items = [];
    mocks.cloudLibrary.favorites.initialStatus = 'idle';
    mocks.cloudLibrary.favorites.nextCursor = null;
    mocks.cloudLibrary.favoritesSearch.query = '';
    mocks.cloudLibrary.favoritesSearch.active = false;
    mocks.cloudLibrary.favoritesSearch.collection.items = [];
    mocks.cloudLibrary.favoritesSearch.collection.initialStatus = 'idle';
    mocks.cloudLibrary.favoritesSearch.collection.nextCursor = null;
    mocks.cloudLibrary.details.clear();
    mocks.cloudLibrary.detailError = null;
    mocks.cloudLibrary.refreshSearches.mockReset();
    mocks.getAllSessions.mockResolvedValue([]);
    mocks.strudel.code = 's("bd")';
    mocks.session.code = 's("bd")';
    mocks.session.messages = [];
    mocks.session.updatedAt = 1;
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

  it('opens the account modal instead of entering Favorites for a guest', async () => {
    mocks.auth.user = null;
    mocks.isMobile = false;
    await renderApp();

    const favoritesButton = container.querySelector<HTMLButtonElement>(
      `button[aria-label="${t('navFavorites')}"]`,
    );
    const homeButton = container.querySelector<HTMLButtonElement>(
      `button[aria-label="${t('navHome')}"]`,
    );

    expect(favoritesButton).not.toBeNull();
    expect(container.querySelector('[data-testid="account-modal"]')).toBeNull();

    await act(async () => {
      favoritesButton?.click();
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="account-modal"]')).not.toBeNull();
    expect(homeButton?.getAttribute('aria-current')).toBe('page');
    expect(favoritesButton?.getAttribute('aria-current')).toBeNull();
  });

  it('opens the account modal instead of creating a local favorite for a guest', async () => {
    mocks.auth.user = null;
    mocks.isMobile = false;
    await renderApp();
    mocks.favorites.create.mockClear();
    mocks.sessions.setManualCode.mockClear();
    mocks.sessions.flushCloudSaves.mockClear();
    mocks.sessions.newSession.mockClear();

    await act(async () => {
      await (mocks.sidebarProps?.onFavoriteSession as ((id: string) => Promise<void>))('s-1');
    });

    expect(container.querySelector('[data-testid="account-modal"]')).not.toBeNull();
    expect(mocks.favorites.create).not.toHaveBeenCalled();
    expect(mocks.sessions.setManualCode).not.toHaveBeenCalled();
    expect(mocks.sessions.flushCloudSaves).not.toHaveBeenCalled();
    expect(mocks.sessions.newSession).not.toHaveBeenCalled();
  });

  it('uses cloud history summaries for an account instead of local full sessions', async () => {
    mocks.auth.user = { id: 'user-1', email: 'listener@example.com' };
    const cloudSummary = { id: 'cloud-1', title: 'Cloud history', updatedAt: 20 };
    mocks.cloudLibrary.history.items = [cloudSummary];
    mocks.cloudLibrary.history.initialStatus = 'ready';
    mocks.isMobile = false;

    await renderApp();

    expect(mocks.sidebarProps?.sessions).toEqual([cloudSummary]);
  });

  it('keeps a cloud favorite summary when direct deletion fails', async () => {
    mocks.auth.user = { id: 'user-1', email: 'listener@example.com' };
    const cloudFavorite = {
      id: 'cloud-favorite-delete-fails',
      title: 'Cloud favorite',
      updatedAt: 20,
      favoritedAt: 30,
    };
    mocks.cloudLibrary.favorites.items = [cloudFavorite];
    mocks.cloudLibrary.favorites.initialStatus = 'ready';
    mocks.cloudLibrary.details.set(cloudFavorite.id, {
      updatedAt: cloudFavorite.updatedAt,
      session: {
        id: cloudFavorite.id,
        title: cloudFavorite.title,
        code: 's("bd")',
        messages: [{ id: 'message-1', role: 'user', content: '保留这段', timestamp: 1 }],
        createdAt: 1,
        updatedAt: cloudFavorite.updatedAt,
        favoritedAt: cloudFavorite.favoritedAt,
      },
    });
    mocks.deleteCloudSession.mockRejectedValueOnce(new Error('offline'));
    mocks.isMobile = false;
    await renderApp();

    await act(async () => {
      container.querySelector<HTMLButtonElement>(`button[aria-label="${t('navFavorites')}"]`)?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    const remove = container.querySelector<HTMLButtonElement>('[data-favorites-delete]');
    expect(remove).not.toBeNull();

    act(() => { remove?.click(); });
    // The bin asks first; the delete is what the answer does.
    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="favorites-delete-accept"]')?.click();
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.deleteCloudSession).toHaveBeenCalledWith(cloudFavorite.id, 'user-1');
    expect(mocks.cloudLibrary.removeSummary).not.toHaveBeenCalledWith(cloudFavorite.id);
    expect(mocks.strudel.setError).toHaveBeenCalledWith(t('favoriteActionFailed'));
  });

  /* The favorite under the reader is deleted and the page hands itself to the
     next row — which only works if the id that row's open is made under
     survives the clean-up of the id it replaced. It did not: both ran in the
     same commit, and the clean-up read the deleted id out of a stale closure
     and nulled the new pick with it, leaving the page on a favorite nothing
     had been asked for. See the selection effect in App.tsx. */
  it('opens the next favorite when the open one is deleted', async () => {
    mocks.auth.user = { id: 'user-1', email: 'listener@example.com' };
    const kept = [
      { id: 'fav-1', title: 'First kept', updatedAt: 20, favoritedAt: 40 },
      { id: 'fav-2', title: 'Second kept', updatedAt: 10, favoritedAt: 30 },
    ];
    mocks.cloudLibrary.favorites.items = kept;
    mocks.cloudLibrary.favorites.initialStatus = 'ready';
    for (const summary of kept) {
      mocks.cloudLibrary.details.set(summary.id, {
        updatedAt: summary.updatedAt,
        session: {
          id: summary.id,
          title: summary.title,
          code: 's("bd")',
          messages: [{ id: `${summary.id}-m1`, role: 'user', content: summary.title, timestamp: 1 }],
          createdAt: 1,
          updatedAt: summary.updatedAt,
          favoritedAt: summary.favoritedAt,
        },
      });
    }
    // The library's own removal, which is what the page sees of a deletion.
    mocks.cloudLibrary.removeSummary.mockImplementation((id: string) => {
      mocks.cloudLibrary.favorites.items = mocks.cloudLibrary.favorites.items
        .filter((summary) => summary.id !== id);
    });
    mocks.deleteCloudSession.mockResolvedValue(undefined);
    mocks.isMobile = false;
    await renderApp();

    await act(async () => {
      container.querySelector<HTMLButtonElement>(`button[aria-label="${t('navFavorites')}"]`)?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.cloudLibrary.openFavorite).toHaveBeenCalledWith(kept[0]);

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-favorites-delete]')?.click();
    });
    await act(async () => {
      container.querySelector<HTMLButtonElement>('[data-testid="favorites-delete-accept"]')?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    // The library answering, and the page re-reading it.
    await act(async () => {
      root?.render(<App />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.cloudLibrary.openFavorite).toHaveBeenCalledWith(kept[1]);
    expect(container.querySelector('[data-testid="favorites-detail-loading"]')).toBeNull();
    expect(container.querySelector('[data-testid="favorites-caption"]')?.textContent)
      .toContain(kept[1].title);
  });

  it('keeps a cloud history summary when direct deletion fails', async () => {
    mocks.auth.user = { id: 'user-1', email: 'listener@example.com' };
    const cloudSummary = {
      id: 'cloud-history-delete-fails',
      title: 'Cloud history',
      updatedAt: 20,
    };
    mocks.cloudLibrary.history.items = [cloudSummary];
    mocks.cloudLibrary.history.initialStatus = 'ready';
    mocks.deleteCloudSession.mockRejectedValueOnce(new Error('offline'));
    mocks.isMobile = false;
    await renderApp();

    await act(async () => {
      (mocks.sidebarProps?.onDeleteSession as ((id: string) => void))(cloudSummary.id);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.deleteCloudSession).toHaveBeenCalledWith(cloudSummary.id, 'user-1');
    expect(mocks.cloudLibrary.removeSummary).not.toHaveBeenCalledWith(cloudSummary.id);
    expect(mocks.strudel.setError).toHaveBeenCalledWith(t('requestFailed'));
  });

  it('does not show an old account deletion failure after switching accounts', async () => {
    mocks.auth.user = { id: 'user-1', email: 'listener@example.com' };
    let rejectDelete!: (error: Error) => void;
    mocks.deleteCloudSession.mockImplementationOnce(() => new Promise<void>((_resolve, reject) => {
      rejectDelete = reject;
    }));
    mocks.isMobile = false;
    await renderApp();
    act(() => {
      (mocks.sidebarProps?.onDeleteSession as ((id: string) => void))('cloud-only');
    });
    mocks.auth.user = { id: 'user-2', email: 'other@example.com' };
    await act(async () => { root?.render(<App />); });
    mocks.strudel.setError.mockClear();
    await act(async () => { rejectDelete(new Error('old account offline')); });
    expect(mocks.strudel.setError).not.toHaveBeenCalled();
  });

  it('refreshes searches only after a summary-only cloud deletion succeeds', async () => {
    mocks.auth.user = { id: 'user-1', email: 'listener@example.com' };
    const cloudSummary = {
      id: 'cloud-history-delete-refreshes',
      title: 'Cloud history',
      updatedAt: 20,
    };
    mocks.cloudLibrary.history.items = [cloudSummary];
    mocks.cloudLibrary.history.initialStatus = 'ready';
    mocks.deleteCloudSession.mockResolvedValueOnce(undefined);
    mocks.isMobile = false;
    await renderApp();

    await act(async () => {
      (mocks.sidebarProps?.onDeleteSession as ((id: string) => void))(cloudSummary.id);
      await Promise.resolve();
    });

    expect(mocks.cloudLibrary.refreshSearches).toHaveBeenCalledOnce();
  });

  it('waits for the loaded session delete to reach the cloud before refreshing searches', async () => {
    mocks.auth.user = { id: 'user-1', email: 'listener@example.com' };
    const cloudSummary = {
      id: mocks.session.id,
      title: 'Cloud history',
      updatedAt: 20,
    };
    mocks.cloudLibrary.history.items = [cloudSummary];
    mocks.cloudLibrary.history.initialStatus = 'ready';
    let notifyDeleted!: () => void;
    mocks.sessions.deleteSession.mockImplementationOnce(
      (_id: string, onCloudDeleted?: () => void) => { notifyDeleted = onCloudDeleted ?? (() => {}); },
    );
    mocks.isMobile = false;
    await renderApp();

    act(() => {
      (mocks.sidebarProps?.onDeleteSession as ((id: string) => void))(cloudSummary.id);
    });
    expect(mocks.cloudLibrary.refreshSearches).not.toHaveBeenCalled();

    act(() => { notifyDeleted(); });
    expect(mocks.cloudLibrary.refreshSearches).toHaveBeenCalledOnce();
    expect(mocks.deleteCloudSession).not.toHaveBeenCalled();
  });

  it('refreshes searches after the rename save is flushed', async () => {
    mocks.auth.user = { id: 'user-1', email: 'listener@example.com' };
    const cloudSummary = {
      id: 'cloud-history-rename-refreshes',
      title: '旧标题',
      updatedAt: 20,
    };
    mocks.cloudLibrary.history.items = [cloudSummary];
    mocks.cloudLibrary.history.initialStatus = 'ready';
    let finishFlush!: () => void;
    mocks.sessions.flushCloudSaves.mockImplementationOnce(
      () => new Promise<undefined>((resolve) => { finishFlush = () => resolve(undefined); }),
    );
    mocks.isMobile = false;
    await renderApp();

    let rename!: Promise<void>;
    await act(async () => {
      rename = (mocks.sidebarProps?.onRenameSession as ((id: string, title: string) => Promise<void>))(
        cloudSummary.id,
        '新标题',
      );
      await Promise.resolve();
    });
    expect(mocks.sessions.renameSession).toHaveBeenCalledWith(cloudSummary.id, '新标题');
    expect(mocks.sessions.flushCloudSaves).toHaveBeenCalledWith(cloudSummary.id);
    expect(mocks.cloudLibrary.refreshSearches).not.toHaveBeenCalled();

    await act(async () => {
      finishFlush();
      await rename;
    });
    expect(mocks.cloudLibrary.refreshSearches).toHaveBeenCalledOnce();
  });

  it('shows the undo and view notice after favoriting an account history session', async () => {
    vi.useFakeTimers();
    mocks.auth.user = { id: 'user-1', email: 'listener@example.com' };
    const cloudSummary = { id: 'cloud-favorite-1', title: 'Cloud favorite', updatedAt: 20 };
    mocks.cloudLibrary.history.items = [cloudSummary];
    mocks.cloudLibrary.history.initialStatus = 'ready';
    mocks.cloudLibrary.favoriteSession.mockResolvedValueOnce({
      ...cloudSummary,
      favoritedAt: 30,
    });
    mocks.isMobile = false;
    await renderApp();

    await act(async () => {
      await (mocks.sidebarProps?.onFavoriteSession as ((id: string) => Promise<void>))(
        cloudSummary.id,
      );
    });

    const dialog = container.querySelector('[data-testid="favorite-action-dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain(t('favoriteDoneTitle'));
    expect([...dialog!.querySelectorAll('button')]
      .some((button) => button.textContent === t('favoriteActionUndo'))).toBe(true);
    expect([...dialog!.querySelectorAll('button')]
      .some((button) => button.textContent === t('favoriteActionView'))).toBe(true);

    const undo = [...dialog!.querySelectorAll('button')]
      .find((button) => button.textContent === t('favoriteActionUndo'));
    act(() => { undo?.click(); });
    act(() => { vi.advanceTimersByTime(180); });
    await act(async () => { await Promise.resolve(); });
    expect(mocks.cloudLibrary.unfavoriteSession).toHaveBeenCalledWith(expect.objectContaining({
      id: cloudSummary.id,
      title: cloudSummary.title,
      updatedAt: cloudSummary.updatedAt,
      favoritedAt: 30,
    }));
  });

  it('shows the undo and view notice when releasing an account favorite', async () => {
    vi.useFakeTimers();
    mocks.auth.user = { id: 'user-1', email: 'listener@example.com' };
    const cloudFavorite = {
      id: 'cloud-unfavorite-1',
      title: 'Cloud favorite',
      updatedAt: 20,
      favoritedAt: 30,
    };
    mocks.cloudLibrary.favorites.items = [cloudFavorite];
    mocks.cloudLibrary.favorites.initialStatus = 'ready';
    mocks.cloudLibrary.details.set(cloudFavorite.id, {
      updatedAt: cloudFavorite.updatedAt,
      session: {
        ...cloudFavorite,
        code: 's("bd")',
        messages: [{ id: 'message-1', role: 'user', content: '保留这段', timestamp: 1 }],
        createdAt: 1,
      },
    });
    mocks.isMobile = false;
    await renderApp();

    await act(async () => {
      container.querySelector<HTMLButtonElement>(`button[aria-label="${t('navFavorites')}"]`)?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    const unfavorite = container.querySelector<HTMLButtonElement>('[data-favorites-unfavorite]');
    expect(unfavorite).not.toBeNull();

    act(() => { unfavorite?.click(); });

    const dialog = container.querySelector('[data-testid="favorite-action-dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain(t('unfavoriteDoneTitle'));
    expect([...dialog!.querySelectorAll('button')]
      .some((button) => button.textContent === t('favoriteActionUndo'))).toBe(true);
    expect([...dialog!.querySelectorAll('button')]
      .some((button) => button.textContent === t('favoriteActionView'))).toBe(true);

    const undo = [...dialog!.querySelectorAll('button')]
      .find((button) => button.textContent === t('favoriteActionUndo'));
    act(() => { undo?.click(); });
    act(() => { vi.advanceTimersByTime(180); });
    await act(async () => { await Promise.resolve(); });
    expect(mocks.cloudLibrary.unfavoriteSession).not.toHaveBeenCalled();

    const secondUnfavorite = container.querySelector<HTMLButtonElement>('[data-favorites-unfavorite]');
    expect(secondUnfavorite).not.toBeNull();
    act(() => { secondUnfavorite?.click(); });
    const close = container.querySelector<HTMLButtonElement>(
      `[data-testid="favorite-action-dialog"] button[aria-label="${t('close')}"]`,
    );
    expect(close).not.toBeNull();
    act(() => { close?.click(); });
    act(() => { vi.advanceTimersByTime(180); });
    await act(async () => { await Promise.resolve(); });
    expect(mocks.cloudLibrary.unfavoriteSession).toHaveBeenCalledWith(expect.objectContaining({
      id: cloudFavorite.id,
      title: cloudFavorite.title,
      updatedAt: cloudFavorite.updatedAt,
      favoritedAt: cloudFavorite.favoritedAt,
    }));

    mocks.cloudLibrary.unfavoriteSession.mockClear();
    mocks.sessions.acceptCloudDetail.mockClear();
    const thirdUnfavorite = container.querySelector<HTMLButtonElement>('[data-favorites-unfavorite]');
    expect(thirdUnfavorite).not.toBeNull();
    act(() => { thirdUnfavorite?.click(); });
    const view = [...container.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent === t('favoriteActionView'));
    expect(view).toBeDefined();
    act(() => { view?.click(); });
    act(() => { vi.advanceTimersByTime(180); });
    await act(async () => { await Promise.resolve(); });
    expect(mocks.sessions.acceptCloudDetail).toHaveBeenCalledWith(expect.objectContaining({
      id: cloudFavorite.id,
    }));
    expect(mocks.sessions.acceptCloudDetail.mock.calls[0]?.[0]).not.toHaveProperty('favoritedAt');
  });

  /* Keeping a conversation and then going to look at the collection — by
     either road — has to land on the thing that was just kept, not on whatever
     the page was last left open at. */
  describe('opening the collection on a fresh favorite', () => {
    const older = { id: 'fav-older', title: 'Older kept', updatedAt: 10, favoritedAt: 100 };
    const toKeep = { id: 'sess-fresh', title: 'Just kept', updatedAt: 20 };

    const detailFor = (id: string, title: string, updatedAt: number) => ({
      updatedAt,
      session: {
        id,
        title,
        code: 's("bd")',
        messages: [{ id: `${id}-m1`, role: 'user', content: title, timestamp: 1 }],
        createdAt: 1,
        updatedAt,
      },
    });

    const openOn = () => container
      .querySelector('[data-testid="favorites-caption"] h2')?.textContent;
    const goTo = async (label: string) => {
      await act(async () => {
        container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)?.click();
        await Promise.resolve();
        await Promise.resolve();
      });
    };

    /** Signed in, one favorite already kept, one history session to keep. */
    const setUp = async () => {
      mocks.auth.user = { id: 'user-1', email: 'listener@example.com' };
      mocks.cloudLibrary.favorites.items = [older];
      mocks.cloudLibrary.favorites.initialStatus = 'ready';
      mocks.cloudLibrary.history.items = [toKeep];
      mocks.cloudLibrary.history.initialStatus = 'ready';
      mocks.cloudLibrary.details.set(older.id, detailFor(older.id, older.title, older.updatedAt));
      mocks.cloudLibrary.details.set(
        toKeep.id,
        detailFor(toKeep.id, toKeep.title, toKeep.updatedAt),
      );
      // The library's own move: the new favorite arrives at the top of the
      // collection and leaves the history.
      mocks.cloudLibrary.favoriteSession.mockImplementation(async (item: SessionSummary) => {
        const kept = { ...item, favoritedAt: 300 };
        mocks.cloudLibrary.favorites.items = [kept, ...mocks.cloudLibrary.favorites.items];
        mocks.cloudLibrary.history.items = mocks.cloudLibrary.history.items
          .filter((candidate) => candidate.id !== item.id);
        return kept;
      });
      mocks.isMobile = false;
      await renderApp();

      // The precondition for the bug: the page has been here before and
      // remembers what was open.
      await goTo(t('navFavorites'));
      expect(openOn()).toBe(older.title);
      await goTo(t('navHome'));

      await act(async () => {
        await (mocks.sidebarProps?.onFavoriteSession as ((id: string) => Promise<void>))(toKeep.id);
      });
    };

    it('follows the notice through to the conversation it reports', async () => {
      vi.useFakeTimers();
      await setUp();

      const view = [...container.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent === t('favoriteActionView'));
      act(() => { view?.click(); });
      act(() => { vi.advanceTimersByTime(LEAVING_MS); });
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(openOn()).toBe(toKeep.title);
    });

    it('opens on it by any other road into the collection too', async () => {
      await setUp();

      await goTo(t('navFavorites'));

      expect(openOn()).toBe(toKeep.title);
    });
  });

  /* The phone asks before it acts, so the bar it puts up afterwards has
     nothing left to offer: one line saying what happened, and no way to argue
     with it. */
  it('reports a release on a phone without offering to take it back', async () => {
    vi.useFakeTimers();
    mocks.auth.user = { id: 'user-1', email: 'listener@example.com' };
    const cloudFavorite = {
      id: 'cloud-unfavorite-mobile',
      title: 'Cloud favorite',
      updatedAt: 20,
      favoritedAt: 30,
    };
    mocks.cloudLibrary.favorites.items = [cloudFavorite];
    mocks.cloudLibrary.favorites.initialStatus = 'ready';
    mocks.cloudLibrary.details.set(cloudFavorite.id, {
      updatedAt: cloudFavorite.updatedAt,
      session: {
        ...cloudFavorite,
        code: 's("bd")',
        messages: [{ id: 'message-1', role: 'user', content: '保留这段', timestamp: 1 }],
        createdAt: 1,
      },
    });
    mocks.isMobile = true;
    await renderApp();

    await act(async () => {
      container.querySelector<HTMLButtonElement>(`button[aria-label="${t('navMore')}"]`)?.click();
      await Promise.resolve();
    });
    await act(async () => {
      [...container.querySelectorAll<HTMLButtonElement>('button')]
        .find((button) => button.textContent === t('navFavorites'))?.click();
      await Promise.resolve();
      await Promise.resolve();
    });

    // The phone's own question, answered.
    act(() => {
      container.querySelector<HTMLButtonElement>('[data-favorites-unfavorite]')?.click();
    });
    act(() => {
      container.querySelector<HTMLButtonElement>(
        '[data-testid="favorites-mobile-confirm-accept"]',
      )?.click();
    });

    const dialog = container.querySelector('[data-testid="favorite-action-dialog"]');
    expect(dialog?.textContent).toContain(t('unfavoriteDoneTitle'));
    expect(dialog?.querySelectorAll('button')).toHaveLength(0);
    // The release is written where it was answered, once.
    expect(mocks.cloudLibrary.unfavoriteSession).toHaveBeenCalledTimes(1);

    // And letting the bar go writes nothing further — it was only ever a
    // report.
    // The wait running out sets the bar going; it is gone once it has gone.
    act(() => { vi.advanceTimersByTime(REPORT_LINGER_MS); });
    act(() => { vi.advanceTimersByTime(LEAVING_MS); });
    await act(async () => { await Promise.resolve(); });
    expect(mocks.cloudLibrary.unfavoriteSession).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-testid="favorite-action-dialog"]')).toBeNull();
  });

  it('flushes before opening an account detail and keeps the current session on failure', async () => {
    mocks.auth.user = { id: 'user-1', email: 'listener@example.com' };
    const cloudSummary = { id: 'cloud-2', title: 'Cloud detail', updatedAt: 20 };
    mocks.cloudLibrary.history.items = [cloudSummary];
    mocks.cloudLibrary.history.initialStatus = 'ready';
    mocks.isMobile = false;
    await renderApp();

    mocks.sessions.setManualCode.mockClear();
    mocks.sessions.flushCloudSaves.mockClear();
    mocks.cloudLibrary.openSession.mockClear();
    await act(async () => {
      await (mocks.sidebarProps?.onSwitchSession as ((id: string) => Promise<void>))(cloudSummary.id);
    });

    expect(mocks.sessions.setManualCode).toHaveBeenCalledWith('s("bd")', 's-1');
    expect(mocks.sessions.flushCloudSaves).toHaveBeenCalledWith('s-1');
    expect(mocks.cloudLibrary.openSession).toHaveBeenCalledWith(cloudSummary);
    expect(mocks.sessions.flushCloudSaves.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.cloudLibrary.openSession.mock.invocationCallOrder[0]);

    mocks.cloudLibrary.openSession.mockRejectedValueOnce(Object.assign(new Error('offline'), { status: 500 }));
    mocks.strudel.setError.mockClear();
    await act(async () => {
      await (mocks.sidebarProps?.onSwitchSession as ((id: string) => Promise<void>))(cloudSummary.id);
    });

    expect(mocks.sessions.currentId).toBe('s-1');
    expect(mocks.strudel.setError).toHaveBeenCalledWith(t('requestFailed'));
  });

  /**
   * An account conversation this device already holds a working copy of, beside
   * the summary the history list carries for it.
   */
  function heldAccountSession(
    workingCopyUpdatedAt: number,
    summaryUpdatedAt = 20,
  ): Session {
    mocks.auth.user = { id: 'user-1', email: 'listener@example.com' };
    const held: Session = {
      id: 'cloud-held',
      title: 'Held conversation',
      code: 's("bd")',
      messages: [{ id: 'message-1', role: 'user', content: '来点鼓', timestamp: 1 }],
      createdAt: 1,
      updatedAt: workingCopyUpdatedAt,
    };
    mocks.cloudLibrary.history.items = [
      { id: held.id, title: held.title, updatedAt: summaryUpdatedAt },
    ];
    mocks.cloudLibrary.history.initialStatus = 'ready';
    mocks.sessions.sessions = [mocks.session, held];
    mocks.isMobile = false;
    return held;
  }

  it('opens a held conversation from the working copy without waiting on the cloud', async () => {
    const held = heldAccountSession(20);
    await renderApp();
    mocks.cloudLibrary.openSession.mockClear();
    mocks.sessions.acceptCloudDetail.mockClear();

    await act(async () => {
      await (mocks.sidebarProps?.onSwitchSession as ((id: string) => Promise<void>))(held.id);
    });

    expect(mocks.sessions.switchTo).toHaveBeenCalledWith(held.id);
    expect(mocks.cloudLibrary.openSession).not.toHaveBeenCalled();
    expect(mocks.sessions.acceptCloudDetail).not.toHaveBeenCalled();
    // The conversation being left is still saved on the way out.
    expect(mocks.sessions.flushCloudSaves).toHaveBeenCalledWith('s-1');
  });

  it('returns to a conversation still being answered without re-reading the cloud', async () => {
    // Ahead in the history list, so only the run in flight can hold the read off.
    const held = heldAccountSession(20, 40);
    await renderApp();

    act(() => {
      (mocks.agentRunnerConfig?.setLoadingSessions as (value: Set<string>) => void)(
        new Set([held.id]),
      );
    });
    mocks.cloudLibrary.openSession.mockClear();
    mocks.strudel.setError.mockClear();

    await act(async () => {
      await (mocks.sidebarProps?.onSwitchSession as ((id: string) => Promise<void>))(held.id);
    });

    expect(mocks.sessions.switchTo).toHaveBeenCalledWith(held.id);
    expect(mocks.cloudLibrary.openSession).not.toHaveBeenCalled();
    expect(mocks.strudel.setError).not.toHaveBeenCalled();
  });

  it('revalidates a held conversation in the background when the cloud is ahead', async () => {
    const held = heldAccountSession(20, 40);
    let releaseRead!: () => void;
    mocks.cloudLibrary.openSession.mockImplementationOnce(
      () => new Promise((resolve) => { releaseRead = () => resolve(undefined); }),
    );
    await renderApp();

    await act(async () => {
      await (mocks.sidebarProps?.onSwitchSession as ((id: string) => Promise<void>))(held.id);
    });

    // The switch has already happened while the read is still outstanding.
    expect(mocks.sessions.switchTo).toHaveBeenCalledWith(held.id);
    expect(mocks.cloudLibrary.openSession).toHaveBeenCalledWith(
      expect.objectContaining({ id: held.id }),
    );
    await act(async () => { releaseRead(); });
  });

  it('reads the open conversation again when the history list turns out to be ahead', async () => {
    mocks.auth.user = { id: 'user-1', email: 'listener@example.com' };
    mocks.session.updatedAt = 20;
    // What the list knows about the conversation on screen: a later version,
    // written somewhere else.
    mocks.cloudLibrary.history.items = [
      { id: mocks.session.id, title: mocks.session.title, updatedAt: 55 },
    ];
    mocks.cloudLibrary.history.initialStatus = 'ready';
    mocks.isMobile = false;

    await renderApp();

    await vi.waitFor(() => {
      expect(mocks.cloudLibrary.openSession).toHaveBeenCalledWith(
        expect.objectContaining({ id: mocks.session.id, updatedAt: 55 }),
      );
    });
    // Once per version, however many renders the conversation goes through.
    expect(mocks.cloudLibrary.openSession).toHaveBeenCalledTimes(1);
  });

  it('leaves the open conversation alone while its own turn is being answered', async () => {
    mocks.auth.user = { id: 'user-1', email: 'listener@example.com' };
    mocks.session.updatedAt = 20;
    mocks.cloudLibrary.history.items = [
      { id: mocks.session.id, title: mocks.session.title, updatedAt: 55 },
    ];
    mocks.cloudLibrary.history.initialStatus = 'ready';
    mocks.isMobile = false;

    await renderApp();
    act(() => {
      (mocks.agentRunnerConfig?.setLoadingSessions as (value: Set<string>) => void)(
        new Set([mocks.session.id]),
      );
    });
    mocks.cloudLibrary.openSession.mockClear();

    await act(async () => { await Promise.resolve(); });
    expect(mocks.cloudLibrary.openSession).not.toHaveBeenCalled();
  });

  it('keeps a held conversation open when its background revalidation fails', async () => {
    const held = heldAccountSession(20, 40);
    mocks.cloudLibrary.openSession.mockRejectedValueOnce(
      Object.assign(new Error('offline'), { status: 500 }),
    );
    await renderApp();
    mocks.strudel.setError.mockClear();

    await act(async () => {
      await (mocks.sidebarProps?.onSwitchSession as ((id: string) => Promise<void>))(held.id);
      await Promise.resolve();
    });

    expect(mocks.sessions.switchTo).toHaveBeenCalledWith(held.id);
    expect(mocks.strudel.setError).not.toHaveBeenCalledWith(t('requestFailed'));
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

  it('repaints the system\'s own chrome for whichever page is in front of the reader', async () => {
    localStorage.setItem('vibe_theme', 'dark');
    document.head.querySelector('meta[name="theme-color"]')?.remove();
    const meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.append(meta);
    mocks.isMobile = false;

    try {
      await renderApp();

      const chromeVar = () => document.documentElement.style.getPropertyValue('--browser-chrome-color');
      const navButton = (labelKey: 'navFeatured' | 'navHome' | 'navFavorites') =>
        container.querySelector<HTMLButtonElement>(`button[aria-label="${t(labelKey)}"]`);

      // The studio's own colour, on the page the app always opens on.
      expect(meta.content).toBe('#0D0D0D');
      expect(chromeVar()).toBe('#0D0D0D');

      // Featured stands on its own ground, and the system's own strips follow
      // it there — this is the fix: they used to stay on the studio's colour.
      await act(async () => {
        navButton('navFeatured')?.click();
        await Promise.resolve();
      });
      expect(meta.content).toBe('#05070a');
      expect(chromeVar()).toBe('#05070a');

      // Favorites shares the studio's ground, not Featured's.
      await act(async () => {
        navButton('navHome')?.click();
        await Promise.resolve();
      });
      expect(meta.content).toBe('#0D0D0D');
    } finally {
      localStorage.removeItem('vibe_theme');
      meta.remove();
      document.documentElement.style.removeProperty('--browser-chrome-color');
    }
  });

  it('asks for the device readings from the press that opens the shelf, before it opens', async () => {
    mocks.isMobile = true;
    /* iOS hands out the readings only after a request made from inside a real
       gesture. Entering the shelf from the drawer and then only *turning* the
       phone produces no further gesture — so the row that opens the page is the
       gesture, and the ask goes out on it rather than waiting for a touch that
       may never come. Started, not awaited: an await here would spend the
       activation the request needs. */
    const requestPermission = vi.fn(async () => 'granted');
    vi.stubGlobal('DeviceOrientationEvent', Object.assign(
      function DeviceOrientationEvent() {},
      { requestPermission },
    ));
    resetDeviceTiltStateForTests();
    await renderApp();

    const row = [...container
      .querySelectorAll<HTMLButtonElement>('[data-testid="mobile-nav-drawer"] button')]
      .find((button) => button.textContent?.includes(t('navFeatured')))!;
    expect(row).not.toBeUndefined();

    await act(async () => {
      row.click();
      await Promise.resolve();
    });

    expect(requestPermission).toHaveBeenCalledTimes(1);
    /* And the shelf opened without waiting on the answer — the highlight going
       out is the studio no longer being the page in front of the reader. */
    expect(mocks.historyProps?.currentId).toBeNull();

    resetDeviceTiltStateForTests();
    vi.unstubAllGlobals();
  });

  it('drops the history highlight when a phone leaves the studio, and gets it back on return', async () => {
    mocks.isMobile = true;
    mocks.auth.user = { id: 'user-1', email: 'listener@example.com' };
    mocks.cloudLibrary.history.items = [{ id: 's-1', title: 'Session', updatedAt: 1 }];
    mocks.cloudLibrary.history.initialStatus = 'ready';
    await renderApp();

    /* A phone navigates from the drawer: there is no PrimaryNav on this layout,
       and these rows are the only way to either gallery. */
    const goToGallery = async (label: string) => {
      const row = [...container
        .querySelectorAll<HTMLButtonElement>('[data-testid="mobile-nav-drawer"] button')]
        .find((button) => button.textContent?.includes(label));
      expect(row).not.toBeUndefined();
      await act(async () => {
        row?.click();
        await Promise.resolve();
      });
    };

    expect(mocks.historyProps?.currentId).toBe('s-1');

    /* The studio stays mounted behind a gallery and keeps holding the
       conversation — which is what the list used to read, and why a row stayed
       lit on a page it had nothing to do with. The session itself is untouched:
       nothing switches away, nothing is cleared. */
    await goToGallery(t('navFavorites'));
    expect(mocks.historyProps?.currentId).toBeNull();
    expect(mocks.sessions.switchTo).not.toHaveBeenCalled();

    await goToGallery(t('navFeatured'));
    expect(mocks.historyProps?.currentId).toBeNull();
    expect(mocks.sessions.switchTo).not.toHaveBeenCalled();

    // Picking a row out of the drawer carries the shell back to the studio
    // first, and the highlight follows the conversation that actually opens.
    await act(async () => {
      (mocks.historyProps!.onSwitch as (id: string) => void)('s-1');
      await Promise.resolve();
    });
    expect(mocks.historyProps?.currentId).toBe('s-1');
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

  it('checkpoints the live editor code before creating an account favorite', async () => {
    mocks.auth.user = { id: 'user-1', email: 'listener@example.com' };
    const cloudSummary = { id: 's-1', title: 'Session', updatedAt: 1 };
    mocks.cloudLibrary.history.items = [cloudSummary];
    mocks.cloudLibrary.history.initialStatus = 'ready';
    mocks.isMobile = false;
    await renderApp();
    mocks.strudel.code = 's("bd, hh*8")';
    await renderApp();
    mocks.sessions.setManualCode.mockClear();
    mocks.sessions.flushCloudSaves.mockClear();
    mocks.cloudLibrary.favoriteSession.mockClear();
    mocks.sessions.newSession.mockClear();

    await act(async () => {
      await (mocks.sidebarProps?.onFavoriteSession as ((id: string) => Promise<void>))('s-1');
    });

    expect(mocks.sessions.setManualCode).toHaveBeenCalledWith('s("bd, hh*8")', 's-1');
    expect(mocks.sessions.flushCloudSaves).toHaveBeenCalledWith('s-1');
    expect(mocks.cloudLibrary.favoriteSession).toHaveBeenCalledWith(cloudSummary);
    expect(mocks.sessions.flushCloudSaves.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.cloudLibrary.favoriteSession.mock.invocationCallOrder[0]);
    expect(mocks.sessions.newSession).toHaveBeenCalledOnce();
  });

  it('does not replace the Studio conversation when favoriting another account history entry', async () => {
    mocks.auth.user = { id: 'user-1', email: 'listener@example.com' };
    const other = {
      id: 's-2',
      title: 'Other session',
      updatedAt: 2,
    };
    mocks.cloudLibrary.history.items = [other];
    mocks.cloudLibrary.history.initialStatus = 'ready';
    mocks.isMobile = false;
    await renderApp();
    mocks.sessions.newSession.mockClear();
    mocks.cloudLibrary.favoriteSession.mockClear();

    await act(async () => {
      await (mocks.sidebarProps?.onFavoriteSession as ((id: string) => Promise<void>))('s-2');
    });

    expect(mocks.cloudLibrary.favoriteSession).toHaveBeenCalledWith(other);
    expect(mocks.sessions.newSession).not.toHaveBeenCalled();
  });

  it('opens only the selected favorite script in a new Studio session', async () => {
    mocks.auth.user = { id: 'user-1', email: 'listener@example.com' };
    const favorite = {
      id: 'favorite-1',
      sourceSessionId: 's-1',
      sessionId: 's-1',
      title: 'Session',
      favoritedAt: 100,
      turns: [{ id: 'a-1', role: 'assistant' as const, text: '完成', code: 's("hh")' }],
      messages: [{ id: 'a-1', role: 'assistant' as const, content: '完成', code: 's("hh")', timestamp: 1 }],
      code: 's("bd")',
    };
    mocks.favorites.favorites = [favorite];
    mocks.favorites.sourceSessionIds = new Set(['s-1']);
    mocks.cloudLibrary.favorites.items = [{
      id: 's-1', title: 'Session', updatedAt: 1, favoritedAt: 100,
    }];
    mocks.cloudLibrary.favorites.initialStatus = 'ready';
    mocks.cloudLibrary.details.set('s-1', {
      updatedAt: 1,
      session: {
        id: 's-1', title: 'Session', code: 's("bd")', messages: favorite.messages,
        createdAt: 1, updatedAt: 1, favoritedAt: 100,
      },
    });
    mocks.isMobile = false;
    await renderApp();

    await act(async () => {
      container.querySelector<HTMLButtonElement>(`button[aria-label="${t('navFavorites')}"]`)?.click();
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    act(() => {
      container.querySelector<HTMLButtonElement>('[data-favorites-chip="a-1"]')?.click();
    });
    const open = container.querySelector<HTMLButtonElement>(
      '[data-testid="favorites-script-open-in-studio"]',
    );
    expect(open).not.toBeNull();
    await act(async () => { open?.click(); });

    expect(mocks.sessions.importSession).toHaveBeenCalledWith({
      title: t('newSessionTitle'),
      code: 's("hh")',
      messages: [expect.objectContaining({
        role: 'assistant',
        content: 'greeting',
        isGreeting: true,
      })],
    });
  });

  /* The phone keeps the code behind one key, so the key has to say whether
     there is anything behind it. */
  it('lights the mobile code key while there is a piece to open', async () => {
    mocks.isMobile = true;
    mocks.strudel.code = '';
    await renderApp();
    const key = () => container.querySelector<HTMLButtonElement>('[data-testid="mobile-code-key"]');

    expect(key()?.className).toContain('text-text-secondary');
    expect(key()?.className).not.toContain('text-brand-accent');

    mocks.strudel.code = 's("bd*4")';
    await renderApp();

    expect(key()?.className).toContain('text-brand-accent');
    expect(key()?.getAttribute('data-has-code')).toBe('true');
    // Still the same key, doing the same thing.
    expect(key()?.getAttribute('aria-label')).toBe(t('expandCode'));
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

  it('switches mobile history immediately while the outgoing cloud write is pending', async () => {
    const held = heldAccountSession(20);
    mocks.isMobile = true;
    let release!: () => void;
    mocks.sessions.flushCloudSaves.mockImplementationOnce(() => new Promise<undefined>((resolve) => {
      release = () => resolve(undefined);
    }));
    await renderApp();
    await act(async () => {
      (mocks.historyProps!.onSwitch as (id: string) => void)(held.id);
    });
    expect(mocks.sessions.switchTo).toHaveBeenCalledWith(held.id);
    expect(mocks.sessions.setManualCode).toHaveBeenCalledWith('s("bd")', 's-1');
    await act(async () => release());
  });

  it('keeps the last mobile selection when cloud reads resolve in reverse order', async () => {
    mocks.auth.user = { id: 'user-1', email: 'listener@example.com' };
    const first = { id: 'remote-a', title: 'Remote A', updatedAt: 10 };
    const last = { id: 'remote-b', title: 'Remote B', updatedAt: 10 };
    mocks.cloudLibrary.history.items = [first, last];
    mocks.cloudLibrary.history.initialStatus = 'ready';
    let resolveFirst!: (session: Session) => void;
    let resolveLast!: (session: Session) => void;
    mocks.cloudLibrary.readSession
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveLast = resolve; }));
    await renderApp();
    await act(async () => {
      (mocks.historyProps!.onSwitch as (id: string) => void)(first.id);
      (mocks.historyProps!.onSwitch as (id: string) => void)(last.id);
    });
    const lastDetail = { ...last, code: 's("hh")', messages: [], createdAt: 1 };
    await act(async () => resolveLast(lastDetail));
    await act(async () => resolveFirst({ ...first, code: 's("bd")', messages: [], createdAt: 1 }));
    expect(mocks.sessions.acceptCloudDetail).toHaveBeenCalledTimes(1);
    expect(mocks.sessions.acceptCloudDetail).toHaveBeenCalledWith(lastDetail, { activate: false });
    expect(mocks.sessions.switchTo).toHaveBeenCalledTimes(1);
    expect(mocks.sessions.switchTo).toHaveBeenCalledWith(last.id);
  });

  it('does not let a late mobile favorite completion leave a newer history selection', async () => {
    const held = heldAccountSession(20);
    mocks.isMobile = true;
    const source = { id: mocks.session.id, title: mocks.session.title, updatedAt: 1 };
    mocks.cloudLibrary.history.items.push(source);
    let finishFavorite!: (summary: FavoriteSummary) => void;
    mocks.cloudLibrary.favoriteSession.mockImplementationOnce(() => new Promise((resolve) => {
      finishFavorite = resolve;
    }));
    await renderApp();
    await act(async () => {
      (mocks.historyProps!.onFavorite as (id: string) => void)(source.id);
    });
    await act(async () => {
      (mocks.historyProps!.onSwitch as (id: string) => void)(held.id);
    });
    await act(async () => finishFavorite({ ...source, favoritedAt: 100 }));
    expect(mocks.sessions.switchTo).toHaveBeenCalledWith(held.id);
    expect(mocks.sessions.newSession).not.toHaveBeenCalled();
  });

  it('renames another mobile history row without activating it or replacing editor code', async () => {
    const held = heldAccountSession(20);
    mocks.isMobile = true;
    await renderApp();
    mocks.strudel.setCode.mockClear();
    await act(async () => {
      (mocks.historyProps!.onRename as (id: string, title: string) => void)(held.id, 'Renamed');
    });
    expect(mocks.sessions.renameSession).toHaveBeenCalledWith(held.id, 'Renamed');
    expect(mocks.cloudLibrary.openSession).not.toHaveBeenCalled();
    expect(mocks.sessions.switchTo).not.toHaveBeenCalled();
    expect(mocks.strudel.setCode).not.toHaveBeenCalled();
  });

  it('does not save the previous mobile editor code into the incoming session before restoration', async () => {
    await renderApp();
    const incoming = { ...mocks.session, id: 'incoming', code: 's("hh")' };
    mocks.sessions.sessions = [mocks.session, incoming];
    mocks.sessions.currentId = incoming.id;
    mocks.sessions.currentSession = incoming;
    await renderApp();
    mocks.sessions.setManualCode.mockClear();
    // An unrelated session update arrives before the REPL publishes its new code.
    mocks.sessions.currentSession = { ...incoming, code: 's("hh").gain(.8)' };
    await renderApp();
    expect(mocks.sessions.setManualCode).not.toHaveBeenCalled();
    mocks.strudel.code = incoming.code;
    await renderApp();
    mocks.strudel.code = 's("hh").gain(.5)';
    await renderApp();
    expect(mocks.sessions.setManualCode).toHaveBeenCalledWith('s("hh").gain(.5)', incoming.id);
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
    mocks.auth.user = { id: 'user-1', email: 'listener@example.com' };
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
