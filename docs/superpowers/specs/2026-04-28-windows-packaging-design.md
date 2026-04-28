# Windows 打包设计文档

**日期：** 2026-04-28  
**状态：** 已批准

## 目标

为 oddeNova（Electron + React + Vite）生成 Windows NSIS 安装包（`.exe`），通过 GitHub Actions 在 `windows-latest` runner 上构建，产物上传为 Workflow Artifact，Windows 用户下载后一键安装。

## 范围

- 不做代码签名（Windows SmartScreen 会弹警告，用户可点击"仍要运行"绕过）
- AirJelly 功能在 Windows 上静默禁用（返回 `available: false`）
- 不改动现有 macOS 构建流程

## 改动文件

### 1. `electron/main.ts`

在 `loadAirJellyRuntime()` 函数开头加平台判断：

```ts
function loadAirJellyRuntime(): AirJellyRuntime | null {
  if (process.platform !== 'darwin') return null
  // ... 其余不变
}
```

Windows 上所有 `/api/airjelly-runtime` 请求正常返回 `{ available: false }`，前端已有该分支处理，无需其他改动。

### 2. `package.json`

**新增脚本：**
```json
"dist:win": "vite build && npm run build:electron && electron-builder --win nsis"
```

**`build` 区块新增：**
```json
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
```

**图标说明：** Windows 需要 `.ico` 格式图标，需在实现阶段从现有 logo 转换生成 `public/icon.ico`。

### 3. `.github/workflows/build-windows.yml`（新建）

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

**触发方式：**
- 推送 `v*` tag（如 `v1.0.0`）时自动触发
- 在 GitHub Actions 页面手动触发（`workflow_dispatch`）

**产物：** `release/oddeNova Setup {版本号}.exe`，作为 Artifact 保留 30 天。

## 不在范围内

- 代码签名（可后续单独补充，需配置 `CSC_*` secrets）
- 自动附加到 GitHub Release（可后续加 `softprops/action-gh-release`）
- Windows ARM64 支持（当前仅 x64）
- AirJelly 的 Windows 适配
