import { describe, expect, it, vi } from 'vitest';
import { privacyRouteMiddleware } from '../server/privacy-route';

interface Call {
  url: string;
  nextCount: number;
  ended: boolean;
}

function run(method: string | undefined, url: string | undefined): Call {
  const call: Call = { url: url ?? '', nextCount: 0, ended: false };
  const req = { method, url } as Parameters<typeof privacyRouteMiddleware>[0];
  const res = {
    end: vi.fn(() => {
      call.ended = true;
    }),
  } as unknown as Parameters<typeof privacyRouteMiddleware>[1];
  privacyRouteMiddleware(req, res, () => {
    call.nextCount += 1;
    call.url = req.url ?? '';
  });
  return call;
}

describe('privacy route middleware', () => {
  it('rewrites the exact aliases to /privacy.html and always falls through', () => {
    for (const url of ['/privacy', '/privacy/']) {
      for (const method of ['GET', 'HEAD']) {
        const call = run(method, url);
        expect(call.url).toBe('/privacy.html');
        expect(call.nextCount).toBe(1);
        expect(call.ended).toBe(false);
      }
    }
  });

  it('preserves the query string verbatim', () => {
    expect(run('GET', '/privacy?lang=zh&x=a%2Fb').url).toBe('/privacy.html?lang=zh&x=a%2Fb');
    expect(run('GET', '/privacy/?').url).toBe('/privacy.html?');
    expect(run('HEAD', '/privacy/?lang=en').url).toBe('/privacy.html?lang=en');
  });

  it('passes /privacy.html itself through unchanged', () => {
    const call = run('GET', '/privacy.html');
    expect(call.url).toBe('/privacy.html');
    expect(call.nextCount).toBe(1);
    expect(call.ended).toBe(false);
  });

  it('leaves every other path untouched', () => {
    const urls = ['/privacy-other', '/privacy/assets', '/api/sessions', '/', '/presentation.html', '/privacyX'];
    for (const url of urls) {
      const call = run('GET', url);
      expect(call.url).toBe(url);
      expect(call.nextCount).toBe(1);
      expect(call.ended).toBe(false);
    }
  });

  it('does not rewrite non-GET/HEAD methods', () => {
    for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
      const call = run(method, '/privacy');
      expect(call.url).toBe('/privacy');
      expect(call.nextCount).toBe(1);
      expect(call.ended).toBe(false);
    }
  });

  it('tolerates undefined method and url', () => {
    const call = run(undefined, undefined);
    expect(call.url).toBe('');
    expect(call.nextCount).toBe(1);
    expect(call.ended).toBe(false);
  });
});
