declare function initStrudel(options?: { prebake?: () => unknown }): void;
declare function samples(path: string): unknown;
declare function evaluate(code: string): Promise<unknown>;
declare function note(pattern: string): unknown;
declare function s(pattern: string): unknown;
declare function stack(...patterns: unknown[]): unknown;
declare function cat(...patterns: unknown[]): unknown;
declare function hush(): void;
declare function getDestination(): AudioNode;
declare function setcps(cps: number): void;
declare function silence(): unknown;

interface Window {
  __strudelInitialized?: boolean;
}
