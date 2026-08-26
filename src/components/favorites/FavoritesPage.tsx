import { useMemo, useState, type ReactNode } from 'react';
import { t } from '../../lib/i18n';
import {
  conversationTitle,
  favoriteConversationMessages,
  favoriteScripts,
  favoritedTimeLabel,
  type FavoriteConversation,
  type FavoriteScript,
} from '../../lib/favorite-conversations';
import { CheckIcon, CopyIcon } from '../icons';
import ArchivedConversationView from '../conversation/ArchivedConversationView';

interface FavoritesPageProps {
  conversations: readonly FavoriteConversation[];
  isPlaying?: boolean;
  playingCode?: string;
  onPlayCode?: (code: string) => void;
  onStopCode?: () => void;
}

interface PanelProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}

function Panel({ title, action, className = '', children, ...rest }: PanelProps) {
  return (
    <section
      aria-label={title}
      className={`flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[9px] border border-border bg-conversation-surface p-5 ${className}`}
      {...rest}
    >
      {/* mt-[42px] reuses the same reserved-space convention as the
          conversation panel's own pt-[42px] (see ArchivedConversationView),
          so this title bar's content lines up with the top of the first
          user bubble over there instead of sitting flush with the panel's
          own top edge. */}
      <div className="mb-5 mt-[42px] flex h-9 shrink-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-2.5">
          <h2 className="truncate text-lg font-medium uppercase tracking-[0.08em] text-text-primary">
            {title}
          </h2>
        </div>
        {action}
      </div>
      <div className="-mr-3.5 min-h-0 flex-1 overflow-auto pr-3.5">{children}</div>
    </section>
  );
}

