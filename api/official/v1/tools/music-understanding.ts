import type { IncomingMessage, ServerResponse } from 'node:http';
import { authenticateUser } from '../../../../server/session-utils.js';
import { HUMMING_LLM_MODEL_VERSION, HUMMING_RECORDING_LIMIT_SECONDS } from '../../../../src/types/humming.js';
import { MUSIC_ANALYSIS_SAMPLE_RATE, parseMusicUnderstanding } from '../../../../shared/music-understanding.js';


export const config = { api: { bodyParser: false }, maxDuration: 45 };
const MAX_AUDIO_BYTES = 44 + MUSIC_ANALYSIS_SAMPLE_RATE * 2 * (HUMMING_RECORDING_LIMIT_SECONDS + 1);

function resolveEndpoint(baseUrl: string): URL | null {
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null;
    const path = url.pathname.replace(/\/+$/, '');
    if (!/\/compatible-mode\/v1(?:\/chat\/completions)?$/.test(path)) return null;
    url.pathname = path.endsWith('/chat/completions') ? path : path + '/chat/completions';
    return url;
  } catch {
    return null;
  }
}

function parseCompletion(content: unknown) {
  if (typeof content !== 'string') return null;
  try {
    const json = content.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1');
    return parseMusicUnderstanding(JSON.parse(json));
  } catch {
    return null;
  }
}

function isRecordedWav(audio: Buffer): boolean {
  // The studio encoder writes a fixed 44-byte PCM header.
  return audio.length > 44 && audio.length % 2 === 0
    && audio.toString('ascii', 0, 4) === 'RIFF'
    && audio.readUInt32LE(4) === audio.length - 8
    && audio.toString('ascii', 8, 16) === 'WAVEfmt '
    && audio.readUInt32LE(16) === 16
    && audio.readUInt16LE(20) === 1
    && audio.readUInt16LE(22) === 1
    && audio.readUInt32LE(24) === MUSIC_ANALYSIS_SAMPLE_RATE
    && audio.readUInt32LE(28) === MUSIC_ANALYSIS_SAMPLE_RATE * 2
    && audio.readUInt16LE(32) === 2
    && audio.readUInt16LE(34) === 16
    && audio.toString('ascii', 36, 40) === 'data'
    && audio.readUInt32LE(40) === audio.length - 44;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const send = (status: number, body: unknown) => {
    if (res.destroyed || res.writableEnded) return;
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(JSON.stringify(body));
  };

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(405, { code: 'method_not_allowed' });
  }
  if (req.headers['content-type'] !== 'audio/wav') return send(415, { code: 'invalid_audio' });
  if (Number(req.headers['content-length']) > MAX_AUDIO_BYTES) return send(413, { code: 'audio_too_large' });

  const apiKey = process.env.QWEN_OMNI_API_KEY?.trim();
  const baseUrl = process.env.QWEN_OMNI_BASE_URL?.trim();
  if (!apiKey || !baseUrl) return send(503, { code: 'not_configured' });
  const endpoint = resolveEndpoint(baseUrl);
  if (!endpoint) return send(503, { code: 'invalid_provider_url' });

  const cancel = new AbortController();
  const onClose = () => cancel.abort();
  res.once('close', onClose);
  const timeout = AbortSignal.timeout(35_000);
  const signal = AbortSignal.any([cancel.signal, timeout]);
  let phase = 'authenticate';
  try {
    const auth = await authenticateUser(req);
    if (!auth) return send(401, { code: 'sign_in_required' });
    signal.throwIfAborted();

    phase = 'read_audio';
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req.iterator({ destroyOnReturn: false })) {
      signal.throwIfAborted();
      const bytes = Buffer.from(chunk);
      size += bytes.length;
      if (size > MAX_AUDIO_BYTES) return send(413, { code: 'audio_too_large' });
      chunks.push(bytes);
    }
    const audio = Buffer.concat(chunks, size);
    if (!isRecordedWav(audio)) return send(400, { code: 'invalid_audio' });

    const language = req.headers['accept-language']?.startsWith('zh') ? 'Simplified Chinese' : 'English';
    const audioInput = {
      type: 'input_audio',
      input_audio: { data: `data:audio/wav;base64,${audio.toString('base64')}`, format: 'wav' },
    };
    const task = `Describe the style of this hummed melody in ${language}, based on the recording. Use 1–2 short sentences. Return a JSON object with one field named melody_style, a non-empty string.`;
    for (const structured of [true, false]) {
      signal.throwIfAborted();
      phase = 'call_qwen';
      const upstream = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        signal,
        redirect: 'error',
        body: JSON.stringify({
          model: HUMMING_LLM_MODEL_VERSION,
          modalities: ['text'],
          stream: false,
          reasoning_effort: 'none',
          max_tokens: 300,
          ...(structured ? { response_format: { type: 'json_object' } } : {}),
          messages: [{
            role: 'user',
            content: [
              audioInput,
              {
                type: 'text',
                text: task,
              },
            ],
          }],
        }),
      });
      if (!upstream.ok) {
        const status = upstream.status;
        console.warn('[music-understanding] Qwen rejected request', {
          status,
          requestId: upstream.headers.get('x-request-id')?.slice(0, 100),
        });
        await upstream.body?.cancel().catch(() => undefined);
        if (status === 429) return send(429, { code: 'rate_limited' });
        if (status === 401 || status === 403) return send(502, { code: 'provider_auth_failed' });
        if (status === 404 || status === 405) return send(502, { code: 'provider_endpoint_failed' });
        if (status === 400 || status === 422) return send(502, { code: 'provider_rejected_audio' });
        return send(502, { code: 'upstream_failed' });
      }
      phase = 'read_result';
      const payload = await upstream.json().catch(() => null) as { choices?: Array<{ message?: { content?: unknown }; finish_reason?: string }> } | null;
      signal.throwIfAborted();
      const choice = payload?.choices?.[0];
      const content = choice?.message?.content;
      const reason = choice?.finish_reason;
      const result = reason === 'content_filter' ? null : parseCompletion(content);
      if (result) return send(200, result);

      console.warn('[music-understanding] Qwen returned an invalid result', {
        requestId: upstream.headers.get('x-request-id')?.slice(0, 100),
        responseFormat: structured ? 'json_object' : 'default',
        finishReason: typeof reason === 'string' ? reason.slice(0, 40) : undefined,
        contentLength: typeof content === 'string' ? content.length : 0,
      });
      if (reason === 'content_filter') break;
      // Retry the same JSON instructions without the API response-format setting.
    }
    send(502, { code: 'invalid_result' });
  } catch {
    if (cancel.signal.aborted) return;
    console.warn('[music-understanding] Request failed', { phase, timedOut: timeout.aborted });
    if (timeout.aborted) return send(504, { code: 'timeout' });
    if (phase === 'authenticate') return send(503, { code: 'session_check_failed' });
    if (phase === 'read_audio') return send(400, { code: 'invalid_audio' });
    send(502, { code: 'upstream_failed' });
  } finally {
    res.removeListener('close', onClose);
  }
}
