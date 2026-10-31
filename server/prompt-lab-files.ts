import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, rename, rm, writeFile, realpath } from 'node:fs/promises';
import { sep, resolve, join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

const COLLECTIONS = new Set(['templates', 'suites', 'runs', 'reviews', 'traces', 'comparisons']);
const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,239}$/;
const MAX_BODY_BYTES = 32 * 1024 * 1024;

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(value));
}

function requestIsLocal(req: IncomingMessage, write: boolean): boolean {
  const host = req.headers.host?.toLowerCase().split(':')[0];
  if (host !== '127.0.0.1' && host !== 'localhost') return false;
  if (req.headers['sec-fetch-site'] === 'cross-site') return false;
  if (!write) return true;
  const origin = req.headers.origin;
  if (!origin) return false;
  try {
    const parsed = new URL(origin);
    return parsed.protocol === 'http:' && parsed.host.toLowerCase() === req.headers.host?.toLowerCase();
  } catch {
    return false;
  }
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolveBody, reject) => {
    let body = '';
    let size = 0;
    let tooLarge = false;
    req.on('data', (chunk: Buffer) => {
      size += chunk.byteLength;
      if (size > MAX_BODY_BYTES) {
        tooLarge = true;
        reject(new Error('payload-too-large'));
        return;
      }
      body += chunk.toString('utf8');
    });
    req.on('error', reject);
    req.on('end', () => {
      if (tooLarge) return;
      try {
        resolveBody(JSON.parse(body));
      } catch {
        reject(new Error('invalid-json'));
      }
    });
  });
}

async function ensureCollection(root: string, collection: string): Promise<string> {
  const dir = resolve(root, collection);
  await mkdir(dir, { recursive: true });
  const [workspace, realRoot, realDir] = await Promise.all([
    realpath(resolve(root, '../..')),
    realpath(root),
    realpath(dir),
  ]);
  if (!realRoot.startsWith(`${workspace}${sep}`)) throw new Error('unsafe-storage-root');
  if (!realDir.startsWith(`${realRoot}${sep}`)) throw new Error('unsafe-storage-path');
  return realDir;
}

