import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from './useChat';
import { buildSuggestions, STATIC_SUGGESTIONS } from '../services/suggestions';

/**
 * Manages the "next-step" suggestion chips shown above the input box.
 *
 * Strategy (mixed):
 *   - When the conversation has no user messages yet → static defaults.
 *   - After each commit (i.e. currentCode changed and is non-empty) →
 *     fetch 2 fresh suggestions from the LLM with music state + style intent context.
 *
 * `key` is used to bust the cache when switching sessions, so we don't
 * carry the previous session's chips into the new one.
 */
export function useSuggestions(opts: {
  key: string;
  currentCode: string;
  hasUserMessages: boolean;
  messages: ChatMessage[];
}) {
  const { key, currentCode, hasUserMessages, messages } = opts;
  const [suggestions, setSuggestions] = useState<string[]>(() => [...STATIC_SUGGESTIONS].sort(() => Math.random() - 0.5).slice(0, 2));
  const [loading, setLoading] = useState(false);
  const [prevKey, setPrevKey] = useState(key);
  const reqIdRef = useRef(0);
  const lastCodeRef = useRef<string>('');

  // Reset when switching sessions.
  if (prevKey !== key) {
    setPrevKey(key);
    setSuggestions([...STATIC_SUGGESTIONS].sort(() => Math.random() - 0.5).slice(0, 2));
    setLoading(false);
  }

  // Reset lastCodeRef when key changes (safe to access refs inside effects).
  useEffect(() => {
    lastCodeRef.current = '';
  }, [key]);

  useEffect(() => {
    // No conversation yet → keep showing the static defaults.
    if (!hasUserMessages || !currentCode.trim()) {
      return;
    }
    // Avoid refetching for the same code (e.g. after re-render).
    if (lastCodeRef.current === currentCode) return;
    lastCodeRef.current = currentCode;

    // Hide current chips while fetching new ones.
    setSuggestions([]);
    setLoading(true);

    const my = ++reqIdRef.current;
    buildSuggestions(currentCode, messages).then((chips) => {
      // Drop stale responses if the user moved on already.
      if (my !== reqIdRef.current) return;
      setLoading(false);
      if (chips.length > 0) setSuggestions(chips);
    });
  }, [currentCode, hasUserMessages, messages]);

  return { suggestions, loading };
}
