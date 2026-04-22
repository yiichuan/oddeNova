import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { copyFileSync, mkdirSync } from 'fs'
import { resolve } from 'path'
import type { Plugin } from 'vite'

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
  plugins: [react(), tailwindcss(), syncAnimationHtml()],
})
