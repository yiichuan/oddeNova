import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from './useChat';
import { buildSuggestions, STATIC_SUGGESTIONS } from '../services/suggestions';

type Persisted = { forCode: string; items: string[] };

function randomStatic(): string[] {
  return [...STATIC_SUGGESTIONS].sort(() => Math.random() - 0.5).slice(0, 2);
}

// Persisted chips are only usable when they were generated for the code we're
// showing now; otherwise they're stale (commit writes code, then generates
// suggestions asynchronously — a refresh in that window leaves them mismatched).
function restoredFor(persisted: Persisted | undefined, currentCode: string): string[] | null {
  if (persisted && persisted.forCode === currentCode && persisted.items.length > 0) {
    return persisted.items.slice(0, 2);
  }
  return null;
}

/**
 * Manages the "next-step" suggestion chips shown above the input box.
 *
 * Strategy (mixed):
 *   - When the conversation has no user messages yet → static defaults.
 *   - On mount / session switch, if the session has persisted suggestions
 *     generated for the current code → restore them and skip the LLM call
 *     (survives a page refresh without a fresh request).
 *   - After each agent commit (i.e. current.code / session committed code changed and
 *     is non-empty) → fetch 2 fresh suggestions from the LLM with music state + style
 *     intent context. NOTE: live editor edits and BPM changes do NOT trigger a refetch;
 *     only committed code (set via sessions.setCurrentCode()) does.
 *
 * Whenever fresh (LLM or commit-provided) suggestions are produced, `onSuggestions`
 * is invoked so the caller can persist them onto the session.
 *
 * `key` is used to bust the cache when switching sessions, so we don't
 * carry the previous session's chips into the new one.
 */
export function useSuggestions(opts: {
  key: string;
  currentCode: string;
  hasUserMessages: boolean;
  messages: ChatMessage[];
  enabled?: boolean;
  /** When provided (from commit explanation), use directly and skip LLM call. */
  commitSuggestions?: string[];
  /** Suggestions persisted on the session from a previous page load. */
  persisted?: Persisted;
  /** Called with fresh suggestions + the code they were generated for, so the caller can persist them. */
  onSuggestions?: (items: string[], forCode: string) => void;
}) {
  const {
    key,
    currentCode,
    hasUserMessages,
    messages,
    enabled = true,
    commitSuggestions,
    persisted,
    onSuggestions,
  } = opts;
  const [suggestions, setSuggestions] = useState<string[]>(
    () => restoredFor(persisted, currentCode) ?? randomStatic(),
  );
  const [loading, setLoading] = useState(false);
  const [prevKey, setPrevKey] = useState(key);
  const reqIdRef = useRef(0);
  const lastCodeRef = useRef<string>('');
  // Use a ref for messages so it's always fresh inside the effect without
  // re-triggering it on every progress message update.
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  // Always hold the latest commitSuggestions so we can read it inside the effect
  // without adding it to the deps array (avoids spurious re-runs).
  const commitSuggestionsRef = useRef(commitSuggestions);
  commitSuggestionsRef.current = commitSuggestions;
  const persistedRef = useRef(persisted);
  persistedRef.current = persisted;
  const onSuggestionsRef = useRef(onSuggestions);
  onSuggestionsRef.current = onSuggestions;

  // Emit fresh suggestions to the caller (for persistence) and show them.
  const publish = (items: string[], forCode: string) => {
    setSuggestions(items);
    onSuggestionsRef.current?.(items, forCode);
  };

  // Reset when switching sessions.
  if (prevKey !== key) {
    setPrevKey(key);
    setSuggestions(restoredFor(persisted, currentCode) ?? randomStatic());
    setLoading(false);
  }

  // Reset lastCodeRef when key changes (safe to access refs inside effects).
  // If the session's persisted suggestions match the current code, prime it so
  // the fetch effect below short-circuits instead of calling the LLM.
  useEffect(() => {
    lastCodeRef.current = restoredFor(persistedRef.current, currentCode) ? currentCode : '';
    // currentCode intentionally read at key-change time only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!enabled) {
      reqIdRef.current += 1;
      setLoading(false);
      return;
    }
    // No conversation yet → keep showing the static defaults.
    if (!hasUserMessages || !currentCode.trim()) {
      return;
    }
    // Avoid refetching for the same code (e.g. after re-render, or restored persisted chips).
    if (lastCodeRef.current === currentCode) return;
    lastCodeRef.current = currentCode;

    // Commit-provided suggestions → use immediately, skip LLM call.
    const override = commitSuggestionsRef.current;
    if (override && override.length > 0) {
      publish(override.slice(0, 2), currentCode);
      return;
    }

    // Hide current chips while fetching new ones.
    setSuggestions([]);
    setLoading(true);

    const my = ++reqIdRef.current;
    buildSuggestions(currentCode, messagesRef.current).then((chips) => {
      // Drop stale responses if the user moved on already.
      if (my !== reqIdRef.current) return;
      setLoading(false);
      if (chips.length > 0) publish(chips, currentCode);
    });
  }, [currentCode, enabled, hasUserMessages]);

  return { suggestions, loading };
}
