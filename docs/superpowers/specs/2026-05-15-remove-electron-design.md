# 移除 Electron 打包，纯 Web 化

**日期：** 2026-05-15  
**状态：** 待实现

---

## 背景

oddeNova 最初同时支持 Web 和 Electron 桌面应用（Mac DMG / Windows NSIS）。由于项目方向调整，不再需要打包成桌面应用，仅作为 Web 项目运行。需要清理所有 Electron 相关代码和配置，降低维护复杂度。

同时需要保留的内容：
- `.command` 快捷启动脚本（用于本地快速启动 `npm run dev`）
- AirJelly 集成功能（`vite.config.ts` 中的 `airjellyProxy()` + `src/services/airjelly.ts` 等）

---

## 范围

### 删除文件/目录

| 路径 | 说明 |
|---|---|
| `electron/` | Electron 主进程源码（`main.ts` + `tsconfig.json`） |
| `dist-electron/` | 主进程编译产物（`main.js`） |
| `.github/workflows/build-windows.yml` | Windows CI 打包流水线 |

### 修改 `package.json`

**删除 scripts：**
- `build:electron`
- `dist:mac`
- `dist:win`

**删除 devDependencies：**
- `electron`
- `electron-builder`

**删除整个 `"build"` 配置块**（electron-builder 配置，包含 `appId`、`mac`、`win`、`nsis`、`extraMetadata` 等字段）

### 不改动内容

| 文件 | 原因 |
|---|---|
| `vite.config.ts` | `airjellyProxy()` 是 Vite dev server 中间件，与 Electron 无关，为 AirJelly 功能提供本地 API 代理，需要保留 |
| `src/` | React 代码与 Electron 完全解耦，不需改动 |
| `启动 Vibe.command` | 使用 Chrome app mode 打开 localhost:5173，不依赖 Electron |
| `启动 Vibe Demo.command` | 同上 |
| `tsconfig.json` / `tsconfig.app.json` / `tsconfig.node.json` | 均不涉及 Electron |
| `vercel.json` | Web 部署配置，保留 |

---

## 影响分析

- `npm run dev` / `npm run build` / `npm run preview`：完全不受影响
- AirJelly 功能：不受影响，`airjellyProxy()` 继续在 dev 模式下提供 `/api/airjelly-*` 路由
- `electron/tsconfig.json` 引用：移除 `electron/` 目录后自然消除
- CI/CD：仅剩标准 Web 构建，无桌面打包流水线

---

## 验收标准

1. `npm run dev` 正常启动，无报错
2. `npm run build` 构建成功
3. `npm run lint` 通过（无 lint 错误）
4. `npx tsc --noEmit -p tsconfig.app.json` 无类型错误
5. 仓库中不再存在 `electron/`、`dist-electron/` 目录
6. `package.json` 中不再有 `electron`、`electron-builder` 相关内容
