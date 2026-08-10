import { useEffect, useRef, useState } from 'react';
import { pickSuggestions } from '../services/daily-suggestions';
import { STATIC_SUGGESTIONS } from '../services/suggestions';

type Persisted = { forCode: string; items: string[] };
type SuggestionSource = 'default' | 'persisted' | 'commit';
type SuggestionState = { source: SuggestionSource; items: string[] };

// Upper bound on how many suggestions the hook exposes. Desktop rotates through
// all of them as placeholder chips; the mobile layout slices this down to two
// quick-action buttons at its render site.
const MAX_SUGGESTIONS = 5;

// Persisted chips are only usable when they were generated for the code we're
// showing now; otherwise they're stale (commit writes code, then produces
// next-steps — a refresh in that window leaves them mismatched).
function restoredFor(persisted: Persisted | undefined, currentCode: string): string[] | null {
  if (persisted && persisted.forCode === currentCode && persisted.items.length > 0) {
    return persisted.items.slice(0, MAX_SUGGESTIONS);
  }
  return null;
}

function defaultState(defaults?: string[]): SuggestionState {
  return {
    source: 'default',
    items: pickSuggestions(defaults?.length ? defaults : STATIC_SUGGESTIONS, MAX_SUGGESTIONS),
  };
}

function initialState(
  persisted: Persisted | undefined,
  currentCode: string,
  defaults?: string[],
): SuggestionState {
  const restored = restoredFor(persisted, currentCode);
  return restored ? { source: 'persisted', items: restored } : defaultState(defaults);
}

/**
 * Manages the "next-step" suggestion chips shown above the input box.
 *
 * Chips have three sources, no separate LLM call:
 *   - Static defaults before any code exists.
 *   - The next-step options the agent emits in every commit explanation (up to
 *     MAX_SUGGESTIONS, parsed upstream, handed in via `commitSuggestions`).
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
  /** The daily entry suggestion pool, when available. */
  defaults?: string[];
  /** The next-step options from the latest commit explanation (up to MAX_SUGGESTIONS). */
  commitSuggestions?: string[];
  /** Suggestions persisted on the session from a previous page load. */
  persisted?: Persisted;
  /** Called with fresh suggestions + the code they were generated for, so the caller can persist them. */
  onSuggestions?: (items: string[], forCode: string) => void;
}) {
  const { key, currentCode, defaults, commitSuggestions, persisted, onSuggestions } = opts;
  const [state, setState] = useState<SuggestionState>(
    () => initialState(persisted, currentCode, defaults),
  );
  const [prevCommit, setPrevCommit] = useState<string[] | undefined>(undefined);
  const [prevKey, setPrevKey] = useState(key);
  const [prevDefaults, setPrevDefaults] = useState(defaults);
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
    if (commitSuggestions?.length) {
      setState({ source: 'commit', items: commitSuggestions.slice(0, MAX_SUGGESTIONS) });
    }
  }

  // Reset when switching sessions: restore this session's persisted chips (when
  // they match its code) or fall back to fresh static defaults. Runs after the
  // commit block so a session switch wins over stale commit chips.
  if (prevKey !== key) {
    setPrevKey(key);
    setState(initialState(persisted, currentCode, defaults));
  }

  // A late daily response may replace bundled defaults, but never suggestions
  // restored for code or emitted by an agent commit.
  if (prevDefaults !== defaults) {
    setPrevDefaults(defaults);
    setState((current) => current.source === 'default' ? defaultState(defaults) : current);
  }

  // Persist freshly shown commit chips to the session (external system sync).
  useEffect(() => {
    if (!commitSuggestions || commitSuggestions.length === 0) return;
    const items = commitSuggestions.slice(0, MAX_SUGGESTIONS);
    const alreadyPersisted = persisted?.forCode === currentCodeRef.current
      && persisted.items.length === items.length
      && persisted.items.every((item, index) => item === items[index]);
    if (!alreadyPersisted) {
      onSuggestionsRef.current?.(items, currentCodeRef.current);
    }
  }, [commitSuggestions, persisted]);

  return { suggestions: state.items };
}
