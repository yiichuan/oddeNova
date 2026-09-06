import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import CodePanel from './components/studio/CodePanel';
import Sidebar from './components/conversation/Sidebar';
import VizPlaceholder from './components/studio/VizPlaceholder';
import { useStrudel } from './hooks/useStrudel';
import { makeGreetingMessage, useSessions } from './hooks/useSessions';
import { useSuggestions } from './hooks/useSuggestions';
import { useDailySuggestions } from './hooks/useDailySuggestions';
import { fetchMoodContext } from './services/airjelly';
import { generateSongTitle } from './services/song-title';
import type { ConversationTurn } from './services/llm';
import { conversationHistoryBefore } from './lib/conversation-history';
import { createAgentProgressHandler } from './lib/agent-progress-handler';
import { isDemoMode, getActiveDemoSet } from './demo/demo-config';
import ApiKeyModal from './components/overlays/ApiKeyModal';
import { hasApiKeyConfigured } from './services/llm-config';
import { resetClient } from './services/llm';
import { HistoryIcon, PauseIcon, PlayIcon, PlusIcon } from './components/icons';
import { parseScore } from './agent/parser';
import { useImportShare } from './hooks/useImportShare';
import { useOddeNovaImport } from './hooks/useOddeNovaImport';
import { useReplay } from './hooks/useReplay';
import { useAgentRunner } from './hooks/useAgentRunner';
import { useVideoDemo } from './hooks/useVideoDemo';
import { useLayout, VIZ_DIVIDER_HEIGHT } from './hooks/useLayout';
import ConversationView from './components/conversation/ConversationView';
import HistoryPanel from './components/conversation/HistoryPanel';
import ChatInput from './components/conversation/ChatInput';
import TopActionBar from './components/studio/TopActionBar';
import AccountModal from './components/overlays/AccountModal';
import WelcomeModal from './components/overlays/WelcomeModal';
import OddeNovaImportNotice from './components/overlays/OddeNovaImportNotice';
import FavoriteActionDialog, { type FavoriteActionKind } from './components/overlays/FavoriteActionDialog';
import PrimaryNav, { type PrimaryNavItem } from './components/nav/PrimaryNav';
import FeaturedPage from './components/featured/FeaturedPage';
import FavoritesPage from './components/favorites/FavoritesPage';
import SettingsSidebar, { type SettingsSection } from './components/settings/SettingsSidebar';
import ModelSettingsPanel from './components/settings/ModelSettingsPanel';
import AppearanceSettingsPanel from './components/settings/AppearanceSettingsPanel';
import { zh, t } from './lib/i18n';
import { getEngineUnavailableMessage } from './lib/engine-status';
import { hasSeenWelcome, markWelcomeSeen, shouldAutoOpenWelcomeModal } from './lib/welcome-modal';
import type { AgentEntryPoint } from './lib/analytics';
import { FEATURED_PIECES, findFeaturedPiece, type FeaturedPiece } from './lib/featured-pieces';
import { conversationTitle, type FavoriteConversation } from './lib/favorite-conversations';
import { sessionAsFavorite } from './lib/session-favorites';
import { useFeaturedPreview } from './hooks/useFeaturedPreview';
import { featuredPlayer } from './services/featured-player';
import { featuredSessionDraft } from './lib/featured-session';
import { useModelSettingsDraft } from './hooks/useModelSettingsDraft';
import {
  useResolvedAnimation,
  useStudioAnimationVisible,
  useThemePreference,
} from './hooks/useAppearance';
import { ANIMATION_LABEL_KEYS, THEME_LABEL_KEYS } from './lib/appearance-preferences';
import { providerLabel } from './lib/model-settings';
import { useAuth } from './hooks/useAuth';
import { accountInitials } from './lib/account-identity';
import {
  deleteCloudSession,
  saveCloudSession,
} from './services/cloud-session-repository';
import { useCloudSessionLibrary } from './hooks/useCloudSessionLibrary';
import type { FavoriteSummary, SessionSummary } from '../shared/session-api';
import {
  deleteSession,
  getAllSessions,
  getSession,
  putSession,
} from './lib/session-storage';
import {
  readSummaryCache,
  writeSummaryCache,
  type CachedSummaries,
} from './lib/session-summary-cache';
import {
  collectImportableGuestSessions,
  getNextImportPromptUserMarker,
  importGuestSessions,
} from './lib/session-import';
import { type Session } from './hooks/useSessions';

/**
 * Destinations that take the whole content area, leaving no room for the
 * session column or the divider beside it.
 */
const FULL_WIDTH_PAGES = new Set<PrimaryNavItem>(['featured', 'favorites']);

/** How long the summary cache holds a change before writing it down. */
const SUMMARY_CACHE_WRITE_MS = 1000;

function cloudErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object' || !('status' in error)) return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === 'number' ? status : undefined;
}

function favoriteNoticeFromSummary(summary: FavoriteSummary): FavoriteConversation {
  return {
    id: summary.id,
    title: summary.title,
    favoritedAt: summary.favoritedAt,
    turns: [],
    sessionId: summary.id,
    sourceSessionId: summary.id,
  };
}

/**
 * The move a conversation has just made, for as long as the dialog reporting
 * it is up.
 *
 * It carries the session itself rather than an id so that a deletion can be
 * undone from what is held here: the entry steps out of the Favorites list the
 * moment the bin is pressed, but nothing is written until the dialog is let go
 * of, which is what makes the undo an undo and not a re-import.
 */
interface FavoriteNotice {
  /**
   * One per move made, and never reused. The notice keeps itself on screen for
   * a few seconds and then lets the move stand; when one move follows another
   * the bar does not leave the page in between, so this is what tells the
   * component it is reporting something new and owes it a fresh few seconds.
   */
  id: number;
  kind: FavoriteActionKind;
  session?: Session;
  favorite: FavoriteConversation;
}

