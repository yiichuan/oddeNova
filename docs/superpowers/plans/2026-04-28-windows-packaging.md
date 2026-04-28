# Windows Packaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 oddeNova 添加 Windows NSIS 安装包构建支持，通过 GitHub Actions 在 `windows-latest` runner 上自动构建，产物上传为 Workflow Artifact。

**Architecture:** 修改 `electron/main.ts` 以跳过 Windows 上的 AirJelly 路径读取；更新 `package.json` 补充 Windows 构建配置和 `dist:win` 脚本；新建 GitHub Actions 工作流文件；从现有 SVG logo 生成 `.ico` 图标。

**Tech Stack:** Electron, electron-builder, NSIS, GitHub Actions, Inkscape/sharp（图标转换）

---

## 文件结构

| 状态 | 文件 | 改动说明 |
|------|------|---------|
| 修改 | `electron/main.ts` | 加平台判断，Windows 跳过 AirJelly |
| 修改 | `package.json` | 添加 `dist:win` 脚本和 `win`/`nsis` 构建配置 |
| 新建 | `.github/workflows/build-windows.yml` | Windows CI 工作流 |
| 新建 | `public/icon.ico` | Windows 安装程序图标（从 SVG 转换） |
| 新建 | `scripts/gen-ico.mjs` | 图标生成脚本（构建完可删除） |

---

## Task 1：生成 Windows 图标

**Files:**
- Create: `scripts/gen-ico.mjs`
- Create: `public/icon.ico`

- [ ] **Step 1: 安装图标转换依赖**

```bash
npm install --save-dev sharp png-to-ico
```

预期输出：`added N packages`

- [ ] **Step 2: 创建图标生成脚本**

新建 `scripts/gen-ico.mjs`：

```js
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
```

- [ ] **Step 3: 运行脚本生成图标**

```bash
node scripts/gen-ico.mjs
```

预期输出：`Generated public/icon.ico`

验证：`ls -lh public/icon.ico` 应看到文件大小 > 0。

- [ ] **Step 4: 提交**

```bash
git add public/icon.ico scripts/gen-ico.mjs package.json package-lock.json
git commit -m "feat: generate windows icon from SVG logo"
```

---

## Task 2：修改 `electron/main.ts` 跳过 Windows AirJelly

**Files:**
- Modify: `electron/main.ts`

- [ ] **Step 1: 在 `loadAirJellyRuntime()` 开头加平台判断**

打开 `electron/main.ts`，找到：

```ts
function loadAirJellyRuntime(): AirJellyRuntime | null {
  const p = path.join(
    os.homedir(),
    'Library', 'Application Support', 'AirJelly', 'runtime.json'
  )
```

替换为：

```ts
function loadAirJellyRuntime(): AirJellyRuntime | null {
  // AirJelly currently only supports macOS
  if (process.platform !== 'darwin') return null

  const p = path.join(
    os.homedir(),
    'Library', 'Application Support', 'AirJelly', 'runtime.json'
  )
```

- [ ] **Step 2: 验证 TypeScript 编译通过**

```bash
npm run build:electron
```

预期输出：无报错，`dist-electron/main.js` 更新。

- [ ] **Step 3: 提交**

```bash
git add electron/main.ts
git commit -m "feat: skip AirJelly on non-macOS platforms"
```

---

## Task 3：更新 `package.json` Windows 构建配置

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 添加 `dist:win` 脚本**

在 `package.json` 的 `scripts` 区块，找到：

```json
    "dist:mac": "APPLE_KEYCHAIN_PROFILE=notarytool-password vite build && npm run build:electron && electron-builder --mac dmg"
```

在其后添加一行：

```json
    "dist:mac": "APPLE_KEYCHAIN_PROFILE=notarytool-password vite build && npm run build:electron && electron-builder --mac dmg",
    "dist:win": "vite build && npm run build:electron && electron-builder --win nsis"
```

- [ ] **Step 2: 在 `build` 区块的 `dmg` 配置后添加 Windows 配置**

找到：

```json
    "dmg": {
      "title": "oddeNova"
    }
  }
}
```

替换为：

```json
    "dmg": {
      "title": "oddeNova"
    },
    "win": {
      "target": [
        { "target": "nsis", "arch": ["x64"] }
      ],
      "icon": "public/icon.ico"
    },
    "nsis": {
      "oneClick": true,
      "installerIcon": "public/icon.ico",
      "uninstallerIcon": "public/icon.ico",
      "shortcutName": "oddeNova",
      "runAfterFinish": true
    }
  }
}
```

- [ ] **Step 3: 验证 JSON 格式正确**

```bash
node -e "JSON.parse(require('fs').readFileSync('package.json','utf-8')); console.log('OK')"
```

预期输出：`OK`

- [ ] **Step 4: 提交**

```bash
git add package.json
git commit -m "feat: add Windows NSIS build configuration"
```

---

## Task 4：新建 GitHub Actions Windows 构建工作流

**Files:**
- Create: `.github/workflows/build-windows.yml`

- [ ] **Step 1: 创建工作流目录**

```bash
mkdir -p .github/workflows
```

- [ ] **Step 2: 新建工作流文件**

新建 `.github/workflows/build-windows.yml`：

```yaml
name: Build Windows

on:
  workflow_dispatch:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: windows-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run dist:win
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Upload installer
        uses: actions/upload-artifact@v4
        with:
          name: oddeNova-Windows
          path: release/*.exe
```

- [ ] **Step 3: 验证 YAML 格式**

```bash
node -e "
const yaml = require('js-yaml')
const fs = require('fs')
yaml.load(fs.readFileSync('.github/workflows/build-windows.yml','utf-8'))
console.log('YAML OK')
" 2>/dev/null || python3 -c "
import yaml, sys
yaml.safe_load(open('.github/workflows/build-windows.yml'))
print('YAML OK')
"
```

预期输出：`YAML OK`

- [ ] **Step 4: 提交**

```bash
git add .github/workflows/build-windows.yml
git commit -m "ci: add GitHub Actions Windows build workflow"
```

---

## Task 5：验证端到端构建（可选本地验证）

> 此步骤在 Mac 上无法完整运行（需要 Wine），但可验证配置合法性。如跳过，直接推 tag 触发 CI 验证。

- [ ] **Step 1: 验证 electron-builder 能读取 Windows 配置**

```bash
npx electron-builder --win nsis --dry-run 2>&1 | head -30
```

预期：看到 `target=nsis`、`arch=x64` 相关日志，无 JSON 解析错误。

- [ ] **Step 2: 推送 tag 触发 CI**

```bash
git tag v0.1.0-windows-test
git push origin v0.1.0-windows-test
```

然后在 GitHub → Actions → Build Windows 查看运行状态。

预期：workflow 成功，Artifacts 中出现 `oddeNova-Windows` 包含 `.exe` 文件。

- [ ] **Step 3: 下载并测试安装包**

从 GitHub Actions Artifacts 下载 `oddeNova-Windows.zip`，解压得到 `.exe`，在 Windows 机器或虚拟机上运行，确认：
- 安装完成后 oddeNova 启动
- 不报 AirJelly 相关错误
- 应用功能正常

---

## 收尾

- [ ] 删除临时图标生成脚本（如不再需要）：`git rm scripts/gen-ico.mjs && git commit -m "chore: remove icon generation script"`
- [ ] 如需保留脚本供未来更新图标使用，则保留即可
