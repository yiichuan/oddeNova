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
