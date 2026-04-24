import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { copyFileSync, mkdirSync, readFileSync, existsSync } from 'fs'
import { resolve, join } from 'path'
import { homedir } from 'os'
import type { IncomingMessage, ServerResponse } from 'http'
import type { Plugin } from 'vite'

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
          res.end(JSON.stringify({ available: true }))
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
  plugins: [react(), tailwindcss(), airjellyProxy(), syncAnimationHtml()],
})
