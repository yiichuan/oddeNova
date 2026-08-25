/**
 * What a title column needs besides its rows: the label rule every column reads
 * titles through, and the motion for a column that has no carousel under it.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  easeOutQuint,
  nearestEquivalent,
  positiveModulo,
  snapDuration,
} from './featured-carousel-motion';

/**
 * What a title reads as in a column. One line of large type wants the song and
 * not the disclaimer, so a trailing "(cover)" or "(cover / remix)" comes off —
 * the page the column stands on still carries it, next to the two names it
 * belongs to.
 */
const COVER_SUFFIX = /\s+\((?:cover|remix)[^)]*\)$/i;

export const wheelLabel = (title: string) => title.replace(COVER_SUFFIX, '');

export interface WheelPosition {
  /** Where the column stands, including part-way between two rows mid-drag. */
  position: number;
  /** The row under the marker once the column has settled. */
  index: number;
  /** Travel to a row, the short way round the ring. */
  snapTo: (logicalIndex: number) => void;
  /** A drag is driving: stand exactly where you are put. */
  scrubTo: (value: number) => void;
  /** The drag ended — settle on the nearest row. */
  settleScrub: () => void;
}

export interface WheelOptions {
  /** The row standing under the marker when the column first appears. */
  initialIndex?: number;
  /**
   * The column has come to rest on a row it was not already on. Trips that end
   * where they began say nothing — this is the column *arriving* somewhere, and
   * so the moment a page built on it has changed what it is showing.
   */
  onSettle?: (index: number) => void;
}

/**
 * The motion behind a title column that is a page's only selector.
 *
 * On the Featured shelf this lives inside the carousel, because there the
 * column and the sleeves are two views of one position. A record's track list
 * and the Favorites list have no carousel under them — the column *is* the
 * control — so the same arithmetic is kept here rather than in either page,
 * both so those pages read as layout and so the behaviour of the lists cannot
 * quietly drift apart.
 *
 * Position is continuous and unbounded: the list is a ring, so row -1 is the
 * last conversation and travelling to it goes backwards a little rather than
 * forwards all the way round.
 *
 * `index` changes only when a trip ends. That is what keeps the page's content
 * still while the column is being dragged past it — the content answers to
 * where you land, not to everything you pass on the way.
 */
export function useWheelPosition(count: number, options: WheelOptions = {}): WheelPosition {
  const { initialIndex = 0, onSettle } = options;
  const positionRef = useRef(initialIndex);
  /* Where the column is headed, as opposed to where it stands: repeated picks
     compound against this rather than fighting the trip already running. */
  const targetRef = useRef(initialIndex);
  const frameRef = useRef<number | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  /* The row last arrived at, kept beside the state because the arrival is
     announced from inside the trip rather than from the render that follows it. */
  const arrivedRef = useRef(initialIndex);
  /* Held in a ref so a caller writing the callback inline does not rebuild the
     trip functions on every render — and so the one that runs is never a
     render behind the page that reads it. */
  const settleRef = useRef(onSettle);
  const [position, setPosition] = useState(initialIndex);
  const [index, setIndex] = useState(initialIndex);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    settleRef.current = onSettle;
  });

  const setLogicalPosition = useCallback((value: number) => {
    positionRef.current = value;
    setPosition(value);
  }, []);

  const stopSweep = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
  }, []);

  const scrubTo = useCallback((value: number) => {
    stopSweep();
    targetRef.current = value;
    setLogicalPosition(value);
  }, [setLogicalPosition, stopSweep]);

  const snapTo = useCallback((logicalIndex: number) => {
    stopSweep();
    if (count <= 0) return;

    const from = positionRef.current;
    const target = nearestEquivalent(logicalIndex, targetRef.current, count);
    const normalised = positiveModulo(target, count);
    targetRef.current = target;

    const settle = () => {
      stopSweep();
      targetRef.current = normalised;
      setLogicalPosition(normalised);
      setIndex(normalised);
      if (arrivedRef.current !== normalised) {
        arrivedRef.current = normalised;
        settleRef.current?.(normalised);
      }
    };

    if (reducedMotion || Math.abs(target - from) < 0.001) {
      settle();
      return;
    }

    const duration = snapDuration(target - from);
    const start = performance.now();

    const step = () => {
      const progress = Math.min((performance.now() - start) / duration, 1);
      setLogicalPosition(from + (target - from) * easeOutQuint(progress));
      frameRef.current = progress < 1 ? requestAnimationFrame(step) : null;
    };
    frameRef.current = requestAnimationFrame(step);

    /* The clock, not the frames, is what says the trip is over: a page that is
       not being painted still has to arrive. */
    settleTimerRef.current = window.setTimeout(settle, duration);
  }, [count, reducedMotion, setLogicalPosition, stopSweep]);

  const settleScrub = useCallback(() => {
    snapTo(Math.round(positionRef.current));
  }, [snapTo]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(mediaQuery.matches);
    update();
    mediaQuery.addEventListener('change', update);
    return () => mediaQuery.removeEventListener('change', update);
  }, []);

  useEffect(() => stopSweep, [stopSweep]);

  /* Folded back into the ring on the way out rather than stored folded, so a
     list that shrank under the column — a favorite removed — cannot leave the
     marker parked past its end. It is the same fold the column itself does to
     pick the row it draws, so the two always name the same conversation. */
  return {
    position,
    index: count > 0 ? positiveModulo(index, count) : 0,
    snapTo,
    scrubTo,
    settleScrub,
  };
}
