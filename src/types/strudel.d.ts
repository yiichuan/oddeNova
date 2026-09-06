declare module '@strudel/core' {
  interface Pattern {
    piano(): Pattern;
    /**
     * Paint the code panel with a Strudel theme name, patterned over time.
     * Registered by `StrudelService.prebake`; strudel.cc has it, no published
     * `@strudel/*` package does.
     */
    theme(name: unknown): Pattern;
  }
}

// Global audio context helpers registered via evalScope at runtime
declare function getAudioContext(): AudioContext;
declare function getSuperdoughAudioController(): { output: { destinationGain: AudioNode } } | null;

// Common strudel pattern functions (registered via evalScope at runtime)
declare function note(pattern: string): unknown;
declare function s(pattern: string): unknown;
declare function stack(...patterns: unknown[]): unknown;
declare function cat(...patterns: unknown[]): unknown;
declare function setcps(cps: number): void;
declare const silence: unknown;

interface Window {
  __strudelInitialized?: boolean;
}
