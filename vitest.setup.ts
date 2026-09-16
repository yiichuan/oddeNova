/**
 * Node ≥26 ships its own `localStorage` global getter, which resolves to
 * undefined unless --localstorage-file is provided — and when the DOM
 * environment is installed onto globalThis that getter shadows the shim's
 * own Storage. The storage-backed code under test only ever needs the four
 * DOM calls, so a minimal stand-in is pinned in place — the guard keeps this
 * a no-op wherever the environment's own Storage is intact.
 */
if (typeof window !== 'undefined' && typeof localStorage === 'undefined') {
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
