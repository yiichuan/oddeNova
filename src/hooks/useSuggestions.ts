import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from './useChat';
import { buildSuggestions, STATIC_SUGGESTIONS } from '../services/suggestions';

/**
 * Manages the "next-step" suggestion chips shown above the input box.
 *
 * Strategy (mixed):
 *   - When the conversation has no user messages yet → static defaults.
 *   - After each agent commit (i.e. current.code / session committed code changed and
 *     is non-empty) → fetch 2 fresh suggestions from the LLM with music state + style
 *     intent context. NOTE: live editor edits and BPM changes do NOT trigger a refetch;
 *     only committed code (set via sessions.setCurrentCode()) does.
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
}) {
  const { key, currentCode, hasUserMessages, messages, enabled = true, commitSuggestions } = opts;
  const [suggestions, setSuggestions] = useState<string[]>(() => [...STATIC_SUGGESTIONS].sort(() => Math.random() - 0.5).slice(0, 2));
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

  // Reset when switching sessions.
  if (prevKey !== key) {
    setPrevKey(key);
    // eslint-disable-next-line react-hooks/purity
    setSuggestions([...STATIC_SUGGESTIONS].sort(() => Math.random() - 0.5).slice(0, 2));
    setLoading(false);
  }

  // Reset lastCodeRef when key changes (safe to access refs inside effects).
  useEffect(() => {
    lastCodeRef.current = '';
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
    // Avoid refetching for the same code (e.g. after re-render).
    if (lastCodeRef.current === currentCode) return;
    lastCodeRef.current = currentCode;

    // Commit-provided suggestions → use immediately, skip LLM call.
    const override = commitSuggestionsRef.current;
    if (override && override.length > 0) {
      setSuggestions(override.slice(0, 2));
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
      if (chips.length > 0) setSuggestions(chips);
    });
  }, [currentCode, enabled, hasUserMessages]);

  return { suggestions, loading };
}
