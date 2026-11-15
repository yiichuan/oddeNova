import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolveOfficialApiKey } from '../../../../server/official-api-key';

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const sendError = (status: number, message: string) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ message }));
  };

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendError(405, 'Method not allowed');
    return;
  }

  const contentType = req.headers['content-type'];
  if (!contentType?.startsWith('multipart/form-data;')) {
    sendError(415, 'Expected a multipart audio upload');
    return;
  }

  const apiKey = resolveOfficialApiKey();
  if (!apiKey) {
    sendError(503, 'Official DeepSeek API key is not configured');
    return;
  }

  try {
    const chunks: Buffer[] = [];
    let size = 0;
    // Preserve the multipart boundary and binary audio as sent by the browser.
    for await (const chunk of req.iterator({ destroyOnReturn: false })) {
      const buffer = Buffer.from(chunk);
      size += buffer.length;
      if (size > MAX_UPLOAD_BYTES) {
        sendError(413, 'Audio upload is too large');
        return;
      }
      chunks.push(buffer);
    }

    if (!size) {
      sendError(400, 'Audio upload is empty');
      return;
    }

    const upstream = await fetch('https://api.deepseek.com/v1/tools/asr', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': contentType },
      body: Buffer.concat(chunks, size),
      redirect: 'error',
    });

    const body = await upstream.text();
    res.statusCode = upstream.status;
    res.setHeader('Content-Type', 'application/json');
    res.end(body);
  } catch {
    sendError(502, 'Official DeepSeek transcription request failed');
  }
}
