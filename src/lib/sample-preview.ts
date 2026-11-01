/**
 * How one sound is auditioned: the single event the audition page hands to
 * superdough when a name is pressed.
 *
 * Kept apart from the audio service so it can be read — and tested — without a
 * running AudioContext. The service looks the name up in superdough's sound
 * map, passes what it finds here, and schedules what comes back.
 */

/**
 * What kind of thing a registered sound is, as far as auditioning goes.
 *
 * - `sample`  — a folder of recordings; `n` picks one and it plays as recorded.
 * - `pitched` — something that takes a note: a soundfont, an oscillator, or a
 *               sample set recorded at several pitches (piano.json, most of VCSL).
 */
export type SoundKind = 'sample' | 'pitched';

export interface SoundInfo {
  kind: SoundKind;
  /** How many recordings `n` can choose between. 1 for anything pitched. */
  variants: number;
}

/** The shape superdough's sound map keeps for each name (only what is read here). */
export interface RegisteredSoundData {
  type?: string;
  samples?: unknown;
}

export function describeRegisteredSound(data: RegisteredSoundData | undefined): SoundInfo | null {
  if (!data) return null;
  if (data.type === 'sample') {
    /* A plain list is a folder of hits; a map keyed by note name is one
       instrument recorded across its range. */
    if (Array.isArray(data.samples)) return { kind: 'sample', variants: Math.max(data.samples.length, 1) };
    return { kind: 'pitched', variants: 1 };
  }
  return { kind: 'pitched', variants: 1 };
}

/* A one-shot is cut off here if it has not ended on its own: long enough for
   any drum hit to ring out and for a break to be recognised, short enough that
   a loop does not keep playing under the next thing you press. */
const SAMPLE_PREVIEW_SECONDS = 3;
/* A held note, then its tail. */
const PITCHED_PREVIEW_SECONDS = 1.2;
const PITCHED_RELEASE_SECONDS = 0.4;
const RELEASE_SECONDS = 0.05;
/** The pitch a pitched sound is auditioned at when its catalog group names none. */
const DEFAULT_NOTE = 'c4';

/*
 * Every audition shares one cut group, so pressing a second name silences a
 * sample still sounding from the first. Picked far above anything a pattern
 * would number its own groups with, so an audition never cuts — and is never
 * cut by — a piece. (Superdough's cut groups only reach samples; soundfonts
 * and oscillators end on their own, after PITCHED_PREVIEW_SECONDS.)
 */
export const AUDITION_CUT_GROUP = 7919;

export interface PreviewEvent {
  /** The superdough value. A fresh object every call — superdough writes into it. */
  value: Record<string, unknown>;
  /** The event's length in seconds, which superdough takes as a separate argument. */
  duration: number;
}

export function buildPreviewEvent(
  name: string,
  info: SoundInfo | null,
  options: { variant?: number; note?: string } = {},
): PreviewEvent {
  if (info?.kind === 'pitched') {
    return {
      value: {
        s: name,
        note: options.note ?? DEFAULT_NOTE,
        release: PITCHED_RELEASE_SECONDS,
        cut: AUDITION_CUT_GROUP,
      },
      duration: PITCHED_PREVIEW_SECONDS,
    };
  }
  const variants = info?.variants ?? 1;
  return {
    value: {
      s: name,
      n: ((options.variant ?? 0) % variants + variants) % variants,
      /* Both are needed for the cap to hold: without `clip` (or a release)
         superdough plays a sample for its own full length, whatever the
         event's duration says. */
      clip: 1,
      release: RELEASE_SECONDS,
      cut: AUDITION_CUT_GROUP,
    },
    duration: SAMPLE_PREVIEW_SECONDS,
  };
}
