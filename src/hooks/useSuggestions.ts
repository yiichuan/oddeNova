import { useEffect, useRef, useState } from 'react';
import { STATIC_SUGGESTIONS } from '../services/suggestions';

type Persisted = { forCode: string; items: string[] };

function randomStatic(): string[] {
  return [...STATIC_SUGGESTIONS].sort(() => Math.random() - 0.5).slice(0, 2);
}

// Persisted chips are only usable when they were generated for the code we're
// showing now; otherwise they're stale (commit writes code, then produces
// next-steps — a refresh in that window leaves them mismatched).
function restoredFor(persisted: Persisted | undefined, currentCode: string): string[] | null {
  if (persisted && persisted.forCode === currentCode && persisted.items.length > 0) {
    return persisted.items.slice(0, 2);
  }
  return null;
}

/**
 * Manages the "next-step" suggestion chips shown above the input box.
 *
 * Chips have three sources, no separate LLM call:
 *   - Static defaults before any code exists.
 *   - The two next-step options the agent emits in every commit explanation
 *     (parsed upstream, handed in via `commitSuggestions`).
 *   - Persisted chips restored on mount / session switch, so a page refresh
 *     brings back the last commit's options without regenerating them.
 *
 * Whenever fresh (commit-provided) chips are shown, `onSuggestions` is invoked
 * so the caller can persist them onto the session.
 *
 * `key` busts the cache when switching sessions, so the previous session's
 * chips don't leak into the new one.
 */
export function useSuggestions(opts: {
  key: string;
  currentCode: string;
  /** The two next-step options from the latest commit explanation. */
  commitSuggestions?: string[];
  /** Suggestions persisted on the session from a previous page load. */
  persisted?: Persisted;
  /** Called with fresh suggestions + the code they were generated for, so the caller can persist them. */
  onSuggestions?: (items: string[], forCode: string) => void;
}) {
  const { key, currentCode, commitSuggestions, persisted, onSuggestions } = opts;
  const [suggestions, setSuggestions] = useState<string[]>(
    () => restoredFor(persisted, currentCode) ?? randomStatic(),
  );
  const [prevCommit, setPrevCommit] = useState<string[] | undefined>(undefined);
  const [prevKey, setPrevKey] = useState(key);
  // Read the freshest currentCode / onSuggestions inside the persist effect
  // without adding them to its deps (they'd re-fire it on every render).
  const currentCodeRef = useRef(currentCode);
  const onSuggestionsRef = useRef(onSuggestions);
  useEffect(() => {
    currentCodeRef.current = currentCode;
    onSuggestionsRef.current = onSuggestions;
  });

  // Show the latest commit's next-step options as soon as they arrive.
  if (prevCommit !== commitSuggestions) {
    setPrevCommit(commitSuggestions);
    if (commitSuggestions && commitSuggestions.length > 0) {
      setSuggestions(commitSuggestions.slice(0, 2));
    }
  }

  // Reset when switching sessions: restore this session's persisted chips (when
  // they match its code) or fall back to fresh static defaults. Runs after the
  // commit block so a session switch wins over stale commit chips.
  if (prevKey !== key) {
    setPrevKey(key);
    setSuggestions(restoredFor(persisted, currentCode) ?? randomStatic());
  }

  // Persist freshly shown commit chips to the session (external system sync).
  useEffect(() => {
    if (!commitSuggestions || commitSuggestions.length === 0) return;
    onSuggestionsRef.current?.(commitSuggestions.slice(0, 2), currentCodeRef.current);
  }, [commitSuggestions]);

  return { suggestions };
}
