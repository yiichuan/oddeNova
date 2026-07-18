import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { copyFileSync, mkdirSync, readFileSync, existsSync } from 'fs'
import { resolve, join } from 'path'
import { homedir } from 'os'
import type { IncomingMessage, ServerResponse } from 'http'
import type { Plugin } from 'vite'
import sessionsHandler from './api/sessions'
import sessionByIdHandler from './api/sessions/[id]'
import authEmailHandler from './api/auth-email'

interface AirJellyRuntime {
  port: number
  token: string
}

function loadAirJellyRuntime(): AirJellyRuntime | null {
  // macOS only – AirJelly Desktop does not support Windows/Linux
  const p = join(
    homedir(),
    'Library', 'Application Support', 'AirJelly', 'runtime.json'
  )
  if (!existsSync(p)) return null
  try {
    return JSON.parse(readFileSync(p, 'utf-8')) as AirJellyRuntime
  } catch {
    return null
  }
}

function airjellyProxy(): Plugin {
  return {
    name: 'airjelly-proxy',
    configureServer(server) {
      // GET /api/airjelly-runtime → { available }
      server.middlewares.use(
        '/api/airjelly-runtime',
        (_req: IncomingMessage, res: ServerResponse) => {
          const runtime = loadAirJellyRuntime()
          res.setHeader('Content-Type', 'application/json')
          if (!runtime) {
            res.end(JSON.stringify({ available: false }))
            return
          }
          // Verify the service is actually running, not just the config file exists
          fetch(`http://127.0.0.1:${runtime.port}/rpc`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${runtime.token}`,
            },
            body: JSON.stringify({ method: 'ping', args: [] }),
            signal: AbortSignal.timeout(1000),
          })
            .then(() => {
              res.end(JSON.stringify({ available: true }))
            })
            .catch(() => {
              res.end(JSON.stringify({ available: false }))
            })
        }
      )

      // POST /api/airjelly-rpc → proxy to http://127.0.0.1:{port}/rpc
      server.middlewares.use(
        '/api/airjelly-rpc',
        (req: IncomingMessage, res: ServerResponse) => {
          const runtime = loadAirJellyRuntime()
          if (!runtime) {
            res.statusCode = 503
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: false, error: 'AirJelly not running' }))
            return
          }
          if (req.method !== 'POST') {
            res.statusCode = 405
            res.end()
            return
          }
          let body = ''
          req.on('data', (chunk: Buffer) => { body += chunk.toString() })
          req.on('error', () => {
            res.statusCode = 400
            res.end()
          })
          req.on('end', () => {
            fetch(`http://127.0.0.1:${runtime.port}/rpc`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${runtime.token}`,
              },
              body,
            })
              .then(r => r.text())
              .then(text => {
                res.setHeader('Content-Type', 'application/json')
                res.end(text)
              })
              .catch(() => {
                res.statusCode = 502
                res.setHeader('Content-Type', 'application/json')
                res.end(JSON.stringify({ ok: false, error: 'AirJelly RPC failed' }))
              })
          })
        }
      )
    },
  }
}

