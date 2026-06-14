import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { copyFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'
import type { IncomingMessage, ServerResponse } from 'http'
import type { Plugin } from 'vite'

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

export default defineConfig({
  plugins: [react(), tailwindcss(), officialApiDevMiddleware(), shareDevMiddleware(), syncAnimationHtml()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        presentation: resolve(__dirname, 'presentation.html'),
      },
    },
  },
})