export default function App() {
  const strudel = useStrudel();
  const auth = useAuth();
  const cloudRepository = useMemo(() => ({
    saveSession: saveCloudSession,
    deleteSession: deleteCloudSession,
  }), []);
  const ownerKey = auth.user ? `user:${auth.user.id}` : 'guest';
  const [accountStartToken, setAccountStartToken] = useState(0);
  const lastAuthUserIdRef = useRef<string | null>(null);
  const { isReplaying, replayMessages, replayInputText, startReplay } = useReplay(
    (code) => { strudel.play(code); }
  );
  const sessions = useSessions({
    ownerKey,
    syncEnabled: !!auth.user,
    cloud: cloudRepository,
    startNewSessionToken: accountStartToken,
  });
  const dailySuggestionDefaults = useDailySuggestions(zh);
  const importStatus = useImportShare(sessions.importSession, !sessions.isLoading);
  const oddeNovaImportResult = useOddeNovaImport(
    sessions.importOddeNovaSession,
    !sessions.isLoading,
    sessions.isPersistent,
  );
  const [loadingSessions, setLoadingSessions] = useState<Set<string>>(new Set());
  const [commitSuggestions, setCommitSuggestions] = useState<string[] | null>(null);
  const [demoStep, setDemoStep] = useState(0);
  const [unreadSessions, setUnreadSessions] = useState<Set<string>>(new Set());
  const [rollbackPrefill, setRollbackPrefill] = useState('');
  const [inputFocusTrigger, setInputFocusTrigger] = useState(1);
  const [primaryNavItem, setPrimaryNavItem] = useState<PrimaryNavItem>('home');
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('model');
  // The Featured page opens on a piece rather than on an empty panel; there is
  // no browsing state worth preserving in an unpicked list.
  const [featuredId, setFeaturedId] = useState<string | null>(
    () => FEATURED_PIECES[0]?.id ?? null,
  );
  const [openingFeatured, setOpeningFeatured] = useState(false);
  // Which of Featured's two views is up. The page owns that; the shell only
  // needs it because the primary nav breaks apart for the collection and
  // re-forms into a column for a piece.
  const [featuredPieceOpen, setFeaturedPieceOpen] = useState(false);
  const modelSettings = useModelSettingsDraft(resetClient);
  const themePreference = useThemePreference();
  const animationPreference = useResolvedAnimation();
  const studioAnimationVisible = useStudioAnimationVisible();
  const [accountOpen, setAccountOpen] = useState(false);
  const [guestImportSessions, setGuestImportSessions] = useState<Session[] | null>(null);
  const [guestImportError, setGuestImportError] = useState('');
  const [importingGuestHistory, setImportingGuestHistory] = useState(false);
  const [guestImportGateUserId, setGuestImportGateUserId] = useState<string | null>(null);
  const guestImportRunningRef = useRef(false);
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map());
  const currentIdRef = useRef<string | null>(sessions.currentId);
  const skipNextManualSyncSessionRef = useRef<string | null>(null);
  const prevLoadingRef = useRef<Set<string>>(new Set());
  const importPromptUserRef = useRef<string | null>(null);
  const latestGuestSessionsRef = useRef<Session[]>([]);
  const cloudLibraryEnabled = Boolean(
    auth.user
    && !auth.loading
    && !auth.recoveringPassword
    && !sessions.isLoading
    && guestImportGateUserId === auth.user.id
    && guestImportSessions === null
    && !importingGuestHistory,
  );
  /* The cloud library's local half. Everything it reads for this account is
     kept where the account's own working copies are kept, under the same owner
     key, so a second visit opens on what the first one read. */
  const readCachedSummaries = useCallback(() => readSummaryCache(ownerKey), [ownerKey]);
  /* The lists move with every answered message — the conversation on screen
     keeps re-dating its own summary — and none of that is worth a write of its
     own. One write a second carries whatever the lists last said. */
  const summaryCacheTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const summaryCachePendingRef = useRef<CachedSummaries | null>(null);
  const writeCachedSummaries = useCallback((value: CachedSummaries) => {
    summaryCachePendingRef.current = value;
    if (summaryCacheTimerRef.current !== null) return;
    summaryCacheTimerRef.current = setTimeout(() => {
      summaryCacheTimerRef.current = null;
      const pending = summaryCachePendingRef.current;
      summaryCachePendingRef.current = null;
      if (pending) void writeSummaryCache(ownerKey, pending);
    }, SUMMARY_CACHE_WRITE_MS);
  }, [ownerKey]);
  useEffect(() => () => {
    if (summaryCacheTimerRef.current !== null) clearTimeout(summaryCacheTimerRef.current);
  }, []);
  const readCachedDetail = useCallback(
    (id: string) => getSession(id, ownerKey),
    [ownerKey],
  );
  const writeCachedDetail = useCallback((session: Session) => {
    void putSession(session, ownerKey);
  }, [ownerKey]);
  const cloudLibrary = useCloudSessionLibrary({
    enabled: cloudLibraryEnabled,
    ownerId: auth.user?.id,
    acceptCloudDetail: sessions.acceptCloudDetail,
    readCachedSummaries,
    writeCachedSummaries,
    readCachedDetail,
    writeCachedDetail,
  });
  const cloudHistory = cloudLibrary.history;
  const cloudFavorites = cloudLibrary.favorites;
  const cloudHistoryItems = cloudHistory.items;
  const cloudFavoriteItems = cloudFavorites.items;
  const cloudHistoryInitialError = cloudHistory.initialError;
  const cloudHistoryMoreError = cloudHistory.moreError;
  const cloudFavoritesInitialError = cloudFavorites.initialError;
  const cloudFavoritesMoreError = cloudFavorites.moreError;
  const cloudDetails = cloudLibrary.details;
  const cloudDetailError = cloudLibrary.detailError;
  const loadMoreCloudHistory = cloudLibrary.loadMoreHistory;
  const loadMoreCloudFavorites = cloudLibrary.loadMoreFavorites;
  const ensureCloudFavorites = cloudLibrary.ensureFavorites;
  const openCloudSession = cloudLibrary.openSession;
  const openCloudFavorite = cloudLibrary.openFavorite;
  const favoriteCloudSession = cloudLibrary.favoriteSession;
  const unfavoriteCloudSession = cloudLibrary.unfavoriteSession;
  const removeCloudSummary = cloudLibrary.removeSummary;
  const upsertCloudHistorySummary = cloudLibrary.upsertHistorySummary;
  const retryCloudDetail = cloudLibrary.retryDetail;
  // Use ref to prevent the postMessage handler from capturing a stale strudel closure
  const strudelRef = useRef(strudel);
  useEffect(() => { strudelRef.current = strudel; }, [strudel]);
  useEffect(() => {
    if (auth.recoveringPassword) setAccountOpen(true);
  }, [auth.recoveringPassword]);
  const { isVideoMode, videoDemoMsgs, videoConvScrollBottom, videoTitle } = useVideoDemo(strudelRef);

  const {
    isMobile,
    keyboardHeight,
    sidebarWidth,
    sidebarCollapsed,
    vizHeight,
    vizCollapsed,
    toggleVizCollapsed,
    isDragging,
    mainRef,
    hDragHandlers,
    vDragHandlers,
    historyOpen,
    setHistoryOpen,
    drawerOpen,
    setDrawerOpen,
    shouldLiftBottomBar,
    mobileDrawerHeight,
    handleChatFocusChange,
    handleCodeFocusChange,
  } = useLayout();
  useEffect(() => {
    currentIdRef.current = sessions.currentId;
  }, [sessions.currentId]);

  useEffect(() => {
    const userId = auth.user?.id ?? null;
    if (userId && userId !== lastAuthUserIdRef.current) {
      setAccountStartToken((token) => token + 1);
    }
    lastAuthUserIdRef.current = userId;
  }, [auth.user?.id]);

  useEffect(() => {
    if (!auth.user && !sessions.isLoading) {
      latestGuestSessionsRef.current = sessions.sessions;
    }
  }, [auth.user, sessions.isLoading, sessions.sessions]);

  useEffect(() => {
    const nextMarker = getNextImportPromptUserMarker(auth.user?.id ?? null, importPromptUserRef.current);
    if (nextMarker !== importPromptUserRef.current) {
      importPromptUserRef.current = nextMarker;
      setGuestImportError('');
      setGuestImportSessions(null);
      setGuestImportGateUserId(null);
    }
  }, [auth.user]);

  useEffect(() => {
    const prev = prevLoadingRef.current;
    const curr = loadingSessions;
    // Find IDs that disappeared from loading in this round (i.e. sessions that finished generating)
    const completed = [...prev].filter((id) => !curr.has(id));
    if (completed.length > 0) {
      setUnreadSessions((prevUnread) => {
        const next = new Set(prevUnread);
        for (const id of completed) {
          // Only mark as unread if it is not the current session
          if (id !== currentIdRef.current) {
            next.add(id);
          }
        }
        return next;
      });
    }
    prevLoadingRef.current = curr;
  }, [loadingSessions]);

  const handleStop = useCallback(() => {
    const id = sessions.currentId;
    if (id) {
      abortControllersRef.current.get(id)?.abort();
    }
  }, [sessions]);

  // Mobile transport toggle next to the code pill. Mirrors CodePanel's footer
  // play button, which mobile no longer renders.
  const handleMobileTransportClick = useCallback(() => {
    if (strudel.isPlaying) {
      strudel.pause();
    } else if (strudel.engineReady && strudel.code) {
      void strudel.play();
    }
  }, [strudel]);
  // Dimmed until there's something to play — but never while playing, or the
  // pause action would become unreachable.
  const mobileTransportDisabled = !strudel.isPlaying && (!strudel.engineReady || !strudel.code);

  const [apiKeyModalOpen, setApiKeyModalOpen] = useState(false);
  // Read once, before the auth session has had a chance to resolve: this is the
  // very first paint of a first visit, and the flag is what decides it. Waiting
  // for `auth.loading` would let the studio show through first and then have the
  // window drop on top of it.
  const [welcomeOpen, setWelcomeOpen] = useState(() => {
    let isTopWindow = true;
    try {
      isTopWindow = window.self === window.top;
    } catch {
      // Cross-origin frame access can throw; treat it as embedded and stay quiet.
      isTopWindow = false;
    }
    return shouldAutoOpenWelcomeModal({ isTopWindow, hasSeenWelcome: hasSeenWelcome() });
  });
  const [importErrorDismissed, setImportErrorDismissed] = useState(false);

  const closeApiKeyModal = useCallback(() => {
    setApiKeyModalOpen(false);
  }, []);

  const closeWelcomeModal = useCallback(() => setWelcomeOpen(false), []);

  const openSettings = useCallback(() => {
    setApiKeyModalOpen(true);
  }, []);

  // Seen means shown, not dismissed. Continuing with Google hands the page over
  // to the provider and returns through a reload, so a flag written on the way
  // out is a flag that never gets written.
  useEffect(() => {
    if (welcomeOpen) markWelcomeSeen();
  }, [welcomeOpen]);

  // Each settings entry carries the value it is currently set to, so the column
  // still answers "what am I on?" without opening the section.
  const settingsHints = useMemo(() => ({
    model: providerLabel(modelSettings.activeProvider),
    appearance: `${t(THEME_LABEL_KEYS[themePreference])} · ${
      studioAnimationVisible ? t(ANIMATION_LABEL_KEYS[animationPreference]) : t('studioAnimationOff')
    }`,
  }), [animationPreference, modelSettings.activeProvider, studioAnimationVisible, themePreference]);

  // Auditioning a featured piece borrows the studio's engine; `borrowed` is
  // what tells the rest of this file that the code in the editor is on loan
  // and belongs to nobody's session.
  const featuredPreview = useFeaturedPreview(featuredPlayer);
  const stopFeaturedPreview = featuredPreview.stop;
  const featuredPlayingId = featuredPreview.playingId;
  const featuredPausedId = featuredPreview.pausedId;
  const stopStudio = strudel.stop;

  const handlePrimaryNavSelect = useCallback((item: PrimaryNavItem) => {
    if (item === 'favorites' && !auth.user) {
      setAccountOpen(true);
      return;
    }
    if (item === 'account') {
      setAccountOpen(true);
      return;
    }
    // A transport belongs to the page its controls are on. Walking away stops
    // it — music playing on behalf of a bar you can no longer reach is worse
    // than silence, in either direction.
    if (item !== 'featured') stopFeaturedPreview();
    if (item !== 'home') stopStudio();
    setPrimaryNavItem(item);
  }, [auth.user, stopFeaturedPreview, stopStudio]);

  useEffect(() => {
    // A sign-out or expired auth session must not leave the account-only page
    // visible while the auth state settles.
    if (!auth.user && primaryNavItem === 'favorites') {
      setPrimaryNavItem('home');
    }
  }, [auth.user, primaryNavItem]);

  useEffect(() => {
    const userId = auth.user?.id;
    if (!userId) {
      setGuestImportGateUserId(null);
      return;
    }
    // Wait for the account's own sessions to finish loading, like the share and
    // oddeNova import entry points do: importing into a half-loaded account
    // drops the imported session when the in-flight load replaces the list.
    if (
      !userId
      || auth.loading
      || auth.recoveringPassword
      || sessions.isLoading
      || importPromptUserRef.current === userId
    ) return;
    let cancelled = false;
    getAllSessions('guest').then((guestSessions) => {
      if (cancelled) return;
      const importable = collectImportableGuestSessions(guestSessions, latestGuestSessionsRef.current);
      if (importable.length > 0) {
        setGuestImportError('');
        setGuestImportSessions(importable);
      } else {
        setGuestImportGateUserId(userId);
      }
      importPromptUserRef.current = userId;
    }).catch((err) => {
      console.warn('[account] failed to inspect guest sessions for import.', err);
      importPromptUserRef.current = userId;
      setGuestImportGateUserId(userId);
    });
    return () => { cancelled = true; };
  }, [auth.user, auth.loading, auth.recoveringPassword, sessions.isLoading]);

  const importGuestHistory = useCallback(async () => {
    // The cloud save keeps the dialog up for as long as the request takes. A
    // second click would import the same history again under a fresh id, so
    // guard on a ref: it is set before the first await, unlike the state the
    // disabled button reads.
    if (guestImportRunningRef.current) return;
    guestImportRunningRef.current = true;
    setImportingGuestHistory(true);
    const items = guestImportSessions ?? [];
    setGuestImportError('');
    try {
      const result = await importGuestSessions(
        items,
        (item) => sessions.importSession(item, { activate: false, awaitCloud: true }),
        (id) => deleteSession(id, 'guest'),
      );
      setGuestImportSessions(result.remaining.length > 0 ? result.remaining : null);
      if (result.error) {
        console.warn('[account] failed to import guest sessions to cloud.', result.error);
        setGuestImportError(t('accountActionFailed'));
      } else {
        setGuestImportGateUserId(auth.user?.id ?? null);
      }
    } finally {
      guestImportRunningRef.current = false;
      setImportingGuestHistory(false);
    }
  }, [auth.user?.id, guestImportSessions, sessions]);

  const current = sessions.currentSession;
  const visibleSyncStatus = !sessions.isPersistent
    && sessions.currentManualSyncStatus === 'offline'
    ? 'retrying'
    : sessions.currentManualSyncStatus;
  const messages = isReplaying ? replayMessages : (current?.messages ?? []);
  // Session code = last committed/played code (used as agent context)
  // Fall back to live editor code so manually-pasted code is visible to the agent.
  const currentCode = strudel.code || (current?.code ?? '');
  const currentBpm = parseScore(currentCode).bpm ?? 120;
  const isLoading = !!current?.id && loadingSessions.has(current.id);
  const historyItems: readonly (Session | SessionSummary)[] = auth.user
    ? cloudHistoryItems
    : sessions.sessions.filter((session) => session.favoritedAt === undefined);
  /* Loading is only ever the empty state's business: once there are rows to
     show — last visit's, or this one's — the list is drawn and the request
     that is still out corrects it in place. */
  const historyInitialLoading = auth.user
    ? (!cloudLibraryEnabled || cloudHistory.initialStatus === 'loading')
      && cloudHistoryItems.length === 0
    : sessions.isLoading;
  /* Same for the failure: a list this device could not check is still the list
     it has, and saying so where rows are already drawn would replace them with
     an apology. The error takes the panel only when there is nothing else. */
  const historyInitialError = auth.user && cloudHistoryItems.length === 0
    ? cloudHistory.initialError
    : null;
  const historyHasMore = auth.user ? cloudHistory.nextCursor !== null : false;
  const historyLoadingMore = Boolean(auth.user && cloudHistory.moreStatus === 'loading');
  const historyLoadMoreError = auth.user ? cloudHistory.moreError : null;
  /** The featured piece the detail panel is showing. */
  const featuredPiece = findFeaturedPiece(featuredId) ?? null;
  const showSessionSyncStatus = Boolean(
    auth.user
    && current
    && !isLoading
    && visibleSyncStatus,
  );

  useEffect(() => {
    if (!auth.user?.id || !cloudLibraryEnabled || !current || current.favoritedAt !== undefined) return;
    // The local working copy intentionally keeps its pre-favorite marker. The
    // cloud library owns that transition; once its optimistic favorite is in
    // the favorites collection, do not let this content-sync bridge add the
    // same session back into history on the next render.
    if (cloudFavoriteItems.some((summary) => summary.id === current.id)) return;
    const hasSubstantiveContent = Boolean(current.code.trim())
      || current.messages.some((message) => (
        (message.role === 'user' || message.role === 'assistant') && !message.isGreeting
      ));
    if (!hasSubstantiveContent) return;
    upsertCloudHistorySummary({
      id: current.id,
      title: current.title,
      updatedAt: current.updatedAt,
    }, 0);
  }, [auth.user?.id, cloudFavoriteItems, cloudLibraryEnabled, current, upsertCloudHistorySummary]);

  /* The other half of opening on the working copy. When the history list turns
     out to know a later version of the conversation on screen — written on
     another device, or by a page that was open elsewhere — read it once and let
     the studio catch up. Once per version, so a read that comes back older than
     the summary claimed cannot ask for itself again; and never over a turn
     being answered here, which is the one thing the cloud cannot know about. */
  const revalidatedVersionRef = useRef<string | null>(null);
  useEffect(() => {
    if (!auth.user || !cloudLibraryEnabled || !current || isLoading) return;
    const summary = cloudHistoryItems.find((candidate) => candidate.id === current.id);
    if (!summary || summary.updatedAt <= current.updatedAt) return;
    const version = `${summary.id}:${summary.updatedAt}`;
    if (revalidatedVersionRef.current === version) return;
    revalidatedVersionRef.current = version;
    void openCloudSession(summary).catch((error) => {
      console.warn('[sessions] open conversation revalidation failed.', error);
    });
  }, [auth.user, cloudHistoryItems, cloudLibraryEnabled, current, isLoading, openCloudSession]);

  const { suggestions } = useSuggestions({
    key: current?.id ?? '',
    currentCode: current?.code ?? '',
    defaults: dailySuggestionDefaults,
    commitSuggestions: commitSuggestions ?? undefined,
    persisted: current?.suggestions,
    onSuggestions: (items, forCode) => sessions.setSuggestions(items, forCode, current?.id),
  });
  const activeSet = getActiveDemoSet();
  const demoSuggestions = isDemoMode()
    ? (demoStep < activeSet.length ? [activeSet[demoStep].prompt] : [])
    : suggestions;
  const visibleSuggestions = demoSuggestions;

  const accountLabel = auth.user?.email || (auth.user ? t('account') : t('signIn'));

  const accountOverlays = (
    <>
      {/* The first-entry window stands down for anyone the session already
          knows, and for a failed Google return — that one has its own window to
          report itself in. */}
      {welcomeOpen && !auth.oauthErrorKey && !auth.user && (
        <WelcomeModal configured={auth.configured} onClose={closeWelcomeModal} />
      )}
      {(accountOpen || auth.oauthErrorKey) && (
        <AccountModal
          user={auth.user}
          configured={auth.configured}
          recoveringPassword={auth.recoveringPassword}
          oauthErrorKey={auth.oauthErrorKey}
          beforeSignOut={sessions.flushCloudSaves}
          onClose={() => {
            auth.dismissOAuthError();
            setAccountOpen(false);
          }}
        />
      )}
      {guestImportSessions && (
        // The editor's bottom fade uses z-index 240/250, so this app-level
        // dialog must sit above those masks or they can cover its buttons.
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-[var(--color-overlay-backdrop)] backdrop-blur-[2px]">
          <div className="bg-bg-secondary border border-border rounded-2xl p-6 w-[420px] max-w-[90vw] shadow-dialog-overlay">
            <h2 className="text-lg font-semibold text-text-primary mb-2">{t('importLocalHistory')}</h2>
            <p className="text-xs text-text-muted mb-5">{t('importLocalHistoryDesc')}</p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setGuestImportError('');
                  setGuestImportSessions(null);
                  setGuestImportGateUserId(auth.user?.id ?? null);
                }}
                disabled={importingGuestHistory}
                className="flex-1 py-2.5 text-sm text-text-secondary bg-bg-tertiary rounded-lg hover:bg-border transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('notNow')}
              </button>
              <button
                onClick={() => void importGuestHistory()}
                disabled={importingGuestHistory}
                className="flex-1 py-2.5 text-sm text-on-accent bg-accent rounded-lg hover:bg-accent-light transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('importNow')}
              </button>
            </div>
            {guestImportError && <div className="text-xs text-red-300 mt-3">{guestImportError}</div>}
          </div>
        </div>
      )}
    </>
  );

  // When the session switches, restore its code into the editor and stop audio
  useEffect(() => {
    if (!current) return;
    skipNextManualSyncSessionRef.current = current.id;
    strudel.setCode(current.code);
    strudel.stop();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: only re-run when session ID changes
  }, [current?.id]);

  const setManualCode = sessions.setManualCode;
  const flushCloudSaves = sessions.flushCloudSaves;
  useEffect(() => {
    if (!current?.id || isLoading || isReplaying || isVideoMode) return;
    if (skipNextManualSyncSessionRef.current === current.id) {
      skipNextManualSyncSessionRef.current = null;
      return;
    }
    if (strudel.code === current.code) return;
    void setManualCode(strudel.code, current.id);
  }, [
    current?.id,
    current?.code,
    isLoading,
    isReplaying,
    isVideoMode,
    setManualCode,
    strudel.code,
  ]);

  // Option+. (Alt+.) global play/stop toggle — matches strudel's Alt+. keybinding
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && e.code === 'Period' && e.key !== '.') {
        e.preventDefault();
        if (strudelRef.current.isPlaying) {
          strudelRef.current.pause();
        } else if (strudelRef.current.engineReady) {
          void strudelRef.current.play();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Build the agent progress→UI handler for a given session. Shared verbatim by
  // handleInstruction and handleMoodInstruction.
  const makeAgentProgressHandler = useCallback(
    (sessionId: string) => createAgentProgressHandler(sessions, sessionId),
    [sessions]
  );

  // One Agent turn (instruction → generation → playback + persistence), shared by
  // the text and mood entry points below. See src/hooks/useAgentRunner.ts.
  const runTurn = useAgentRunner({
    strudel,
    sessions,
    currentCode,
    abortControllersRef,
    currentIdRef,
    setLoadingSessions,
    setCommitSuggestions,
    setRollbackPrefill,
    makeProgressHandler: makeAgentProgressHandler,
  });

  const handleInstruction = useCallback(
    async (text: string, options?: {
      entryPoint?: AgentEntryPoint;
      skipAddMessage?: boolean;
      initialCode?: string;
      history?: ConversationTurn[];
    }) => {
      if (isDemoMode() && activeSet[demoStep]?.prompt === text) {
        setDemoStep((s) => s + 1);
      }

      return runTurn({
        text,
        entryPoint: options?.entryPoint ?? 'text',
        includeHistory: true,
        skipAddMessage: options?.skipAddMessage,
        initialCode: options?.initialCode,
        suppliedHistory: options?.history,
      });
    },
    [runTurn, demoStep, activeSet]
  );

  const handleChatInstruction = useCallback(
    (text: string, entryPoint: Extract<AgentEntryPoint, 'text' | 'suggestion'>) =>
      handleInstruction(text, { entryPoint }),
    [handleInstruction],
  );

  // Abort any in-progress run and rewind strudel/session code state to before messageId was sent.
  // Shared by handleResend (edit + resend) and handleRollback (rewind only);
  // they diverge only in what they do after the rewind (overwrite + resend vs. prefill input).
  const rewindBeforeMessage = useCallback(
    async (messageId: string) => {
      const currentSessionId = sessions.currentId;
      if (currentSessionId) {
        abortControllersRef.current.get(currentSessionId)?.abort();
      }
      // Find the last assistant message with code before this message, as the rollback target

      const allMessages = sessions.currentSession?.messages ?? [];
      const idx = allMessages.findIndex((m) => m.id === messageId);
      if (idx < 0) return null;
      const target = allMessages[idx];

      // Find the last assistant message with code before this message, as the rollback target
      const prevAssistant = [...allMessages.slice(0, idx)].reverse().find((m) => m.role === 'assistant' && m.code != null);
      const previousCode = prevAssistant?.code ?? '';

      // Restore the rollback target as the session truth without auto-playing:
      // stop current audio (it belongs to the rolled-away version), put the
      // code back in the editor, and persist it. Playback stays a user action.
      strudel.stop();
      strudel.setCode(previousCode);
      if (sessions.currentId) sessions.setCurrentCode(previousCode, sessions.currentId);

      return { target, previousCode };
    },
    [sessions, strudel]
  );

  const handleResend = useCallback(
    async (messageId: string, newContent: string) => {
      const allMsgs = sessions.currentSession?.messages ?? [];
      const history = conversationHistoryBefore(allMsgs, messageId);

      const rewound = await rewindBeforeMessage(messageId);
      if (!rewound) return;

      sessions.truncateAndEdit(messageId, newContent);
      await handleInstruction(newContent, {
        entryPoint: 'retry',
        skipAddMessage: true,
        initialCode: rewound.previousCode,
        history,
      });
    },
    [sessions, handleInstruction, rewindBeforeMessage]
  );

  const handleRollback = useCallback(
    async (messageId: string) => {
      const currentSessionId = sessions.currentId;
      const rewound = await rewindBeforeMessage(messageId);
      if (!rewound) return;

      sessions.truncate(messageId);
      if (currentSessionId) {
        await sessions.checkpointSession(currentSessionId);
      }

      // Prefill the input with the message content and focus
      setRollbackPrefill(rewound.target.content);
      setInputFocusTrigger((n) => n + 1);
    },
    [sessions, rewindBeforeMessage]
  );

  const handleRetry = useCallback(
    async (assistantMessageId: string) => {
      const allMessages = sessions.currentSession?.messages ?? [];
      const idx = allMessages.findIndex((m) => m.id === assistantMessageId);
      if (idx < 0) return;
      const userMsg = [...allMessages.slice(0, idx)].reverse().find((m) => m.role === 'user');
      if (!userMsg) return;
      await handleResend(userMsg.id, userMsg.content);
    },
    [sessions, handleResend]
  );

  const handleMoodInstruction = useCallback(async () => {
    // Pre-flight engine check before the (potentially slow) mood fetch, so we don't
    // fire the mood request when audio is unavailable.
    const engineUnavailableMessage = getEngineUnavailableMessage(strudel.engineStatus);
    if (engineUnavailableMessage) {
      strudel.setError(engineUnavailableMessage);
      return;
    }

    let moodContext: string | null = null;
    if (!isDemoMode()) {
      moodContext = await fetchMoodContext();
    }

    // Mood generation is a one-off creation: deliberately no conversation history.
    await runTurn({
      text: '根据我的心情生成音乐',
      entryPoint: 'mood',
      moodContext: moodContext ?? undefined,
      includeHistory: false,
    });
  }, [strudel, runTurn]);

  const persistAndFlushOutgoingSession = useCallback(async (id: string, code: string) => {
    try {
      await setManualCode(code, id);
      await flushCloudSaves(id);
    } catch (error) {
      // Local persistence and the durable pending marker remain authoritative;
      // the coordinator will retry while the user continues navigating.
      console.warn('[sessions] outgoing session flush failed.', error);
    }
  }, [flushCloudSaves, setManualCode]);

  const handlePlay = useCallback(async () => {
    if (sessions.currentId) {
      await setManualCode(strudel.code, sessions.currentId);
      await flushCloudSaves(sessions.currentId);
    }
    await strudel.play();
  }, [flushCloudSaves, sessions.currentId, setManualCode, strudel]);

  // Live update: the edit is persisted the same way a play is, then handed to
  // the running transport instead of restarting it.
  const handleUpdate = useCallback(async () => {
    if (sessions.currentId) {
      await setManualCode(strudel.code, sessions.currentId);
      await flushCloudSaves(sessions.currentId);
    }
    await strudel.update();
  }, [flushCloudSaves, sessions.currentId, setManualCode, strudel]);

  const importSession = sessions.importSession;
  const playFeatured = featuredPreview.play;
  // Picking a tile is what parks the player bar on it, so the bar always shows
  // the piece you last reached for rather than trailing a separate selection.
  const handleFeaturedPlay = useCallback((piece: FeaturedPiece) => {
    setFeaturedId(piece.id);
    void playFeatured(piece);
  }, [playFeatured]);

  /* Reading a piece parks the bar on it too — opening a record, or turning its
     track column, is choosing what the transport points at. The audition goes
     quiet with it: the bar names one piece, so letting a different one carry on
     sounding underneath would make the bar say the wrong thing. Reaching for
     the piece already sounding, or the one holding a paused playhead, is not a
     change and leaves the transport alone. */
  const handleFeaturedSelect = useCallback((piece: FeaturedPiece) => {
    setFeaturedId(piece.id);
    if (featuredPlayingId !== piece.id && featuredPausedId !== piece.id) {
      stopFeaturedPreview();
    }
  }, [featuredPausedId, featuredPlayingId, stopFeaturedPreview]);

  const handleOpenFeaturedInStudio = useCallback(async (piece: FeaturedPiece) => {
    setOpeningFeatured(true);
    try {
      // The audition is over: what you are about to look at is the studio's
      // copy of this piece, which the studio's own transport plays.
      stopFeaturedPreview();
      await importSession(featuredSessionDraft(piece));
      setPrimaryNavItem('home');
    } finally {
      setOpeningFeatured(false);
    }
  }, [importSession, stopFeaturedPreview]);

  const handleNewSession = useCallback(async () => {
    if (sessions.currentId) {
      await persistAndFlushOutgoingSession(sessions.currentId, strudel.code);
    }
    strudel.stop();
    // The last turn's next-step chips belong to the conversation being left,
    // exactly as on a switch — a fresh session opens on its own placeholder.
    setCommitSuggestions(null);
    sessions.newSession();
    if (isDemoMode()) setDemoStep(0);
  }, [strudel, sessions, persistAndFlushOutgoingSession]);

  /* The notice delays release/delete writes long enough for Undo to remain a
     real cancellation while the session stays in its current collection. */
  const [favoriteNotice, setFavoriteNotice] = useState<FavoriteNotice | null>(null);
  const [favoritesFocus, setFavoritesFocus] = useState<{ id: string } | null>(null);
  const [selectedFavoriteId, setSelectedFavoriteId] = useState<string | null>(null);
  const selectedAccountFavoriteSummary = cloudFavoriteItems.find(
    (summary) => summary.id === selectedFavoriteId,
  ) ?? null;
  const selectedAccountFavoriteDetail = selectedAccountFavoriteSummary
    ? cloudDetails.get(selectedAccountFavoriteSummary.id)?.session ?? null
    : null;
  /* Memoised for its identity, not for the work. `sessionAsFavorite` builds a
     new object out of the same two inputs every time it is called, and the
     Favorites page hands that object straight down to the archive as the
     conversation being read — where a fresh one is indistinguishable from a
     different favorite having been opened, and takes the reading back to its
     end. Any render of this component was enough: a track starting, a hover
     three panes away. So the object changes when the detail or the summary
     behind it does, and at no other time. */
  const selectedAccountFavorite = useMemo(
    () => (selectedAccountFavoriteDetail && selectedAccountFavoriteSummary
      ? sessionAsFavorite(selectedAccountFavoriteDetail, {
        favoritedAt: selectedAccountFavoriteSummary.favoritedAt,
      })
      : null),
    [selectedAccountFavoriteDetail, selectedAccountFavoriteSummary],
  );
  const selectedAccountFavoriteError = cloudDetailError
    && cloudDetailError.id === selectedAccountFavoriteSummary?.id
    ? cloudDetailError.error
    : null;
  useEffect(() => {
    if (
      selectedFavoriteId
      && !cloudFavoriteItems.some((summary) => summary.id === selectedFavoriteId)
    ) {
      setSelectedFavoriteId(null);
    }
  }, [cloudFavoriteItems, selectedFavoriteId]);
  const pendingFavoriteId = favoriteNotice?.kind === 'released' || favoriteNotice?.kind === 'deleted'
    ? favoriteNotice.favorite.id
    : null;
  const cloudFavoriteConversations = useMemo(
    () => cloudFavoriteItems.filter((summary) => summary.id !== pendingFavoriteId),
    [cloudFavoriteItems, pendingFavoriteId],
  );

  const commitPendingDelete = useCallback(async (notice: FavoriteNotice | null): Promise<boolean> => {
    if (notice?.kind !== 'released' && notice?.kind !== 'deleted') return false;
    if (!auth.user) return false;
    if (notice.kind === 'deleted') {
      // Deletion already removes the source session. Updating its favorite
      // marker first would enqueue a checkpoint that could race the delete and
      // resurrect the session in the cloud.
      const sourceSessionId = notice.session?.id
        ?? notice.favorite.sourceSessionId
        ?? notice.favorite.sessionId
        ?? notice.favorite.id;
      sessions.deleteSession(sourceSessionId);
      return true;
    }
    try {
      await unfavoriteCloudSession(notice.favorite.id);
      return true;
    } catch (error) {
      console.warn('[favorites] failed to update session favorite state.', error);
      if (auth.user && cloudErrorStatus(error) === 401) setAccountOpen(true);
      strudel.setError(t('favoriteActionFailed'));
      return false;
    }
  }, [auth.user, sessions, strudel, unfavoriteCloudSession]);

  const noticeSeqRef = useRef(0);

  const noticeFor = useCallback((
    kind: FavoriteActionKind,
    session: Session | undefined,
    favorite: FavoriteConversation,
  ): void => {
    void commitPendingDelete(favoriteNotice);
    setFavoriteNotice({
      id: ++noticeSeqRef.current,
      kind,
      session,
      favorite,
    });
  }, [commitPendingDelete, favoriteNotice]);

  const handleFavoriteSession = useCallback(async (id: string) => {
    if (!auth.user) {
      setAccountOpen(true);
      return;
    }
    const summary = cloudHistoryItems.find((candidate) => candidate.id === id);
    if (!summary) return;
    const isCurrentSession = sessions.currentId === id;
    try {
      if (isCurrentSession) {
        await setManualCode(strudel.code, id);
        await flushCloudSaves(id);
      }
      const favoriteSummary = await favoriteCloudSession(summary);
      noticeFor('kept', undefined, favoriteNoticeFromSummary(favoriteSummary));
      if (isCurrentSession) await handleNewSession();
    } catch (error) {
      console.warn('[favorites] failed to favorite cloud session.', error);
      if (cloudErrorStatus(error) === 401) setAccountOpen(true);
      strudel.setError(t('favoriteActionFailed'));
    }
  }, [auth.user, cloudHistoryItems, favoriteCloudSession, flushCloudSaves, handleNewSession, noticeFor, sessions.currentId, setManualCode, strudel]);

  const handleUnfavorite = useCallback((conversation: FavoriteConversation) => {
    if (!auth.user) {
      setAccountOpen(true);
      return;
    }
    const sourceId = conversation.sourceSessionId ?? conversation.sessionId ?? conversation.id;
    const summary = cloudFavoriteItems.find((candidate) => candidate.id === sourceId)
      ?? cloudFavoriteItems.find((candidate) => candidate.id === conversation.id);
    if (!summary) return;
    const session = cloudDetails.get(summary.id)?.session
      ?? sessions.sessions.find((candidate) => candidate.id === sourceId);
    noticeFor('released', session, conversation);
  }, [auth.user, cloudDetails, cloudFavoriteItems, noticeFor, sessions.sessions]);

  const handleDeleteFavorite = useCallback((conversation: FavoriteConversation) => {
    if (!auth.user) {
      setAccountOpen(true);
      return;
    }
    const sourceId = conversation.sourceSessionId ?? conversation.sessionId ?? conversation.id;
    if (sessions.sessions.some((session) => session.id === sourceId)) {
      removeCloudSummary(sourceId);
      sessions.deleteSession(sourceId);
    } else {
      void deleteCloudSession(sourceId, auth.user.id)
        .then(() => { removeCloudSummary(sourceId); })
        .catch((error) => {
          console.warn('[favorites] failed to delete cloud session.', error);
          if (cloudErrorStatus(error) === 401) setAccountOpen(true);
          strudel.setError(t('favoriteActionFailed'));
        });
    }
  }, [auth.user, removeCloudSummary, sessions, strudel]);

  const dismissFavoriteNotice = useCallback(() => {
    // Letting the notice go is what commits the deletion it was holding.
    void commitPendingDelete(favoriteNotice);
    setFavoriteNotice(null);
  }, [commitPendingDelete, favoriteNotice]);

  const undoFavoriteNotice = useCallback(() => {
    if (!favoriteNotice) return;
    if (favoriteNotice.kind === 'kept') {
      if (!auth.user) {
        setFavoriteNotice(null);
        return;
      }
      const undo = unfavoriteCloudSession(favoriteNotice.favorite.id);
      void undo.catch((error) => {
        console.warn('[favorites] failed to undo session favorite.', error);
        strudel.setError(t('favoriteActionFailed'));
      });
    }
    setFavoriteNotice(null);
  }, [auth.user, favoriteNotice, strudel, unfavoriteCloudSession]);

  const handleSwitchSession = useCallback(async (id: string) => {
    if (sessions.currentId !== id) {
      if (sessions.currentId) {
        await persistAndFlushOutgoingSession(sessions.currentId, strudel.code);
      }
    }
    setCommitSuggestions(null);
    setUnreadSessions((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    const workingCopy = sessions.sessions.find((session) => session.id === id);
    const summary = auth.user
      ? cloudHistoryItems.find((candidate) => candidate.id === id)
      : undefined;
    /* A conversation this device already holds opens on the copy it holds —
       the switch is a local one, and nothing waits on the network. What the
       cloud is asked for afterwards is only a correction: whether another
       device has written this conversation since. A turn still being answered
       is not asked about at all; its working copy is being written right now,
       and the cloud's idea of it is the past. */
    if (workingCopy) {
      sessions.switchTo(id);
      const cloudIsAhead = summary !== undefined && summary.updatedAt > workingCopy.updatedAt;
      if (cloudIsAhead && !loadingSessions.has(id)) {
        void openCloudSession(summary).catch((error) => {
          console.warn('[sessions] background session revalidation failed.', error);
          if (cloudErrorStatus(error) === 401) setAccountOpen(true);
        });
      }
      return;
    }
    // Nothing local to open: this device is seeing the conversation for the
    // first time, and the read is the switch.
    if (auth.user) {
      if (!summary) return;
      try {
        await openCloudSession(summary);
      } catch (error) {
        console.warn('[sessions] failed to open cloud session.', error);
        if (cloudErrorStatus(error) === 401) setAccountOpen(true);
        // Gone from the cloud is gone: the library has already dropped the
        // summary, and there is nothing to open.
        if (cloudErrorStatus(error) === 404) return;
        strudel.setError(t('requestFailed'));
      }
      return;
    }
    sessions.switchTo(id);
  }, [
    auth.user,
    cloudHistoryItems,
    loadingSessions,
    openCloudSession,
    persistAndFlushOutgoingSession,
    sessions,
    strudel,
  ]);

  const handleDeleteSession = useCallback((id: string) => {
    if (!auth.user) {
      sessions.deleteSession(id);
      return;
    }
    if (sessions.sessions.some((session) => session.id === id)) {
      removeCloudSummary(id);
      sessions.deleteSession(id);
    } else {
      void deleteCloudSession(id, auth.user.id)
        .then(() => { removeCloudSummary(id); })
        .catch((error) => {
          console.warn('[sessions] failed to delete cloud session.', error);
          if (cloudErrorStatus(error) === 401) setAccountOpen(true);
          if (cloudErrorStatus(error) !== 404) strudel.setError(t('requestFailed'));
        });
    }
  }, [auth.user, removeCloudSummary, sessions, strudel]);

  const handleRenameSession = useCallback(async (id: string, title: string) => {
    if (!auth.user) {
      sessions.renameSession(id, title);
      return;
    }
    const summary = cloudHistoryItems.find((candidate) => candidate.id === id);
    if (!summary) return;
    try {
      await openCloudSession(summary);
      sessions.renameSession(id, title);
      upsertCloudHistorySummary({ ...summary, title }, 0);
    } catch (error) {
      console.warn('[sessions] failed to rename cloud session.', error);
      if (cloudErrorStatus(error) === 401) setAccountOpen(true);
      if (cloudErrorStatus(error) !== 404) strudel.setError(t('requestFailed'));
    }
  }, [auth.user, cloudHistoryItems, openCloudSession, sessions, strudel, upsertCloudHistorySummary]);

  const handleOpenFavoriteInStudio = useCallback((code: string) => {
    if (!auth.user) {
      setAccountOpen(true);
      return;
    }
    void sessions.importSession({
      /* A new session that happens to start on this code — nothing of the
         conversation that wrote it, not its name and not its exchange. What is
         kept is an archive: it is finished, it is read where it is kept, and it
         does not move. Carrying it over would put a second copy of it in the
         history to drift away from the one on the Favorites page, under a name
         that says it is that conversation when it is not one yet. So the studio
         opens the way it opens for anything: its own title, its own opening
         line, and the code loaded and ready to be played with. */
      title: t('newSessionTitle'),
      code,
      messages: [makeGreetingMessage()],
    }).then(() => handlePrimaryNavSelect('home')).catch((error) => {
      console.warn('[favorites] failed to continue snapshot.', error);
      strudel.setError(t('favoriteActionFailed'));
    });
  }, [auth.user, handlePrimaryNavSelect, sessions, strudel]);

  const handleSelectFavorite = useCallback((summary: FavoriteSummary) => {
    if (!auth.user) {
      setAccountOpen(true);
      return;
    }
    /* The studio session's flush runs alongside the open, not in front of it.
       Reading a favorite never touches the studio's session — the detail is
       not accepted into it — so the two have no order between them, and the
       flush is durable enough to finish on its own. Waiting on a network write
       before the first local read is what put a spinner on a page whose
       contents this device already has. */
    if (sessions.currentId && sessions.currentId !== summary.id) {
      void persistAndFlushOutgoingSession(sessions.currentId, strudel.code);
    }
    setSelectedFavoriteId(summary.id);
    void openCloudFavorite(summary).catch((error) => {
      if (cloudErrorStatus(error) === 401) setAccountOpen(true);
    });
  }, [auth.user, openCloudFavorite, persistAndFlushOutgoingSession, sessions.currentId, strudel.code]);

  const retrySelectedFavorite = useCallback(() => {
    void retryCloudDetail().catch((error) => {
      if (cloudErrorStatus(error) === 401) setAccountOpen(true);
    });
  }, [retryCloudDetail]);

  useEffect(() => {
    if (!auth.user || primaryNavItem !== 'favorites' || !cloudLibraryEnabled) return;
    void ensureCloudFavorites().catch((error) => {
      if (cloudErrorStatus(error) === 401) setAccountOpen(true);
    });
  }, [auth.user, cloudLibraryEnabled, ensureCloudFavorites, primaryNavItem]);

  useEffect(() => {
    const errors = [
      cloudHistoryInitialError,
      cloudHistoryMoreError,
      cloudFavoritesInitialError,
      cloudFavoritesMoreError,
      cloudDetailError?.error,
    ];
    if (auth.user && errors.some((error) => cloudErrorStatus(error) === 401)) {
      setAccountOpen(true);
    }
  }, [auth.user, cloudDetailError, cloudFavoritesInitialError, cloudFavoritesMoreError, cloudHistoryInitialError, cloudHistoryMoreError]);

  /* "Take me there" — the page the conversation is on now, opened on it. Only
     the two reversible moves have one; a deletion has nowhere to go. */
  const viewFavoriteNotice = useCallback(() => {
    if (!favoriteNotice) return;
    const noticeToView = favoriteNotice;
    const { kind, session, favorite } = noticeToView;
    setFavoriteNotice(null);
    if (kind === 'kept') {
      setFavoritesFocus({ id: favorite.id });
      handlePrimaryNavSelect('favorites');
      return;
    }
    if (kind === 'released' && session) {
      // "View" is another way of accepting the release, not an undo. Commit
      // the session state before returning to Studio so it re-enters history.
      void (async () => {
        const committed = await commitPendingDelete(noticeToView);
        if (!committed) return;
        if (auth.user) {
          const releasedSession = { ...session };
          delete releasedSession.favoritedAt;
          await sessions.acceptCloudDetail(releasedSession);
        } else {
          await handleSwitchSession(session.id);
        }
        handlePrimaryNavSelect('home');
      })().catch((error) => {
        console.warn('[favorites] failed to open released session.', error);
        if (auth.user && cloudErrorStatus(error) === 401) setAccountOpen(true);
        strudel.setError(t('requestFailed'));
      });
    }
  }, [auth.user, commitPendingDelete, favoriteNotice, handlePrimaryNavSelect, handleSwitchSession, sessions, strudel]);

  const responsiveLayout = isMobile ? (
      <div className="flex flex-col bg-bg-primary overflow-hidden" style={{ height: '100%', width: '100%' }}>
        {apiKeyModalOpen && (
          <ApiKeyModal
            onClose={closeApiKeyModal}
            onSaved={resetClient}
            required={!hasApiKeyConfigured()}
          />
        )}

        {/* ── Top Nav ── */}
        <div
          className="relative flex items-center justify-between px-2 shrink-0"
          style={{ paddingTop: 'max(12px, env(safe-area-inset-top))', paddingBottom: '12px' }}
        >
          <div className="flex items-center">
            <button
              onClick={handleNewSession}
              className="w-8 h-8 flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors"
              aria-label={t('newSession')}
              title={t('newSession')}
            >
              <PlusIcon size={18} />
            </button>
            <button
              onClick={() => setHistoryOpen(true)}
              className="w-8 h-8 flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors"
              aria-label={t('sessionHistory')}
              title={t('sessionHistory')}
            >
              <HistoryIcon size={18} />
            </button>
          </div>
          <h1 className="text-[24px] absolute left-1/2 -translate-x-1/2" style={{
            background: 'linear-gradient(to bottom, var(--color-logo-top), var(--color-logo-bottom))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            <span style={{ fontFamily: "'Baskervville', serif", fontStyle: 'italic' }}>odde</span>
            <span style={{ fontFamily: "'42dot Sans', sans-serif", fontWeight: 800 }}>Nova</span>
          </h1>
          <TopActionBar
            onOpenSettings={openSettings}
            onOpenAccount={() => setAccountOpen(true)}
            accountLabel={accountLabel}
            session={sessions.currentSession}
            code={strudel.code}
            messages={messages}
            engineReady={strudel.engineReady}
            hasCode={!!strudel.code}
            exportState={strudel.exportState}
            onExport={strudel.exportWav}
            onGenerateTitle={generateSongTitle}
            onResetExportState={strudel.resetExportState}
            bpm={currentBpm}
          />
        </div>

        {/* ── Conversation ── */}
        {/* mb-3 keeps the stream from clipping flush against the rule below —
            this is where messages get cut off as they scroll, so butting it
            straight up to the line read as cramped. */}
        {/* The stream's own surface, re-declared to the page's. On desktop the
            conversation is cut into a flat panel and everything that has to
            paint over it — the end fades, the sticky reasoning header's band —
            fades out to `--color-conversation-surface`, which is that panel's
            fill. Here there is no panel: the stream stands directly on the
            page, so the same token has to name the page's own ground or those
            bands are a slab of the wrong colour laid across the ends of the
            reading. Scoped by re-declaring the token on the wrapper, the way
            the code bar and the rollback key do, so the studio's panel keeps
            its fill everywhere else. */}
        <div
          className="flex-1 min-h-0 overflow-hidden mb-5"
          style={{ ['--color-conversation-surface' as string]: 'var(--color-bg-primary)' }}
        >
          <ConversationView
            key={sessions.currentId ?? 'default'}
            messages={messages}
            revisions={sessions.currentSession?.revisions}
            isLoading={isLoading}
            onRollback={handleRollback}
            onBranch={sessions.branchFromMessage}
            onRetry={handleRetry}
          />
        </div>

        {/* ── Code Drawer ── */}
        {/* No border of its own: CodePanel already draws a full border, and a
            border-t here would survive the 0-height collapsed state as a stray
            line 6px below the rule. */}
        <div
          className="shrink-0 overflow-hidden"
          style={{
            height: mobileDrawerHeight,
            // Lands CodePanel's bottom border exactly on the rule the bottom bar
            // draws at -6px, so the two are the same row of pixels and read as
            // one line. The border sits in the last 1px *inside* the drawer's
            // box, so the box has to stop at -5, not -6.
            //
            // Constant, never animated: while this transitioned alongside height
            // the border travelled from 0 to its resting place and showed as a
            // second line for the length of the animation. Only height moves now,
            // so the border stays pinned to the rule throughout. The conversation
            // above is flex-1, so it gives up the 5px and the bar doesn't move.
            marginBottom: 5,
            transition: 'height 0.3s cubic-bezier(0.4,0,0.2,1)',
          }}
        >
          <div className="h-full flex flex-col">
            <div className="flex-1 min-h-0">
              <CodePanel
                code={strudel.code}
                error={strudel.error}
                isPlaying={strudel.isPlaying}
                isPaused={strudel.isPaused}
                engineReady={strudel.engineReady}
                accentColor={strudel.accentColor}
                session={sessions.currentSession}
                messages={messages}
                exportState={strudel.exportState}
                onExport={strudel.exportWav}
                onGenerateTitle={generateSongTitle}
                onResetExportState={strudel.resetExportState}
                bpm={currentBpm}
                onMount={strudel.setRoot}
                onPlay={handlePlay}
                onPause={strudel.pause}
                isDirty={strudel.isDirty}
                activeCode={strudel.activeCode}
                onUpdate={() => { void handleUpdate(); }}
                onEditorFocusChange={handleCodeFocusChange}
                syncStatus={visibleSyncStatus}
                showSyncStatus={showSessionSyncStatus}
              />
            </div>
          </div>
        </div>

        {/* ── Bottom Bar ── */}
        <div
          className="relative shrink-0 px-3 pt-3"
          style={{
            paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
            transform: shouldLiftBottomBar ? `translateY(-${keyboardHeight}px)` : undefined,
            transition: 'transform 0.3s ease-out',
          }}
        >
          {/* The rule the row below straddles, drawn 6px above this bar rather
              than as its border-t so it lands on the row's centre line in both
              drawer states. Kept inside the bar so it still rides along when the
              keyboard lifts it; a sibling of the drawer would stay behind. */}
          <div className="absolute -top-1.5 left-0 right-0 border-t border-border" />

          {/* Transport and code pill both ride the rule above, positioned
              independently: the transport flush left, the pill centred in the
              bar. Both are 28px tall so they straddle the rule and hide the
              stretch behind them with their own background. The transport lives
              here rather than in CodePanel's footer so it stays reachable
              whether or not the code drawer is open.

              Only the pill is centred; the transport hangs off its left edge via
              right-full rather than an offset of its own, so the 20px gap holds
              when the label swaps between 查看代码 / 收起代码 and changes width. */}
          <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 -translate-y-1/2 h-7">
            <button
              onClick={handleMobileTransportClick}
              disabled={mobileTransportDisabled}
              // Dimmed by darkening the glyph itself, not by opacity: the icons
              // fill from currentColor, so only the triangle/square goes down in
              // brightness while the ring and background stay put.
              className={`absolute right-full top-0 mr-3 flex w-7 h-7 items-center justify-center rounded-full border border-border bg-bg-primary disabled:cursor-not-allowed ${
                mobileTransportDisabled ? 'text-text-muted' : 'text-action-fill'
              }`}
              aria-label={strudel.isPlaying ? t('pause') : t('play')}
              title={strudel.isPlaying ? t('pause') : t('play')}
            >
              {strudel.isPlaying ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
            </button>
            <button
              onClick={() => setDrawerOpen((v) => !v)}
              className="flex h-7 items-center rounded-full border border-border bg-bg-primary px-4 text-[12px] text-text-secondary hover:text-text-primary transition-colors"
            >
              {drawerOpen ? t('collapseCode') : t('viewCode')}
            </button>
          </div>

          {/* Input. Suggestions ride inside it as the animated placeholder, same
              as desktop — mobile adopts one by focusing the field rather than
              with Tab, so no separate chip row. */}
          <div className="mt-3">
            <ChatInput
              isLoading={isLoading}
              engineReady={strudel.engineReady}
              engineStatus={strudel.engineStatus}
              onSendText={handleChatInstruction}
              onStop={handleStop}
              onReinitEngine={strudel.reinit}
              prefill={rollbackPrefill}
              focusTrigger={inputFocusTrigger}
              onFocusChange={handleChatFocusChange}
              inputMode={current?.inputMode ?? 'normal'}
              suggestions={isVideoMode ? [] : visibleSuggestions}
              isVideoMode={isVideoMode}
            />
          </div>
        </div>

        {/* ── History Dropdown ── */}
        {historyOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setHistoryOpen(false)} />
            <div
              className="mobile-dropdown-panel fixed z-40 rounded-region overflow-hidden flex flex-col shadow-lg"
              style={{
                top: 'calc(max(12px, env(safe-area-inset-top)) + 44px)',
                left: '12px',
                width: '200px',
                maxHeight: '40dvh',
                // The history search bar sticks to the top of this dropdown,
                // so it has to be drawn on the dropdown's own ground.
                ['--history-search-bg' as string]: 'var(--color-bg-primary)',
              }}
            >
              <div className="flex-1 overflow-y-auto min-h-0">
                <HistoryPanel
                  sessions={historyItems}
                  currentId={sessions.currentId}
                  isLoading={historyInitialLoading}
                  initialError={historyInitialError}
                  onRetryInitial={auth.user ? cloudLibrary.history.retryInitial : undefined}
                  onSwitch={(id) => { handleSwitchSession(id); setHistoryOpen(false); }}
                  onDelete={handleDeleteSession}
                  onRename={(id, title) => { void handleRenameSession(id, title); }}
                  onLoadMore={auth.user ? loadMoreCloudHistory : undefined}
                  hasMore={historyHasMore}
                  isLoadingMore={historyLoadingMore}
                  loadMoreError={historyLoadMoreError}
                  onRetryLoadMore={auth.user ? cloudLibrary.history.retryMore : undefined}
                  loadingSessions={loadingSessions}
                  unreadSessions={unreadSessions}
                />
              </div>
            </div>
          </>
        )}
        {importStatus === 'loading' && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-bg-primary/80">
            <span className="text-text-secondary text-sm">{t('loadingShare')}</span>
          </div>
        )}
        {importStatus === 'error' && !importErrorDismissed && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-bg-primary/90">
            <span className="text-red-400 text-sm">{t('shareLoadFailed')}</span>
            <div className="flex gap-3">
              <button
                onClick={() => { handleNewSession(); setImportErrorDismissed(true); }}
                className="px-4 py-1.5 text-sm rounded border border-border text-text-primary hover:border-accent/50 transition-colors"
              >
                {t('newSession')}
              </button>
              <button
                onClick={() => setImportErrorDismissed(true)}
                className="px-4 py-1.5 text-sm rounded border border-border text-text-secondary hover:text-text-primary hover:border-accent/50 transition-colors"
              >
                {t('close')}
              </button>
            </div>
          </div>
        )}
        {accountOverlays}
      </div>
    ) : (
    <div
      // `relative z-0` owns the desktop layer stack. Featured then isolates its
      // background at 0, content at 10, player at 20 and PrimaryNav at 30.
      className="relative z-0 flex h-full w-full overflow-hidden bg-bg-primary p-region"
      style={{ cursor: isDragging === 'h' ? 'col-resize' : isDragging === 'v' ? 'row-resize' : undefined, userSelect: isDragging ? 'none' : undefined }}
    >
      {apiKeyModalOpen && (
        <ApiKeyModal
          onClose={closeApiKeyModal}
          onSaved={resetClient}
          required={!hasApiKeyConfigured()}
        />
      )}
      {accountOverlays}
      <PrimaryNav
        selectedItem={primaryNavItem}
        onSelect={handlePrimaryNavSelect}
        featuredPieceOpen={featuredPieceOpen}
        accountInitials={accountInitials(auth.user)}
      />

      <>
        {/* The gallery pages run full width — they are not two-pane workspaces —
            so the column and its resize handle step aside there. Everything in
            them stays mounted, so drafts and local UI state survive the trip. */}
        <div
          style={{ width: sidebarCollapsed ? 0 : sidebarWidth, flexShrink: 0 }}
          className={FULL_WIDTH_PAGES.has(primaryNavItem) ? 'hidden' : 'h-full overflow-hidden'}
        >
          <div className={primaryNavItem === 'home' ? 'h-full' : 'hidden'}>
            <Sidebar
              title={isVideoMode && videoTitle ? videoTitle : (isReplaying && !replayMessages.some((m) => m.role === 'user') ? t('newSessionTitle') : (current?.title ?? t('newSessionTitle')))}
              messages={videoDemoMsgs ?? messages}
              revisions={current?.revisions}
              isLoading={isLoading || isReplaying}
              engineReady={strudel.engineReady}
              engineStatus={strudel.engineStatus}
              sessions={historyItems}
              currentId={sessions.currentId}
              inputMode={current?.inputMode ?? 'normal'}
              suggestions={isVideoMode ? [] : visibleSuggestions}  // [video] Hide suggestion chips in video mode to avoid obscuring the frame
              isVideoMode={isVideoMode}
              scrollBottom={videoConvScrollBottom}  // [video] Forward the scene-change scroll-to-bottom signal
              onSendText={handleChatInstruction}
              onStop={handleStop}
              onNewSession={handleNewSession}
              onMoodGenerate={handleMoodInstruction}
              onReinitEngine={strudel.reinit}
              loadingSessions={loadingSessions}
              unreadSessions={unreadSessions}
              onSwitchSession={handleSwitchSession}
              onDeleteSession={handleDeleteSession}
              onRenameSession={handleRenameSession}
              onFavoriteSession={handleFavoriteSession}
              isHistoryLoading={historyInitialLoading}
              historyInitialError={historyInitialError}
              onRetryHistory={auth.user ? cloudLibrary.history.retryInitial : undefined}
              historyHasMore={historyHasMore}
              historyLoadingMore={historyLoadingMore}
              historyLoadMoreError={historyLoadMoreError}
              onLoadMoreHistory={auth.user ? loadMoreCloudHistory : undefined}
              onRetryLoadMoreHistory={auth.user ? cloudLibrary.history.retryMore : undefined}
              onReplay={current ? () => { strudel.stop(); strudel.setCode(''); startReplay(current); } : undefined}
              isReplaying={isReplaying}
              replayInputText={replayInputText}
              prefill={rollbackPrefill}
              prefillTrigger={inputFocusTrigger}
              onRollback={handleRollback}
              onBranch={sessions.branchFromMessage}
              onRetry={handleRetry}
            />
          </div>
          <div className={primaryNavItem === 'settings' ? 'h-full' : 'hidden'}>
            <SettingsSidebar
              selectedSection={settingsSection}
              onSelect={setSettingsSection}
              hints={settingsHints}
            />
          </div>
        </div>

        {/* Horizontal resize handle. Dragged shut it gives up its own width
            too, so the studio's left edge lands exactly where the conversation
            column's left edge was — the grab strip then hangs over the studio
            instead of holding a gap open, and dragging it right brings the
            column back. */}
        <div
          {...hDragHandlers}
          data-resize-handle="horizontal"
          data-collapsed={sidebarCollapsed || undefined}
          className={
            FULL_WIDTH_PAGES.has(primaryNavItem)
              ? 'hidden'
              : `relative h-full shrink-0 ${sidebarCollapsed ? 'w-0' : 'w-divider'}`
          }
          style={{ cursor: 'col-resize' }}
        >
          {sidebarCollapsed && (
            /* Reaching back over the gutter PrimaryNav holds open (`mr-region`,
               which nothing else claims once the column is shut), so the whole
               strip of ground between the nav and the studio takes the
               col-resize cursor instead of a 6px seam at the studio's edge. */
            <span
              aria-hidden="true"
              className="absolute inset-y-0 z-20"
              style={{
                left: 'calc(-1 * var(--spacing-region))',
                width: 'calc(var(--spacing-region) + var(--spacing-divider))',
              }}
            />
          )}
        </div>

        <main ref={mainRef} className="flex min-w-0 flex-1 flex-col">
          {/* Hidden rather than unmounted on the other destinations: the audio
              engine is bound to CodePanel's editor, and unmounting it would
              tear that binding down — including under a featured audition,
              which plays through this very editor. */}
          <div className={primaryNavItem === 'home' ? 'flex h-full min-h-0 flex-col' : 'hidden'}>
            <div className="flex-1 min-h-0">
              <CodePanel
                code={strudel.code}
                error={strudel.error}
                isPlaying={strudel.isPlaying}
                isPaused={strudel.isPaused}
                engineReady={strudel.engineReady}
                accentColor={strudel.accentColor}
                session={sessions.currentSession}
                messages={messages}
                exportState={strudel.exportState}
                onExport={strudel.exportWav}
                onGenerateTitle={generateSongTitle}
                onResetExportState={strudel.resetExportState}
                bpm={currentBpm}
                onMount={strudel.setRoot}
                onPlay={handlePlay}
                onPause={strudel.pause}
                isDirty={strudel.isDirty}
                activeCode={strudel.activeCode}
                onUpdate={() => { void handleUpdate(); }}
                vizEnabled={studioAnimationVisible}
                vizCollapsed={vizCollapsed}
                onToggleViz={toggleVizCollapsed}
                syncStatus={visibleSyncStatus}
                showSyncStatus={showSessionSyncStatus}
              />
            </div>

            {/* Resize handle + viz pane slide shut together, so CodePanel's
                footer travels down to the bottom edge of the window with them.
                The handle rides inside the animated box rather than beside it;
                clipped to zero height it also stops being grabbable.

                The transition is dropped mid-drag: there, every pointer move
                sets a new height, and easing would trail the cursor.

                Unmounted outright — not collapsed — when Settings → Appearance
                turns the studio animation off: collapsing keeps the iframe
                alive to preserve the one galaxy it generated, and that is only
                worth paying for while the pane is something you can reopen. */}
            {studioAnimationVisible && (
              <div
                data-testid="viz-pane"
                className={`flex shrink-0 flex-col overflow-hidden ${
                  isDragging === 'v'
                    ? ''
                    : 'transition-[height] duration-[320ms] ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none'
                }`}
                style={{ height: vizCollapsed ? 0 : vizHeight + VIZ_DIVIDER_HEIGHT }}
              >
                <div
                  {...vDragHandlers}
                  data-resize-handle="vertical"
                  className="h-divider shrink-0"
                  style={{ cursor: 'row-resize' }}
                />

                {/* Always mounted, even collapsed: remounting rebuilds the
                    galaxy from scratch, so it would come back a different one. */}
                <div className="min-h-0 flex-1">
                  <VizPlaceholder isPlaying={strudel.isPlaying} />
                </div>
              </div>
            )}
          </div>
          <div className={primaryNavItem === 'featured' ? 'flex h-full min-h-0' : 'hidden'}>
            <FeaturedPage
              pieces={FEATURED_PIECES}
              currentPiece={featuredPiece}
              playingId={featuredPreview.playingId}
              pausedId={featuredPreview.pausedId}
              engineReady={strudel.engineReady}
              opening={openingFeatured}
              onPlay={handleFeaturedPlay}
              onSelect={handleFeaturedSelect}
              onStop={featuredPreview.stop}
              onPause={featuredPreview.pause}
              onOpenInStudio={(piece) => void handleOpenFeaturedInStudio(piece)}
              onOpenChange={setFeaturedPieceOpen}
            />
          </div>
          <div className={primaryNavItem === 'favorites' ? 'flex h-full min-h-0' : 'hidden'}>
            <FavoritesPage
              // Hidden rather than unmounted when you leave, so the page has
              // to be told when it is the one being looked at.
              active={primaryNavItem === 'favorites'}
              conversations={undefined}
              summaries={auth.user ? cloudFavoriteConversations : undefined}
              selectedId={auth.user ? selectedFavoriteId : undefined}
              detail={auth.user ? selectedAccountFavorite : undefined}
              focus={favoritesFocus}
              /* Both are the empty page's business only, the way the history
                 panel's are. Rows on screen — last visit's or this one's — are
                 the page; a request still out behind them is not a spinner,
                 and one that failed behind them is not an apology in place of
                 what the device already has. Saying otherwise would also hold
                 the first entry shut, since a page that is loading or broken
                 has nothing to open. */
              isLoading={Boolean(
                auth.user
                && cloudFavoriteConversations.length === 0
                && (!cloudLibraryEnabled || cloudLibrary.favorites.initialStatus === 'loading'),
              )}
              error={auth.user && cloudFavoriteConversations.length === 0
                ? cloudLibrary.favorites.initialError
                : null}
              onRetry={auth.user ? cloudLibrary.favorites.retryInitial : undefined}
              detailLoading={Boolean(auth.user && selectedAccountFavoriteSummary && !selectedAccountFavorite && !selectedAccountFavoriteError)}
              detailError={auth.user ? selectedAccountFavoriteError : null}
              onRetryDetail={auth.user ? retrySelectedFavorite : undefined}
              hasMore={auth.user ? cloudLibrary.favorites.nextCursor !== null : false}
              isLoadingMore={Boolean(auth.user && cloudLibrary.favorites.moreStatus === 'loading')}
              loadMoreError={auth.user ? cloudLibrary.favorites.moreError : null}
              onLoadMore={auth.user ? loadMoreCloudFavorites : undefined}
              onRetryLoadMore={auth.user ? cloudLibrary.favorites.retryMore : undefined}
              /* Withheld until the library can actually answer: the page opens
                 its first entry the moment one is on screen, and an open that
                 throws because the library is still coming up is an open the
                 page counts as done. Handing it down when the library is ready
                 is what asks for that first entry again. */
              onSelect={auth.user && cloudLibraryEnabled ? handleSelectFavorite : undefined}
              isPlaying={strudel.isPlaying}
              playingCode={strudel.code}
              onPlayCode={auth.user ? (code) => { void strudel.play(code); } : undefined}
              onStopCode={auth.user ? strudel.stop : undefined}
              onUnfavorite={auth.user ? handleUnfavorite : undefined}
              onDelete={auth.user ? handleDeleteFavorite : undefined}
              onOpenInStudio={auth.user ? handleOpenFavoriteInStudio : undefined}
            />
          </div>
          <div className={primaryNavItem === 'settings' ? 'flex h-full min-h-0' : 'hidden'}>
            {settingsSection === 'model' ? (
              <ModelSettingsPanel
                activeProvider={modelSettings.activeProvider}
                draft={modelSettings.draft}
                isDirty={modelSettings.selectedIsDirty}
                onSave={modelSettings.saveSelectedProvider}
                onSelectProvider={modelSettings.selectProvider}
                onUpdate={(patch) => modelSettings.updateDraft(modelSettings.selectedProvider, patch)}
                provider={modelSettings.selectedProvider}
                saveStatus={modelSettings.saveStatus}
              />
            ) : (
              <AppearanceSettingsPanel />
            )}
          </div>
        </main>
      </>
      {importStatus === 'loading' && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-bg-primary/80">
          <span className="text-text-secondary text-sm">{t('loadingShare')}</span>
        </div>
      )}
      {importStatus === 'error' && !importErrorDismissed && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-bg-primary/90">
          <span className="text-red-400 text-sm">{t('shareLoadFailed')}</span>
          <div className="flex gap-3">
            <button
              onClick={() => { handleNewSession(); setImportErrorDismissed(true); }}
              className="px-4 py-1.5 text-sm rounded border border-border text-text-primary hover:border-accent/50 transition-colors"
            >
              {t('newSession')}
            </button>
            <button
              onClick={() => setImportErrorDismissed(true)}
              className="px-4 py-1.5 text-sm rounded border border-border text-text-secondary hover:text-text-primary hover:border-accent/50 transition-colors"
            >
              {t('close')}
            </button>
          </div>
        </div>
      )}
      <Analytics />
      <SpeedInsights />
    </div>
  );

  return (
    <>
      <OddeNovaImportNotice result={oddeNovaImportResult} />
      {responsiveLayout}
      {/* Outside both layouts: it is about a conversation rather than about a
          page, and it blurs whichever one you were on when you moved it. */}
      {favoriteNotice && (
        <FavoriteActionDialog
          key={favoriteNotice.id}
          kind={favoriteNotice.kind}
          title={conversationTitle(favoriteNotice.favorite)}
          onView={favoriteNotice.kind === 'deleted' ? undefined : viewFavoriteNotice}
          onUndo={undoFavoriteNotice}
          onClose={dismissFavoriteNotice}
        />
      )}
    </>
  );
}
