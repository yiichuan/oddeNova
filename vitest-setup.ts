import { vi } from 'vitest';

// Global localStorage mock for all tests
const storage: Record<string, string> = {};

const localStorageMock = {
  getItem: vi.fn((key: string) => storage[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    storage[key] = value;
  }),
  clear: vi.fn(() => {
    Object.keys(storage).forEach((key) => delete storage[key]);
  }),
  removeItem: vi.fn((key: string) => {
    delete storage[key];
  }),
  length: 0,
  key: vi.fn((index: number) => Object.keys(storage)[index] ?? null),
};

Object.assign(globalThis, { localStorage: localStorageMock });