function FavoritesSidebar({
  conversations,
  onSelect,
  selectedId,
}: {
  conversations: readonly FavoriteConversation[];
  onSelect: (conversation: FavoriteConversation) => void;
  selectedId: string | null;
}) {
  return (
    <aside className="flex h-full w-[clamp(220px,22vw,300px)] shrink-0 flex-col overflow-hidden rounded-region border border-border bg-conversation-surface">
      <header className="px-4 pb-6 pt-[14px]">
        <h1 className="text-lg font-bold text-text-primary">{t('navFavorites')}</h1>
      </header>

      <nav aria-label={t('favoritesList')} className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <ul className="space-y-1" data-testid="favorites-list">
          {conversations.map((conversation) => {
            const selected = selectedId === conversation.id;
            return (
              <li key={conversation.id}>
                <button
                  type="button"
                  data-favorite-id={conversation.id}
                  aria-current={selected ? 'page' : undefined}
                  onClick={() => onSelect(conversation)}
                  style={{ height: 52 }}
                  className={`group flex h-[52px] w-full flex-col justify-center rounded-[5px] px-2 py-0 text-left outline-none transition-[background-color,color,transform] duration-150 ease-[cubic-bezier(0.25,1,0.5,1)] focus-visible:ring-2 focus-visible:ring-text-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-[#0D0D0D] active:scale-[0.99] motion-reduce:transition-none ${
                    selected
                      ? 'bg-white/[0.09] text-text-primary'
                      : 'text-text-secondary hover:bg-white/[0.045] hover:text-text-primary'
                  }`}
                >
                  <span className="block w-full truncate text-sm font-medium">
                    {conversationTitle(conversation)}
                  </span>
                  <time
                    dateTime={new Date(conversation.favoritedAt).toISOString()}
                    className="mt-0.5 block truncate text-[10px] tabular-nums text-text-muted"
                  >
                    {favoritedTimeLabel(conversation.favoritedAt)}
                  </time>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}

function CodePanel({ script }: { script: FavoriteScript | null }) {
  const [copied, setCopied] = useState(false);

  if (!script) {
    return (
      <Panel className="h-full flex-[1.1]" title={t('featuredCode')}>
        <div className="flex h-full items-center justify-center px-6 text-center text-xs leading-5 text-text-muted">
          {t('favoritesNoCode')}
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      data-favorites-script={script.turnId}
      className="h-full flex-[1.1]"
      title={t('favoritesCodeColumn').replace('{n}', String(script.take))}
      action={
        <button
          type="button"
          aria-label={t('copyCode')}
          title={t('copyCode')}
          onClick={() => {
            navigator.clipboard?.writeText(script.code).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2000);
            }).catch(() => { /* A refused clipboard is not worth a dialog. */ });
          }}
          className="grid size-8 shrink-0 place-items-center rounded-full text-text-secondary transition-colors hover:bg-white/10 hover:text-text-primary"
        >
          {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
        </button>
      }
    >
      <pre
        className="whitespace-pre text-[12px] text-text-secondary"
        style={{ fontFamily: "'ABeeZee', monospace", lineHeight: 1.7, letterSpacing: '0.04em' }}
      >
        <code>{script.code}</code>
      </pre>
    </Panel>
  );
}

/**
 * Favorites is a settings-like workspace: a persistent collection index on
 * the left and the selected conversation on the right. The conversation and
 * its current code take are parallel reading surfaces, so neither replaces
 * the other and comparing what was asked with what was committed stays direct.
 */
export default function FavoritesPage({
  conversations,
  isPlaying = false,
  playingCode = '',
  onPlayCode = () => {},
  onStopCode = () => {},
}: FavoritesPageProps) {
  const sortedConversations = useMemo(
    () => [...conversations].sort((left, right) => right.favoritedAt - left.favoritedAt),
    [conversations],
  );
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(
    () => sortedConversations[0]?.id ?? null,
  );
  const [selectedScriptTurnId, setSelectedScriptTurnId] = useState<string | null>(null);

  const current = sortedConversations.find(
    (conversation) => conversation.id === selectedConversationId,
  ) ?? sortedConversations[0] ?? null;
  const scripts = useMemo(() => (current ? favoriteScripts(current) : []), [current]);
  const archiveMessages = useMemo(
    () => (current ? favoriteConversationMessages(current) : []),
    [current],
  );
  const selectedScript = scripts.find((script) => script.turnId === selectedScriptTurnId)
    ?? scripts.at(-1)
    ?? null;
  const playingCodeMessageId = isPlaying
    ? scripts.find((script) => script.code === playingCode)?.turnId ?? null
    : null;

  const selectConversation = (conversation: FavoriteConversation) => {
    const conversationScripts = favoriteScripts(conversation);
    setSelectedConversationId(conversation.id);
    setSelectedScriptTurnId(conversationScripts.at(-1)?.turnId ?? null);
  };

  return (
    <main data-testid="favorites-page" className="flex h-full min-w-0 flex-1 gap-[var(--spacing-divider)] overflow-hidden">
      <FavoritesSidebar
        conversations={sortedConversations}
        selectedId={current?.id ?? null}
        onSelect={selectConversation}
      />

      <section
        data-testid="favorites-conversation-panel"
        aria-label={t('favoritesConversation')}
        className="flex h-full min-w-0 flex-[0.9] flex-col overflow-hidden rounded-region border border-border bg-conversation-surface pb-[14px] pt-[42px]"
      >
        <div className="min-h-0 flex-1">
          {current === null ? (
            <div className="flex h-full items-center justify-center text-base text-text-secondary">
              {t('favoritesEmptyTitle')}
            </div>
          ) : (
            <ArchivedConversationView
              messages={archiveMessages}
              selectedCodeMessageId={selectedScript?.turnId ?? null}
              onSelectCode={setSelectedScriptTurnId}
              playingCodeMessageId={playingCodeMessageId}
              onPlayCode={(messageId, code) => {
                setSelectedScriptTurnId(messageId);
                onPlayCode(code);
              }}
              onStopCode={onStopCode}
            />
          )}
        </div>
      </section>

      <CodePanel
        key={selectedScript?.turnId ?? `${current?.id ?? 'favorites'}-empty`}
        script={selectedScript}
      />
    </main>
  );
}