// Local dev proxy for /api/official — mirrors the Vercel serverless function at
// api/official/v1/chat/completions.ts so the 'official' provider works locally.
// Reads OFFICIAL_API_KEY (or VITE_API_KEY as fallback) from the process env.
function officialApiDevMiddleware(): Plugin {
  const UPSTREAM = 'https://api.deepseek.com/v1/chat/completions'

  return {
    name: 'official-api-dev-middleware',
    configureServer(server) {
      server.middlewares.use(
        '/api/official/v1/chat/completions',
        async (req: IncomingMessage, res: ServerResponse) => {
          if (req.method !== 'POST') {
            res.statusCode = 405
            res.end(JSON.stringify({ error: 'Method not allowed' }))
            return
          }

          const apiKey = process.env.OFFICIAL_API_KEY || process.env.VITE_API_KEY || ''
          if (!apiKey) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'OFFICIAL_API_KEY or VITE_API_KEY is not set in your .env file' }))
            return
          }

          let body = ''
          req.on('data', (chunk: Buffer) => { body += chunk.toString() })
          req.on('end', async () => {
            try {
              const upstream = await fetch(UPSTREAM, {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${apiKey}`,
                  'Content-Type': 'application/json',
                },
                body,
              })

              const contentType = upstream.headers.get('content-type') || 'application/json'
              res.setHeader('Content-Type', contentType)
              res.setHeader('Cache-Control', 'no-cache, no-transform')
              res.statusCode = upstream.status

              if (upstream.body) {
                const reader = upstream.body.getReader()
                const decoder = new TextDecoder()
                while (true) {
                  const { done, value } = await reader.read()
                  if (done) break
                  res.write(decoder.decode(value, { stream: true }))
                }
                res.end(decoder.decode())
              } else {
                res.end()
              }
            } catch (_err) {
              res.statusCode = 502
              res.end(JSON.stringify({ error: 'Official provider proxy failed' }))
            }
          })
        }
      )
    },
  }
}

// Local dev mock for /api/share — uses an in-memory Map instead of Vercel Blob.
// In production, Vercel routes /api/* to real serverless functions.
function shareDevMiddleware(): Plugin {
  const store = new Map<string, string>()

  function randomId(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
    let id = ''
    for (let i = 0; i < 10; i++) id += chars[Math.floor(Math.random() * chars.length)]
    return id
  }

  return {
    name: 'share-dev-middleware',
    configureServer(server) {
      server.middlewares.use(
        '/api/share',
        (req: IncomingMessage, res: ServerResponse) => {
          res.setHeader('Content-Type', 'application/json')

          if (req.method === 'POST') {
            const MAX_BYTES = 256 * 1024
            let body = ''
            req.on('data', (chunk: Buffer) => { body += chunk.toString() })
            req.on('end', () => {
              if (body.length > MAX_BYTES) {
                res.statusCode = 413
                res.end(JSON.stringify({ error: 'Payload too large' }))
                return
              }
              const shareId = randomId()
              store.set(shareId, body)
              res.statusCode = 200
              res.end(JSON.stringify({ shareId }))
            })
            req.on('error', () => {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'Bad request' }))
            })
            return
          }

          if (req.method === 'GET') {
            const url = new URL(req.url ?? '', 'http://localhost')
            const id = url.searchParams.get('id')
            if (!id) {
              res.statusCode = 400
              res.end(JSON.stringify({ error: 'Missing id' }))
              return
            }
            const payload = store.get(id)
            if (!payload) {
              res.statusCode = 404
              res.end(JSON.stringify({ error: 'Not found' }))
              return
            }
            res.statusCode = 200
            res.end(payload)
            return
          }

          res.statusCode = 405
          res.end(JSON.stringify({ error: 'Method not allowed' }))
        }
      )
    },
  }
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk: Buffer) => { body += chunk.toString() })
    req.on('error', reject)
    req.on('end', () => {
      if (!body) {
        resolve(undefined)
        return
      }
      try {
        resolve(JSON.parse(body))
      } catch (error) {
        reject(error)
      }
    })
  })
}

function runVercelHandler(
  handler: typeof sessionsHandler,
  req: IncomingMessage,
  res: ServerResponse,
  query: Record<string, string> = {},
  body?: unknown,
): Promise<void> {
  return new Promise((resolve) => {
    const response = {
      status(code: number) {
        res.statusCode = code
        return response
      },
      json(payload: unknown) {
        if (!res.headersSent) res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify(payload))
        resolve()
        return response
      },
    }

    void Promise.resolve(handler({
      method: req.method,
      headers: req.headers,
      query,
      body,
    } as never, response as never)).then(() => {
      if (!res.writableEnded) resolve()
    }).catch((error) => {
      if (!res.writableEnded) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }))
      }
      resolve()
    })
  })
}

function sessionsDevMiddleware(): Plugin {
  return {
    name: 'sessions-api-dev-middleware',
    configureServer(server) {
      server.middlewares.use(
        '/api/sessions',
        async (req: IncomingMessage, res: ServerResponse) => {
          const pathname = new URL(req.url ?? '', 'http://localhost').pathname

          try {
            if (pathname === '/' || pathname === '') {
              await runVercelHandler(sessionsHandler, req, res)
              return
            }

            const id = decodeURIComponent(pathname.replace(/^\//, ''))
            const body = req.method === 'PUT' ? await readJsonBody(req) : undefined
            await runVercelHandler(sessionByIdHandler, req, res, { id }, body)
          } catch (error) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Bad request' }))
          }
        }
      )
    },
  }
}

function authEmailDevMiddleware(): Plugin {
  return {
    name: 'auth-email-api-dev-middleware',
    configureServer(server) {
      server.middlewares.use(
        '/api/auth-email',
        async (req: IncomingMessage, res: ServerResponse) => {
          try {
            const body = req.method === 'POST' ? await readJsonBody(req) : undefined
            await runVercelHandler(authEmailHandler, req, res, {}, body)
          } catch (error) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Bad request' }))
          }
        }
      )
    },
  }
}

// Mirrors src/animation/*.html → public/animation/ so the iframe can load them
// as static assets. Runs once on startup and again on every hot-module update.
function syncAnimationHtml(): Plugin {
  const src  = resolve(__dirname, 'src/animation/galaxy.html')
  const dest = resolve(__dirname, 'public/animation/galaxy.html')
  const sync = () => {
    mkdirSync(resolve(__dirname, 'public/animation'), { recursive: true })
    copyFileSync(src, dest)
  }
  return {
    name: 'sync-animation-html',
    buildStart: sync,
    handleHotUpdate({ file }) {
      if (file === src) sync()
    },
  }
}

export default defineConfig(({ mode }) => {
  // Vite only exposes VITE_-prefixed vars to import.meta.env and does not
  // populate process.env from .env files. The dev API middlewares
  // (officialApiDevMiddleware) read server-side keys from process.env, so
  // load the full .env here and merge any missing keys in (shell env wins).
  const env = loadEnv(mode, process.cwd(), '')
  for (const key of ['OFFICIAL_API_KEY', 'VITE_API_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'RESEND_API_KEY', 'EMAIL_FROM']) {
    if (!process.env[key] && env[key]) process.env[key] = env[key]
  }

  return {
    plugins: [react(), tailwindcss(), airjellyProxy(), officialApiDevMiddleware(), shareDevMiddleware(), sessionsDevMiddleware(), authEmailDevMiddleware(), syncAnimationHtml()],
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          presentation: resolve(__dirname, 'presentation.html'),
        },
      },
    },
  }
})
