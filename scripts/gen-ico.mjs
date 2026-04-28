import sharp from 'sharp'
import pngToIco from 'png-to-ico'
import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

// 1. SVG → 各尺寸 PNG buffer
const svgBuffer = readFileSync(resolve(root, 'logo/OddeNova-Logo.svg'))

const sizes = [16, 32, 48, 64, 128, 256]
const pngBuffers = await Promise.all(
  sizes.map(size =>
    sharp(svgBuffer)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer()
  )
)

// 2. PNG buffers → ICO
const icoBuffer = await pngToIco(pngBuffers)
writeFileSync(resolve(root, 'public/icon.ico'), icoBuffer)
console.log('Generated public/icon.ico')
