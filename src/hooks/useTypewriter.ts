import { useEffect, useState } from 'react';

/** Per-character pace, shortened for long text so no reveal outlasts MAX_MS. */
const STEP_MS = 45;
const MAX_MS = 1400;

const prefersReducedMotion = () =>
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Typed {
  text: string | undefined;
  count: number;
  started: boolean;
}

/**
 * Reveals `text` one character at a time, as if typed. Returns the part shown
 * so far (`undefined` while there is no text).
 *
 * A new text shows nothing until `start` is true, then types itself out; once
 * begun it carries on and stays, whatever `start` does next. With reduced
 * motion it appears whole the moment it starts. Counts code points, so an
 * emoji or other astral character never splits in half.
 */
export function useTypewriter(text: string | undefined, start = true): string | undefined {
  const [typed, setTyped] = useState<Typed>({ text, count: 0, started: false });
  // Adjusted during render, not in an effect: a new text restarts from
  // nothing, and the first render allowed to start marks it begun.
  const current: Typed = typed.text === text ? typed : { text, count: 0, started: false };
  const next: Typed = start && !current.started ? { ...current, started: true } : current;
  if (next !== typed) setTyped(next);

  const { started } = next;
  useEffect(() => {
    if (!started || text === undefined || prefersReducedMotion()) return;
    const length = Array.from(text).length;
    if (length === 0) return;
    const id = window.setInterval(() => {
      setTyped((prev) => {
        if (prev.text !== text) return prev;
        const count = Math.min(prev.count + 1, length);
        if (count >= length) window.clearInterval(id);
        return { ...prev, count };
      });
    }, Math.min(STEP_MS, MAX_MS / length));
    return () => window.clearInterval(id);
  }, [text, started]);

  if (text === undefined) return undefined;
  if (!started) return '';
  if (prefersReducedMotion()) return text;
  return Array.from(text).slice(0, next.count).join('');
}
