import { useEffect, useRef, useState } from 'react';
import { buildSuggestions, STATIC_SUGGESTIONS } from '../services/suggestions';

/**
 * Manages the "next-step" suggestion chips shown above the input box.
 *
 * Strategy (mixed):
 *   - When the conversation has no user messages yet → static defaults.
 *   - After each commit (i.e. currentCode changed and is non-empty) →
 *     fetch 2 fresh suggestions from the LLM.
 *
 * `key` is used to bust the cache when switching sessions, so we don't
 * carry the previous session's chips into the new one.
 */
export function useSuggestions(opts: {
  key: string;
  currentCode: string;
  hasUserMessages: boolean;
}) {
  const { key, currentCode, hasUserMessages } = opts;
  const [suggestions, setSuggestions] = useState<string[]>(() => STATIC_SUGGESTIONS.slice(0, 2));
  const reqIdRef = useRef(0);
  const lastCodeRef = useRef<string>('');
  const lastKeyRef = useRef<string>(key);

  // Reset when switching sessions.
  useEffect(() => {
    if (lastKeyRef.current === key) return;
    lastKeyRef.current = key;
    lastCodeRef.current = '';
    setSuggestions(STATIC_SUGGESTIONS.slice(0, 2));
  }, [key]);

  useEffect(() => {
    // No conversation yet → keep showing the static defaults.
    if (!hasUserMessages || !currentCode.trim()) {
      return;
    }
    // Avoid refetching for the same code (e.g. after re-render).
    if (lastCodeRef.current === currentCode) return;
    lastCodeRef.current = currentCode;

    const my = ++reqIdRef.current;
    buildSuggestions(currentCode).then((chips) => {
      // Drop stale responses if the user moved on already.
      if (my !== reqIdRef.current) return;
      if (chips.length > 0) setSuggestions(chips);
    });
  }, [currentCode, hasUserMessages]);

  return suggestions;
}
