import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { Plugin } from 'vite';

const execFileAsync = promisify(execFile);

function logError(message: string, error: unknown) {
  const cause = error instanceof Error ? error : new Error(String(error));
  console.error(`[local-dev-tools] ${message}`, cause);
}
const toolPaths = new Set([
  '/local-tools', '/local-tools/',
  '/local-tools/prompt-compare', '/local-tools/prompt-compare/',
  '/sample-library', '/sample-library/',
]);

function isLocalRequest(req: IncomingMessage) {
  const address = req.socket.remoteAddress ?? '';
  if (!['::1', '127.0.0.1', '::ffff:127.0.0.1'].includes(address) || !req.headers.host) return false;
  try {
    const host = new URL(`http://${req.headers.host}`).hostname;
    return ['localhost', '127.0.0.1', '[::1]'].includes(host);
  } catch {
    return false;
  }
}

function respond(res: ServerResponse, status: number, contentType: string, body: string | Buffer) {
  res.writeHead(status, { 'Content-Type': contentType, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
}

export function localDevTools(): Plugin {
  return {
    name: 'local-dev-tools',
    apply: 'serve',
    configureServer(server) {
      const root = server.config.root;
      const versionsDir = resolve(root, 'src/prompts/versions');
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const isToolsPage = toolPaths.has(url.pathname);
        const isPromptApi = url.pathname.startsWith('/api/local/prompts/');
        if (!isToolsPage && !isPromptApi) return next();
        if (!isLocalRequest(req)) return respond(res, 403, 'text/plain; charset=utf-8', '仅允许本机访问本地调试工具。');
        if (req.method !== 'GET') return respond(res, 405, 'text/plain; charset=utf-8', '仅支持 GET。');

        if (url.pathname === '/api/local/prompts/versions') {
          try {
            const names = await readdir(versionsDir);
            const versions = names.filter(name => /^v[1-9]\d*\.ts$/.test(name))
              .map(name => name.slice(0, -3))
              .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
            const activeFile = await readFile(resolve(root, 'src/prompts/active.ts'), 'utf8');
            const active = activeFile.match(/\.\/versions\/(v[1-9]\d*)/)?.[1] ?? null;
            return respond(res, 200, 'application/json; charset=utf-8', JSON.stringify({ versions, active }));
          } catch (error) {
            logError('Unable to list prompt versions', error);
            return respond(res, 500, 'text/plain; charset=utf-8', '读取提示词版本失败。');
          }
        }

        if (url.pathname === '/api/local/prompts/diff') {
          const from = url.searchParams.get('from') ?? '';
          const to = url.searchParams.get('to') ?? '';
          if (!/^v[1-9]\d*$/.test(from) || !/^v[1-9]\d*$/.test(to)) {
            return respond(res, 400, 'text/plain; charset=utf-8', '版本格式无效。');
          }
          try {
            const names = await readdir(versionsDir);
            if (![from, to].every(version => names.includes(`${version}.ts`))) {
              return respond(res, 404, 'text/plain; charset=utf-8', '找不到所选版本。');
            }
            const tempDir = await mkdtemp(join(tmpdir(), 'oddenova-prompt-diff-'));
            try {
              const output = join(tempDir, 'comparison.html');
              await execFileAsync(process.execPath, [
                '--import=tsx/esm', resolve(root, 'scripts/prompt-diff.mjs'),
                '--from', from, '--to', to, '--out', output,
              ], { cwd: root, timeout: 30_000, maxBuffer: 2 * 1024 * 1024 });
              return respond(res, 200, 'text/html; charset=utf-8', await readFile(output));
            } finally {
              await rm(tempDir, { recursive: true, force: true });
            }
          } catch (error) {
            logError('Unable to render prompt comparison', error);
            return respond(res, 500, 'text/plain; charset=utf-8', '生成提示词比较失败，请查看 Vite 终端日志。');
          }
        }
        return next();
      });
    },
  };
}
