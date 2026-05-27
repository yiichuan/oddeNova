import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { copyFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'
import type { IncomingMessage, ServerResponse } from 'http'
import type { Plugin } from 'vite'

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
  plugins: [react(), tailwindcss(), shareDevMiddleware(), syncAnimationHtml()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        presentation: resolve(__dirname, 'presentation.html'),
      },
    },
  },
})
