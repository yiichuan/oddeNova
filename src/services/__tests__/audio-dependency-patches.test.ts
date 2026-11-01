import { describe, expect, it } from 'vitest';

describe('installed audio dependency patches', () => {
  it('exposes pool cleanup through the same superdough root used for audio context switching', async () => {
    // Deliberately use the installed dependency: mocks cannot detect a missing
    // patch after a dependency install has replaced node_modules contents.
    const audio = await import('superdough');
    expect(typeof audio.clearNodePools).toBe('function');
    expect(() => audio.clearNodePools()).not.toThrow();
  });
});
