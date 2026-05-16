# 移除 Electron 打包 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 oddeNova 从 Electron 桌面应用模式彻底清理为纯 Web 项目，移除所有 Electron 相关代码、依赖和 CI 配置。

**Architecture:** 删除 `electron/`、`dist-electron/` 目录及 Windows CI 工作流；修改 `package.json` 移除 Electron 相关脚本、依赖和 electron-builder 配置块；`vite.config.ts` 和 `src/` 完全不改动。

**Tech Stack:** Node.js, npm, JSON

---

## 文件变更清单

| 操作 | 路径 |
|---|---|
| 删除目录 | `electron/` |
| 删除目录 | `dist-electron/` |
| 删除文件 | `.github/workflows/build-windows.yml` |
| 修改 | `package.json` |

---

### Task 1: 删除 Electron 目录和 CI 工作流

**Files:**
- Delete: `electron/`
- Delete: `dist-electron/`
- Delete: `.github/workflows/build-windows.yml`

- [ ] **Step 1: 删除 electron/ 目录**

```bash
rm -rf /Users/chaycao/workspace/oddeNova/electron
```

预期：命令无输出，目录消失。

- [ ] **Step 2: 验证 electron/ 已删除**

```bash
ls /Users/chaycao/workspace/oddeNova/electron 2>&1
```

预期：`ls: /Users/chaycao/workspace/oddeNova/electron: No such file or directory`

- [ ] **Step 3: 删除 dist-electron/ 目录**

```bash
rm -rf /Users/chaycao/workspace/oddeNova/dist-electron
```

- [ ] **Step 4: 验证 dist-electron/ 已删除**

```bash
ls /Users/chaycao/workspace/oddeNova/dist-electron 2>&1
```

预期：`ls: .../dist-electron: No such file or directory`

- [ ] **Step 5: 删除 Windows CI 工作流文件**

```bash
rm /Users/chaycao/workspace/oddeNova/.github/workflows/build-windows.yml
```

- [ ] **Step 6: 验证 CI 文件已删除**

```bash
ls /Users/chaycao/workspace/oddeNova/.github/workflows/
```

预期：不再有 `build-windows.yml`（如果目录为空则目录不存在也可）。

- [ ] **Step 7: 暂存变更**

```bash
cd /Users/chaycao/workspace/oddeNova
git add -A electron dist-electron .github/workflows/build-windows.yml
git status
```

预期：看到上述三个路径为 `deleted` 状态。

---

### Task 2: 清理 package.json

**Files:**
- Modify: `package.json`

移除三部分内容：
1. `scripts` 中的 `build:electron`、`dist:mac`、`dist:win`
2. `devDependencies` 中的 `electron`、`electron-builder`
3. 整个 `"build"` 顶级字段（electron-builder 配置块）

- [ ] **Step 1: 移除 Electron 相关 scripts**

将 `package.json` 中的 `scripts` 字段改为：

```json
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "vite preview",
    "postinstall": "patch-package"
  },
```

（删除 `"build:electron"`、`"dist:mac"`、`"dist:win"` 三行）

- [ ] **Step 2: 移除 Electron devDependencies**

将 `devDependencies` 中的以下两行删除：

```json
    "electron": "^41.3.0",
    "electron-builder": "^26.8.1",
```

- [ ] **Step 3: 移除整个 "build" 配置块**

删除 `package.json` 末尾的整个 `"build"` 顶级字段，包括其中所有内容（`appId`、`productName`、`directories`、`extraMetadata`、`files`、`extraResources`、`mac`、`dmg`、`win`、`nsis`）。

最终 `package.json` 末尾应为：

```json
  }
}
```

（即 `devDependencies` 对象闭合后直接是文件结束的 `}`）

- [ ] **Step 4: 验证 package.json 格式正确**

```bash
cd /Users/chaycao/workspace/oddeNova
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); console.log('JSON valid')"
```

预期：`JSON valid`

- [ ] **Step 5: 验证 Electron 相关内容已消失**

```bash
grep -E '"electron"|"electron-builder"|"build:electron"|"dist:mac"|"dist:win"' package.json
```

预期：无任何输出。

---

### Task 3: 更新 node_modules 和 lockfile

**Files:**
- Modify: `package-lock.json`（由 npm 自动更新）

- [ ] **Step 1: 运行 npm install 更新依赖**

```bash
cd /Users/chaycao/workspace/oddeNova
npm install
```

预期：正常完成，无 error。`electron` 和 `electron-builder` 不再出现在安装日志中。

---

### Task 4: 验证项目可正常工作

- [ ] **Step 1: TypeScript 类型检查**

```bash
cd /Users/chaycao/workspace/oddeNova
npx tsc --noEmit -p tsconfig.app.json
```

预期：无任何输出（0 个错误）。

- [ ] **Step 2: ESLint 检查**

```bash
cd /Users/chaycao/workspace/oddeNova
npm run lint
```

预期：`All files pass linting`（或无错误输出，exit code 0）。

- [ ] **Step 3: 构建验证**

```bash
cd /Users/chaycao/workspace/oddeNova
npm run build
```

预期：构建成功，`dist/` 目录生成，无错误。

---

### Task 5: 提交

- [ ] **Step 1: 暂存所有变更**

```bash
cd /Users/chaycao/workspace/oddeNova
git add package.json package-lock.json
git status
```

预期：看到 `package.json` 和 `package-lock.json` 已暂存，加上 Task 1 中已暂存的删除文件。

- [ ] **Step 2: 提交**

```bash
git commit -m "chore: remove Electron packaging, web-only project

- Remove electron/ and dist-electron/ directories
- Remove .github/workflows/build-windows.yml CI pipeline
- Remove electron, electron-builder devDependencies
- Remove build:electron, dist:mac, dist:win npm scripts
- Remove electron-builder 'build' config block from package.json"
```

---

## 验收标准

完成所有任务后确认：

- [ ] `ls electron/` → No such file
- [ ] `ls dist-electron/` → No such file
- [ ] `ls .github/workflows/build-windows.yml` → No such file
- [ ] `grep electron package.json | grep -v "@airjelly"` → 无输出
- [ ] `npx tsc --noEmit -p tsconfig.app.json` → 0 errors
- [ ] `npm run lint` → 通过
- [ ] `npm run build` → 成功
