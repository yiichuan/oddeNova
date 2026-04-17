declare function initStrudel(options?: { prebake?: () => any }): void;
declare function samples(path: string): any;
declare function evaluate(code: string): Promise<any>;
declare function note(pattern: string): any;
declare function s(pattern: string): any;
declare function stack(...patterns: any[]): any;
declare function cat(...patterns: any[]): any;
declare function hush(): void;
declare function setcps(cps: number): void;
declare function silence(): any;

interface Window {
  __strudelInitialized?: boolean;
}
