import { beforeEach, describe, expect, it, vi } from 'vitest';
import { claimTransport, releaseTransport, resetTransportForTests } from '../transport';

describe('transport floor', () => {
  beforeEach(resetTransportForTests);

  it('stops whoever was playing when someone else starts', () => {
    const studio = vi.fn();
    const featured = vi.fn();

    claimTransport('studio', studio);
    expect(studio).not.toHaveBeenCalled();

    claimTransport('featured', featured);
    expect(studio).toHaveBeenCalledTimes(1);
    expect(featured).not.toHaveBeenCalled();

    claimTransport('studio', studio);
    expect(featured).toHaveBeenCalledTimes(1);
  });

  it('leaves a transport alone when it claims the floor it already holds', () => {
    const studio = vi.fn();

    claimTransport('studio', studio);
    claimTransport('studio', studio);
    claimTransport('studio', studio);

    // Playing a second piece in the same place is not a reason to be silenced.
    expect(studio).not.toHaveBeenCalled();
  });

  it('takes the newest way to stop a transport, not the one it first claimed with', () => {
    const first = vi.fn();
    const second = vi.fn();
    const other = vi.fn();

    claimTransport('studio', first);
    claimTransport('studio', second);
    claimTransport('featured', other);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('stops nobody once the floor has been given up', () => {
    const studio = vi.fn();
    const featured = vi.fn();

    claimTransport('studio', studio);
    releaseTransport('studio');
    claimTransport('featured', featured);

    expect(studio).not.toHaveBeenCalled();
  });

  it('ignores a release from a transport that no longer holds the floor', () => {
    const studio = vi.fn();
    const featured = vi.fn();

    claimTransport('studio', studio);
    claimTransport('featured', featured);
    // The studio noticing it stopped, after featured already took over.
    releaseTransport('studio');

    claimTransport('studio', studio);
    expect(featured).toHaveBeenCalledTimes(1);
  });
});
