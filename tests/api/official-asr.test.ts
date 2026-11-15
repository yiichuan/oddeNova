import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { afterEach, expect, it, vi } from 'vitest';
import handler from '../../api/official/v1/tools/asr';
import { transcribeWithDeepSeek } from '../../src/services/deepseek-asr';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const audioBytes = new Uint8Array([0x4f, 0x67, 0x67, 0x53, 0xff, 0x00]);
const makeRecording = () => new Blob([audioBytes], { type: 'audio/ogg' });

it('transcribes without a personal key using the official proxy and preserves the audio bytes', async () => {
  vi.stubEnv('OFFICIAL_API_KEY', 'official-key');
  vi.stubEnv('VITE_API_KEY', 'legacy-key');
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    if (url === '/api/official/v1/tools/asr') {
      const upload = new Request(`https://oddenova.example${url}`, init);
      expect(upload.headers.has('authorization')).toBe(false);

      const req = Object.assign(Readable.from([Buffer.from(await upload.arrayBuffer())]), {
        method: upload.method,
        headers: Object.fromEntries(upload.headers),
      });
      let body = '';
      const res = { statusCode: 200, setHeader: vi.fn(), end: (value: string) => { body = value; } };
      await handler(req as unknown as IncomingMessage, res as unknown as ServerResponse);
      return new Response(body, { status: res.statusCode });
    }

    expect(url).toBe('https://api.deepseek.com/v1/tools/asr');
    const upstream = new Request(url, init);
    expect(upstream.headers.get('authorization')).toBe('Bearer official-key');
    const file = (await upstream.formData()).get('file') as File;
    expect(file.name).toBe('voice.ogg');
    expect(new Uint8Array(await file.arrayBuffer())).toEqual(audioBytes);
    return Response.json({ text: ' 生成一段音乐 ' });
  });
  vi.stubGlobal('fetch', fetchMock);

  await expect(transcribeWithDeepSeek(makeRecording(), ' ', new AbortController().signal))
    .resolves.toBe('生成一段音乐');
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it('keeps a configured personal key on the direct path even if DeepSeek rejects it', async () => {
  const fetchMock = vi.fn().mockResolvedValue(Response.json({ message: 'Invalid key' }, { status: 401 }));
  vi.stubGlobal('fetch', fetchMock);

  await expect(transcribeWithDeepSeek(makeRecording(), 'personal-key', new AbortController().signal))
    .rejects.toThrow('DEEPSEEK_ASR_401');
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith(
    'https://api.deepseek.com/v1/tools/asr',
    expect.objectContaining({ headers: { Authorization: 'Bearer personal-key' } }),
  );
});
