import { app, shell, Tray, Menu, nativeImage } from 'electron'
import * as http from 'http'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const PORT = 5174
const APP_URL = `http://localhost:${PORT}`

interface AirJellyRuntime {
  port: number
  token: string
}

function loadAirJellyRuntime(): AirJellyRuntime | null {
  const p = path.join(
    os.homedir(),
    'Library', 'Application Support', 'AirJelly', 'runtime.json'
  )
  if (!fs.existsSync(p)) return null
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as AirJellyRuntime
  } catch {
    return null
  }
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf':  'font/ttf',
  '.wasm': 'application/wasm',
}

function startServer(distPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const reqUrl = req.url ?? '/'

      // AirJelly runtime check
      if (reqUrl === '/api/airjelly-runtime') {
        const runtime = loadAirJellyRuntime()
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ available: !!runtime }))
        return
      }

      // AirJelly RPC proxy
      if (reqUrl === '/api/airjelly-rpc') {
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
        req.on('error', () => { res.statusCode = 400; res.end() })
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
            .then(text => { res.setHeader('Content-Type', 'application/json'); res.end(text) })
            .catch(() => {
              res.statusCode = 502
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ ok: false, error: 'AirJelly RPC failed' }))
            })
        })
        return
      }

      // Static file serving with SPA fallback
      const urlPath = reqUrl.split('?')[0]
      let filePath = path.join(distPath, urlPath === '/' ? 'index.html' : urlPath)

      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(distPath, 'index.html')
      }

      const ext = path.extname(filePath)
      res.setHeader('Content-Type', MIME_TYPES[ext] ?? 'application/octet-stream')
      fs.createReadStream(filePath)
        .on('error', () => { res.statusCode = 404; res.end() })
        .pipe(res)
    })

    server.listen(PORT, '127.0.0.1', () => resolve())
    server.on('error', reject)
  })
}

// Single instance lock — let the running instance handle reactivation
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    shell.openExternal(APP_URL)
  })
}

let tray: Tray | null = null

app.whenReady().then(async () => {
  const distPath = app.isPackaged
    ? path.join(process.resourcesPath, 'dist')
    : path.join(__dirname, '..', 'dist')

  await startServer(distPath)
  await shell.openExternal(APP_URL)

  // Minimal 1×1 transparent tray icon as fallback (replaced by real icon if present)
  const iconPath = path.join(
    app.isPackaged ? process.resourcesPath : path.join(__dirname, '..', 'public'),
    'favicon.ico'
  )
  const icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    : nativeImage.createEmpty()

  tray = new Tray(icon)
  tray.setToolTip('oddeNova')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '打开 oddeNova', click: () => shell.openExternal(APP_URL) },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() },
    ])
  )
})

app.on('window-all-closed', () => {
  // Keep running — do not quit
})

app.on('activate', () => {
  shell.openExternal(APP_URL)
})
