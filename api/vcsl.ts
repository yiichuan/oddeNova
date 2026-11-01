import type { VercelRequest, VercelResponse } from '@vercel/node';
import { vcslProxyHandler } from '../server/vcsl-proxy.js';

/* GET /api/vcsl?path=<VCSL file path> — see server/vcsl-proxy.ts for why the
   VCSL sample files have to come through here. */
export default function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  return vcslProxyHandler(req, res);
}