async function readCollection(root: string, collection: string): Promise<unknown[]> {
  const dir = await ensureCollection(root, collection);
  const entries = await readdir(dir, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.json'));
  const values = await Promise.all(files.map(async (entry) => {
    try {
      return JSON.parse(await readFile(join(dir, entry.name), 'utf8')) as unknown;
    } catch {
      return null;
    }
  }));
  return values.filter((value) => value !== null);
}

export function promptLabFilesPlugin(workspaceRoot: string): Plugin {
  const dataRoot = resolve(workspaceRoot, '.local/prompt-lab');
  const locks = new Map<string, Promise<void>>();

  return {
    name: 'prompt-lab-local-files',
    configureServer(server) {
      if (server.config.mode !== 'lab') return;

      server.middlewares.use('/__lab/api', async (req, res) => {
        const method = req.method ?? 'GET';
        if (!requestIsLocal(req, method !== 'GET')) {
          sendJson(res, 403, { error: 'Local same-origin access required' });
          return;
        }

        const url = new URL(req.url ?? '/', 'http://127.0.0.1');
        const [collection, id] = url.pathname.split('/').filter(Boolean);
        if (url.pathname === '/meta' && method === 'GET') {
          try {
            const active = await readFile(join(workspaceRoot, 'src/prompts/active.ts'), 'utf8');
            const version = active.match(/versions\/(v\d+)/)?.[1] ?? 'unknown';
            let commit: string | null = null;
            let dirty = true;
            try {
              commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: workspaceRoot, encoding: 'utf8' }).trim();
              dirty = !!execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: workspaceRoot, encoding: 'utf8' }).trim();
            } catch { /* Git metadata is optional. */ }
            sendJson(res, 200, { version, commit, dirty });
          } catch { sendJson(res, 500, { error: 'Cannot read prompt metadata' }); }
          return;
        }

        if (!collection || !COLLECTIONS.has(collection) || (id && !SAFE_ID.test(id))) {
          sendJson(res, 404, { error: 'Unknown local resource' });
          return;
        }

        const lockKey = `${collection}/${id ?? ''}`;
        const previous = locks.get(lockKey) ?? Promise.resolve();
        let release!: () => void;
        const pending = new Promise<void>(resolveLock => { release = resolveLock; });
        if (method !== 'GET') { locks.set(lockKey, pending); await previous; }
        try {
          const dir = await ensureCollection(dataRoot, collection);
          if (method === 'GET' && !id) {
            sendJson(res, 200, await readCollection(dataRoot, collection));
            return;
          }
          if (method === 'GET' && id) {
            const path = join(dir, `${id}.json`);
            const stat = await lstat(path).catch(() => null);
            if (!stat?.isFile() || stat.isSymbolicLink()) {
              sendJson(res, 404, { error: 'Not found' });
              return;
            }
            sendJson(res, 200, JSON.parse(await readFile(path, 'utf8')) as unknown);
            return;
          }
          if (method === 'PUT' && id) {
            if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') {
              sendJson(res, 415, { error: 'Content-Type must be application/json' });
              return;
            }
            const body = await readBody(req);
            if (!body || typeof body !== 'object' || Array.isArray(body) || (body as { id?: unknown }).id !== id) {
              sendJson(res, 400, { error: 'Invalid resource' });
              return;
            }
            const path = join(dir, `${id}.json`);
            const stat = await lstat(path).catch(() => null);
            if (stat && (!stat.isFile() || stat.isSymbolicLink())) {
              sendJson(res, 400, { error: 'Unsafe resource path' });
              return;
            }
            const current = stat ? JSON.parse(await readFile(path, 'utf8')) as { revision?: number } : null;
            const record = body as { revision?: unknown; updatedAt?: unknown };
            const actualRevision = current && typeof current.revision === 'number' ? current.revision : 0;
            if (record.revision !== actualRevision) {
              sendJson(res, 409, { error: 'Revision conflict', currentRevision: actualRevision });
              return;
            }
            // Large transcripts are separate resources; listing runs stays small.
            if (collection === 'runs') {
              const run = body as { results?: Array<{ left: Array<{ trace?: unknown[]; traceId?: string }>; right: Array<{ trace?: unknown[]; traceId?: string }> }> };
              const traceDir = await ensureCollection(dataRoot, 'traces');
              for (const item of run.results ?? []) for (const side of [item.left, item.right]) for (const result of side) {
                if (!result.trace?.length) continue;
                const traceId = `trace-${createHash('sha256').update(JSON.stringify(result.trace)).digest('hex')}`;
                const temporaryTrace = join(traceDir, `.write-${randomUUID()}.tmp`);
                await writeFile(temporaryTrace, JSON.stringify({ id: traceId, events: result.trace }), { mode: 0o600, flag: 'wx' });
                await rename(temporaryTrace, join(traceDir, `${traceId}.json`));
                result.traceId = traceId;
                result.trace = [];
              }
            }
            const saved = {
              ...(body as Record<string, unknown>),
              revision: actualRevision + 1,
              updatedAt: new Date().toISOString(),
            };
            const temporary = join(dir, `.write-${randomUUID()}.tmp`);
            await writeFile(temporary, JSON.stringify(saved, null, 2), { encoding: 'utf8', flag: 'wx', mode: 0o600 });
            await rename(temporary, path);
            sendJson(res, 200, saved);
            return;
          }
          if (method === 'DELETE' && id) {
            const path = join(dir, `${id}.json`);
            const stat = await lstat(path).catch(() => null);
            if (!stat?.isFile() || stat.isSymbolicLink()) {
              sendJson(res, 404, { error: 'Not found' });
              return;
            }
            await rm(path);
            sendJson(res, 200, { ok: true });
            return;
          }
          sendJson(res, 405, { error: 'Method not allowed' });
        } catch (error) {
          if (error instanceof Error && error.message === 'payload-too-large') {
            sendJson(res, 413, { error: 'Payload too large' });
            return;
          }
          if (error instanceof Error && error.message === 'invalid-json') {
            sendJson(res, 400, { error: 'Invalid JSON' });
            return;
          }
          sendJson(res, 500, { error: 'Local prompt-lab storage failed' });
          server.config.logger.error(`[prompt-lab] ${error instanceof Error ? error.message : String(error)}`);
        } finally {
          if (method !== 'GET') { release(); if (locks.get(lockKey) === pending) locks.delete(lockKey); }
        }
      });
    },
  };
}
