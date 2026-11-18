import { PassThrough, Writable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../../api/official/v1/tools/music-understanding';
import { authenticateUser } from '../../server/session-utils';
import { encodeWav16 } from '../../src/lib/wav';
import { MUSIC_ANALYSIS_SAMPLE_RATE } from '../../shared/music-understanding';

vi.mock('../../server/session-utils', () => ({ authenticateUser: vi.fn() }));

const analysis = {
  melody: 'One held note rises at the end.',
  rhythm: 'Two short phrases separated by a pause.',
  suggestions: 'Keep the final note long.',
};
const fetchUpstream = vi.fn<typeof fetch>();

async function post(audio: Buffer) {
  const req = Object.assign(new PassThrough(), {
    method: 'POST',
    headers: { 'content-type': 'audio/wav' },
  }) as unknown as IncomingMessage;
  const output: Buffer[] = [];
  const res = Object.assign(new Writable({
    write(chunk: Buffer, _encoding, callback) {
      output.push(chunk);
      callback();
    },
  }), { statusCode: 200, setHeader: vi.fn() }) as unknown as ServerResponse;
  req.push(audio);
  req.push(null);
  await handler(req, res);
  return { status: res.statusCode, data: JSON.parse(Buffer.concat(output).toString()) };
}

function wav() {
  return Buffer.from(encodeWav16([new Float32Array(100)], MUSIC_ANALYSIS_SAMPLE_RATE));
}

describe('music understanding route', () => {
  beforeEach(() => {
    vi.stubEnv('QWEN_OMNI_API_KEY', 'test-key');
    vi.stubEnv('QWEN_OMNI_BASE_URL', 'https://qwen.example/compatible-mode/v1');
    vi.stubGlobal('fetch', fetchUpstream);
    vi.mocked(authenticateUser).mockResolvedValue({} as NonNullable<Awaited<ReturnType<typeof authenticateUser>>>);
    fetchUpstream.mockResolvedValue(Response.json({
      choices: [{ message: { content: JSON.stringify(analysis) }, finish_reason: 'stop' }],
    }));
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('sends the exact WAV to Qwen and returns the validated analysis', async () => {
    const audio = wav();
    expect(await post(audio)).toEqual({ status: 200, data: analysis });
    const [url, init] = fetchUpstream.mock.calls[0];
    expect(String(url)).toBe('https://qwen.example/compatible-mode/v1/chat/completions');
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: 'qwen3.8-omni-flash',
      stream: false,
      messages: [{ content: expect.arrayContaining([{
        type: 'input_audio', input_audio: { data: `data:audio/wav;base64,${audio.toString('base64')}`, format: 'wav' },
      }]) }],
    });
  });

  it('checks authentication and audio validity before charging for a request', async () => {
    vi.mocked(authenticateUser).mockResolvedValueOnce(null);
    expect((await post(wav())).status).toBe(401);
    expect((await post(Buffer.from('invalid'))).status).toBe(400);
    expect(fetchUpstream).not.toHaveBeenCalled();
  });

  it('rejects an incomplete model result', async () => {
    fetchUpstream.mockResolvedValueOnce(Response.json({
      choices: [{ message: { content: '{"melody":"humming"}' }, finish_reason: 'stop' }],
    }));
    expect(await post(wav())).toEqual({ status: 502, data: { code: 'invalid_result' } });
  });
});
