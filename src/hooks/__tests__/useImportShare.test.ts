import { describe, expect, it } from 'vitest';
import { getShareIdFromLocation } from '../useImportShare';

function makeLocation(pathname: string, search = ''): Location {
  return { pathname, search } as Location;
}

describe('getShareIdFromLocation', () => {
  it('reads legacy /s/:id share links', () => {
    expect(getShareIdFromLocation(makeLocation('/s/abc123'))).toBe('abc123');
  });

  it('reads share query params used by the dynamic share page redirect', () => {
    expect(getShareIdFromLocation(makeLocation('/', '?share=abc123'))).toBe('abc123');
  });

  it('returns null when the current URL is not a share import', () => {
    expect(getShareIdFromLocation(makeLocation('/', ''))).toBeNull();
  });
});
