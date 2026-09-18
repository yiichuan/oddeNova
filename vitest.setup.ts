/**
 * Node ≥26 ships its own `localStorage` global. Without
 * --localstorage-file it resolves to undefined and shadows happy-dom's
 * Storage; with the flag it exposes native methods that Vitest cannot spy on
 * reliably. Pin DOM tests to one in-memory implementation so both invocation
 * modes have identical, isolated, spy-friendly behaviour.
 */
if (typeof window !== 'undefined') {
  const entries = new Map<string, string>();
  const storage: Storage = {
    get length(): number {
      return entries.size;
    },
    clear: (): void => {
      entries.clear();
    },
    getItem: (key: string): string | null => (entries.has(key) ? entries.get(key)! : null),
    key: (index: number): string | null => [...entries.keys()][index] ?? null,
    removeItem: (key: string): void => {
      entries.delete(key);
    },
    setItem: (key: string, value: string): void => {
      entries.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
}
