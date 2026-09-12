import { useRef } from 'react';
import type { ChangeEvent, CompositionEvent } from 'react';
import { clampSessionTitleInput } from '../lib/session-title';

/**
 * What a rename field needs to hold the shared title limit: handlers that count
 * visible characters rather than UTF-16 units.
 *
 * `maxLength` cannot do this job. It counts code units, so an emoji costs two of
 * them and a sixty-ideograph Chinese name is allowed where a thirty-emoji one is
 * not — and worse, the browser enforces it *during* composition, which cuts a
 * Pinyin or Kana buffer off mid-word and leaves the IME rewriting text that is
 * no longer there. So the field is unbounded to the browser and bounded here:
 * free while a composition is open, clamped the moment it closes and on every
 * ordinary keystroke or paste.
 */
export function useSessionTitleInput(setDraft: (value: string) => void) {
  const composingRef = useRef(false);
  return {
    onChange: (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.currentTarget.value;
      setDraft(composingRef.current ? value : clampSessionTitleInput(value));
    },
    onCompositionStart: () => {
      composingRef.current = true;
    },
    onCompositionEnd: (event: CompositionEvent<HTMLInputElement>) => {
      composingRef.current = false;
      setDraft(clampSessionTitleInput(event.currentTarget.value));
    },
  };
}
