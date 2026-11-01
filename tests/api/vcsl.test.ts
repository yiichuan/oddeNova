import type { IncomingMessage, ServerResponse } from 'node:http';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from '../../api/vcsl.js';
import { VCSL_UPSTREAM, vcslUpstreamUrl } from '../../server/vcsl-proxy.js';

const SNARE = 'Membranophones/Struck%20Membranophones/Snare%20Drum%2C%20Rope%20Tension/Hi/RopeSnare_hi_sn_Main_vl1_rr1.wav';

function makeResponse() {
  const stream = new PassThrough();
  const chunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));
  const headers: Record<string, string> = {};
  const res = Object.assign(stream, {
    statusCode: 0,
    headersSent: false,
    setHeader(name: string, value: string) { headers[name.toLowerCase()] = String(value); },
  });
  return { res, headers, body: () => Buffer.concat(chunks).toString() };
}

const request = (url: string, method = 'GET') => ({ url, method }) as IncomingMessage;

const call = (req: IncomingMessage, res: ReturnType<typeof makeResponse>['res']) =>
  handler(req as never, res as unknown as ServerResponse as never);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('vcslUpstreamUrl', () => {
  it('passes a VCSL .wav path through to GitHub exactly as escaped', () => {
    expect(vcslUpstreamUrl(`/api/vcsl?path=${SNARE}`)).toBe(VCSL_UPSTREAM + SNARE);
    expect(vcslUpstreamUrl('/api/vcsl?path=Idiophones/Kalimba%2C%20Tanzania/MBira3_A%232_rr2.wav'))
      .toBe(`${VCSL_UPSTREAM}Idiophones/Kalimba%2C%20Tanzania/MBira3_A%232_rr2.wav`);
  });

  it('refuses anything that is not a plain relative .wav path', () => {
    for (const url of [
      '/api/vcsl',
      '/api/vcsl?path=',
      '/api/vcsl?path=notes.txt',
      '/api/vcsl?path=../secrets/a.wav',
      '/api/vcsl?path=a/%2E%2E/b.wav',
      '/api/vcsl?path=https://evil.example/a.wav',
      '/api/vcsl?path=a.wav?x=1',
      '/api/vcsl?path=a.wav#frag',
      '/api/vcsl?path=/abs/a.wav',
      '/api/vcsl?other=1&path=a.wav',
    ]) {
      expect(vcslUpstreamUrl(url), url).toBeNull();
    }
  });
});

describe('api/vcsl', () => {
  it('streams the file back without GitHub\'s Content-Disposition, cacheable', async () => {
    const fetchMock = vi.fn(async () => new Response('RIFF....WAVE', {
      status: 200,
      headers: {
        'content-type': 'audio/wav',
        'content-length': '12',
        'content-disposition': 'attachment; filename=Snare Drum, Rope Tension/a.wav',
      },
    }));
    vi.stubGlobal('fetch', fetchMock);
    const { res, headers, body } = makeResponse();

    await call(request(`/api/vcsl?path=${SNARE}`), res);

    expect(fetchMock).toHaveBeenCalledWith(VCSL_UPSTREAM + SNARE, { method: 'GET' });
    expect(res.statusCode).toBe(200);
    expect(body()).toBe('RIFF....WAVE');
    expect(headers['content-type']).toBe('audio/wav');
    expect(headers['content-length']).toBe('12');
    expect(headers['content-disposition']).toBeUndefined();
    expect(headers['cache-control']).toContain('s-maxage=31536000');
  });

  it('passes an upstream miss on uncached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Not Found', { status: 404 })));
    const { res, headers, body } = makeResponse();

    await call(request('/api/vcsl?path=Missing/a.wav'), res);

    expect(res.statusCode).toBe(404);
    expect(headers['cache-control']).toBe('no-store');
    expect(body()).toBe('');
  });

  it('answers a bad path or method without reaching upstream', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const bad = makeResponse();
    await call(request('/api/vcsl?path=../a.wav'), bad.res);
    expect(bad.res.statusCode).toBe(400);

    const post = makeResponse();
    await call(request(`/api/vcsl?path=${SNARE}`, 'POST'), post.res);
    expect(post.res.statusCode).toBe(405);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
